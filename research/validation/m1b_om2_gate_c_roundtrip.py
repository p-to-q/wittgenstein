#!/usr/bin/env python3
"""Produce Gate C deterministic round-trip metrics for the OpenMAGVIT2 LFQ tokenizer.

This script performs inference only. It does not train or update weights.
It expects a local checkout of TencentARC/SEED-Voken (the Open-MAGVIT2 subtree)
so the upstream `Encoder` / `Decoder` / `LFQ` implementations are the measured
code path.

The harness mirrors `m1b_gate_c_roundtrip.py` (VQGAN-class / LlamaGen) so the
two Gate C receipts are directly comparable: same receipt schema, same
encode -> decode -> re-encode structure, same JSON metric names.

OpenMAGVIT2-specific notes:
- The released tokenizer checkpoint stores both plain and EMA weights; the
  upstream eval convention (`VQModel.init_from_ckpt`, stage="transformer")
  loads the EMA encoder/decoder. This harness replicates that selection with
  an order-independent mapping (EMA weight wins per key).
- LFQ has no learned codebook; `decode_code` (which calls a non-existent
  `embed_code` in the current upstream tree) is a dead path. The live
  index -> latent path is `LFQ.get_codebook_entry`, which this harness uses
  and additionally proves bit-exact against the latent produced by
  `LFQ.forward` inside `encode`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Write M1B Gate C round-trip metrics for OpenMAGVIT2 (LFQ).")
    parser.add_argument("--out", default="artifacts/m1b-audit/om2-gate-c-roundtrip.json")
    parser.add_argument("--repo-root", required=True, help="Path to a local TencentARC/SEED-Voken checkout.")
    parser.add_argument("--ckpt", required=True, help="Path to the SHA-pinned OpenMAGVIT2 tokenizer checkpoint.")
    parser.add_argument("--image-size", type=int, default=256)
    parser.add_argument("--downsample-size", type=int, default=16, help="256_L uses 16; 128_L uses 8.")
    parser.add_argument("--codebook-dim", type=int, default=18)
    parser.add_argument("--codebook-size", type=int, default=2 ** 18)
    parser.add_argument("--sample-count", type=int, default=3)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--device", choices=["auto", "cpu", "cuda", "mps"], default="auto")
    parser.add_argument(
        "--input-image",
        help="Optional image path. If omitted, uses a deterministic synthetic RGB fixture.",
    )
    parser.add_argument("--png-dir", help="Optional directory to write one decoded PNG preview per run.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.sample_count < 1:
        raise SystemExit("--sample-count must be >= 1")
    if args.downsample_size < 1:
        raise SystemExit("--downsample-size must be >= 1")
    if args.image_size < 1:
        raise SystemExit("--image-size must be >= 1")
    if args.image_size % args.downsample_size != 0:
        raise SystemExit(
            f"--image-size ({args.image_size}) must be divisible by --downsample-size ({args.downsample_size})"
        )

    torch = import_torch()
    configure_determinism(torch, args.seed, args.threads)
    device = resolve_device(torch, args.device)
    components = load_om2_components(torch, args, device)
    image, input_meta = load_input_tensor(torch, args, device)

    runs = []
    for run_index in range(args.sample_count):
        runs.append(run_roundtrip(torch, components, image, args, device, run_index))

    token_hamming_rates = [run["token_hamming_rate"] for run in runs]
    token_sha256s = [run["token_sha256"] for run in runs]
    decoded_sha256s = [run["decoded_sha256"] for run in runs]
    reencoded_sha256s = [run["reencoded_token_sha256"] for run in runs]
    encode_consistent = all_equal(token_sha256s)
    decode_consistent = all_equal(decoded_sha256s)
    reencode_consistent = all_equal(reencoded_sha256s) and max(token_hamming_rates) == 0.0
    roundtrip_passed = encode_consistent and decode_consistent and reencode_consistent

    write_json(
        Path(args.out),
        {
            "schema_version": "m1b-gate-c-roundtrip-metrics.v0",
            "generated_at": utc_now_iso(),
            "roundtrip_passed": roundtrip_passed,
            "encode_consistent": encode_consistent,
            "decode_consistent": decode_consistent,
            "reencode_consistent": reencode_consistent,
            "sample_count": args.sample_count,
            "token_hamming_rate": max(token_hamming_rates),
            "reencode_token_hamming_rate": max(token_hamming_rates),
            "token_sha256s": token_sha256s,
            "decoded_sha256s": decoded_sha256s,
            "reencoded_token_sha256s": reencoded_sha256s,
            "png_sha256s": [run["png_sha256"] for run in runs],
            "latents_sha256s": [run["latent_sha256"] for run in runs],
            "token_latent_max_abs_diff": max(run["latent_max_abs_diff"] for run in runs),
            "token_latent_exact_fraction": min(run["latent_exact_fraction"] for run in runs),
            "runs": runs,
            "environment": environment(torch, components, device),
            "inputs": {
                "repo_root": str(Path(args.repo_root).resolve()),
                "repo_commit": repo_commit(Path(args.repo_root).resolve()),
                "ckpt": str(Path(args.ckpt).resolve()),
                "ckpt_sha256": file_sha256(Path(args.ckpt)),
                "ckpt_load_weights_only": components["weights_only"],
                "image_size": args.image_size,
                "downsample_size": args.downsample_size,
                "token_grid": [args.image_size // args.downsample_size] * 2,
                "codebook_dim": args.codebook_dim,
                "codebook_size": args.codebook_size,
                "token_factorization": False,
                "input_image": input_meta["path"],
                "input_image_sha256": input_meta["file_sha256"],
                "input_tensor_sha256": input_meta["tensor_sha256"],
                "synthetic_fixture": input_meta["synthetic"],
            },
        },
    )
    print(args.out)
    return 0


def import_torch():
    try:
        import torch  # type: ignore
    except ImportError as error:
        raise SystemExit("Gate C requires torch in the local environment.") from error
    return torch


def configure_determinism(torch: Any, seed: int, threads: int) -> None:
    torch.manual_seed(seed)
    torch.set_grad_enabled(False)
    if threads > 0:
        torch.set_num_threads(threads)
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


def load_om2_components(
    torch: Any,
    args: argparse.Namespace,
    device: str,
    load_encoder: bool = True,
) -> dict[str, Any]:
    repo_root = Path(args.repo_root).resolve()
    if not repo_root.exists():
        raise SystemExit(f"SEED-Voken checkout not found: {repo_root}")
    sys.path.insert(0, str(repo_root))
    try:
        from src.Open_MAGVIT2.modules.diffusionmodules.improved_model import (  # type: ignore
            Decoder,
            Encoder,
        )
        from src.Open_MAGVIT2.modules.vqvae.lookup_free_quantize import LFQ  # type: ignore
    except ImportError as error:
        raise SystemExit("Could not import Open_MAGVIT2 Encoder/Decoder/LFQ from --repo-root.") from error

    ddconfig = {
        "double_z": False,
        "z_channels": args.codebook_dim,
        "resolution": 128,
        "in_channels": 3,
        "out_ch": 3,
        "ch": 128,
        "ch_mult": [1, 1, 2, 2, 4],
        "num_res_blocks": 4,
    }
    encoder = Encoder(**ddconfig) if load_encoder else None
    decoder = Decoder(**ddconfig)
    lfq = LFQ(
        dim=args.codebook_dim,
        codebook_size=args.codebook_size,
        sample_minimization_weight=1.0,
        batch_maximization_weight=1.0,
    )

    state_dict, weights_only = load_ckpt_state(torch, Path(args.ckpt))
    encoder_state, decoder_state, selection = select_ema_state(state_dict)
    if encoder is not None:
        encoder.load_state_dict(encoder_state, strict=True)
        encoder.eval().to(device)
    decoder.load_state_dict(decoder_state, strict=True)
    decoder.eval().to(device)
    lfq.eval().to(device)

    param_counts = {}
    if encoder is not None:
        param_counts["encoder"] = sum(p.numel() for p in encoder.parameters())
    param_counts["decoder"] = sum(p.numel() for p in decoder.parameters())
    return {
        "encoder": encoder,
        "decoder": decoder,
        "lfq": lfq,
        "param_counts": param_counts,
        "selection": selection,
        "weights_only": weights_only,
    }


def load_ckpt_state(torch: Any, ckpt_path: Path) -> tuple[dict[str, Any], bool]:
    if not ckpt_path.exists():
        raise SystemExit(f"Checkpoint not found: {ckpt_path}")
    try:
        checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=True)
        weights_only = True
    except Exception:
        checkpoint = torch.load(ckpt_path, map_location="cpu", weights_only=False)
        weights_only = False
    state = checkpoint.get("state_dict") if isinstance(checkpoint, dict) else None
    if not isinstance(state, dict):
        raise SystemExit("Checkpoint does not expose a state_dict.")
    return state, weights_only


def select_ema_state(state_dict: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Replicate the upstream EMA preference for encoder/decoder keys.

    Upstream stores EMA weights with a `model_ema.` prefix and dot-stripped
    names (e.g. `model_ema.encoderconv_inweight`). The upstream loader maps
    dot-stripped names back to the canonical dotted names of the plain keys.
    This version is order-independent: every plain encoder/decoder key uses
    its EMA twin when present; non-encoder/decoder EMA entries (e.g. `decay`,
    `num_updates`) are ignored.
    """
    ema: dict[str, Any] = {}
    plain: dict[str, Any] = {}
    for key, value in state_dict.items():
        if key.startswith("model_ema."):
            ema[key[len("model_ema."):]] = value
        else:
            plain[key] = value

    encoder_state: dict[str, Any] = {}
    decoder_state: dict[str, Any] = {}
    matched_ema: set[str] = set()
    plain_used = 0
    ignored_plain: list[str] = []
    for key, value in plain.items():
        if not (key.startswith("encoder.") or key.startswith("decoder.")):
            ignored_plain.append(key)
            continue
        dotless = key.replace(".", "")
        if dotless in ema:
            value = ema[dotless]
            matched_ema.add(dotless)
        else:
            plain_used += 1
        if key.startswith("encoder."):
            encoder_state[key[len("encoder."):]] = value
        else:
            decoder_state[key[len("decoder."):]] = value

    selection = {
        "plain_keys": len(plain),
        "ema_keys": len(ema),
        "ema_used": len(matched_ema),
        "plain_used": plain_used,
        "ema_ignored": sorted(set(ema) - matched_ema),
        "plain_ignored": sorted(ignored_plain),
    }
    return encoder_state, decoder_state, selection


