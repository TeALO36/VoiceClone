#!/usr/bin/env bash
#
# Convert a Kyutai Pocket TTS checkpoint (any language) to the sherpa-onnx
# ONNX package the app's native engine loads:
#   lm_flow.int8.onnx, lm_main.int8.onnx, encoder.onnx, decoder.int8.onnx,
#   text_conditioner.onnx, vocab.json, token_scores.json, voices/*.wav
#
# How the conversion works
# ------------------------
# sherpa-onnx's PocketTTS runtime is fully generic: every dimension comes from
# the ONNX graphs and the two JSON files, so converting a language is just
# exporting that language's checkpoint with the same tooling that produced the
# official English model (csukuangfj/pocket-tts-onnx-export).
#
# The vendored `pocket_tts` package inside pocket-tts-onnx-export predates the
# per-language checkpoints, so before exporting you must:
#   1. copy the language YAMLs from kyutai-labs/pocket-tts (pocket_tts/config)
#      into the vendored pocket_tts/config/ (this repo's multilingual flow
#      patches are documented in the git history),
#   2. neutralize the top-level `weights_path:` lines in those YAMLs (the
#      export scripts load the state dict themselves via --weights_path),
#   3. patch the export scripts to take `--variant` (load_model(variant)).
#
# The kyutai/pocket-tts repo is GATED: accept the model terms at
# https://huggingface.co/kyutai/pocket-tts and pass a read token.
#
# Multilingual note: the fr/de/pt/it/es checkpoints train with
# `insert_bos_before_voice: true` — a learned 1024-dim BOS embedding is
# prepended to the voice conditioning. sherpa-onnx does not do this itself, so
# this script fuses the BOS into the encoder graph (scripts/bake-pocket-bos.py):
# the encoder output becomes [B, F+1, 1024] = [BOS, voice...].
#
# Usage:
#   HF_TOKEN=hf_xxx ./convert-pocket-tts-lang.sh french_24l fr C:/tmp/out/fr [ref.wav]
#
# The optional 4th arg is the default reference voice (24 kHz mono WAV),
# copied into voices/bria.wav and voices/loona.wav.

set -euo pipefail

VARIANT="${1:?variant e.g. french_24l}"
LANG_ID="${2:?language id e.g. fr}"
OUT="${3:?output dir}"
REF_WAV="${4:-}"

EXPORT_DIR="${POCKET_EXPORT_DIR:?set POCKET_EXPORT_DIR to the pocket-tts-onnx-export checkout}"
VENV_PY="${VENV_PY:?set VENV_PY to the conversion venv python}"
# Windows aggressively purges %TEMP%, so keep the working files next to the
# output instead of using mktemp (files vanish mid-run otherwise).
WORK="$(dirname "$OUT")/.work-$LANG_ID"
rm -rf "$WORK" && mkdir -p "$WORK"
trap 'rm -rf "$WORK"' EXIT

echo "==> [$LANG_ID] downloading checkpoint + tokenizer"
"$VENV_PY" - "$VARIANT" "$WORK" <<'PYEOF'
import os, sys
from huggingface_hub import hf_hub_download
variant, work = sys.argv[1], sys.argv[2]
os.makedirs(work, exist_ok=True)
for f in ["model.safetensors", "tokenizer.model"]:
    p = hf_hub_download("kyutai/pocket-tts", f"languages/{variant}/{f}", local_dir=work)
    print("   ", f, os.path.getsize(p))
PYEOF

# hf_hub_download(local_dir=...) keeps the repo layout under local_dir:
#   $WORK/languages/<variant>/model.safetensors
WEIGHTS="$WORK/languages/$VARIANT/model.safetensors"

echo "==> [$LANG_ID] exporting mimi + text conditioner"
(cd "$EXPORT_DIR" && HF_TOKEN="${HF_TOKEN:-}" PYTHONIOENCODING=utf-8 PYTHONPATH=. "$VENV_PY" scripts/export_mimi_and_conditioner.py \
  --output_dir "$WORK/onnx" --language "$VARIANT" \
  > "$WORK/mimi.log" 2>&1 || { tail -30 "$WORK/mimi.log"; exit 1; })

echo "==> [$LANG_ID] exporting flow lm"
(cd "$EXPORT_DIR" && HF_TOKEN="${HF_TOKEN:-}" PYTHONIOENCODING=utf-8 PYTHONPATH=. "$VENV_PY" scripts/export_flow_lm.py \
  --output_dir "$WORK/onnx" --language "$VARIANT" \
  > "$WORK/flowlm.log" 2>&1 || { tail -30 "$WORK/flowlm.log"; exit 1; })

echo "==> [$LANG_ID] baking insert_bos_before_voice into encoder"
"$VENV_PY" "$(dirname "$0")/bake-pocket-bos.py" \
  "$WEIGHTS" "$WORK/onnx/mimi_encoder.onnx" "$WORK/onnx/mimi_encoder.onnx"

echo "==> [$LANG_ID] quantizing to int8"
(cd "$EXPORT_DIR" && HF_TOKEN="${HF_TOKEN:-}" PYTHONIOENCODING=utf-8 PYTHONPATH=. "$VENV_PY" scripts/quantize.py \
  --input_dir "$WORK/onnx" --output_dir "$WORK/int8" \
  > "$WORK/quant.log" 2>&1 || { tail -30 "$WORK/quant.log"; exit 1; })

echo "==> [$LANG_ID] converting tokenizer"
"$VENV_PY" "$(dirname "$0")/convert-pocket-tokenizer.py" "$WORK/languages/$VARIANT/tokenizer.model" "$WORK/onnx"

echo "==> [$LANG_ID] assembling final package"
rm -rf "$OUT" && mkdir -p "$OUT/voices"
cp "$WORK/int8/flow_lm_flow_int8.onnx"  "$OUT/lm_flow.int8.onnx"
cp "$WORK/int8/flow_lm_main_int8.onnx"  "$OUT/lm_main.int8.onnx"
cp "$WORK/onnx/mimi_encoder.onnx"       "$OUT/encoder.onnx"
cp "$WORK/int8/mimi_decoder_int8.onnx"  "$OUT/decoder.int8.onnx"
cp "$WORK/onnx/text_conditioner.onnx"   "$OUT/text_conditioner.onnx"
cp "$WORK/onnx/vocab.json" "$WORK/onnx/token_scores.json" "$OUT/"
if [ -n "$REF_WAV" ]; then
  cp "$REF_WAV" "$OUT/voices/bria.wav"
  cp "$REF_WAV" "$OUT/voices/loona.wav"
fi
ls -la "$OUT"
echo "==> [$LANG_ID] DONE"
