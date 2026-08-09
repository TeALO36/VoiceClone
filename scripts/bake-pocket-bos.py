#!/usr/bin/env python3
"""Bake `insert_bos_before_voice` into a Pocket TTS encoder ONNX graph.

sherpa-onnx (as of v1.13.4) feeds the raw Mimi encoder output straight into the
LM as the voice conditioning. The newer multilingual Kyutai checkpoints
(french_24l, german, italian, portuguese, spanish) train with
`insert_bos_before_voice: true`, which prepends a learned 1024-dim embedding
(`flow_lm.bos_before_voice`, shape [1, 1, 1024]) before the voice embedding in
the conditioning sequence. Without it the LM conditioning is misaligned and
generation produces garbage (EOS fires immediately or never).

We bake the BOS into the encoder graph itself: the encoder's output becomes
[1, F+1, 1024] = [BOS, voice...], so the unmodified sherpa-onnx binary in the
app gets the exact sequence the official Kyutai runtime would build.

Usage:
    python bake-pocket-bos.py <checkpoint.safetensors> <encoder.onnx> <out.onnx>
"""
import sys

import numpy as np
import onnx
from onnx import helper, numpy_helper


def bake(ckpt_path: str, enc_onnx_path: str, out_path: str) -> None:
    import safetensors.torch

    sd = safetensors.torch.load_file(ckpt_path)
    bos = sd["flow_lm.bos_before_voice"].float().numpy().astype(np.float32)
    if bos.shape != (1, 1, 1024):
        raise SystemExit(f"unexpected bos_before_voice shape {bos.shape}")

    m = onnx.load(enc_onnx_path)
    out_name = m.graph.output[0].name

    bos_name = "bos_before_voice_const"
    m.graph.initializer.append(numpy_helper.from_array(bos, name=bos_name))

    new_out = "latents_with_bos"
    concat = helper.make_node(
        "Concat", inputs=[bos_name, out_name], outputs=[new_out], axis=1,
        name="concat_bos_voice",
    )
    m.graph.node.append(concat)

    o = m.graph.output[0]
    o.name = new_out
    d = o.type.tensor_type.shape.dim[1]
    d.ClearField("dim_value")
    d.ClearField("dim_param")
    d.dim_param = "voice_len_plus_bos"

    onnx.checker.check_model(m)
    onnx.save(m, out_path)
    print(f"baked BOS into {out_path} (output now [B, F+1, 1024])")


if __name__ == "__main__":
    bake(sys.argv[1], sys.argv[2], sys.argv[3])
