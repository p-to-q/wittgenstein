from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from .experiment_tracking import (
    JsonlExperimentTracker,
    TrainingExperimentManifestReference,
    assert_training_experiment_receipt_shape,
)
from .manifest import sha256_file


class TrainingExperimentReceiptTests(unittest.TestCase):
    def test_jsonl_tracker_writes_receipt_without_torch(self) -> None:
        torch_was_loaded = "torch" in sys.modules
        with tempfile.TemporaryDirectory() as tmp:
            run_dir = Path(tmp) / "run"
            tracker = JsonlExperimentTracker(run_dir, "tokenizer-stdlib-smoke-test")
            config_reference = tracker.config_reference()
            tracker.log_params({"subprogram": "tokenizer", "smoke": True})
            tracker.log_metrics(0, {"loss": 0.0, "lr": 0.0})
            manifest_path = run_dir / "manifest.json"
            checkpoint_path = run_dir / "ckpts" / "final.synthetic"
            checkpoint_path.parent.mkdir(parents=True)
            manifest_path.write_text("{}\n", encoding="utf-8")
            checkpoint_path.write_bytes(b"checkpoint")
            tracker.finish(
                TrainingExperimentManifestReference(
                    runId="tokenizer-stdlib-smoke-test",
                    manifestPath=str(manifest_path),
                    manifestSha256=sha256_file(manifest_path),
                    checkpointSha256=sha256_file(checkpoint_path),
                )
            )

            payload = json.loads(tracker.receipt_path.read_text(encoding="utf-8"))
            metrics_lines = tracker.metrics_path.read_text(encoding="utf-8").splitlines()

        assert_training_experiment_receipt_shape(payload)
        self.assertEqual(payload["schemaVersion"], "witt.training.experiment/v0.1")
        self.assertEqual(payload["tracker"], "jsonl")
        self.assertEqual(payload["trainingRunId"], "tokenizer-stdlib-smoke-test")
        self.assertEqual(len(metrics_lines), 2)
        self.assertIn("manifest", payload)
        self.assertEqual(payload["metricsLog"]["bytes"], len("\n".join(metrics_lines).encode("utf-8")) + 1)
        self.assertEqual(config_reference["trainingRunId"], "tokenizer-stdlib-smoke-test")
        self.assertTrue(config_reference["metricsLogPath"].endswith("experiment-metrics.jsonl"))

        if not torch_was_loaded:
            self.assertNotIn("torch", sys.modules)

    def test_rejects_freeform_experiment_receipt_fields(self) -> None:
        with self.assertRaisesRegex(ValueError, "unrecognized keys"):
            assert_training_experiment_receipt_shape(
                {
                    "schemaVersion": "witt.training.experiment/v0.1",
                    "tracker": "jsonl",
                    "uri": "file:///tmp/metrics.jsonl",
                    "runId": "jsonl-run",
                    "trainingRunId": "training-run",
                    "startedAt": "2026-05-31T00:00:00Z",
                    "finishedAt": None,
                    "metricsLog": {
                        "path": "metrics.jsonl",
                        "sha256": "0" * 64,
                        "bytes": 0,
                    },
                    "hparams": {},
                }
            )

    def test_rejects_impossible_tracker_windows(self) -> None:
        with self.assertRaisesRegex(ValueError, "finishedAt must be greater than or equal"):
            assert_training_experiment_receipt_shape(
                {
                    "schemaVersion": "witt.training.experiment/v0.1",
                    "tracker": "jsonl",
                    "uri": "file:///tmp/metrics.jsonl",
                    "runId": "jsonl-run",
                    "trainingRunId": "training-run",
                    "startedAt": "2026-05-31T00:00:00Z",
                    "finishedAt": "2026-05-30T23:59:59Z",
                    "metricsLog": {
                        "path": "metrics.jsonl",
                        "sha256": "0" * 64,
                        "bytes": 0,
                    },
                }
            )


if __name__ == "__main__":
    unittest.main()
