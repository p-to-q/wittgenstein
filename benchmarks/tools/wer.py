#!/usr/bin/env python3
"""Whisper WER — word error rate for TTS speech artifacts (Phase 4 stub).

Wires `openai/whisper-small` (or compatible) to transcribe a `.wav`
artifact and compute WER against the requested speech text. Today this
is a typed skeleton that raises NotImplementedError so the contract —
argparse shape, manifest read, score receipt path — is locked before
a real Whisper load is wired.

To implement:
    1. pip install openai-whisper (or use faster-whisper)
    2. Replace the NotImplementedError with the transcription + WER calc
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


def _assert_speech_route(manifest: dict) -> None:
    codec = manifest.get("codec", "")
    route = manifest.get("route", "")
    if codec != "audio" or route != "speech":
        raise ValueError(
            f"wer expects an audio-speech manifest; got codec={codec!r}, route={route!r}"
        )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="wer",
        description="Whisper WER for TTS speech artifacts (Phase 4 stub).",
    )
    parser.add_argument(
        "--artifact",
        type=Path,
        required=True,
        help="Path to speech .wav artifact produced by audio codec speech route.",
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
        print(f"wer: artifact not found: {args.artifact}", file=sys.stderr)
        return 1

    manifest = _read_manifest(args.manifest)
    _assert_speech_route(manifest)

    raise NotImplementedError(
        "wer: Whisper model wiring is not yet implemented. "
        "Install openai-whisper (or faster-whisper) and replace this stub "
        "with a transcription + WER call. See benchmarks/tools/README.md."
    )


if __name__ == "__main__":
    sys.exit(main())
