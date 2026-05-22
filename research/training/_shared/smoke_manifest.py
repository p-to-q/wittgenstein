"""CPU-only synthetic smoke for the training manifest spine.

Run from the repository root:

    python -m research.training._shared.smoke_manifest

The smoke writes a tiny deterministic checkpoint payload and a training
manifest under artifacts/training-smoke/. It does not import torch or touch
real datasets.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from .manifest import (
    MetricSnapshot,
    TrainingDatasetRef,
    TrainingManifest,
    hash_file_sha256,
    write_training_manifest,
)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Write a synthetic training manifest receipt.")
    parser.add_argument(
        "--out-dir",
        default="artifacts/training-smoke",
        help="Directory for the synthetic checkpoint and manifest.",
    )
    parser.add_argument("--run-id", default="training-smoke")
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--git-sha", default=os.environ.get("GITHUB_SHA"))
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    checkpoint_path = out_dir / "checkpoint.bin"
    checkpoint_path.write_bytes(f"wittgenstein-training-smoke:{args.seed}\n".encode("utf-8"))
    checkpoint_sha256 = hash_file_sha256(checkpoint_path)

    manifest = TrainingManifest(
        run_id=args.run_id,
        program="synthetic-smoke",
        git_sha=args.git_sha,
        seed=args.seed,
        command=[sys.executable, "-m", "research.training._shared.smoke_manifest"],
        checkpoint_path=str(checkpoint_path),
        checkpoint_sha256=checkpoint_sha256,
        datasets=[
            TrainingDatasetRef(
                name="synthetic",
                split="smoke",
                uri="memory://synthetic-training-smoke",
                sha256=checkpoint_sha256,
                sample_count=1,
            ),
        ],
        metrics=[MetricSnapshot(name="loss", value=0.0, step=1, split="smoke")],
        framework={"python": sys.version.split()[0], "training": "stdlib-smoke"},
        notes=[
            "CPU-only receipt smoke. This is not a real tokenizer, adapter, or LLM-head run.",
        ],
    )
    manifest_path = write_training_manifest(manifest, out_dir / "manifest.json")
    print(manifest_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
