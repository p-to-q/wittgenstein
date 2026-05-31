#!/usr/bin/env python3
"""Aggregate score chart generator.

Reads a directory of score-receipt JSON files (produced by clipscore /
wer / disc_score) and writes a single chart summarizing the aggregate
quality picture for a release tag.

Per docs/roadmap.md Phase 4: "Chart generator producing
artifacts/benchmarks/<tag>.png".

See benchmarks/tools/README.md for the full contract.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
from matplotlib import pyplot as plt  # noqa: E402

from score_receipt import ScoreReceipt, load_score_receipts  # noqa: E402


def _render_chart(receipts: list[ScoreReceipt], out: Path, tag: str) -> None:
    grouped: dict[tuple[str, str], list[ScoreReceipt]] = {}
    for receipt in receipts:
        grouped.setdefault((receipt.metric.name, receipt.metric.unit), []).append(
            receipt
        )

    panel_count = len(grouped)
    max_rows = max(len(group) for group in grouped.values())
    height = max(4.0, panel_count * 2.6 + max_rows * 0.24)
    fig, axes = plt.subplots(panel_count, 1, figsize=(10, height), squeeze=False)
    palette = {
        "clipscore": "#3563E9",
        "wer": "#D64A3A",
        "disc_score": "#168A5B",
    }

    for axis, ((metric_name, unit), metric_points) in zip(axes.flat, grouped.items()):
        ordered = sorted(
            metric_points,
            key=lambda receipt: (receipt.tool, receipt.chart_label),
        )
        labels = [f"{receipt.tool}: {receipt.chart_label}" for receipt in ordered]
        values = [receipt.metric.value for receipt in ordered]
        colors = [palette.get(receipt.tool, "#6B7280") for receipt in ordered]
        y_positions = range(len(ordered))

        axis.barh(y_positions, values, color=colors)
        axis.set_yticks(list(y_positions), labels=labels)
        axis.invert_yaxis()
        axis.set_title(metric_name)
        axis.set_xlabel(unit or "score")
        axis.grid(axis="x", alpha=0.24)
        axis.spines["top"].set_visible(False)
        axis.spines["right"].set_visible(False)

        if values:
            max_value = max(values)
            pad = max(abs(max_value) * 0.02, 0.01)
            axis.set_xlim(right=max_value + max(abs(max_value), 1.0) * 0.16)
            for index, value in enumerate(values):
                axis.text(value + pad, index, f"{value:.3g}", va="center", fontsize=9)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    fig.suptitle(f"Wittgenstein benchmark scores - {tag}", fontsize=14, fontweight="bold")
    fig.text(
        0.01,
        0.01,
        f"Generated {generated_at} from {len(receipts)} score receipt(s). "
        "Raw metric units are not normalized.",
        fontsize=8,
        color="#4B5563",
    )
    fig.tight_layout(rect=(0, 0.04, 1, 0.95))

    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out, dpi=160)
    plt.close(fig)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="chart",
        description="Aggregate score chart generator.",
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

    receipts = load_score_receipts(args.receipts_dir)
    if not receipts:
        print(f"chart: no score receipts found in {args.receipts_dir}", file=sys.stderr)
        return 1

    _render_chart(receipts, args.out, args.tag)
    return 0


if __name__ == "__main__":
    sys.exit(main())
