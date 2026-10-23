"""Tests for the training receipts added alongside the manifest spine.

Covers the two torch-free pieces — the run-acceptance receipt writer (C3) and
the corrupt-sample-count channel (C4) — plus a torch/PIL-guarded check that
`ImageFolderDataset` actually bumps the shared worker tally.
"""

from __future__ import annotations

import importlib.util
import json
import multiprocessing as mp
import tempfile
import unittest
from pathlib import Path

from .acceptance import (
    TRAINING_ACCEPTANCE_SCHEMA_VERSION,
    assert_training_acceptance_shape,
    write_acceptance_receipt,
)
from .corrupt_count import local_corrupt_count, resolve_dataset_corrupt_count

_FORK_AVAILABLE = "fork" in mp.get_all_start_methods()
_TORCH_AVAILABLE = importlib.util.find_spec("torch") is not None
_PIL_AVAILABLE = importlib.util.find_spec("PIL") is not None


class _FakeDataset:
    def __init__(self, corrupt_count: int = 0, corrupt_tally=None):
        self.corrupt_count = corrupt_count
        if corrupt_tally is not None:
            self.corrupt_tally = corrupt_tally


def _acceptance(**overrides):
    block = {
        "smoke_mode": True,
        "manifest_written": True,
        "final_checkpoint_written": True,
        "used_synthetic_data": True,
        "dataset_corrupt_count": 0,
    }
    block.update(overrides)
    return block


class AcceptanceReceiptTests(unittest.TestCase):
    def test_writes_valid_acceptance_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = write_acceptance_receipt(tmp, _acceptance(), run_id="tokenizer-test")
            self.assertEqual(path.name, "acceptance.json")
            payload = json.loads(path.read_text(encoding="utf-8"))
        assert_training_acceptance_shape(payload)
        self.assertEqual(payload["schemaVersion"], TRAINING_ACCEPTANCE_SCHEMA_VERSION)
        self.assertEqual(payload["runId"], "tokenizer-test")
        self.assertIs(payload["acceptance"]["manifest_written"], True)

    def test_leave_no_tmp_file_behind(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            write_acceptance_receipt(tmp, _acceptance())
            leftovers = sorted(p.name for p in Path(tmp).iterdir())
        self.assertEqual(leftovers, ["acceptance.json"])

    def test_rejects_missing_required_flag(self) -> None:
        block = _acceptance()
        del block["manifest_written"]
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                write_acceptance_receipt(tmp, block)

    def test_rejects_negative_corrupt_count(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                write_acceptance_receipt(tmp, _acceptance(dataset_corrupt_count=-1))

    def test_accepts_null_corrupt_count_as_unknown(self) -> None:
        # None is the honest "unknowable" value and must survive the round-trip
        # rather than being coerced to a false 0.
        with tempfile.TemporaryDirectory() as tmp:
            path = write_acceptance_receipt(tmp, _acceptance(dataset_corrupt_count=None))
            payload = json.loads(path.read_text(encoding="utf-8"))
        self.assertIsNone(payload["acceptance"]["dataset_corrupt_count"])
        assert_training_acceptance_shape(payload)


class LocalCorruptCountTests(unittest.TestCase):
    def test_single_process_reads_parent_counter(self) -> None:
        ds = _FakeDataset(corrupt_count=7)
        self.assertEqual(local_corrupt_count(ds, num_workers=0, start_method="spawn"), 7)

    def test_multiworker_without_tally_is_unknown_never_zero(self) -> None:
        # THE BUG: a worker-side counter is invisible to the parent, so the
        # parent's `corrupt_count` stays 0. The honest answer is None.
        ds = _FakeDataset(corrupt_count=0)
        self.assertIsNone(local_corrupt_count(ds, num_workers=4, start_method="fork"))

    def test_multiworker_spawn_start_method_is_unknown(self) -> None:
        # Under spawn the child gets a copy, not the shared value; trusting it
        # would publish a false 0.
        tally = mp.get_context("spawn").Value("q", 3)
        ds = _FakeDataset(corrupt_tally=tally)
        self.assertIsNone(local_corrupt_count(ds, num_workers=4, start_method="spawn"))

    @unittest.skipUnless(_FORK_AVAILABLE, "fork start method unavailable")
    def test_multiworker_fork_reads_shared_tally(self) -> None:
        tally = mp.get_context("fork").Value("q", 5)
        ds = _FakeDataset(corrupt_tally=tally)
        self.assertEqual(local_corrupt_count(ds, num_workers=4, start_method="fork"), 5)

    @unittest.skipUnless(_FORK_AVAILABLE, "fork start method unavailable")
    def test_fork_tally_is_visible_across_processes(self) -> None:
        ctx = mp.get_context("fork")
        tally = ctx.Value("q", 0)

        def bump(value):
            with value.get_lock():
                value.value += 4

        proc = ctx.Process(target=bump, args=(tally,))
        proc.start()
        proc.join()
        ds = _FakeDataset(corrupt_tally=tally)
        self.assertEqual(local_corrupt_count(ds, num_workers=2, start_method="fork"), 4)

    def test_resolve_world_one_delegates_to_local(self) -> None:
        known = _FakeDataset(corrupt_count=2)
        unknown = _FakeDataset(corrupt_count=0)
        self.assertEqual(
            resolve_dataset_corrupt_count(known, num_workers=0, start_method="fork", world=1),
            2,
        )
        self.assertIsNone(
            resolve_dataset_corrupt_count(unknown, num_workers=2, start_method="fork", world=1)
        )


@unittest.skipUnless(_TORCH_AVAILABLE and _PIL_AVAILABLE, "torch/PIL not installed")
class ImageFolderCorruptTallyTests(unittest.TestCase):
    def test_counts_corrupt_image_and_bumps_shared_tally(self) -> None:
        from PIL import Image

        from .dataset import ImageFolderDataset

        tally = mp.Value("q", 0)
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            Image.new("RGB", (8, 8), (10, 20, 30)).save(root / "good.png")
            (root / "bad.png").write_text("not an image", encoding="utf-8")
            ds = ImageFolderDataset(root, image_size=8, corrupt_tally=tally)
            # sorted(): bad.png first -> idx 0 is the corrupt file.
            _, _ = ds[0]
        self.assertEqual(ds.corrupt_count, 1)
        self.assertEqual(tally.value, 1)


if __name__ == "__main__":
    unittest.main()