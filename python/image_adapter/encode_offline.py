#!/usr/bin/env python3
"""Stub offline encoder: image -> discrete token grid (matches placeholder decoder semantics)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

CODEBOOK_SIZE = 8192
REPO_ROOT = Path(__file__).resolve().parents[2]


def resolve_image_path(value: str) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path

    cwd_path = Path.cwd() / path
    if cwd_path.is_file():
        return cwd_path

    return REPO_ROOT / path


def encode_image(path: Path, grid_w: int, grid_h: int) -> list[int]:
    im = Image.open(path).convert("RGB")
    im = im.resize((grid_w, grid_h), Image.Resampling.BILINEAR)
    tokens: list[int] = []
    for y in range(grid_h):
        for x in range(grid_w):
            r, g, b = im.getpixel((x, y))
            tokens.append((r + g * 256 + b * 65536) % CODEBOOK_SIZE)
    return tokens


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--in",
        dest="in_path",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "train" / "scenes.jsonl",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "train" / "encoded.jsonl",
    )
    args = parser.parse_args()
    if not args.in_path.is_file():
        raise SystemExit(f"Missing {args.in_path}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with args.in_path.open(encoding="utf-8") as fin, args.out.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            spec = row["image_scene_spec"]
            dec = spec["decoder"]
            w, h = dec["latentResolution"]
            img_path = resolve_image_path(row["image_path"])
            if not img_path.is_file():
                print(f"skip missing image: {img_path}")
                continue
            tokens = encode_image(img_path, w, h)
            row["target_tokens"] = tokens
            row["codebook_size"] = CODEBOOK_SIZE
            fout.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    print(f"Wrote {n} encoded rows to {args.out}")


if __name__ == "__main__":
    main()
