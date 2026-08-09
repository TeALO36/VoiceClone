"""Upload fp32 multilingual Pocket TTS ONNX packages to HuggingFace.

Mirrors upload-pocket-models-hf.py but for the full-precision packages, stored
under `<lang>-fp32/` directories in the same repo. The app catalog can then
point at either precision with a URL prefix change.

Requires a HuggingFace token with WRITE permission:
  HF_TOKEN=hf_xxx python scripts/upload-pocket-models-fp32.py

Layout on HF:
  TeALO/pocket-tts-models/
    fr-fp32/lm_flow.onnx, fr-fp32/lm_main.onnx, fr-fp32/encoder.onnx, ...
    de-fp32/..., pt-fp32/..., it-fp32/..., es-fp32/...
"""
import os
import sys

from huggingface_hub import HfApi

REPO = "TeALO/pocket-tts-models"
LANGS = ["fr", "de", "pt", "it", "es"]
FILES = [
    "lm_flow.onnx",
    "lm_main.onnx",
    "encoder.onnx",
    "decoder.onnx",
    "text_conditioner.onnx",
    "vocab.json",
    "token_scores.json",
]

BASE_DIR = os.path.expanduser("~/pocket-work")


def main() -> None:
    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("HF_TOKEN env var required (write permission)")

    api = HfApi(token=token)
    try:
        api.repo_info(REPO)
    except Exception:
        sys.exit(f"repo {REPO} missing — run upload-pocket-models-hf.py first")

    uploaded = 0
    for lang in LANGS:
        src_dir = os.path.join(BASE_DIR, f"out-{lang}-fp32")
        if not os.path.isdir(src_dir):
            sys.exit(f"missing source dir {src_dir}")
        for f in FILES:
            src = os.path.join(src_dir, f)
            if not os.path.exists(src):
                sys.exit(f"missing {src}")
            dst = f"{lang}-fp32/{f}"
            print(f"  {dst} ({os.path.getsize(src):,} bytes)")
            api.upload_file(
                path_or_fileobj=src,
                path_in_repo=dst,
                repo_id=REPO,
                repo_type="model",
            )
            uploaded += 1
        # Reference voice: the package keeps it at voices/bria.wav; the app
        # downloads it as <lang>-fp32/default.wav (mirrors the int8 layout).
        voice = os.path.join(src_dir, "voices", "bria.wav")
        if not os.path.exists(voice):
            sys.exit(f"missing {voice}")
        dst = f"{lang}-fp32/default.wav"
        print(f"  {dst} ({os.path.getsize(voice):,} bytes)")
        api.upload_file(
            path_or_fileobj=voice,
            path_in_repo=dst,
            repo_id=REPO,
            repo_type="model",
        )
        uploaded += 1

    print(f"Uploaded {uploaded} fp32 files to https://huggingface.co/{REPO}")


if __name__ == "__main__":
    main()
