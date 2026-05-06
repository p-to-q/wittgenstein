#!/usr/bin/env python3
"""CLIPScore — image-text cosine similarity (Phase 4 stub).

Wires `openai/clip-vit-base-patch32` (or compatible) to produce a single
scalar quality score per image artifact. Today this is a typed skeleton
that raises NotImplementedError so the contract — argparse shape,
manifest read, score receipt path — is locked before a real CLIP load
is wired.

To implement:
    1. pip install transformers torch (or use a pinned local copy)
    2. Replace the NotImplementedError with the CLIP cosine call
    3. Write the score receipt JSON to args.out
    4. Drop the test that asserts NotImplementedError fires

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


def _assert_image_modality(manifest: dict) -> None:
    modality = manifest.get("codec", "")
    if not modality.startswith("image"):
        raise ValueError(
            f"clipscore expects an image-modality manifest; got codec={modality!r}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="clipscore",
        description="CLIPScore image-text cosine similarity (Phase 4 stub).",
    )
    parser.add_argument(
        "--artifact",
        type=Path,
        required=True,
        help="Path to image artifact (.png / .jpg) produced by an image codec run.",
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
        print(f"clipscore: artifact not found: {args.artifact}", file=sys.stderr)
        return 1

    manifest = _read_manifest(args.manifest)
    _assert_image_modality(manifest)

    raise NotImplementedError(
        "clipscore: CLIP model wiring is not yet implemented. "
        "Install transformers + torch and replace this stub with a CLIP "
        "image-text cosine call. See benchmarks/tools/README.md."
    )


if __name__ == "__main__":
    sys.exit(main())
