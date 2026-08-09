#!/usr/bin/env python3
"""Convert a Pocket TTS sentencepiece tokenizer model to the JSON files
sherpa-onnx's SentencePieceTokenizer expects (vocab.json + token_scores.json).

Usage: python convert-pocket-tokenizer.py tokenizer.model [out_dir]
"""
import json
import sys

import sentencepiece as spm


def main() -> None:
    model_file = sys.argv[1]
    out_dir = sys.argv[2] if len(sys.argv) > 2 else "."

    sp = spm.SentencePieceProcessor(model_file=model_file)

    token2id = {}
    token2score = {}
    for i in range(sp.get_piece_size()):
        tok = sp.id_to_piece(i)
        token2id[tok] = i
        token2score[tok] = sp.get_score(i)

    with open(f"{out_dir}/vocab.json", "w", encoding="utf-8") as f:
        json.dump(token2id, f, indent=2, ensure_ascii=False)
    with open(f"{out_dir}/token_scores.json", "w", encoding="utf-8") as f:
        json.dump(token2score, f, indent=2, ensure_ascii=False)

    print(f"vocab.json ({len(token2id)} entries) + token_scores.json written to {out_dir}")


if __name__ == "__main__":
    main()
