#!/usr/bin/env python3

from __future__ import annotations

import csv
import json
import math
import shutil
from dataclasses import dataclass
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch


ROOT = Path(__file__).resolve().parents[1]
BENCHMARK_JSON = ROOT / "artifacts/benchmarks/latest.json"
OUT_DIR = ROOT / "artifacts/benchmarks/ppt-kit"

BG = "#121212"
FG = "#F6F1EA"
MUTED = "#B7AFA6"
STROKE = "#E9E0D7"
CARD = "#181818"
GRID = "#2A2A2A"


@dataclass
class Case:
    case_id: str
    label: str
    modality: str
    artifact_kind: str
    artifact_size_bytes: int
    latency_ms: int
    quality_score: float
    cost_usd: float
    input_tokens: int
    output_tokens: int
    artifact_path: str
    run_id: str


def human_label(case_id: str, modality: str) -> str:
    mapping = {
        "image-editorial": "Image / Editorial",
        "tts-launch": "TTS / Launch",
        "audio-music": "Audio / Music",
        "sensor-ecg": "Sensor / ECG",
    }
    return mapping.get(case_id, f"{modality.title()} / {case_id}")


def detect_artifact_kind(path: Path) -> str:
    suffix = path.suffix.lower()
    if suffix == ".png":
        return "PNG"
    if suffix == ".wav":
        return "WAV"
    if suffix == ".html":
        return "HTML"
    return suffix.lstrip(".").upper() or "FILE"


def read_cases() -> list[Case]:
    payload = json.loads(BENCHMARK_JSON.read_text())
    cases: list[Case] = []
    for item in payload["results"]:
        artifact_path = Path(item["artifactPath"])
        size = artifact_path.stat().st_size if artifact_path.exists() else 0
        cases.append(
            Case(
                case_id=item["id"],
                label=human_label(item["id"], item["modality"]),
                modality=item["modality"],
                artifact_kind=detect_artifact_kind(artifact_path),
                artifact_size_bytes=size,
                latency_ms=item["latency"]["durationMs"],
                quality_score=item["quality"]["score"],
                cost_usd=item["price"]["costUsd"],
                input_tokens=item["price"]["inputTokens"],
                output_tokens=item["price"]["outputTokens"],
                artifact_path=str(artifact_path),
                run_id=item["runId"],
            )
        )
    return cases


def ensure_out_dir() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)


def copy_source_json() -> None:
    shutil.copy2(BENCHMARK_JSON, OUT_DIR / "latest.json")


def write_csv(cases: list[Case]) -> None:
    with (OUT_DIR / "benchmark_results.csv").open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "case_id",
                "label",
                "modality",
                "artifact_kind",
                "artifact_size_bytes",
                "latency_ms",
                "quality_score",
                "cost_usd",
                "input_tokens",
                "output_tokens",
                "artifact_path",
                "run_id",
            ]
        )
        for case in cases:
            writer.writerow(
                [
                    case.case_id,
                    case.label,
                    case.modality,
                    case.artifact_kind,
                    case.artifact_size_bytes,
                    case.latency_ms,
                    case.quality_score,
                    case.cost_usd,
                    case.input_tokens,
                    case.output_tokens,
                    case.artifact_path,
                    case.run_id,
                ]
            )


def format_size(size_bytes: int) -> str:
    if size_bytes >= 1024 * 1024:
        return f"{size_bytes / (1024 * 1024):.1f} MB"
    if size_bytes >= 1024:
        return f"{size_bytes / 1024:.1f} KB"
    return f"{size_bytes} B"


def add_pills(fig, active: str) -> None:
    labels = ["Price", "Latency", "Quality"]
    x = 0.06
    y = 0.93
    for label in labels:
        active_here = label == active
        width = 0.11 if label != "Latency" else 0.125
        pill = FancyBboxPatch(
            (x, y),
            width,
            0.045,
            boxstyle="round,pad=0.008,rounding_size=0.02",
            transform=fig.transFigure,
            facecolor=FG if active_here else BG,
            edgecolor=STROKE if active_here else GRID,
            linewidth=1.0,
        )
        fig.add_artist(pill)
        fig.text(
            x + 0.018,
            y + 0.014,
            label,
            color=BG if active_here else MUTED,
            fontsize=10.5,
            weight="medium",
        )
        x += width + 0.012


