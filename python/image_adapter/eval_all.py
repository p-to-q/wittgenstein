#!/usr/bin/env python3
"""Run a compact eval bundle for the image adapter.

This is meant to be a single command that prints:
- token metrics (MAE / exact-match) on encoded JSONL
- spectrum health checks (singular values + effective rank) on weights
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True, help="Path to adapter_mlp.json")
    parser.add_argument("--data", type=Path, required=True, help="Path to encoded.jsonl (train/encoded.jsonl format)")
    parser.add_argument("--top-k", type=int, default=8, help="How many top singular values/eigs to print")
    parser.add_argument("--latent-dump", type=Path, default=None, help="Optional .npy file with (N,D) latent/features")
    args = parser.parse_args()

    try:
        from eval_metrics import evaluate_token_metrics
    except ModuleNotFoundError as e:
        raise SystemExit(
            "Missing Python dependencies for token-metric evaluation. "
            "Run `pip install -r requirements.txt` under python/image_adapter/."
        ) from e

    metrics = evaluate_token_metrics(args.weights, args.data)
    print(
        f"token_metrics: samples={metrics['samples']} "
        f"token_mae={metrics['token_mae']:.4f} "
        f"token_exact_rate={metrics['token_exact_rate']:.4f}"
    )
    print("spectrum_metrics:")

    # Reuse the spectrum_check CLI implementation for consistent formatting.
    from spectrum_check import main as spectrum_main
    import sys

    argv = ["spectrum_check.py", "--weights", str(args.weights), "--top-k", str(args.top_k)]
    if args.latent_dump is not None:
        argv += ["--latent-dump", str(args.latent_dump)]
    old_argv = sys.argv
    try:
        sys.argv = argv
        spectrum_main()
    finally:
        sys.argv = old_argv


if __name__ == "__main__":
    main()
