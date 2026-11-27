from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path
from unittest import mock

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

    def _snapshot(self, root: Path):
        pointer = root / "dataset.dvc"
        pointer.write_text('{"outs":[{"path":"images","md5":"source-checksum","size":4}]}\n')
        return build_dataset_snapshot_from_dvc(
            snapshot_id="fixture", dvc_path=pointer, dataset_name="images",
            split="train", role="train", license="research-only",
            sample_count=2, repo_rev_lock="fixture-revision", repo_root=root,
            remote=TrainingDvcRemote(name="fixture-remote"),
        )

    def test_rejects_stale_content_identity_when_loading_a_reference(self) -> None:
        changes = [
            ("dataset", "name", "different-corpus"),
            ("dataset", "split", "eval"),
            ("dataset", "license", "permissive"),
            ("dataset", "sampleCount", 200),
            ("dvc", "repoRevLock", "different-revision"),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "snapshot.json"
            write_training_dataset_snapshot(self._snapshot(root), path)
            original = json.loads(path.read_text())
            for section, key, value in changes:
                with self.subTest(field=f"{section}.{key}"):
                    payload = copy.deepcopy(original)
                    payload[section][key] = value
                    path.write_text(json.dumps(payload))
                    with self.assertRaisesRegex(ValueError, "SHA-256"):
                        dataset_snapshot_reference(path)
            for key, value in (("path", "other-images"), ("md5", "other-checksum")):
                with self.subTest(field=f"dvc.outs.{key}"):
                    payload = copy.deepcopy(original)
                    payload["dvc"]["outs"][0][key] = value
                    path.write_text(json.dumps(payload))
                    with self.assertRaisesRegex(ValueError, "SHA-256"):
                        dataset_snapshot_reference(path)

    def test_writer_rejects_forged_digest_before_replacing_a_valid_receipt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "snapshot.json"
            snapshot = self._snapshot(root)
            write_training_dataset_snapshot(snapshot, path)
            original = path.read_bytes()
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                write_training_dataset_snapshot(replace(snapshot, sha256="0" * 64), path)
            self.assertEqual(path.read_bytes(), original)

    def test_reference_preserves_raw_file_hash_and_existing_identity_definition(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "snapshot.json"
            snapshot = self._snapshot(root)
            write_training_dataset_snapshot(snapshot, path)
            payload = json.loads(path.read_text())
            # Names/timestamps are outside the existing dataset+DVC identity.
            payload["snapshotId"] = "another-label"
            payload["generatedAt"] = "2026-11-27T00:00:00Z"
            raw = (json.dumps(payload, indent=4, sort_keys=True) + "\n\n").encode()
            path.write_bytes(raw)
            ref = dataset_snapshot_reference(path)
            self.assertEqual(ref["snapshotSha256"], hashlib.sha256(raw).hexdigest())
            self.assertEqual(ref["datasetSha256"], snapshot.sha256)

    def test_reference_normalizes_optional_nulls_without_changing_identity(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "snapshot.json"
            snapshot = self._snapshot(root)
            write_training_dataset_snapshot(snapshot, path)
            payload = json.loads(path.read_text())
            payload["dataset"]["uri"] = None
            payload["dvc"]["remote"]["url"] = None
            payload["dvc"]["outs"][0]["etag"] = None
            path.write_text(json.dumps(payload))
            self.assertEqual(dataset_snapshot_reference(path)["datasetSha256"], snapshot.sha256)

    def test_reference_hashes_the_bytes_it_parsed_despite_atomic_replacement(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            path = root / "snapshot.json"
            write_training_dataset_snapshot(self._snapshot(root), path)
            original = path.read_bytes()
            loads = json.loads

            def replace_after_parse(raw):
                parsed = loads(raw)
                replacement = root / "replacement.json"
                replacement.write_text("{}")
                replacement.replace(path)
                return parsed

            with mock.patch("research.training._shared.data_versioning.json.loads", replace_after_parse):
                ref = dataset_snapshot_reference(path)
            self.assertEqual(ref["snapshotSha256"], hashlib.sha256(original).hexdigest())
            self.assertEqual(path.read_text(), "{}")

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
