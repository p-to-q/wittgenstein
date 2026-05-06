#!/usr/bin/env python3
"""Discriminative-score classifier for sensor artifacts (Phase 4 stub).

Trains (or loads) a small classifier that distinguishes real-recording
sensor traces from generated traces; the score is the classifier's
accuracy in distinguishing — lower is better (closer to 0.5 = generated
is indistinguishable from real). Today this is a typed skeleton that
raises NotImplementedError so the contract is locked before a model
choice and dataset are committed to.

To implement:
    1. Pick a small classifier architecture (e.g. 1D-CNN or random forest
       over a few HRV / spectral-entropy features). Document the choice.
    2. Pick a real-recording dataset (PhysioNet MIT-BIH for ECG, etc.)
       — coordinate with #155 dataset-lock decision.
    3. Replace the NotImplementedError with the train + eval pass.
    4. Write the score receipt JSON to args.out.
    5. Drop the test that asserts NotImplementedError fires.

See benchmarks/tools/README.md for the full contract.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _read_manifest(manifest_path: Path) -> dict:
    if not manifest_path.exists():
        raise FileNotFoundError(f"Run manifest not found: {manifest_path}")
    return json.loads(manifest_path.read_text())


def _assert_sensor_modality(manifest: dict) -> None:
    codec = manifest.get("codec", "")
    if codec != "sensor":
        raise ValueError(
            f"disc_score expects a sensor manifest; got codec={codec!r}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="disc_score",
        description="Discriminative-score classifier for sensor artifacts (Phase 4 stub).",
    )
    parser.add_argument(
        "--artifact",
        type=Path,
        required=True,
        help="Path to sensor .csv artifact produced by sensor codec.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        required=True,
        help="Path to artifacts/runs/<run-id>/manifest.json for the same run.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Where to write the score receipt JSON.",
    )
    args = parser.parse_args(argv)

    if not args.artifact.exists():
        print(f"disc_score: artifact not found: {args.artifact}", file=sys.stderr)
        return 1

    manifest = _read_manifest(args.manifest)
    _assert_sensor_modality(manifest)

    raise NotImplementedError(
        "disc_score: classifier training/inference is not yet implemented. "
        "Pick a real-recording dataset (coordinate with #155) and a small "
        "classifier architecture, then replace this stub. "
        "See benchmarks/tools/README.md."
    )


if __name__ == "__main__":
    sys.exit(main())