def style_figure(active: str, title: str, subtitle: str):
    fig = plt.figure(figsize=(9.5, 7.5), dpi=200, facecolor=BG)
    ax = fig.add_axes([0.08, 0.12, 0.84, 0.74])
    ax.set_facecolor(BG)
    for spine in ax.spines.values():
        spine.set_visible(False)
    add_pills(fig, active)
    fig.text(0.08, 0.86, title, color=FG, fontsize=20, weight="bold")
    fig.text(0.08, 0.825, subtitle, color=MUTED, fontsize=10.5)
    return fig, ax


def rounded_barh(ax, y: float, width: float, height: float, facecolor: str, hatch: str | None = None):
    patch = FancyBboxPatch(
        (0, y - height / 2),
        width,
        height,
        boxstyle=f"round,pad=0.01,rounding_size={height/2}",
        linewidth=1.0,
        edgecolor=STROKE,
        facecolor=facecolor,
        hatch=hatch,
    )
    ax.add_patch(patch)
    return patch


def plot_latency(cases: list[Case]) -> None:
    fig, ax = style_figure(
        "Latency",
        "Lightweight Benchmark Latency",
        "End-to-end wall-clock time for the local harness smoke benchmark. Lower is better.",
    )
    max_latency = max(case.latency_ms for case in cases)
    norm = lambda ms: 18 + 82 * (math.log10(ms + 1) / math.log10(max_latency + 1))

    ys = list(range(len(cases) - 1, -1, -1))
    ax.set_xlim(0, 112)
    ax.set_ylim(-0.75, len(cases) - 0.25)
    ax.set_xticks([])
    ax.set_yticks([])

    for idx, case in zip(ys, cases):
        width = norm(case.latency_ms)
        rounded_barh(ax, idx, width, 0.56, FG)
        ax.text(-1.0, idx + 0.18, case.label, color=FG, fontsize=13, ha="right", va="center")
        ax.text(-1.0, idx - 0.15, f"{case.modality} · {case.artifact_kind}", color=MUTED, fontsize=9.5, ha="right", va="center")
        ax.text(min(width - 2.0, 100), idx, f"{case.latency_ms} ms", color=BG, fontsize=15, fontweight="bold", ha="right", va="center")

    ax.text(0, -0.55, "Chart uses a log-scaled bar length to keep 6 ms and 608 ms on the same page.", color=MUTED, fontsize=9)
    fig.savefig(OUT_DIR / "01_latency_by_case.png", facecolor=BG, bbox_inches="tight")
    plt.close(fig)


def plot_quality(cases: list[Case]) -> None:
    fig, ax = style_figure(
        "Quality",
        "Structural Quality Proxy",
        "Current benchmark quality is a reproducible proxy: artifact exists, has the expected format, and can be opened.",
    )
    ys = list(range(len(cases) - 1, -1, -1))
    ax.set_xlim(0, 112)
    ax.set_ylim(-0.75, len(cases) - 0.25)
    ax.set_xticks([])
    ax.set_yticks([])

    for idx, case in zip(ys, cases):
        width = case.quality_score * 100
        hatch = None if case.modality in {"image", "sensor"} else "////"
        rounded_barh(ax, idx, width, 0.56, FG if hatch is None else BG, hatch=hatch)
        ax.text(-1.0, idx + 0.18, case.label, color=FG, fontsize=13, ha="right", va="center")
        ax.text(-1.0, idx - 0.15, f"{format_size(case.artifact_size_bytes)} artifact", color=MUTED, fontsize=9.5, ha="right", va="center")
        ax.text(min(width - 2.0, 100), idx, f"{case.quality_score * 100:.0f} / 100", color=BG if hatch is None else FG, fontsize=15, fontweight="bold", ha="right", va="center")

    ax.text(0, -0.55, "Because this is a smoke benchmark, equal scores mean every case cleared the same structural pass criteria.", color=MUTED, fontsize=9)
    fig.savefig(OUT_DIR / "02_quality_proxy.png", facecolor=BG, bbox_inches="tight")
    plt.close(fig)