def load_input_tensor(torch: Any, args: argparse.Namespace, device: str) -> tuple[Any, dict[str, Any]]:
    if args.input_image:
        return load_image_tensor(torch, Path(args.input_image), args.image_size, device)
    total = 3 * args.image_size * args.image_size
    values = torch.linspace(-1.0, 1.0, steps=total, dtype=torch.float32)
    tensor = values.reshape(1, 3, args.image_size, args.image_size).to(device)
    meta = {
        "path": None,
        "file_sha256": None,
        "tensor_sha256": sha256(tensor_bytes(tensor)),
        "synthetic": True,
    }
    return tensor, meta


def load_image_tensor(torch: Any, path: Path, image_size: int, device: str) -> tuple[Any, dict[str, Any]]:
    try:
        from PIL import Image  # type: ignore
        import numpy as np  # type: ignore
    except ImportError as error:
        raise SystemExit("--input-image requires Pillow and numpy in the local environment.") from error
    image = Image.open(path).convert("RGB").resize((image_size, image_size))
    array = np.asarray(image).astype("float32") / 127.5 - 1.0
    tensor = torch.from_numpy(array).permute(2, 0, 1).unsqueeze(0)
    tensor = tensor.to(device)
    meta = {
        "path": str(path.resolve()),
        "file_sha256": file_sha256(path),
        "tensor_sha256": sha256(tensor_bytes(tensor)),
        "synthetic": False,
    }
    return tensor, meta


