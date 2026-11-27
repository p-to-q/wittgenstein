"""Verified-descriptor resume regressions; scalar CPU models, no downloads."""
from __future__ import annotations

import copy
import json
import os
import shutil
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import torch
import torch.distributed as dist
import torch.multiprocessing as mp

from . import train as trainer
from .resume import (
    ResumeDatasetDrift,
    ResumeError,
    ResumeIntegrityError,
    load_checkpoint,
    manifest_path_for,
    verify_resume_checkpoint,
)
from .test_distributed_forward import TinyTokenizer
from .test_resume_dataset import snapshot
from .test_resume_optimizer import config, scalar_run
from .test_resume_optimizer_state import write_pair


def swap_at_load(selected, replacement=None, receipt=None, *, in_place=False):
    """Inject once at the real deserializer boundary, for either path or fd."""
    real_load = torch.load
    injected = []

    def load(stream, *args, **kwargs):
        if Path(getattr(stream, "name", stream)) == selected and not injected:
            injected.append(True)
            if replacement is not None:
                if in_place:
                    # Mutate after torch has read to test the post-load guard too.
                    result = real_load(stream, *args, **kwargs)
                    selected.write_bytes(replacement.read_bytes())
                    return result
                os.replace(replacement, selected)
            if receipt is not None:
                manifest_path_for(selected).write_bytes(receipt)
        return real_load(stream, *args, **kwargs)

    return load, injected


def refused_worker(rank, rendezvous, cfg, selected, output, mismatch):
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=rendezvous, rank=rank, world_size=2, timeout=timedelta(seconds=30))
    try:
        cfg.resume_from = str(selected[rank])
        hook, _ = swap_at_load(selected[rank], receipt=b"{")
        with patch.object(TinyTokenizer, "load_state_dict") as load:
            try:
                if rank == 1 and not mismatch:
                    with patch.object(torch, "load", side_effect=hook):
                        scalar_run(cfg, rank, 2)
                else:
                    scalar_run(cfg, rank, 2)
            except ResumeIntegrityError as exc:
                load.assert_not_called()
                (Path(output) / f"rank-{rank}.json").write_text(json.dumps({"code": exc.code, "message": str(exc)}))
            else:
                raise AssertionError("rank-local snapshot drift was accepted")
    finally:
        dist.destroy_process_group()


class ResumeSnapshotTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = tempfile.TemporaryDirectory()
        root = Path(cls.fixture.name)
        cls.cfg = config(root)
        result = scalar_run(cls.cfg)
        cls.source = Path(result["run_dir"]) / "ckpts/final.pt"

    @classmethod
    def tearDownClass(cls):
        cls.fixture.cleanup()

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.selected = self.root / "input/final.pt"
        self.selected.parent.mkdir()
        shutil.copy2(self.source, self.selected)
        shutil.copy2(manifest_path_for(self.source), manifest_path_for(self.selected))
        self.cfg = copy.deepcopy(self.cfg)
        self.cfg.resume_from = str(self.selected)
        self.cfg.out_root = str(self.root / "output")
        self.original = snapshot(self.source.parent.parent)

    def replacement(self):
        payload = torch.load(self.selected, weights_only=True)
        payload["model"]["scale"].add_(1)
        replacement = self.root / "final.pt.tmp"
        torch.save(payload, replacement)
        self.assertEqual(replacement.stat().st_size, self.selected.stat().st_size)
        return replacement

    def assert_refused(self, hook, expected=ResumeIntegrityError, message=None):
        with patch.object(TinyTokenizer, "load_state_dict") as load:
            with hook:
                with self.assertRaises(expected) as caught:
                    scalar_run(self.cfg)
            load.assert_not_called()
        if message:
            self.assertIn(message, str(caught.exception))
        self.assertFalse(Path(self.cfg.out_root).exists())
        self.assertEqual(snapshot(self.source.parent.parent), self.original)
        return caught.exception

    def test_same_size_atomic_checkpoint_swap_cannot_recertify_replacement(self):
        replacement = self.replacement()
        hook, injected = swap_at_load(self.selected, replacement)
        self.assertIsNone(verify_resume_checkpoint(self.selected))
        exc = self.assert_refused(patch.object(torch, "load", side_effect=hook))
        self.assertEqual(exc.code, "RESUME_INTEGRITY_INVALID")
        self.assertTrue(injected)
        self.assertIn("SHA-256", verify_resume_checkpoint(self.selected))

    def test_in_place_change_after_deserialization_is_refused(self):
        hook, _ = swap_at_load(self.selected, self.replacement(), in_place=True)
        self.assert_refused(patch.object(torch, "load", side_effect=hook), message="SHA-256")

    def test_receipt_replacement_during_load_is_refused(self):
        for raw in (b"{", b"null", b"\xff", manifest_path_for(self.selected).read_bytes() + b"\n"):
            with self.subTest(raw=raw[:20]):
                shutil.copy2(manifest_path_for(self.source), manifest_path_for(self.selected))
                hook, _ = swap_at_load(self.selected, receipt=raw)
                self.assert_refused(patch.object(torch, "load", side_effect=hook), message="sibling manifest changed")

    def test_missing_receipt_after_preflight_is_refused(self):
        real = trainer._load_training_resume

        def remove_then_load(*args):
            manifest_path_for(self.selected).unlink()
            return real(*args)

        self.assert_refused(patch.object(trainer, "_load_training_resume", side_effect=remove_then_load), message="missing sibling")

    def test_dataset_check_uses_the_loaded_receipt(self):
        real = trainer._load_training_resume

        def change_then_load(*args):
            document = json.loads(manifest_path_for(self.selected).read_text())
            document["dataset"]["sha256"] = "0" * 64
            manifest_path_for(self.selected).write_text(json.dumps(document))
            return real(*args)

        self.assert_refused(patch.object(trainer, "_load_training_resume", side_effect=change_then_load), ResumeDatasetDrift)

    def test_pinned_receipt_enforces_payload_run_id_and_step(self):
        for key, value, message in (("runId", "other-run", "run-id"), ("stepCount", 2, "stepCount")):
            with self.subTest(key=key):
                payload = torch.load(self.source, weights_only=True)
                document = json.loads(manifest_path_for(self.source).read_text())
                payload["run_id"] = document["runId"]
                write_pair(self.source, self.selected, payload)
                document = json.loads(manifest_path_for(self.selected).read_text())
                document[key] = value
                manifest_path_for(self.selected).write_text(json.dumps(document))
                with self.assertRaisesRegex(ResumeError, message):
                    load_checkpoint(self.selected, verify_receipt=True)

    def test_loader_receives_verified_seekable_handle_and_closes_it(self):
        real = torch.load
        handles = []

        def load(stream, **kwargs):
            self.assertTrue(stream.seekable())
            self.assertEqual(stream.tell(), 0)
            self.assertTrue(kwargs["weights_only"])
            handles.append(stream)
            return real(stream, **kwargs)

        with patch.object(torch, "load", side_effect=load):
            loaded = load_checkpoint(self.selected, verify_receipt=True)
        self.assertIsNotNone(loaded.snapshot_identity)
        self.assertTrue(handles[0].closed)

    def test_healthy_final_and_periodic_resumes(self):
        for filename in ("final.pt", "step_00000001.pt"):
            with self.subTest(filename=filename):
                self.cfg.resume_from = str(self.source.with_name(filename))
                self.cfg.out_root = str(self.root / filename)
                result = scalar_run(self.cfg)
                self.assertTrue(result["acceptance"]["manifest_written"])
                # Actual resumed payload reaches the requested final update count.
                saved = torch.load(Path(result["run_dir"]) / "ckpts/final.pt", weights_only=True)
                self.assertEqual(saved["step"], 3)
                self.assertEqual(snapshot(self.source.parent.parent), self.original)

    def test_standalone_legacy_reader_still_allows_absent_receipt(self):
        manifest_path_for(self.selected).unlink()
        self.assertEqual(load_checkpoint(self.selected).step, 3)
        with self.assertRaisesRegex(ResumeIntegrityError, "missing sibling"):
            load_checkpoint(self.selected, verify_receipt=True)

    @unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
    def test_rank_local_receipt_change_and_different_valid_pairs_refuse_all(self):
        for mismatch in (False, True):
            with self.subTest(mismatch=mismatch), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                payload = torch.load(self.source, weights_only=True)
                if mismatch:
                    payload["model"]["scale"].add_(1)
                second = write_pair(self.source, root / "second/final.pt", payload)
                # Separate paths prevent the invalid-receipt injection affecting rank 0.
                selected = [self.source, second]
                cfg = copy.deepcopy(self.cfg)
                cfg.out_root = str(root / "output")
                processes = mp.spawn(refused_worker, args=((root / "rendezvous").as_uri(), cfg, selected, tmp, mismatch), nprocs=2, join=False)
                try:
                    deadline = time.monotonic() + 45
                    while not processes.join(timeout=1):
                        self.assertLess(time.monotonic(), deadline, "snapshot refusal hung a rank")
                finally:
                    for process in processes.processes:
                        if process.is_alive():
                            process.terminate()
                        process.join(timeout=5)
                for rank in range(2):
                    receipt = json.loads((root / f"rank-{rank}.json").read_text())
                    self.assertEqual(receipt["code"], "RESUME_INTEGRITY_INVALID")
                self.assertFalse(Path(cfg.out_root).exists())
                self.assertEqual(snapshot(self.source.parent.parent), self.original)


if __name__ == "__main__":
    unittest.main()