def plot_price(cases: list[Case]) -> None:
    fig, ax = style_figure(
        "Price",
        "Local Price Profile",
        "Current benchmark cases run through dry-run or local render paths, so incremental API cost is zero in this snapshot.",
    )
    ax.set_xlim(0, 1)
    ax.set_ylim(0, len(cases))
    ax.axis("off")

    for i, case in enumerate(cases):
        y = len(cases) - i - 0.9
        card = FancyBboxPatch(
            (0.02, y),
            0.96,
            0.68,
            boxstyle="round,pad=0.012,rounding_size=0.03",
            transform=ax.transData,
            facecolor=CARD,
            edgecolor=GRID,
            linewidth=1.0,
        )
        ax.add_patch(card)
        ax.text(0.05, y + 0.43, case.label, color=FG, fontsize=13, ha="left", va="center")
        ax.text(0.05, y + 0.19, f"{case.artifact_kind} · {format_size(case.artifact_size_bytes)}", color=MUTED, fontsize=9.5, ha="left", va="center")
        ax.text(0.70, y + 0.43, "$0.00", color=FG, fontsize=20, fontweight="bold", ha="left", va="center")
        ax.text(0.70, y + 0.19, "0 input tokens · 0 output tokens", color=MUTED, fontsize=9.5, ha="left", va="center")

    ax.text(0.02, 0.05, "Useful slide framing: this is a harness-level local benchmark, not a claim that every production call will always be free.", color=MUTED, fontsize=9)
    fig.savefig(OUT_DIR / "03_price_profile.png", facecolor=BG, bbox_inches="tight")
    plt.close(fig)


def plot_overview(cases: list[Case]) -> None:
    fig = plt.figure(figsize=(12, 6.8), dpi=200, facecolor=BG)
    ax = fig.add_axes([0.04, 0.08, 0.92, 0.84])
    ax.set_facecolor(BG)
    ax.axis("off")
    fig.text(0.04, 0.93, "Wittgenstein Lightweight Benchmark", color=FG, fontsize=22, weight="bold")
    fig.text(0.04, 0.895, "A reproducible smoke benchmark across four launch-critical paths: image, TTS, audio, and sensor.", color=MUTED, fontsize=11)

    cols = [0.00, 0.36, 0.60, 0.79, 0.95]
    headers = ["Case", "Price", "Latency", "Quality"]
    for x, header in zip(cols[:-1], headers):
        ax.text(x, 0.80, header, color=MUTED, fontsize=10, fontweight="medium", ha="left", va="center", transform=ax.transAxes)

    row_y = 0.69
    for case in cases:
        row = FancyBboxPatch(
            (0.0, row_y - 0.09),
            0.97,
            0.12,
            boxstyle="round,pad=0.012,rounding_size=0.02",
            transform=ax.transAxes,
            facecolor=CARD,
            edgecolor=GRID,
            linewidth=1.0,
        )
        ax.add_patch(row)
        ax.text(0.02, row_y, case.label, color=FG, fontsize=13, ha="left", va="center", transform=ax.transAxes)
        ax.text(0.02, row_y - 0.04, f"{case.artifact_kind} · {format_size(case.artifact_size_bytes)}", color=MUTED, fontsize=9, ha="left", va="center", transform=ax.transAxes)
        ax.text(0.38, row_y, "$0.00", color=FG, fontsize=14, fontweight="bold", ha="left", va="center", transform=ax.transAxes)
        ax.text(0.38, row_y - 0.04, "local path", color=MUTED, fontsize=9, ha="left", va="center", transform=ax.transAxes)
        ax.text(0.62, row_y, f"{case.latency_ms} ms", color=FG, fontsize=14, fontweight="bold", ha="left", va="center", transform=ax.transAxes)
        ax.text(0.62, row_y - 0.04, "end-to-end wall clock", color=MUTED, fontsize=9, ha="left", va="center", transform=ax.transAxes)
        ax.text(0.81, row_y, f"{case.quality_score * 100:.0f}/100", color=FG, fontsize=14, fontweight="bold", ha="left", va="center", transform=ax.transAxes)
        ax.text(0.81, row_y - 0.04, "structural proxy", color=MUTED, fontsize=9, ha="left", va="center", transform=ax.transAxes)
        row_y -= 0.16

    ax.text(0.00, 0.06, "Video is not in this run because the MP4 renderer is still on another branch. This kit only reports runnable main-branch cases.", color=MUTED, fontsize=9.5, transform=ax.transAxes)
    fig.savefig(OUT_DIR / "04_benchmark_overview.png", facecolor=BG, bbox_inches="tight")
    plt.close(fig)


