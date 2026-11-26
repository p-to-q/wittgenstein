"""Fixture-only dataset preflight: no network, torch or model invocation."""

from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ._shared.manifest import sha256_file
from .audit_dataset import audit_splits, main

_PIL = importlib.util.find_spec("PIL") is not None
if _PIL:
    from PIL import Image, PngImagePlugin


@unittest.skipUnless(_PIL, "Pillow required")
class DatasetAuditTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.splits = {
            "train": self.root / "train",
            "validation": self.root / "validation",
        }
        for name, color in (("train", "red"), ("validation", "blue")):
            self.splits[name].mkdir()
            Image.new("RGB", (16, 12), color).save(self.splits[name] / "one.png")

    def audit(self, name="audit", **kwargs):
        return audit_splits(self.splits, self.root / name, **kwargs)

    def test_clean_split_writes_hashed_inventory_and_explicit_limits(self):
        result = self.audit()
        self.assertEqual(result["status"], "pass")
        self.assertEqual(result["splits"]["train"]["decoded"], 1)
        self.assertEqual(
            result["inventory"]["sha256"],
            sha256_file(self.root / "audit/inventory.jsonl"),
        )
        self.assertIn("rights-and-consent", result["notAssessed"])
        self.assertIn("near-duplicates-and-semantic-leakage", result["notAssessed"])
        self.assertEqual(
            result, json.loads((self.root / "audit/dataset-audit.json").read_text())
        )

    def test_cross_split_byte_copies_are_rejected(self):
        shutil.copyfile(
            self.splits["train"] / "one.png", self.splits["validation"] / "leak.png"
        )
        result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["duplicates"]["crossSplitGroupsByHashMethod"], 2)

    def test_same_rgb_with_different_encoding_is_rejected(self):
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("comment", "different metadata and compression")
        with Image.open(self.splits["train"] / "one.png") as image:
            image.save(
                self.splits["validation"] / "pixels.png",
                pnginfo=metadata,
                compress_level=0,
            )
        result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["duplicates"]["crossSplitGroupsByHashMethod"], 1)
        self.assertEqual(result["duplicates"]["examples"][0]["method"], "pixelSha256")

    def test_within_split_copies_are_also_reported(self):
        shutil.copyfile(
            self.splits["train"] / "one.png", self.splits["train"] / "duplicate.png"
        )
        result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["duplicates"]["crossSplitGroupsByHashMethod"], 0)
        self.assertGreater(result["duplicates"]["groupsByHashMethod"], 0)

    def test_corrupt_file_records_failure_without_substitution(self):
        (self.splits["validation"] / "bad.jpg").write_bytes(b"not a jpeg")
        result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["errorCount"], 1)
        self.assertEqual(result["splits"]["validation"]["decoded"], 1)
        self.assertIn("bad.jpg", result["errorExamples"][0]["path"])

    def test_header_only_and_oversize_images_fail(self):
        image = self.splits["train"] / "one.png"
        image.write_bytes(image.read_bytes()[:50])
        result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["splits"]["train"]["decoded"], 0)
        self.assertEqual(self.audit("small-cap", max_pixels=1)["status"], "fail")

    def test_pillow_bomb_warnings_are_not_silently_accepted(self):
        with patch.object(Image, "MAX_IMAGE_PIXELS", 150):
            result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertTrue(
            all(
                row["error"]["type"] == "DecompressionBombWarning"
                for row in result["errorExamples"]
            )
        )

    def test_optional_eval_split_is_included(self):
        self.splits["eval"] = self.root / "eval"
        self.splits["eval"].mkdir()
        Image.new("RGB", (12, 12), "green").save(self.splits["eval"] / "eval.png")
        self.assertEqual(self.audit()["splits"]["eval"]["decoded"], 1)

    def test_empty_split_is_not_a_pass(self):
        (self.splits["train"] / "one.png").unlink()
        result = self.audit()
        self.assertIn("empty-split", result["failureReasons"])
        self.assertEqual(result["status"], "fail")

    def test_overlap_symlink_alias_and_output_inside_data_are_rejected(self):
        for root in (self.splits["train"], self.root):
            with self.assertRaisesRegex(ValueError, "overlap"):
                audit_splits({**self.splits, "validation": root}, self.root / "audit")
        alias = self.root / "alias"
        alias.symlink_to(self.splits["train"], target_is_directory=True)
        with self.assertRaisesRegex(ValueError, "overlap"):
            audit_splits({**self.splits, "validation": alias}, self.root / "audit")
        with self.assertRaisesRegex(ValueError, "outside"):
            audit_splits(self.splits, self.splits["train"] / "output")

    def test_nested_symlinks_make_inventory_incomplete(self):
        (self.splits["validation"] / "linked.png").symlink_to(
            self.splits["train"] / "one.png"
        )
        (self.splits["train"] / "dir-link").symlink_to(
            self.splits["validation"], target_is_directory=True
        )
        result = self.audit()
        self.assertEqual(result["status"], "fail")
        self.assertEqual(result["errorCount"], 2)

    def test_mount_path_independent_content_changes_are_detected(self):
        original = self.audit()
        copy_root = self.root / "copy"
        copy_root.mkdir()
        copied = {}
        for name, root in self.splits.items():
            copied[name] = copy_root / name
            shutil.copytree(root, copied[name])
        replica = audit_splits(copied, self.root / "replica")
        self.assertEqual(original["datasetSha256"], replica["datasetSha256"])
        Image.new("RGB", (16, 12), "green").save(copied["train"] / "one.png")
        changed = audit_splits(copied, self.root / "changed")
        self.assertNotEqual(original["datasetSha256"], changed["datasetSha256"])

    def test_old_pass_is_not_overwritten_by_a_new_attempt(self):
        self.audit()
        receipt = self.root / "audit/dataset-audit.json"
        previous = receipt.read_bytes()
        (self.splits["train"] / "bad.jpg").write_bytes(b"invalid")
        with self.assertRaises(FileExistsError):
            self.audit()
        self.assertEqual(receipt.read_bytes(), previous)

    def test_bad_boundaries_are_errors_and_not_passes(self):
        for max_pixels in (0, -1, True):
            with self.assertRaises(ValueError):
                self.audit(max_pixels=max_pixels)
        with self.assertRaises(ValueError):
            audit_splits({"train": self.splits["train"]}, self.root / "out")
        with self.assertRaises(FileNotFoundError):
            audit_splits(
                {**self.splits, "validation": self.root / "absent"}, self.root / "out"
            )

    def test_cli_exit_status_and_saved_failed_receipt(self):
        args = [
            "--train-root",
            str(self.splits["train"]),
            "--validation-root",
            str(self.splits["validation"]),
        ]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(args + ["--out-root", str(self.root / "pass")]), 0)
            (self.splits["validation"] / "bad.jpg").write_bytes(b"invalid")
            self.assertEqual(main(args + ["--out-root", str(self.root / "fail")]), 1)
        self.assertEqual(
            json.loads((self.root / "fail/dataset-audit.json").read_text())["status"],
            "fail",
        )
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(args + ["--out-root", str(self.root / "pass")]), 2)


if __name__ == "__main__":
    unittest.main()
