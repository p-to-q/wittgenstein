from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from .data_versioning import (
    TrainingDvcRemote,
    assert_training_dataset_snapshot_shape,
    build_dataset_snapshot_from_dvc,
    dataset_snapshot_reference,
    load_dvc_pointer,
    write_training_dataset_snapshot,
)


class TrainingDataVersioningTests(unittest.TestCase):
    def test_builds_dataset_snapshot_from_json_subset_dvc_pointer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dvc_path = Path(tmp) / "synthetic-smoke.dvc"
            dvc_path.write_text(
                json.dumps(
                    {
                        "outs": [
                            {
                                "path": "../smoke/synthetic-manifest-smoke.txt",
                                "size": 46,
                                "md5": "4a8685c927c10ccec30a7f8d9d16d7b7",
                                "hash": "md5",
                            }
                        ]
                    }
                )
                + "\n",
                encoding="utf-8",
            )

            snapshot = build_dataset_snapshot_from_dvc(
                snapshot_id="synthetic-smoke-2026q2",
                dvc_path=dvc_path,
                dataset_name="synthetic-manifest-smoke",
                split="smoke",
                role="smoke",
                license="permissive",
                sample_count=1,
                remote=TrainingDvcRemote(name="local-smoke"),
                repo_rev_lock="smoke-local",
                repo_root=Path(tmp),
            )
            out_path = Path(tmp) / "synthetic-smoke.dataset.json"
            write_training_dataset_snapshot(snapshot, out_path)
            payload = json.loads(out_path.read_text(encoding="utf-8"))
            ref = dataset_snapshot_reference(out_path)

        assert_training_dataset_snapshot_shape(payload)
        self.assertEqual(payload["schemaVersion"], "witt.training.dataset-snapshot/v0.1")
        self.assertEqual(payload["dataset"]["role"], "smoke")
        self.assertEqual(payload["dvc"]["outs"][0]["md5"], "4a8685c927c10ccec30a7f8d9d16d7b7")
        self.assertEqual(payload["dvc"]["path"], "synthetic-smoke.dvc")
        self.assertEqual(ref["snapshotId"], "synthetic-smoke-2026q2")
        self.assertEqual(ref["datasetSha256"], payload["sha256"])

    def test_rejects_dvc_outputs_without_checksum(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dvc_path = Path(tmp) / "missing-checksum.dvc"
            dvc_path.write_text(
                json.dumps({"outs": [{"path": "dataset", "size": 1}]}) + "\n",
                encoding="utf-8",
            )

            with self.assertRaisesRegex(ValueError, "checksum field"):
                build_dataset_snapshot_from_dvc(
                    snapshot_id="bad",
                    dvc_path=dvc_path,
                    dataset_name="bad",
                    split="train",
                    role="train",
                    license="unknown",
                    repo_rev_lock="smoke-local",
                )

    def test_loads_dvc_pointer_without_importing_dvc(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dvc_path = Path(tmp) / "pointer.dvc"
            dvc_path.write_text(
                '{"outs":[{"path":"dataset","etag":"etag-value","size":10}]}\n',
                encoding="utf-8",
            )

            outs = load_dvc_pointer(dvc_path)

        self.assertEqual(len(outs), 1)
        self.assertEqual(outs[0].etag, "etag-value")


if __name__ == "__main__":
    unittest.main()
