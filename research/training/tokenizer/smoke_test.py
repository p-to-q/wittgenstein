"""Smoke test for the tokenizer training loop.

Runs the training loop with a 5-step synthetic-data config to validate:
  - Model construction
  - Loss assembly (with LPIPS skipped if missing)
  - Optimizer step
  - DDP plumbing (skipped if not launched under torchrun — single-process OK)
  - Manifest emission shape
  - Checkpoint write path

Should complete in <60s on a single A800 GPU; <5min on CPU.

Run:
    python -m research.training.tokenizer.smoke_test
or (under torchrun for multi-GPU smoke):
    torchrun --nproc-per-node 2 -m research.training.tokenizer.smoke_test
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

# Ensure repo root is importable
_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from research.training.tokenizer.config import smoke_config
from research.training.tokenizer.train import train


def main() -> int:
    import os
    rank = int(os.environ.get("RANK", "0"))

    cfg = smoke_config()
    # Smoke writes to a stable temp-style location so re-runs don't accumulate
    cfg.out_root = str(_REPO_ROOT / "research" / "training" / "_shared" / "runs" / "smoke")
    if rank == 0:
        print("[smoke] starting...")
    summary = train(cfg)
    if rank != 0:
        # Non-leader ranks just need to exit cleanly — manifest verification
        # only makes sense on the writer rank.
        return 0
    print("[smoke] summary:", json.dumps(summary, indent=2, default=str))

    # Sanity-check that a manifest was actually written
    run_dir = Path(summary["run_dir"])
    manifests = list((run_dir / "ckpts").glob("*.manifest.json"))
    if not manifests:
        print("[smoke] FAIL: no manifest written")
        return 1
    acceptance = summary.get("acceptance", {})
    if summary.get("final_step") != cfg.max_steps:
        print(
            f"[smoke] FAIL: final_step={summary.get('final_step')} expected={cfg.max_steps}"
        )
        return 1
    if acceptance.get("manifest_written") is not True:
        print("[smoke] FAIL: final manifest missing from acceptance summary")
        return 1
    if acceptance.get("final_checkpoint_written") is not True:
        print("[smoke] FAIL: final checkpoint missing from acceptance summary")
        return 1
    if acceptance.get("used_synthetic_data") is not True:
        print("[smoke] FAIL: smoke run did not report synthetic dataset usage")
        return 1
    if acceptance.get("dataset_corrupt_count", 0) != 0:
        print(
            f"[smoke] FAIL: corrupt_count={acceptance.get('dataset_corrupt_count')} during smoke"
        )
        return 1
    print(f"[smoke] PASS: {len(manifests)} manifest(s) at {run_dir / 'ckpts'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
