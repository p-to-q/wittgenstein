"""Asserts every Phase 4 runner stub raises NotImplementedError.

Drop the relevant block (and add real coverage) when each runner gets
its real implementation. Until then, "this is a stub" is itself an
invariant — silent success here would be the worst failure mode.

Run with:
    python -m unittest discover -s benchmarks/tools -p 'test_*.py' -v
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

THIS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(THIS_DIR))

import chart  # noqa: E402
import clipscore  # noqa: E402
import disc_score  # noqa: E402
import wer  # noqa: E402


def _write_dummy(path: Path, content: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _write_manifest(path: Path, codec: str, route: str | None = None) -> None:
    payload = {"codec": codec}
    if route is not None:
        payload["route"] = route
    _write_dummy(path, json.dumps(payload))


class StubsRaiseNotImplementedTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp(prefix="benchmarks-tools-stubs-")

    def tearDown(self) -> None:
        for root, _, files in os.walk(self.tmp, topdown=False):
            for name in files:
                Path(root, name).unlink()
            Path(root).rmdir()

    def test_clipscore_stub_raises(self) -> None:
        artifact = Path(self.tmp, "artifact.png")
        manifest = Path(self.tmp, "manifest.json")
        out = Path(self.tmp, "score.json")
        _write_dummy(artifact, "fake-png")
        _write_manifest(manifest, codec="image")
        with self.assertRaises(NotImplementedError):
            clipscore.main(
                ["--artifact", str(artifact), "--manifest", str(manifest), "--out", str(out)]
            )

    def test_wer_stub_raises(self) -> None:
        artifact = Path(self.tmp, "speech.wav")
        manifest = Path(self.tmp, "manifest.json")
        out = Path(self.tmp, "score.json")
        _write_dummy(artifact, "fake-wav")
        _write_manifest(manifest, codec="audio", route="speech")
        with self.assertRaises(NotImplementedError):
            wer.main(
                ["--artifact", str(artifact), "--manifest", str(manifest), "--out", str(out)]
            )

    def test_disc_score_stub_raises(self) -> None:
        artifact = Path(self.tmp, "trace.csv")
        manifest = Path(self.tmp, "manifest.json")
        out = Path(self.tmp, "score.json")
        _write_dummy(artifact, "t,v\n0,0\n")
        _write_manifest(manifest, codec="sensor")
        with self.assertRaises(NotImplementedError):
            disc_score.main(
                ["--artifact", str(artifact), "--manifest", str(manifest), "--out", str(out)]
            )

    def test_chart_stub_raises(self) -> None:
        receipts_dir = Path(self.tmp, "receipts")
        receipts_dir.mkdir()
        _write_dummy(receipts_dir / "one.json", json.dumps({"tool": "clipscore"}))
        out = Path(self.tmp, "chart.png")
        with self.assertRaises(NotImplementedError):
            chart.main(
                ["--receipts-dir", str(receipts_dir), "--out", str(out)]
            )


if __name__ == "__main__":
    unittest.main()
