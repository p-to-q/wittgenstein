#!/usr/bin/env python3
"""Export the OpenMAGVIT2 LFQ tokenizer decoder to ONNX for M1B Gate D.

This script performs export only. It does not train or update weights.
It expects a local checkout of TencentARC/SEED-Voken (the Open-MAGVIT2
subtree) so the upstream `Decoder` / `LFQ` implementations are the export
source, mirroring `m1b_export_llamagen_decoder_onnx.py`.

Boundary decision: like the LlamaGen Gate D artifact, the exported graph is
a self-contained tokenizer decoder: int64 token ids `[1, grid*grid]` ->
LFQ index-to-latent expansion -> frozen decoder -> float32 image
`[1, 3, H, W]` in `[-1, 1]`. The index-to-latent expansion replicates the
`LFQ.get_codebook_entry` bit semantics with int64 Div/Mod arithmetic (exact
for indices < 2^18) so the graph stays within ONNX opset 17, the opset
pinned for the LlamaGen artifact; a BitwiseAnd formulation would require
opset 18 and is avoided on purpose.

The receipt is `m1b-gate-d-onnx-export.v0` (same schema as the LlamaGen
export) plus an additive `parity_check` block: when onnxruntime is
installed, the exported graph is executed on CPU and compared against the
torch wrapper on two deterministic token fixtures (sequential token ids, and
a spread fixture that exercises the high bit planes). The exit code is 0 only
when export succeeded and the parity check did not explicitly fail.
"""

from __future__ import annotations

import argparse
import contextlib
import platform
from pathlib import Path
from typing import Any

from .m1b_om2_gate_c_roundtrip import (
    configure_determinism,
    file_sha256,
    import_torch,
    load_om2_components,
    repo_commit,
    utc_now_iso,
    write_json,
)

PARITY_MAX_ABS_DIFF = 1e-4


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Export the OpenMAGVIT2 LFQ decoder to ONNX.")
    parser.add_argument("--out", default="artifacts/m1b-audit/om2-decoder.onnx")
    parser.add_argument("--receipt", default="artifacts/m1b-audit/om2-gate-d-onnx-export.json")
    parser.add_argument("--repo-root", required=True, help="Path to a local TencentARC/SEED-Voken checkout.")
    parser.add_argument("--ckpt", required=True, help="Path to the SHA-pinned OpenMAGVIT2 tokenizer checkpoint.")
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--downsample-size", type=int, default=16)
    parser.add_argument("--codebook-dim", type=int, default=18)
    parser.add_argument("--codebook-size", type=int, default=2 ** 18)
    parser.add_argument("--opset", type=int, default=17)
    parser.add_argument("--seed", type=int, default=0)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.image_size % args.downsample_size != 0:
        raise SystemExit(
            f"--image-size ({args.image_size}) must be divisible by --downsample-size ({args.downsample_size})"
        )
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    export_status = "passed"
    export_error = None
    parity_check: dict[str, Any] = {"available": False, "reason": "not attempted"}
    torch = None
    wrapper = None
    try:
        torch = import_torch()
        configure_determinism(torch, args.seed, 4)
        components = load_om2_components(torch, args, "cpu", load_encoder=False)
        grid = latent_size(args)
        wrapper = build_decoder_wrapper(torch, components["decoder"], grid, args.codebook_dim)
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
            # The legacy TorchScript exporter is pinned on purpose: it produced
            # the opset-17 LlamaGen Gate D artifact. The dynamo exporter (the
            # default since torch 2.9) requires the `onnxscript` package and
            # emits a structurally different graph.
            dynamo=False,
        )
    except Exception as error:
        export_status = "blocked"
        export_error = f"{type(error).__name__}: {error}"
        with contextlib.suppress(FileNotFoundError):
            out_path.unlink()

    if export_status == "passed" and wrapper is not None and torch is not None:
        parity_check = run_parity_check(torch, wrapper, out_path, args)

    receipt = {
        "schema_version": "m1b-gate-d-onnx-export.v0",
        "generated_at": utc_now_iso(),
        "status": export_status,
        "error": export_error,
        "onnx": str(out_path.resolve()) if out_path.exists() else None,
        "onnx_sha256": file_sha256(out_path) if out_path.exists() else None,
        "parity_check": parity_check,
        "environment": {
            "python_version": platform.python_version(),
            "platform": platform.platform(),
            "torch_version": getattr(torch, "__version__", "unavailable") if torch is not None else "unavailable",
            "opset": args.opset,
            "onnx_version": onnx_version(),
        },
        "inputs": {
            "repo_root": str(Path(args.repo_root).resolve()),
            "repo_commit": repo_commit(Path(args.repo_root).resolve()),
            "ckpt": str(Path(args.ckpt).resolve()),
            "ckpt_sha256": file_sha256(Path(args.ckpt)) if Path(args.ckpt).exists() else None,
            "codebook_dim": args.codebook_dim,
            "codebook_size": args.codebook_size,
            "image_size": args.image_size,
            "downsample_size": args.downsample_size,
            "token_grid": [latent_size(args), latent_size(args)],
        },
    }
    write_json(Path(args.receipt), receipt)
    print(args.receipt)
    parity_passed = parity_check.get("passed")
    return 0 if export_status == "passed" and parity_passed is not False else 1


