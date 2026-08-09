"""Upload the multilingual Pocket TTS ONNX packages to HuggingFace.

Why: the app downloads the English Pocket TTS package from HuggingFace and it
works reliably on mobile, while GitHub release assets stall mid-transfer on
phone connections. Hosting the 5 language packages on HF gives the app the
same dependable CDN.

Requires a HuggingFace token with WRITE permission:
  HF_TOKEN=hf_xxx python scripts/upload-pocket-models-hf.py

Layout on HF (mirrors the catalog URLs in lib/services/models.ts):
  TeALO/pocket-tts-models/
    fr/lm_flow.int8.onnx, fr/lm_main.int8.onnx, fr/encoder.onnx, ...
    de/..., pt/..., it/..., es/...
"""
import os
import sys

from huggingface_hub import HfApi
from huggingface_hub.utils import RepositoryNotFoundError

REPO = "TeALO/pocket-tts-models"
LANGS = ["fr", "de", "pt", "it", "es"]
# (source file in the local upload dir, target path in the repo)
FILES = [
    "lm_flow.int8.onnx",
    "lm_main.int8.onnx",
    "encoder.onnx",
    "decoder.int8.onnx",
    "text_conditioner.onnx",
    "vocab.json",
    "token_scores.json",
    "default.wav",
]

UPLOAD_DIR = os.path.expanduser("~/pocket-work/upload")


def main() -> None:
    token = os.environ.get("HF_TOKEN")
    if not token:
        sys.exit("HF_TOKEN env var required (write permission)")
    if not os.path.isdir(UPLOAD_DIR):
        sys.exit(f"upload dir not found: {UPLOAD_DIR}")

    api = HfApi(token=token)

    try:
        api.repo_info(REPO)
        print(f"Repo {REPO} exists")
    except RepositoryNotFoundError:
        print(f"Creating repo {REPO}...")
        api.create_repo(REPO, repo_type="model", private=False)
        model_card = """
---
license: other
---
# Pocket TTS — Multilingual ONNX packages (fr, de, pt, it, es)

Converted from the Kyutai `pocket-tts` checkpoints to the sherpa-onnx ONNX
layout with `insert_bos_before_voice` baked into the encoder (required by the
multilingual models). Used by VoxClone Pro.

Each language is a directory (`fr/`, `de/`, ...) containing:
`lm_flow.int8.onnx`, `lm_main.int8.onnx`, `encoder.onnx`,
`decoder.int8.onnx`, `text_conditioner.onnx`, `vocab.json`,
`token_scores.json`, `default.wav`.
"""
        api.upload_file(
            path_or_fileobj=model_card.encode("utf-8"),
            path_in_repo="README.md",
            repo_id=REPO,
            repo_type="model",
        )
        print(f"Created repo {REPO} + README")

    uploaded = 0
    for lang in LANGS:
        for f in FILES:
            src = os.path.join(UPLOAD_DIR, f"{lang}_{f}")
            if not os.path.exists(src):
                sys.exit(f"missing {src}")
            dst = f"{lang}/{f}"
            print(f"  {dst} ({os.path.getsize(src):,} bytes)")
            api.upload_file(
                path_or_fileobj=src,
                path_in_repo=dst,
                repo_id=REPO,
                repo_type="model",
            )
            uploaded += 1

    print(f"Uploaded {uploaded} files to https://huggingface.co/{REPO}")


if __name__ == "__main__":
    main()
