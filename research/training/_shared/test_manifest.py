from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from .manifest import (
    TRAINING_RUN_MANIFEST_SCHEMA_VERSION,
    assert_training_run_manifest_shape,
    capture_dataset_fingerprint,
    sha256_file,
)
from .smoke_manifest import build_smoke_manifest


class TrainingRunManifestSmokeTests(unittest.TestCase):
    def test_stdlib_smoke_writes_canonical_manifest(self) -> None:
        torch_was_loaded = "torch" in sys.modules
        with tempfile.TemporaryDirectory() as tmp:
            summary = build_smoke_manifest(Path(tmp), run_id="tokenizer-stdlib-smoke-test")
            manifest_path = Path(summary["manifestPath"])
            checkpoint_path = Path(summary["checkpointPath"])
            payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            checkpoint_sha256 = sha256_file(checkpoint_path)

        assert_training_run_manifest_shape(payload)
        self.assertEqual(payload["schemaVersion"], TRAINING_RUN_MANIFEST_SCHEMA_VERSION)
        self.assertEqual(payload["subprogram"], "tokenizer")
        self.assertEqual(payload["hardware"]["gpuModel"], "cpu:stdlib-smoke")
        self.assertEqual(payload["hardware"]["gpuCount"], 0)
        self.assertEqual(payload["checkpoint"]["weightsLicense"], "permissive")
        self.assertEqual(payload["checkpoint"]["sha256"], checkpoint_sha256)
        self.assertEqual(payload["optimizer"]["name"], "stdlib-smoke-none")
        self.assertEqual(payload["evalSnapshots"], [])
        self.assertIn("trainingConfig", payload)

        if not torch_was_loaded:
            self.assertNotIn("torch", sys.modules)

    def test_rejects_legacy_training_manifest_shape(self) -> None:
        with self.assertRaisesRegex(ValueError, "missing required keys"):
            assert_training_run_manifest_shape(
                {
                    "schema_version": "witt.training/v0.1",
                    "program": "tokenizer",
                    "config": {},
                }
            )

    def test_rejects_bool_where_schema_requires_numbers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            summary = build_smoke_manifest(Path(tmp), run_id="tokenizer-stdlib-smoke-test")
            payload = json.loads(Path(summary["manifestPath"]).read_text(encoding="utf-8"))

        payload["hardware"]["gpuCount"] = False
        with self.assertRaisesRegex(ValueError, "hardware.gpuCount"):
            assert_training_run_manifest_shape(payload)

    def test_dataset_fingerprint_can_ignore_mount_point(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root_a = Path(tmp) / "a" / "dataset"
            root_b = Path(tmp) / "b" / "dataset"
            for root in (root_a, root_b):
                (root / "class").mkdir(parents=True)
                (root / "class" / "sample.jpg").write_bytes(b"same-size")

            fp_a = capture_dataset_fingerprint("dataset", [root_a / "class" / "sample.jpg"], root=root_a)
            fp_b = capture_dataset_fingerprint("dataset", [root_b / "class" / "sample.jpg"], root=root_b)

        self.assertEqual(fp_a.sha256, fp_b.sha256)

    def test_dataset_content_fingerprint_rejects_missing_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.jpg"

            with self.assertRaises(FileNotFoundError):
                capture_dataset_fingerprint("dataset", [missing])


if __name__ == "__main__":
    unittest.main()
