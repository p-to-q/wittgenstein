from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from .data_versioning import (
    TrainingDvcRemote,
    build_dataset_snapshot_from_dvc,
    write_training_dataset_snapshot,
)
from .manifest import sha256_file
from .smoke_manifest import build_smoke_manifest
from .sweep_manifest import (
    assert_training_sweep_manifest_shape,
    build_passed_sweep_row,
    new_sweep_manifest,
    write_training_sweep_manifest,
)


class TrainingSweepManifestTests(unittest.TestCase):
    def test_builds_passed_sweep_manifest_from_smoke_receipts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            dvc_path = root / "synthetic-smoke.dvc"
            dvc_path.write_text(
                json.dumps(
                    {
                        "outs": [
                            {
                                "path": "../smoke/synthetic-manifest-smoke.txt",
                                "size": 46,
                                "md5": "4a8685c927c10ccec30a7f8d9d16d7b7",
                            }
                        ]
                    }
                )
                + "\n",
                encoding="utf-8",
            )
            snapshot_path = root / "synthetic-smoke.dataset.json"
            write_training_dataset_snapshot(
                build_dataset_snapshot_from_dvc(
                    snapshot_id="synthetic-smoke-2026q2",
                    dvc_path=dvc_path,
                    dataset_name="synthetic-manifest-smoke",
                    split="smoke",
                    role="smoke",
                    license="permissive",
                    sample_count=1,
                    remote=TrainingDvcRemote(name="local-smoke"),
                    repo_rev_lock="smoke-local",
                ),
                snapshot_path,
            )
            summary = build_smoke_manifest(root / "runs", run_id="tokenizer-stdlib-smoke")
            checkpoint_sha256 = sha256_file(Path(summary["checkpointPath"]))
            spec_path = root / "sweep.json"
            spec_path.write_text("{}\n", encoding="utf-8")
            row = build_passed_sweep_row(
                row_id="tokenizer-stdlib-smoke",
                subprogram="tokenizer",
                command=["python3", "-m", "research.training._shared.smoke_manifest"],
                dataset_snapshot_path=snapshot_path,
                training_manifest_path=Path(summary["manifestPath"]),
                experiment_receipt_path=Path(summary["experimentReceiptPath"]),
                metrics=[{"name": "loss", "value": 0.0, "unit": "loss", "higherIsBetter": False}],
            )
            manifest = new_sweep_manifest(
                sweep_id="phase1-smoke",
                spec_path=spec_path,
                rows=[row],
                tracker="https://github.com/p-to-q/wittgenstein/issues/400",
            )
            out_path = root / "sweep-manifest.json"
            write_training_sweep_manifest(manifest, out_path)
            payload = json.loads(out_path.read_text(encoding="utf-8"))

        assert_training_sweep_manifest_shape(payload)
        self.assertEqual(payload["summary"], {"total": 1, "passed": 1, "failed": 0, "skipped": 0, "blocked": 0})
        self.assertEqual(payload["rows"][0]["trainingRun"]["checkpointSha256"], checkpoint_sha256)

    def test_rejects_mismatched_summary_counts(self) -> None:
        with self.assertRaisesRegex(ValueError, "summary.passed"):
            assert_training_sweep_manifest_shape(
                {
                    "schemaVersion": "witt.training.sweep-manifest/v0.1",
                    "sweepId": "bad",
                    "generatedAt": "2026-05-31T00:00:00Z",
                    "source": {"specPath": "spec.json", "specSha256": "0" * 64},
                    "rows": [
                        {
                            "rowId": "blocked-row",
                            "subprogram": "tokenizer",
                            "status": "blocked",
                            "dataset": {
                                "snapshotId": "snapshot",
                                "snapshotPath": "snapshot.json",
                                "snapshotSha256": "1" * 64,
                                "datasetSha256": "2" * 64,
                            },
                            "command": ["python3"],
                            "error": {"code": "NO_GPU", "message": "No GPU available."},
                        }
                    ],
                    "summary": {"total": 1, "passed": 1, "failed": 0, "skipped": 0, "blocked": 0},
                }
            )


if __name__ == "__main__":
    unittest.main()
