#!/usr/bin/env python3
"""Build train/scenes.jsonl from data/image_adapter/raw/metadata.jsonl"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def portable_image_path(raw_dir: Path, rel: str) -> str:
    path = raw_dir / rel
    try:
        return path.resolve().relative_to(REPO_ROOT.resolve()).as_posix()
    except ValueError:
        return path.as_posix()


def default_scene(caption: str, subject: str | None, negatives: list[str] | None) -> dict:
    subj = (subject or caption[:120]).strip()
    neg = negatives or []
    return {
        "schemaVersion": "witt.image.spec/v0.1",
        "intent": caption.strip()[:500],
        "subject": subj,
        "composition": {
            "framing": "medium shot",
            "camera": "neutral camera",
            "depthPlan": ["foreground", "midground", "background"],
        },
        "lighting": {"mood": "neutral", "key": "soft"},
        "style": {"references": [], "palette": ["black", "white"]},
        "decoder": {
            "family": "llamagen",
            "codebook": "stub-codebook",
            "codebookVersion": "v0",
            "latentResolution": [32, 32],
        },
        "constraints": {"mustHave": [], "negative": neg},
        "renderHints": {
            "detailLevel": "medium",
            "tokenBudget": 1024,
            "seed": None,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--raw-dir",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "raw",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "train" / "scenes.jsonl",
    )
    args = parser.parse_args()
    meta_path = args.raw_dir / "metadata.jsonl"
    if not meta_path.is_file():
        raise SystemExit(f"Missing {meta_path}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with meta_path.open(encoding="utf-8") as fin, args.out.open("w", encoding="utf-8") as fout:
        for line in fin:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            cid = row["id"]
            rel = row["image_path"]
            caption = row["caption"]
            subject = row.get("subject")
            neg = row.get("constraints_negative")
            if isinstance(neg, str):
                neg = [neg]
            scene = default_scene(caption, subject, neg)
            out = {
                "id": cid,
                "image_path": portable_image_path(args.raw_dir, rel),
                "image_scene_spec": scene,
            }
            fout.write(json.dumps(out, ensure_ascii=False) + "\n")
            n += 1
    print(f"Wrote {n} rows to {args.out}")


if __name__ == "__main__":
    main()
