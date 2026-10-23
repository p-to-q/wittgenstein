from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import unittest
from dataclasses import asdict
from pathlib import Path

from .manifest import (
    TRAINING_RUN_MANIFEST_SCHEMA_VERSION,
    assert_training_run_manifest_shape,
    capture_dataset_fingerprint,
    manifest_to_dict,
    sha256_file,
)
from .smoke_manifest import build_smoke_manifest


# Exact field names the TS dataset schema declares (packages/schemas/src/
# training-manifest.ts TrainingRunDatasetSchema). The Python emitter must use
# these names byte-for-byte; a rename on either side breaks these tests
# (report 19 F-4: the cross-language contract was assumed, never enforced).
DATASET_RECEIPT_FIELD_NAMES = frozenset(
    {"sourceInputSha256", "requestedCount", "writtenCount", "canonicalSelectionSha256"}
)


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


class DatasetReceiptFieldsTests(unittest.TestCase):
    """Cross-language dataset-receipt contract (report 19 F-1 / F-4)."""

    def _write_images(self, root: Path, names: tuple[str, ...]) -> list[Path]:
        paths = []
        for name in names:
            path = root / name
            path.write_bytes(name.encode("utf-8"))
            paths.append(path)
        return paths

    def test_emitted_dataset_keys_match_ts_schema_field_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = self._write_images(root, ("a.jpg", "b.jpg"))
            fp = capture_dataset_fingerprint(
                "dataset",
                files=files,
                revision="uncommitted",
                root=root,
                source_input=files,
                selection=files,
                requested_count=2,
                written_count=2,
            )
            emitted = manifest_to_dict({"dataset": asdict(fp)})["dataset"]

        self.assertEqual(set(emitted), {"dvcRev", "name", "sha256"} | DATASET_RECEIPT_FIELD_NAMES)

    def test_ungrounded_receipt_fields_are_omitted_not_faked(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            files = self._write_images(root, ("a.jpg",))
            fp = capture_dataset_fingerprint("dataset", files=files, revision="uncommitted", root=root)
            emitted = manifest_to_dict({"dataset": asdict(fp)})["dataset"]

        self.assertEqual(set(emitted), {"dvcRev", "name", "sha256"})
        for field in DATASET_RECEIPT_FIELD_NAMES:
            self.assertNotIn(field, emitted)

    def test_selection_digest_is_canonical_sorted_list(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_images(root, ("a.jpg", "b.jpg", "c.jpg"))
            fp = capture_dataset_fingerprint(
                "dataset",
                files=[root / "a.jpg"],
                root=root,
                source_input=[root / "c.jpg", root / "a.jpg", root / "b.jpg"],
                selection=[root / "c.jpg", root / "a.jpg"],
                requested_count=3,
                written_count=2,
            )

        expected_source = hashlib.sha256("\n".join(["a.jpg", "b.jpg", "c.jpg"]).encode("utf-8")).hexdigest()
        expected_selection = hashlib.sha256("\n".join(["a.jpg", "c.jpg"]).encode("utf-8")).hexdigest()
        self.assertEqual(fp.sourceInputSha256, expected_source)
        self.assertEqual(fp.canonicalSelectionSha256, expected_selection)

    def test_selection_digest_is_write_order_invariant_but_selection_sensitive(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._write_images(root, ("a.jpg", "b.jpg", "c.jpg"))
            shuffled = capture_dataset_fingerprint(
                "dataset",
                files=[root / "a.jpg"],
                root=root,
                source_input=[root / "b.jpg", root / "c.jpg", root / "a.jpg"],
                selection=[root / "c.jpg", root / "a.jpg"],
            )
            ordered = capture_dataset_fingerprint(
                "dataset",
                files=[root / "a.jpg"],
                root=root,
                source_input=[root / "a.jpg", root / "b.jpg", root / "c.jpg"],
                selection=[root / "a.jpg", root / "c.jpg"],
            )
            changed = capture_dataset_fingerprint(
                "dataset",
                files=[root / "a.jpg"],
                root=root,
                selection=[root / "b.jpg"],
            )

        self.assertEqual(shuffled.sourceInputSha256, ordered.sourceInputSha256)
        self.assertEqual(shuffled.canonicalSelectionSha256, ordered.canonicalSelectionSha256)
        self.assertNotEqual(shuffled.canonicalSelectionSha256, changed.canonicalSelectionSha256)

    def test_full_manifest_with_dataset_receipt_validates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            summary = build_smoke_manifest(Path(tmp), run_id="tokenizer-dataset-receipt-test")
            payload = json.loads(Path(summary["manifestPath"]).read_text(encoding="utf-8"))

        payload["dataset"].update(
            {
                "sourceInputSha256": "1a" * 32,
                "requestedCount": 10,
                "writtenCount": 7,
                "canonicalSelectionSha256": "2b" * 32,
            }
        )
        assert_training_run_manifest_shape(payload)
        self.assertNotEqual(payload["dataset"]["requestedCount"], payload["dataset"]["writtenCount"])

    def test_rejects_ungrounded_or_malformed_receipt_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            summary = build_smoke_manifest(Path(tmp), run_id="tokenizer-dataset-receipt-bad")
            payload = json.loads(Path(summary["manifestPath"]).read_text(encoding="utf-8"))

        for field, bad_value in (
            ("requestedCount", -1),
            ("writtenCount", True),
            ("sourceInputSha256", "not-a-digest"),
            ("canonicalSelectionSha256", "2b" * 31),
        ):
            with self.subTest(field=field):
                corrupted = json.loads(json.dumps(payload))
                corrupted["dataset"][field] = bad_value
                with self.assertRaises(ValueError):
                    assert_training_run_manifest_shape(corrupted)


if __name__ == "__main__":
    unittest.main()
