#!/usr/bin/env python3
"""Produce Gate C deterministic round-trip metrics for a LlamaGen VQ tokenizer.

This script performs inference only. It does not train or update weights.
It expects a local checkout of FoundationVision/LlamaGen so the upstream
`VQ_models` implementation is the measured code path.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Write M1B Gate C round-trip metrics.")
    parser.add_argument("--out", default="artifacts/m1b-audit/gate-c-roundtrip.json")
    parser.add_argument("--llamagen-root", required=True, help="Path to a local FoundationVision/LlamaGen checkout.")
    parser.add_argument("--vq-ckpt", required=True, help="Path to the SHA-pinned LlamaGen VQ checkpoint.")
    parser.add_argument("--vq-model", default="VQ-16", help="LlamaGen VQ model key, usually VQ-16.")
    parser.add_argument("--codebook-size", type=int, default=16384)
    parser.add_argument("--codebook-embed-dim", type=int, default=8)
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--downsample-size", type=int, default=16)
    parser.add_argument("--sample-count", type=int, default=3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument(
        "--input-image",
        help="Optional image path. If omitted, uses a deterministic synthetic RGB fixture.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.sample_count < 1:
        raise SystemExit("--sample-count must be >= 1")

    torch = import_torch()
    if args.image_size % args.downsample_size != 0:
        raise SystemExit("--image-size must be divisible by --downsample-size")
    configure_determinism(torch, args.seed)
    device = resolve_device(torch, args.device)
    model = load_vq_model(torch, args, device)
    image = load_input_tensor(torch, args, device)

    runs = []
    for _ in range(args.sample_count):
        runs.append(run_roundtrip(torch, model, image, args))

    token_hamming_rates = [run["token_hamming_rate"] for run in runs]
    token_sha256s = [run["token_sha256"] for run in runs]
    decoded_sha256s = [run["decoded_sha256"] for run in runs]
    reencoded_sha256s = [run["reencoded_token_sha256"] for run in runs]
    roundtrip_passed = (
        all_equal(token_sha256s)
        and all_equal(decoded_sha256s)
        and all_equal(reencoded_sha256s)
        and max(token_hamming_rates) == 0.0
    )

    write_json(
        Path(args.out),
        {
            "schema_version": "m1b-gate-c-roundtrip-metrics.v0",
            "generated_at": utc_now_iso(),
            "roundtrip_passed": roundtrip_passed,
            "sample_count": args.sample_count,
            "token_hamming_rate": max(token_hamming_rates),
            "token_sha256s": token_sha256s,
            "decoded_sha256s": decoded_sha256s,
            "reencoded_token_sha256s": reencoded_sha256s,
            "runs": runs,
            "environment": environment(torch, device),
            "inputs": {
                "llamagen_root": str(Path(args.llamagen_root).resolve()),
                "vq_ckpt": str(Path(args.vq_ckpt).resolve()),
                "vq_model": args.vq_model,
                "image_size": args.image_size,
                "downsample_size": args.downsample_size,
                "input_image": str(Path(args.input_image).resolve()) if args.input_image else None,
            },
        },
    )
    print(args.out)
    return 0


def import_torch():
    try:
        import torch  # type: ignore
    except ImportError as error:
        raise SystemExit("Gate C requires torch in the lab environment.") from error
    return torch


def configure_determinism(torch: Any, seed: int) -> None:
    torch.manual_seed(seed)
    torch.set_grad_enabled(False)
    try:
        torch.use_deterministic_algorithms(True)
    except Exception:
        pass
    if hasattr(torch.backends, "cudnn"):
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False
    if hasattr(torch.backends, "cuda"):
        torch.backends.cuda.matmul.allow_tf32 = False
    try:
        torch.set_float32_matmul_precision("highest")
    except Exception:
        pass


def resolve_device(torch: Any, requested: str) -> str:
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def load_vq_model(torch: Any, args: argparse.Namespace, device: str) -> Any:
    llamagen_root = Path(args.llamagen_root).resolve()
    if not llamagen_root.exists():
        raise SystemExit(f"LlamaGen checkout not found: {llamagen_root}")
    sys.path.insert(0, str(llamagen_root))
    try:
        from tokenizer.tokenizer_image.vq_model import VQ_models  # type: ignore
    except ImportError as error:
        raise SystemExit("Could not import tokenizer.tokenizer_image.vq_model from --llamagen-root.") from error

    if args.vq_model not in VQ_models:
        raise SystemExit(f"Unknown VQ model {args.vq_model}; available: {sorted(VQ_models)}")

    model = VQ_models[args.vq_model](
        codebook_size=args.codebook_size,
        codebook_embed_dim=args.codebook_embed_dim,
    ).to(device)
    checkpoint = torch.load(args.vq_ckpt, map_location="cpu")
    state = checkpoint.get("model") if isinstance(checkpoint, dict) else checkpoint
    model.load_state_dict(state)
    model.eval()
    return model


def load_input_tensor(torch: Any, args: argparse.Namespace, device: str) -> Any:
    if args.input_image:
        return load_image_tensor(torch, Path(args.input_image), args.image_size, device)
    total = 3 * args.image_size * args.image_size
    values = torch.linspace(-1.0, 1.0, steps=total, dtype=torch.float32)
    return values.reshape(1, 3, args.image_size, args.image_size).to(device)


def load_image_tensor(torch: Any, path: Path, image_size: int, device: str) -> Any:
    try:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as error:
        raise SystemExit("--input-image requires Pillow and numpy in the lab environment.") from error
    image = Image.open(path).convert("RGB").resize((image_size, image_size))
    array = np.asarray(image).astype("float32") / 127.5 - 1.0
    tensor = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0)
    return tensor.to(device)


def run_roundtrip(torch: Any, model: Any, image: Any, args: argparse.Namespace) -> dict[str, Any]:
    latent_size = args.image_size // args.downsample_size
    qzshape = [1, args.codebook_embed_dim, latent_size, latent_size]
    with torch.no_grad():
        quant, _, info = model.encode(image)
        tokens = info[2].detach().to("cpu").contiguous()
        decoded = model.decode_code(tokens.to(image.device), qzshape)
        _, _, reencoded_info = model.encode(decoded.clamp(-1.0, 1.0))
        reencoded_tokens = reencoded_info[2].detach().to("cpu").contiguous()

    token_bytes = tensor_bytes(tokens)
    decoded_bytes = tensor_bytes(decoded.detach().to("cpu").contiguous())
    reencoded_bytes = tensor_bytes(reencoded_tokens)
    mismatches = int((tokens != reencoded_tokens).sum().item())
    total = int(tokens.numel())
    return {
        "token_sha256": sha256(token_bytes),
        "decoded_sha256": sha256(decoded_bytes),
        "reencoded_token_sha256": sha256(reencoded_bytes),
        "token_count": total,
        "token_mismatches": mismatches,
        "token_hamming_rate": mismatches / total if total else 1.0,
        "decoded_shape": list(decoded.shape),
    }


def tensor_bytes(tensor: Any) -> bytes:
    array = tensor.detach().cpu().numpy()
    return array.tobytes(order="C")


def all_equal(values: list[str]) -> bool:
    return len(set(values)) == 1


def environment(torch: Any, device: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "torch_version": getattr(torch, "__version__", "unknown"),
        "device": device,
    }
    if device == "cuda" and torch.cuda.is_available():
        result["cuda_version"] = getattr(torch.version, "cuda", None)
        result["device_name"] = torch.cuda.get_device_name(0)
    return result


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
