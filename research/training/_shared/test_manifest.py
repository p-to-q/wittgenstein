from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from .manifest import (
    MetricSnapshot,
    TrainingDatasetRef,
    TrainingManifest,
    hash_file_sha256,
    write_training_manifest,
)
from .smoke_manifest import main as smoke_main


class TrainingManifestTests(unittest.TestCase):
    def test_hash_file_sha256(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "checkpoint.bin"
            path.write_bytes(b"abc")
            self.assertEqual(
                hash_file_sha256(path),
                "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            )

    def test_write_training_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            manifest_path = Path(tmp) / "manifest.json"
            manifest = TrainingManifest(
                run_id="run-test",
                program="unit-test",
                git_sha="abc123",
                seed=1,
                command=["python", "-m", "unit"],
                checkpoint_path="checkpoint.bin",
                checkpoint_sha256="sha256",
                datasets=[
                    TrainingDatasetRef(
                        name="synthetic",
                        split="train",
                        uri="memory://synthetic",
                        sample_count=1,
                    ),
                ],
                metrics=[MetricSnapshot(name="loss", value=0.0, step=1)],
            )

            write_training_manifest(manifest, manifest_path)
            raw = manifest_path.read_text(encoding="utf-8")
            self.assertEqual(raw, json.dumps(manifest.to_json_dict(), indent=2, sort_keys=True) + "\n")
            parsed = json.loads(raw)

            self.assertEqual(parsed["schema_version"], "training-manifest.v0")
            self.assertEqual(parsed["run_id"], "run-test")
            self.assertEqual(parsed["datasets"][0]["name"], "synthetic")
            self.assertEqual(parsed["metrics"][0]["name"], "loss")

    def test_smoke_manifest_writes_checkpoint_and_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            exit_code = smoke_main(["--out-dir", tmp, "--run-id", "smoke-test", "--seed", "11"])
            self.assertEqual(exit_code, 0)

            out_dir = Path(tmp)
            checkpoint_path = out_dir / "checkpoint.bin"
            manifest_path = out_dir / "manifest.json"

            self.assertTrue(checkpoint_path.exists())
            self.assertTrue(manifest_path.exists())

            parsed = json.loads(manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(parsed["run_id"], "smoke-test")
            self.assertEqual(parsed["checkpoint_sha256"], hash_file_sha256(checkpoint_path))
            self.assertEqual(parsed["datasets"][0]["uri"], "memory://synthetic-training-smoke")


if __name__ == "__main__":
    unittest.main()