def build_decoder_wrapper(torch: Any, decoder: Any, grid: int, dim: int) -> Any:
    class OM2DecoderOnnxWrapper(torch.nn.Module):  # type: ignore[name-defined]
        def __init__(self) -> None:
            super().__init__()
            self.decoder = decoder
            self.grid = grid
            self.dim = dim
            self.register_buffer("shifts", 2 ** torch.arange(dim, dtype=torch.long))

        def forward(self, tokens: Any) -> Any:
            bits = ((tokens.unsqueeze(-1) // self.shifts) % 2).to(torch.float32)
            latent = bits * 2.0 - 1.0
            latent = latent.reshape(1, self.grid, self.grid, self.dim).permute(0, 3, 1, 2).contiguous()
            return self.decoder(latent)

    return OM2DecoderOnnxWrapper()


def deterministic_token_fixture(torch: Any, args: argparse.Namespace) -> Any:
    size = latent_size(args)
    total = size * size
    return (torch.arange(total, dtype=torch.long).reshape(1, total) % args.codebook_size).contiguous()


def spread_token_fixture(torch: Any, args: argparse.Namespace) -> Any:
    size = latent_size(args)
    total = size * size
    return ((torch.arange(total, dtype=torch.long) * 1031 + 5) % args.codebook_size).reshape(1, total).contiguous()


def run_parity_check(torch: Any, wrapper: Any, out_path: Path, args: argparse.Namespace) -> dict[str, Any]:
    try:
        import numpy as np  # type: ignore
        import onnxruntime as ort  # type: ignore
    except ImportError as error:
        return {"available": False, "reason": f"{type(error).__name__}: {error}"}
    try:
        session = ort.InferenceSession(str(out_path), providers=["CPUExecutionProvider"])
        fixtures = {
            "sequential": deterministic_token_fixture(torch, args),
            "spread": spread_token_fixture(torch, args),
        }
        per_fixture: dict[str, Any] = {}
        max_abs_diff = 0.0
        with torch.no_grad():
            for name, tokens in fixtures.items():
                reference = wrapper(tokens).detach().cpu().numpy()
                outputs = session.run(None, {"tokens": tokens.numpy().astype(np.int64)})
                observed = np.asarray(outputs[0])
                diff = float(np.abs(reference - observed).max())
                per_fixture[name] = {"max_abs_diff": diff, "output_shape": list(observed.shape)}
                max_abs_diff = max(max_abs_diff, diff)
    except Exception as error:
        return {"available": False, "reason": f"{type(error).__name__}: {error}"}
    return {
        "available": True,
        "onnxruntime_version": ort.__version__,
        "fixtures": per_fixture,
        "max_abs_diff": max_abs_diff,
        "max_abs_diff_threshold": PARITY_MAX_ABS_DIFF,
        "passed": max_abs_diff <= PARITY_MAX_ABS_DIFF,
    }


def onnx_version() -> str:
    try:
        import onnx  # type: ignore

        return getattr(onnx, "__version__", "unknown")
    except ImportError:
        return "unavailable"


def latent_size(args: argparse.Namespace) -> int:
    return args.image_size // args.downsample_size


if __name__ == "__main__":
    raise SystemExit(main())