def run_roundtrip(
    torch: Any,
    components: dict[str, Any],
    image: Any,
    args: argparse.Namespace,
    device: str,
    run_index: int,
) -> dict[str, Any]:
    encoder = components["encoder"]
    decoder = components["decoder"]
    lfq = components["lfq"]
    grid_h = args.image_size // args.downsample_size
    grid_w = grid_h

    with torch.no_grad():
        hidden = encoder(image)
        quant, _, indices = lfq(hidden)
        tokens_flat = indices.detach().to("cpu").reshape(1, grid_h * grid_w)
        latent = lfq.get_codebook_entry(tokens_flat.to(device), (1, grid_h, grid_w, args.codebook_dim), None)
        exact_fraction = float((latent == quant).float().mean().item())
        max_abs_diff = float((latent - quant).abs().max().item())
        decoded = decoder(latent)
        re_hidden = encoder(decoded.clamp(-1.0, 1.0))
        _, _, re_indices = lfq(re_hidden)
        re_tokens = re_indices.detach().to("cpu").reshape(1, grid_h * grid_w)

    token_bytes = tensor_bytes(tokens_flat)
    reencoded_bytes = tensor_bytes(re_tokens)
    decoded_bytes = tensor_bytes(decoded.detach().to("cpu").contiguous())
    latent_bytes = tensor_bytes(quant.detach().to("cpu").contiguous())
    mismatches = int((tokens_flat != re_tokens).sum().item())
    total = int(tokens_flat.numel())
    png_bytes = decoded_to_png_bytes(torch, decoded)
    if args.png_dir:
        png_dir = Path(args.png_dir)
        png_dir.mkdir(parents=True, exist_ok=True)
        (png_dir / f"om2-decode-run{run_index + 1}.png").write_bytes(png_bytes)

    return {
        "run": run_index + 1,
        "token_sha256": sha256(token_bytes),
        "decoded_sha256": sha256(decoded_bytes),
        "reencoded_token_sha256": sha256(reencoded_bytes),
        "latent_sha256": sha256(latent_bytes),
        "png_sha256": sha256(png_bytes),
        "token_count": total,
        "token_mismatches": mismatches,
        "token_hamming_rate": mismatches / total if total else 1.0,
        "decoded_shape": list(decoded.shape),
        "latent_max_abs_diff": max_abs_diff,
        "latent_exact_fraction": exact_fraction,
    }