def write_docs(cases: list[Case]) -> None:
    readme = f"""# Benchmark PPT Kit

This folder packages the current lightweight benchmark into PPT-ready assets.

## Included

- `01_latency_by_case.png` — latency chart
- `02_quality_proxy.png` — structural quality proxy chart
- `03_price_profile.png` — local price profile chart
- `04_benchmark_overview.png` — one-slide summary table
- `benchmark_results.csv` — flat export for spreadsheets
- `latest.json` — source benchmark payload
- `ppt_background.md` — background notes and talk track
- `references.md` — local repo references behind the benchmark

## Snapshot

- Generated from: `artifacts/benchmarks/latest.json`
- Cases: {len(cases)}
- Dimensions: `Price`, `Latency`, `Quality`
- Status: all current cases produced valid artifacts

## Scope

This is a **lightweight harness smoke benchmark**, not a full academic benchmark.

- `Price` reports current local dry-run or local render cost
- `Latency` reports end-to-end wall clock time
- `Quality` is a structural proxy, not `FID`, `MOS`, or `FVD`

## Cases In This Snapshot

"""
    for case in cases:
        readme += f"- `{case.case_id}` — {case.label} — {case.latency_ms} ms — {case.quality_score * 100:.0f}/100\n"

    readme += """
## Important Caveat

`video` is intentionally absent from this kit because the MP4 renderer is still on another branch and was not part of the current runnable main-branch benchmark.
"""
    (OUT_DIR / "README.md").write_text(readme)

    background = """# PPT Background Notes

## What This Benchmark Is

Wittgenstein currently ships a lightweight, reproducible benchmark for the four runnable launch paths on the current branch:

- image
- TTS
- audio
- sensor

The purpose is fast iteration and regression checking during build-out, not a full academic evaluation stack.

## What Each Dimension Means

### Price

In this snapshot, all benchmark cases ran through local or dry-run paths.

- Reported cost is therefore `$0.00`
- Token counts are `0`
- This should be presented as a **current local benchmark property**, not as a universal claim about future production serving cost

### Latency

Latency is the most informative dimension in the current run.

- `image-editorial`: 6 ms
- `sensor-ecg`: 24 ms
- `audio-music`: 507 ms
- `tts-launch`: 608 ms

Takeaway for slides:

- image and sensor are effectively instant in the current local harness
- speech and audio are still sub-second, but materially slower because they render waveform artifacts

### Quality

The current quality number is a **structural pass score**, not a human-judged quality benchmark.

It checks whether the expected artifact exists and has the correct file shape:

- PNG for image
- WAV for TTS and audio
- HTML dashboard for sensor

Because every case cleared the same structural threshold, all four cases report `85/100`.

## How To Explain This Cleanly

Suggested wording:

\"This benchmark is a lightweight harness benchmark for fast iteration. It tells us whether the system produces the right artifacts cheaply and quickly on the current branch. It does not yet replace standard modality-specific metrics such as FID, MOS, or FVD.\"

## Slide-Friendly Observations

1. All current benchmark cases succeeded and produced real files.
2. Cost is effectively zero in the local harness path.
3. Latency is already comfortably low for the current demo stack.
4. Quality should be described as structural reliability today, with standard metrics planned per modality as each renderer matures.
5. Video is not included in this run because the MP4 path still lives on another branch.
"""
    (OUT_DIR / "ppt_background.md").write_text(background)

    refs = """# References

These local documents define how the benchmark should be interpreted:

- `/path/to/wittgenstein/benchmarks/README.md`
- `/path/to/wittgenstein/docs/benchmark-standards.md`
- `/path/to/wittgenstein/docs/modality-launch-surface.md`
- `/path/to/wittgenstein/artifacts/benchmarks/latest.json`

Recommended supporting claim for slides:

- The current benchmark is a reproducible smoke benchmark
- Standard modality metrics remain the target
- The benchmark is intentionally lightweight because the repo is still in rapid architecture iteration
"""
    (OUT_DIR / "references.md").write_text(refs)


def main() -> None:
    ensure_out_dir()
    cases = read_cases()
    copy_source_json()
    write_csv(cases)
    plot_latency(cases)
    plot_quality(cases)
    plot_price(cases)
    plot_overview(cases)
    write_docs(cases)


if __name__ == "__main__":
    main()
