"""CPU-only smoke for the training-run manifest receipt.

This does not train a model. It writes a tiny synthetic checkpoint and the
canonical `witt.training.run-manifest/v0.1` receipt without importing torch,
so CI can enforce the receipt floor before GPU training exists.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from .experiment_tracking import JsonlExperimentTracker, TrainingExperimentManifestReference
from .manifest import (
    TRAINING_RUN_MANIFEST_SCHEMA_VERSION,
    TrainingRunHardware,
    TrainingRunManifest,
    capture_dataset_fingerprint,
    capture_docker_image_sha,
    capture_git_sha,
    capture_lockfile_sha256,
    capture_training_checkpoint,
    new_run_id,
    sha256_file,
    synthetic_optimizer_checkpoint,
    utc_now_iso,
    write_training_config_snapshot,
    write_training_run_manifest,
)


REPO_ROOT = Path(__file__).resolve().parents[3]


def build_smoke_manifest(out_root: Path, run_id: str | None = None) -> dict[str, Any]:
    run_id = run_id or new_run_id("training-smoke")
    run_dir = out_root / run_id
    ckpt_dir = run_dir / "ckpts"
    ckpt_dir.mkdir(parents=True, exist_ok=True)

    dataset_marker = run_dir / "synthetic-dataset.txt"
    dataset_marker.write_text("wittgenstein synthetic training manifest smoke\n", encoding="utf-8")
    checkpoint_path = ckpt_dir / "final.synthetic"
    checkpoint_path.write_bytes(b"wittgenstein synthetic checkpoint bytes\n")
    tracker = JsonlExperimentTracker(run_dir, run_id)
    tracker.log_params({"purpose": "stdlib training-manifest smoke", "subprogram": "tokenizer"})
    tracker.log_metrics(0, {"loss": 0.0, "wallClockSec": 0.0})
    config_ref = write_training_config_snapshot(
        run_dir / "config.json",
        {
            "purpose": "stdlib training-manifest smoke",
            "realTraining": False,
            "subprogram": "tokenizer",
            "experimentTracking": tracker.config_reference(),
        },
    )

    started_at = utc_now_iso()
    manifest = TrainingRunManifest(
        schemaVersion=TRAINING_RUN_MANIFEST_SCHEMA_VERSION,
        runId=run_id,
        subprogram="tokenizer",
        startedAt=started_at,
        finishedAt=utc_now_iso(),
        harnessGitSha=capture_git_sha(REPO_ROOT),
        trainingCodeGitSha=capture_git_sha(REPO_ROOT),
        dockerImageSha=capture_docker_image_sha(),
        lockfileSha256=capture_lockfile_sha256(REPO_ROOT / "research" / "training" / "requirements.txt"),
        dataset=capture_dataset_fingerprint(
            "synthetic-manifest-smoke",
            [dataset_marker],
            revision="synthetic-smoke",
            cache_per_file=True,
        ),
        seed=0,
        stepCount=0,
        wallClockSec=0.0,
        hardware=TrainingRunHardware(gpuModel="cpu:stdlib-smoke", gpuCount=0, nodeCount=1),
        optimizer=synthetic_optimizer_checkpoint(),
        evalSnapshots=[],
        checkpoint=capture_training_checkpoint(checkpoint_path, weights_license="permissive"),
        trainingConfig=config_ref,
    )
    manifest_path = run_dir / "manifest.json"
    write_training_run_manifest(manifest, manifest_path)
    tracker.finish(
        TrainingExperimentManifestReference(
            runId=run_id,
            manifestPath=str(manifest_path),
            manifestSha256=sha256_file(manifest_path),
            checkpointSha256=sha256_file(checkpoint_path),
        )
    )
    return {
        "runId": run_id,
        "runDir": str(run_dir),
        "manifestPath": str(manifest_path),
        "checkpointPath": str(checkpoint_path),
        "experimentReceiptPath": str(tracker.receipt_path),
        "experimentMetricsPath": str(tracker.metrics_path),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--out-root",
        type=Path,
        default=REPO_ROOT / "artifacts" / "runs",
        help="Output root for the synthetic run directory.",
    )
    parser.add_argument("--run-id", default=None, help="Optional deterministic run id for tests.")
    args = parser.parse_args()

    summary = build_smoke_manifest(args.out_root, run_id=args.run_id)
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
