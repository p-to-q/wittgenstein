#!/usr/bin/env python3
"""Aggregate score chart generator (Phase 4 stub).

Reads a directory of score-receipt JSON files (produced by clipscore /
wer / disc_score) and writes a single chart summarizing the aggregate
quality picture for a release tag. Today this is a typed skeleton that
raises NotImplementedError so the contract is locked before a chart
library and aggregation rule are committed to.

Per ROADMAP.md Phase 4: "Chart generator producing
artifacts/benchmarks/<tag>.png".

To implement:
    1. Pick a chart library (matplotlib, since polyglot-mini already
       depends on it; no new dependency).
    2. Decide aggregation: per-modality scatter, per-runner box, or
       single multi-panel figure. Pick one.
    3. Replace the NotImplementedError with the read + render pass.
    4. Write the PNG to args.out.
    5. Drop the test that asserts NotImplementedError fires.

See benchmarks/tools/README.md for the full contract.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _read_score_receipts(receipts_dir: Path) -> list[dict]:
    if not receipts_dir.is_dir():
        raise FileNotFoundError(f"Score-receipts directory not found: {receipts_dir}")
    receipts: list[dict] = []
    for path in sorted(receipts_dir.glob("*.json")):
        receipts.append(json.loads(path.read_text()))
    return receipts


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="chart",
        description="Aggregate score chart generator (Phase 4 stub).",
    )
    parser.add_argument(
        "--receipts-dir",
        type=Path,
        required=True,
        help="Directory of *.json score receipts produced by clipscore/wer/disc_score.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Where to write the aggregate chart PNG.",
    )
    parser.add_argument(
        "--tag",
        type=str,
        required=False,
        default="unreleased",
        help="Release tag label for the chart title (e.g. 'v0.3.0-alpha.1').",
    )
    args = parser.parse_args(argv)

    receipts = _read_score_receipts(args.receipts_dir)
    if not receipts:
        print(f"chart: no score receipts found in {args.receipts_dir}", file=sys.stderr)
        return 1

    raise NotImplementedError(
        "chart: chart rendering is not yet implemented. "
        "Pick a chart shape (per-modality scatter / per-runner box / multi-panel) "
        "and replace this stub with matplotlib calls. "
        "See benchmarks/tools/README.md."
    )


if __name__ == "__main__":
    sys.exit(main())