def decoded_to_png_bytes(torch: Any, decoded: Any) -> bytes:
    """Upstream `custom_to_pil` conversion, pinned for deterministic PNG bytes."""
    import io

    from PIL import Image  # type: ignore

    x = decoded.detach().cpu().to(torch.float32)
    x = torch.clamp(x, -1.0, 1.0)
    x = (x + 1.0) / 2.0
    array = x.permute(0, 2, 3, 1).numpy()
    rgb = (255 * array).astype("uint8")[0]
    buffer = io.BytesIO()
    Image.fromarray(rgb).save(buffer, format="PNG", optimize=False, compress_level=6)
    return buffer.getvalue()


def tensor_bytes(tensor: Any) -> bytes:
    array = tensor.detach().cpu().numpy()
    return array.tobytes(order="C")


def all_equal(values: list[str]) -> bool:
    return len(set(values)) == 1


def environment(torch: Any, components: dict[str, Any], device: str) -> dict[str, Any]:
    result: dict[str, Any] = {
        "python_version": platform.python_version(),
        "platform": platform.platform(),
        "torch_version": getattr(torch, "__version__", "unknown"),
        "device": device,
        "threads": torch.get_num_threads(),
        "deterministic_algorithms": bool(torch.are_deterministic_algorithms_enabled()),
        "param_counts": components["param_counts"],
        "state_selection": components["selection"],
    }
    if device == "cuda" and torch.cuda.is_available():
        result["cuda_version"] = getattr(torch.version, "cuda", None)
        result["device_name"] = torch.cuda.get_device_name(0)
    return result


def repo_commit(repo_root: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            encoding="utf-8",
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip()


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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
