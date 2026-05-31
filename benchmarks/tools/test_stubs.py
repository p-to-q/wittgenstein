"""Checks Phase 4 benchmark tool behavior.

Unimplemented metric runners still raise NotImplementedError. Implemented
tools get real output coverage here.

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
import score_receipt  # noqa: E402
import wer  # noqa: E402


def _write_dummy(path: Path, content: str = "") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content)


def _write_manifest(path: Path, codec: str, route: str | None = None) -> None:
    payload = {"codec": codec}
    if route is not None:
        payload["route"] = route
    _write_dummy(path, json.dumps(payload))


def _receipt(tool: str, metric_name: str, value: float, unit: str, artifact: str) -> dict:
    return {
        "tool": tool,
        "version": "0.0.1",
        "metric": {"name": metric_name, "value": value, "unit": unit},
        "model": {"id": "local/test-model", "deterministic": True},
        "inputs": {
            "artifact": artifact,
            "manifest": "artifacts/runs/example/manifest.json",
            "prompt": "test prompt",
        },
        "generatedAt": "2026-05-31T00:00:00Z",
    }


class BenchmarkToolTests(unittest.TestCase):
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
                [
                    "--artifact",
                    str(artifact),
                    "--manifest",
                    str(manifest),
                    "--out",
                    str(out),
                ]
            )

    def test_wer_stub_raises(self) -> None:
        artifact = Path(self.tmp, "speech.wav")
        manifest = Path(self.tmp, "manifest.json")
        out = Path(self.tmp, "score.json")
        _write_dummy(artifact, "fake-wav")
        _write_manifest(manifest, codec="audio", route="speech")
        with self.assertRaises(NotImplementedError):
            wer.main(
                [
                    "--artifact",
                    str(artifact),
                    "--manifest",
                    str(manifest),
                    "--out",
                    str(out),
                ]
            )

    def test_disc_score_stub_raises(self) -> None:
        artifact = Path(self.tmp, "trace.csv")
        manifest = Path(self.tmp, "manifest.json")
        out = Path(self.tmp, "score.json")
        _write_dummy(artifact, "t,v\n0,0\n")
        _write_manifest(manifest, codec="sensor")
        with self.assertRaises(NotImplementedError):
            disc_score.main(
                [
                    "--artifact",
                    str(artifact),
                    "--manifest",
                    str(manifest),
                    "--out",
                    str(out),
                ]
            )

    def test_chart_writes_png(self) -> None:
        receipts_dir = Path(self.tmp, "receipts")
        receipts_dir.mkdir()
        _write_dummy(
            receipts_dir / "clip.json",
            json.dumps(
                _receipt(
                    "clipscore",
                    "CLIPScore",
                    0.832,
                    "cosine",
                    "artifacts/runs/example/image.png",
                )
            ),
        )
        _write_dummy(
            receipts_dir / "wer.json",
            json.dumps(
                _receipt(
                    "wer",
                    "WER",
                    0.071,
                    "ratio",
                    "artifacts/runs/example/speech.wav",
                )
            ),
        )
        out = Path(self.tmp, "chart.png")
        status = chart.main(
            [
                "--receipts-dir",
                str(receipts_dir),
                "--out",
                str(out),
                "--tag",
                "test-tag",
            ]
        )
        self.assertEqual(status, 0)
        self.assertTrue(out.exists())
        self.assertEqual(out.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_chart_rejects_invalid_receipt_shape(self) -> None:
        receipts_dir = Path(self.tmp, "receipts")
        receipts_dir.mkdir()
        _write_dummy(receipts_dir / "broken.json", json.dumps({"tool": "clipscore"}))
        out = Path(self.tmp, "chart.png")
        with self.assertRaises(ValueError):
            chart.main(["--receipts-dir", str(receipts_dir), "--out", str(out)])

    def test_score_receipt_contract_parses_full_shape(self) -> None:
        path = Path(self.tmp, "score.json")
        receipt = score_receipt.parse_score_receipt(
            path,
            _receipt("clipscore", "CLIPScore", 0.832, "cosine", "image.png"),
        )
        self.assertEqual(receipt.tool, "clipscore")
        self.assertEqual(receipt.version, "0.0.1")
        self.assertEqual(receipt.metric.name, "CLIPScore")
        self.assertEqual(receipt.metric.value, 0.832)
        self.assertEqual(receipt.model.id, "local/test-model")
        self.assertEqual(receipt.inputs.manifest, "artifacts/runs/example/manifest.json")
        self.assertEqual(receipt.chart_label, "image")

    def test_score_receipt_rejects_non_finite_metric(self) -> None:
        payload = _receipt("clipscore", "CLIPScore", float("nan"), "cosine", "image.png")
        with self.assertRaises(ValueError):
            score_receipt.parse_score_receipt(Path(self.tmp, "score.json"), payload)


if __name__ == "__main__":
    unittest.main()
