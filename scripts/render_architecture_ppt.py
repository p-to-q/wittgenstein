#!/usr/bin/env python3

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "artifacts/benchmarks/ppt-kit"

BG = "#121212"
CARD = "#181818"
CARD_ALT = "#1E1E1E"
FG = "#F6F1EA"
MUTED = "#B7AFA6"
GRID = "#2A2A2A"
STROKE = "#E9E0D7"
ACCENT = "#EFE8DF"
HATCH = "#D9D0C7"
GREEN = "#DCE8DD"

W = 1600
H = 900


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = []
    if bold:
        candidates.extend(
            [
                "DejaVuSans-Bold.ttf",
                "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
                "/Library/Fonts/Arial Bold.ttf",
            ]
        )
    else:
        candidates.extend(
            [
                "DejaVuSans.ttf",
                "/System/Library/Fonts/Supplemental/Arial.ttf",
                "/Library/Fonts/Arial.ttf",
            ]
        )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


TITLE = font(48, bold=True)
SUBTITLE = font(22)
LABEL = font(18)
BODY = font(24)
BODY_BOLD = font(24, bold=True)
SMALL = font(18)
SMALL_BOLD = font(18, bold=True)


def make_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGB", (W, H), BG)
    return image, ImageDraw.Draw(image)


def rounded_box(draw, xy, fill=CARD, outline=GRID, width=2, radius=26):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text(draw, xy, content, fill=FG, fnt=BODY, anchor="la"):
    draw.text(xy, content, font=fnt, fill=fill, anchor=anchor)


def wrapped_text(draw, x, y, content, max_width, fnt=BODY, fill=MUTED, line_gap=8):
    words = content.split()
    lines = []
    current = ""
    for word in words:
        trial = word if not current else f"{current} {word}"
        width = draw.textbbox((0, 0), trial, font=fnt)[2]
        if width <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)

    cy = y
    for line in lines:
        draw.text((x, cy), line, font=fnt, fill=fill)
        bbox = draw.textbbox((x, cy), line, font=fnt)
        cy += (bbox[3] - bbox[1]) + line_gap
    return cy


