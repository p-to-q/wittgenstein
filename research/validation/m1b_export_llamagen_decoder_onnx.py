#!/usr/bin/env python3
"""Export the LlamaGen VQ decoder half to ONNX for M1B Gate D.

This script performs export only. It does not train or update weights.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import contextlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .m1b_gate_c_roundtrip import configure_determinism, import_torch, load_vq_model


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export LlamaGen VQ decoder to ONNX.")
    parser.add_argument("--out", default="artifacts/m1b-audit/decoder.onnx")
    parser.add_argument("--receipt", default="artifacts/m1b-audit/gate-d-onnx-export.json")
    parser.add_argument("--llamagen-root", required=True, help="Path to a local FoundationVision/LlamaGen checkout.")
    parser.add_argument("--vq-ckpt", required=True, help="Path to the SHA-pinned LlamaGen VQ checkpoint.")
    parser.add_argument("--vq-model", default="VQ-16", help="LlamaGen VQ model key, usually VQ-16.")
    parser.add_argument("--codebook-size", type=int, default=16384)
    parser.add_argument("--codebook-embed-dim", type=int, default=8)
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--downsample-size", type=int, default=16)
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--seed", type=int, default=0)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    export_status = "passed"
    export_error = None
    torch = None
    try:
        torch = import_torch()
        configure_determinism(torch, args.seed)
        model = load_vq_model(torch, args, "cpu")
        wrapper = build_decoder_wrapper(torch, model, args.codebook_embed_dim, latent_size(args))
        wrapper.eval()
        tokens = deterministic_token_fixture(torch, args)
        torch.onnx.export(
            wrapper,
            (tokens,),
            str(out_path),
            input_names=["tokens"],
            output_names=["image"],
            dynamic_axes=None,
            opset_version=args.opset,
            do_constant_folding=True,
        )
    except Exception as error:
        export_status = "blocked"
        export_error = f"{type(error).__name__}: {error}"
        with contextlib.suppress(FileNotFoundError):
            out_path.unlink()

    receipt = {
        "schema_version": "m1b-gate-d-onnx-export.v0",
        "generated_at": utc_now_iso(),
        "status": export_status,
        "error": export_error,
        "onnx": str(out_path.resolve()) if out_path.exists() else None,
        "onnx_sha256": file_sha256(out_path) if out_path.exists() else None,
        "environment": {
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "torch_version": getattr(torch, "__version__", "unavailable") if torch is not None else "unavailable",
            "opset": args.opset,
        },
        "inputs": {
            "llamagen_root": str(Path(args.llamagen_root).resolve()),
            "vq_ckpt": str(Path(args.vq_ckpt).resolve()),
            "vq_ckpt_sha256": file_sha256(Path(args.vq_ckpt)) if Path(args.vq_ckpt).exists() else None,
            "vq_model": args.vq_model,
            "codebook_size": args.codebook_size,
            "codebook_embed_dim": args.codebook_embed_dim,
            "image_size": args.image_size,
            "downsample_size": args.downsample_size,
            "token_grid": [latent_size(args), latent_size(args)],
        },
    }
    write_json(Path(args.receipt), receipt)
    print(args.receipt)
    return 0 if export_status == "passed" else 1


def build_decoder_wrapper(
    torch: Any,
    model: Any,
    codebook_embed_dim: int,
    latent_size_value: int,
) -> Any:
    class LlamaGenDecoderOnnxWrapper(torch.nn.Module):  # type: ignore[name-defined]
        def __init__(self) -> None:
            super().__init__()
            self.model = model
            self.qzshape = [1, codebook_embed_dim, latent_size_value, latent_size_value]

        def forward(self, tokens: Any) -> Any:
            return self.model.decode_code(tokens, self.qzshape)

    return LlamaGenDecoderOnnxWrapper()


def deterministic_token_fixture(torch: Any, args: argparse.Namespace) -> Any:
    size = latent_size(args)
    total = size * size
    return (torch.arange(total, dtype=torch.long).reshape(1, total) % args.codebook_size).contiguous()


def latent_size(args: argparse.Namespace) -> int:
    if args.downsample_size < 1:
        raise SystemExit("--downsample-size must be >= 1")
    if args.image_size < 1:
        raise SystemExit("--image-size must be >= 1")
    if args.image_size % args.downsample_size != 0:
        raise SystemExit("--image-size must be divisible by --downsample-size")
    return args.image_size // args.downsample_size


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