def pill(draw, x, y, w, h, label_text, active=False):
    rounded_box(draw, (x, y, x + w, y + h), fill=FG if active else BG, outline=STROKE if active else GRID, width=2, radius=h // 2)
    text(draw, (x + 24, y + h / 2), label_text, fill=BG if active else MUTED, fnt=LABEL, anchor="lm")


def header(draw, title, subtitle, active="Architecture"):
    pills = ["Architecture", "Pipeline", "Benchmark", "Artifacts"]
    x = 74
    y = 34
    widths = {"Architecture": 190, "Pipeline": 132, "Benchmark": 150, "Artifacts": 130}
    for item in pills:
        pill(draw, x, y, widths[item], 52, item, active=item == active)
        x += widths[item] + 14
    text(draw, (74, 136), title, fnt=TITLE)
    text(draw, (74, 192), subtitle, fill=MUTED, fnt=SUBTITLE)


def arrow(draw, x1, y1, x2, y2, fill=STROKE, width=4):
    draw.line((x1, y1, x2, y2), fill=fill, width=width)
    angle = math.atan2(y2 - y1, x2 - x1)
    size = 14
    p1 = (x2, y2)
    p2 = (x2 - size * math.cos(angle - math.pi / 6), y2 - size * math.sin(angle - math.pi / 6))
    p3 = (x2 - size * math.cos(angle + math.pi / 6), y2 - size * math.sin(angle + math.pi / 6))
    draw.polygon([p1, p2, p3], fill=fill)


def save(image: Image.Image, name: str):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    image.save(OUT_DIR / name)


def draw_layers_stack():
    image, draw = make_canvas()
    header(draw, "Five-Layer Harness", "Wittgenstein is organized so modality logic lands in code and contracts, not hidden prompt prose.")

    layers = [
        ("L1", "Harness / Runtime", "Routing, retry, budget, telemetry, sandbox, invariants, and provider orchestration.", FG),
        ("L2", "IR / Codec", "One structured modality IR per path, validated with schemas and codec-owned prompt preambles.", CARD_ALT),
        ("L3", "Renderer / Decoder", "Deterministic renderer or frozen decoder turns parsed IR into a real file artifact.", FG),
        ("L4", "Optional Adapter", "Small learned bridge when the decoder needs latent-code alignment.", CARD_ALT),
        ("L5", "Packaging / Distribution", "CLI, docs, install surface, artifact conventions, and operator-facing ergonomics.", FG),
    ]

    x = 94
    y = 270
    for idx, (layer, title, desc, fill) in enumerate(layers):
        h = 96
        rounded_box(draw, (x, y, 1506, y + h), fill=CARD if fill == FG else CARD_ALT, outline=GRID, width=2, radius=28)
        tag_fill = ACCENT if idx % 2 == 0 else BG
        tag_text = BG if idx % 2 == 0 else FG
        rounded_box(draw, (x + 24, y + 22, x + 88, y + 70), fill=tag_fill, outline=STROKE if idx % 2 == 0 else GRID, width=2, radius=22)
        text(draw, (x + 56, y + 46), layer, fill=tag_text, fnt=SMALL_BOLD, anchor="mm")
        text(draw, (x + 120, y + 38), title, fnt=BODY_BOLD, anchor="lm")
        wrapped_text(draw, x + 120, y + 54, desc, 1220, fnt=SMALL, fill=MUTED, line_gap=6)
        if idx < len(layers) - 1:
            arrow(draw, 800, y + h, 800, y + h + 28, fill=GRID, width=5)
        y += 116

    text(draw, (96, 852), "Slide cue: the model is only one part of the system; the repo treats runtime, codec, decoder, and packaging as separate layers.", fill=MUTED, fnt=SMALL)
    save(image, "05_architecture_layers.png")


def draw_system_pipeline():
    image, draw = make_canvas()
    header(draw, "System Pipeline", "One harness routes requests into modality-specific codecs, then packages artifacts and traces into reproducible runs.", active="Pipeline")

    steps = [
        (90, 330, 250, 130, "User / CLI", "Prompt, flags, seed, output path"),
        (400, 330, 250, 130, "Core Runtime", "Route, schema preamble, retry, budget"),
        (710, 330, 250, 130, "Codec", "Parse and validate modality IR"),
        (1020, 250, 230, 90, "Image", "scene spec → adapter → decoder"),
        (1020, 360, 230, 90, "Audio / TTS", "audio plan → waveform route"),
        (1020, 470, 230, 90, "Sensor", "algorithm spec → deterministic signals"),
        (1300, 330, 220, 130, "Artifacts + Manifest", "artifact file, manifest.json, llm-input/output"),
    ]

    for x1, y1, w1, h1, title, desc in steps:
        rounded_box(draw, (x1, y1, x1 + w1, y1 + h1), fill=CARD, outline=GRID, width=2, radius=28)
        text(draw, (x1 + 26, y1 + 34), title, fnt=BODY_BOLD)
        wrapped_text(draw, x1 + 26, y1 + 66, desc, w1 - 52, fnt=SMALL, fill=MUTED, line_gap=6)

    arrow(draw, 340, 395, 400, 395)
    arrow(draw, 650, 395, 710, 395)
    arrow(draw, 960, 395, 1020, 295)
    arrow(draw, 960, 395, 1020, 405)
    arrow(draw, 960, 395, 1020, 515)
    arrow(draw, 1250, 295, 1300, 355)
    arrow(draw, 1250, 405, 1300, 395)
    arrow(draw, 1250, 515, 1300, 435)

    rounded_box(draw, (1020, 610, 1520, 736), fill=CARD_ALT, outline=GRID, width=2, radius=28)
    text(draw, (1046, 644), "Current runnable set", fnt=SMALL_BOLD)
    text(draw, (1046, 682), "image · tts · audio · sensor", fnt=BODY_BOLD)
    text(draw, (1046, 714), "video stays outside the current benchmark run until the MP4 branch is merged.", fill=MUTED, fnt=SMALL)

    text(draw, (92, 842), "Slide cue: this diagram is useful when you need to explain that the harness owns control flow while codecs own modality contracts.", fill=MUTED, fnt=SMALL)
    save(image, "06_system_pipeline.png")


def draw_image_path():
    image, draw = make_canvas()
    header(draw, "Strict Image Path", "Image has one shipping path only: semantics in JSON, latent translation in the adapter, pixels in the frozen decoder.", active="Pipeline")

    boxes = [
        (84, 340, 260, 126, "Text LLM", "Returns scene semantics, composition, style, and decoder hints."),
        (408, 340, 290, 126, "Scene Spec JSON", "Validated structured output. No SVG, no Canvas, no raw pixels."),
        (762, 340, 250, 126, "Adapter", "Small learned scene → latent bridge."),
        (1076, 340, 250, 126, "Frozen Decoder", "Deterministically reconstructs raster pixels."),
        (1390, 340, 128, 126, "PNG", "Final image artifact"),
    ]
    for x1, y1, w1, h1, title, desc in boxes:
        rounded_box(draw, (x1, y1, x1 + w1, y1 + h1), fill=CARD, outline=GRID, width=2, radius=28)
        text(draw, (x1 + 24, y1 + 36), title, fnt=BODY_BOLD)
        wrapped_text(draw, x1 + 24, y1 + 68, desc, w1 - 48, fnt=SMALL, fill=MUTED, line_gap=6)

    arrow(draw, 344, 403, 408, 403)
    arrow(draw, 698, 403, 762, 403)
    arrow(draw, 1012, 403, 1076, 403)
    arrow(draw, 1326, 403, 1390, 403)

    rounded_box(draw, (440, 560, 1190, 690), fill=CARD_ALT, outline=GRID, width=2, radius=28)
    text(draw, (468, 592), "Optional bypass", fnt=SMALL_BOLD)
    wrapped_text(draw, 468, 626, "If a provider can return valid discrete `providerLatents` in the JSON object, the runtime can skip the learned adapter and decode those tokens directly.", 690, fnt=SMALL, fill=MUTED, line_gap=6)
    arrow(draw, 552, 466, 552, 560, fill=STROKE)
    arrow(draw, 988, 560, 1200, 466, fill=STROKE)

    rounded_box(draw, (84, 740, 1430, 840), fill=BG, outline=GRID, width=2, radius=28)
    text(draw, (112, 774), "Why this matters", fnt=SMALL_BOLD)
    text(draw, (112, 808), "The repo keeps image generation aligned with a VQ-style discrete latent framing: decoder not generator, adapter not full image model.", fill=MUTED, fnt=SMALL)
    save(image, "07_image_neural_path.png")


def draw_manifest_spine():
    image, draw = make_canvas()
    header(draw, "Traceability Spine", "Every run writes a manifest-centered trace so success and failure remain inspectable after the fact.", active="Artifacts")

    rounded_box(draw, (86, 300, 430, 620), fill=CARD, outline=GRID, width=2, radius=28)
    text(draw, (112, 336), "CLI Invocation", fnt=BODY_BOLD)
    wrapped_text(draw, 112, 374, "Prompt, route, seed, provider, model, and output path enter through the CLI boundary.", 280, fnt=SMALL, fill=MUTED, line_gap=6)

    rounded_box(draw, (590, 220, 1010, 700), fill=CARD, outline=GRID, width=2, radius=28)
    text(draw, (618, 256), "artifacts/runs/<run-id>/", fnt=BODY_BOLD)

    files = [
        ("manifest.json", "git SHA, lockfile hash, provider, model, seed, duration, success flag, artifact hash"),
        ("llm-input.txt", "fully expanded input sent to the model"),
        ("llm-output.txt", "raw model output before parse and validation"),
        ("artifact file", "PNG / WAV / HTML output when rendering succeeds"),
    ]
    fy = 306
    for name, desc in files:
        rounded_box(draw, (620, fy, 980, fy + 86), fill=CARD_ALT, outline=GRID, width=2, radius=22)
        text(draw, (644, fy + 28), name, fnt=SMALL_BOLD)
        wrapped_text(draw, 644, fy + 52, desc, 300, fnt=SMALL, fill=MUTED, line_gap=6)
        fy += 104

    rounded_box(draw, (1100, 300, 1496, 620), fill=CARD, outline=GRID, width=2, radius=28)
    text(draw, (1128, 336), "Why it helps", fnt=BODY_BOLD)
    wrapped_text(draw, 1128, 378, "The manifest spine is the quality bar for fast iteration: even a failed run leaves enough evidence to debug, compare, and reproduce.", 320, fnt=SMALL, fill=MUTED, line_gap=6)
    wrapped_text(draw, 1128, 492, "This is also what makes lightweight benchmarking credible: every point in a chart can be traced back to a run directory.", 320, fnt=SMALL, fill=MUTED, line_gap=6)

    arrow(draw, 430, 460, 590, 460)
    arrow(draw, 1010, 460, 1100, 460)
    text(draw, (92, 826), "Slide cue: use this when you need to justify why Wittgenstein is a harness-first system rather than a loose prompt wrapper.", fill=MUTED, fnt=SMALL)
    save(image, "08_manifest_spine.png")


def draw_benchmark_scope():
    image, draw = make_canvas()
    header(draw, "Benchmark Scope", "The current benchmark is intentionally light: useful for regression and demos, but honest about what it does and does not measure.", active="Benchmark")

    cols = [86, 450, 778, 1090]
    headers = ["Modality", "What Runs Today", "What The Number Means", "Standard Metric Target"]
    widths = [320, 284, 284, 420]
    for x, header_text, width in zip(cols, headers, widths):
        rounded_box(draw, (x, 260, x + width, 322), fill=CARD_ALT, outline=GRID, width=2, radius=20)
        text(draw, (x + 18, 291), header_text, fnt=SMALL_BOLD)

    rows = [
        ("Image", "PNG artifact smoke case", "structural proxy", "FID + CLIPScore"),
        ("TTS / Audio", "WAV artifact smoke case", "structural proxy", "MOS + WER / PER"),
        ("Sensor", "JSON / CSV / HTML smoke case", "structural proxy", "discriminative + predictive score"),
        ("Video", "not in current run", "n/a on main branch", "FVD + Video-Bench"),
    ]

    y = 346
    row_h = 108
    for modality, current, meaning, target in rows:
        rounded_box(draw, (86, y, 1510, y + row_h), fill=CARD, outline=GRID, width=2, radius=24)
        text(draw, (104, y + 32), modality, fnt=BODY_BOLD)
        text(draw, (468, y + 32), current, fnt=SMALL_BOLD if "not" in current else SMALL)
        text(draw, (796, y + 32), meaning, fnt=SMALL)
        text(draw, (1108, y + 32), target, fnt=SMALL)
        y += 124

    rounded_box(draw, (86, 796, 1510, 860), fill=BG, outline=GRID, width=2, radius=22)
    text(draw, (108, 828), "Use this slide to separate smoke benchmark claims from eventual modality-standard evaluation claims.", fill=MUTED, fnt=SMALL)
    save(image, "09_benchmark_scope.png")


def write_notes():
    notes = """# Architecture Diagram Notes

This folder now includes a second visual set focused on architecture and system explanation.

## Added Figures

- `05_architecture_layers.png` — the five-layer harness model
- `06_system_pipeline.png` — end-to-end system flow from CLI to artifact packaging
- `07_image_neural_path.png` — the strict image pipeline with adapter and frozen decoder
- `08_manifest_spine.png` — run traceability and manifest-centered reproducibility
- `09_benchmark_scope.png` — what the current benchmark does today versus standard metric targets

## Suggested Slide Order

1. `04_benchmark_overview.png`
2. `05_architecture_layers.png`
3. `06_system_pipeline.png`
4. `07_image_neural_path.png`
5. `08_manifest_spine.png`
6. `09_benchmark_scope.png`

## Talk Track

### Five-Layer Harness

Use this to explain that Wittgenstein is not just a prompt wrapper. The repo explicitly separates runtime, IR, renderers, adapters, and packaging.

### System Pipeline

Use this when you want to show that one shared harness can route multiple modalities while keeping each codec contract isolated.

### Strict Image Path

Use this to defend the main thesis for image: the LLM emits semantics, the adapter bridges into latent space, and the frozen decoder reconstructs PNG bytes. This is the cleanest place to explain `decoder not generator`.

### Manifest Spine

Use this to explain why the repo can move quickly without losing rigor. Every run leaves behind a reproducible trace under `artifacts/runs/<run-id>/`.

### Benchmark Scope

Use this to keep claims precise. The current benchmark is valuable and reproducible, but still a smoke benchmark rather than a complete research benchmark.
"""
    (OUT_DIR / "architecture_notes.md").write_text(notes)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    draw_layers_stack()
    draw_system_pipeline()
    draw_image_path()
    draw_manifest_spine()
    draw_benchmark_scope()
    write_notes()


if __name__ == "__main__":
    main()
