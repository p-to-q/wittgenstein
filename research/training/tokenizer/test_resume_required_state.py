"""Strict recovery cannot replace missing training state with fresh state."""
from __future__ import annotations

import copy
import json
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

from .resume import (
    ResumeError,
    ResumeQuartetIncomplete,
    WARN_OPTIMIZER_MISSING,
    load_checkpoint_payload,
)

try:
    import torch
except ImportError:
    torch = None

if torch is not None:
    import torch.distributed as dist
    import torch.multiprocessing as mp

    from research.training._shared.manifest import sha256_file

    from . import train as trainer
    from .resume import manifest_path_for, verify_resume_checkpoint
    from .test_distributed_forward import TinyDiscriminator, TinyTokenizer
    from .test_resume_dataset import snapshot
    from .test_resume_optimizer import config, scalar_run


def payload(gan=False):
    result = {"model": {}, "optimizer": {"state": {}}, "step": 1,
              "args": {"gan_enabled": gan}}
    if gan:
        result.update(discriminator={}, disc_optimizer={"state": {}})
    return result


class RequiredStatePayloadTests(unittest.TestCase):
    def test_required_state_must_be_present_nonnull_mappings(self):
        for field in ("model", "optimizer", "discriminator", "disc_optimizer"):
            for value in (None, False, 0, "state", [], [1]):
                with self.subTest(field=field, value=value):
                    saved = payload(gan=True)
                    saved[field] = value
                    with self.assertRaises(ResumeQuartetIncomplete) as caught:
                        load_checkpoint_payload(saved, source="fixture.pt")
                    self.assertEqual(caught.exception.code, "RESUME_QUARTET_INCOMPLETE")
                    self.assertIn(field, caught.exception.missing)
                    self.assertIn("fixture.pt", str(caught.exception))
            saved = payload(gan=True)
            del saved[field]
            with self.subTest(field=field, absent=True), self.assertRaises(ResumeQuartetIncomplete):
                load_checkpoint_payload(saved)

    def test_error_names_every_missing_required_state(self):
        saved = payload(gan=True)
        for field in ("model", "optimizer", "discriminator", "disc_optimizer"):
            saved.pop(field)
        with self.assertRaises(ResumeQuartetIncomplete) as caught:
            load_checkpoint_payload(saved)
        self.assertEqual(set(caught.exception.missing),
                         {"model", "optimizer", "discriminator", "disc_optimizer"})

    def test_non_gan_and_empty_lazy_state_mappings_remain_loadable(self):
        for gan in (False, True):
            saved = payload(gan=gan)
            loaded = load_checkpoint_payload(saved)
            self.assertEqual(loaded.model, {})
            self.assertEqual(loaded.optimizer, {"state": {}})
            self.assertEqual(loaded.discriminator, {} if gan else None)

    def test_explicit_inspection_optout_keeps_missing_optimizer_warning(self):
        for kind in ("absent", "null"):
            saved = payload(gan=True)
            saved.pop("discriminator")
            saved.pop("disc_optimizer")
            if kind == "absent":
                saved.pop("optimizer")
            else:
                saved["optimizer"] = None
            with self.subTest(kind=kind):
                loaded = load_checkpoint_payload(saved, require_optimizer=False)
                self.assertIsNone(loaded.optimizer)
                self.assertIn(WARN_OPTIMIZER_MISSING, loaded.warnings)


def incomplete_pair(source, target, field, *, absent):
    saved = torch.load(source, weights_only=True)
    if absent:
        saved.pop(field)
    else:
        saved[field] = None
    target.parent.mkdir(parents=True, exist_ok=True)
    torch.save(saved, target)
    receipt = json.loads(manifest_path_for(source).read_text())
    receipt["checkpoint"].update(path=str(target), bytes=target.stat().st_size,
                                 sha256=sha256_file(target))
    manifest_path_for(target).write_text(json.dumps(receipt))
    # File-integrity success is deliberately insufficient for recovery.
    assert verify_resume_checkpoint(target) is None
    return target


def refused_worker(rank, rendezvous, cfg, checkpoints, output):
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=rendezvous, rank=rank, world_size=2,
                            timeout=timedelta(seconds=30))
    try:
        cfg.resume_from = str(checkpoints[rank])
        with (
            patch.object(TinyTokenizer, "load_state_dict") as load,
            patch.object(torch.optim.AdamW, "step") as update,
            patch.object(trainer, "_write_checkpoint") as save,
        ):
            try:
                scalar_run(cfg, rank, 2)
            except ResumeError as exc:
                load.assert_not_called()
                update.assert_not_called()
                save.assert_not_called()
                (Path(output) / f"rank-{rank}.json").write_text(
                    json.dumps({"code": exc.code, "message": str(exc)}))
            else:
                raise AssertionError("incomplete required state was accepted")
    finally:
        dist.destroy_process_group()


@unittest.skipIf(torch is None, "requires CPU torch")
class RequiredStateLoopTests(unittest.TestCase):
    def test_periodic_and_zero_update_resume_refuse_before_restoration_or_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            initial = scalar_run(cfg)
            for name in ("step_00000001.pt", "final.pt"):
                source = Path(initial["run_dir"]) / "ckpts" / name
                for field in ("model", "optimizer", "discriminator", "disc_optimizer"):
                    for absent in (False, True):
                        with self.subTest(checkpoint=name, field=field, absent=absent):
                            target = root / "inputs" / f"{name}-{field}-{absent}" / name
                            cfg.resume_from = str(incomplete_pair(source, target, field, absent=absent))
                            before = snapshot(root / "runs")
                            with (
                                patch.object(TinyTokenizer, "load_state_dict") as load,
                                patch.object(TinyDiscriminator, "load_state_dict") as d_load,
                                patch.object(torch.optim.AdamW, "load_state_dict") as o_load,
                                patch.object(TinyTokenizer, "forward") as forward,
                                patch.object(torch.optim.AdamW, "step") as update,
                                patch.object(trainer, "_write_checkpoint") as save,
                            ):
                                with self.assertRaises(ResumeQuartetIncomplete) as caught:
                                    scalar_run(cfg)
                                self.assertIn(field, caught.exception.missing)
                                for mocked in (load, d_load, o_load, forward, update, save):
                                    mocked.assert_not_called()
                            self.assertEqual(snapshot(root / "runs"), before)

    def test_healthy_non_gan_and_warmup_gan_recover_lazy_states(self):
        for gan in (False, True):
            with self.subTest(gan=gan), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                cfg = config(root, gan=gan)
                cfg.gan_on_step = 10  # no adversarial update; its state is valid and empty
                initial = scalar_run(cfg)
                for name in ("step_00000001.pt", "final.pt"):
                    cfg.resume_from = str(Path(initial["run_dir"]) / "ckpts" / name)
                    cfg.out_root = str(root / "resumed" / name)
                    result = scalar_run(cfg)
                    self.assertTrue(result["acceptance"]["final_checkpoint_written"])
                    saved = torch.load(Path(result["run_dir"]) / "ckpts/final.pt", weights_only=True)
                    self.assertEqual([float(s["step"]) for s in saved["optimizer"]["state"].values()], [3.0])
                    if gan:
                        self.assertEqual(saved["disc_optimizer"]["state"], {})
                    else:
                        self.assertNotIn("discriminator", saved)
                        self.assertNotIn("disc_optimizer", saved)

    @unittest.skipUnless(torch is not None and dist.is_available() and dist.is_gloo_available(),
                         "requires CPU gloo")
    def test_one_incomplete_rank_stops_both_ranks_with_the_typed_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            initial = scalar_run(cfg)
            source = Path(initial["run_dir"]) / "ckpts/final.pt"
            before = snapshot(root / "runs")
            for field in ("optimizer", "discriminator", "disc_optimizer"):
                with self.subTest(field=field):
                    bad = incomplete_pair(source, root / field / "final.pt", field, absent=False)
                    output = root / f"results-{field}"
                    output.mkdir()
                    processes = mp.spawn(refused_worker, args=((root / f"rendezvous-{field}").as_uri(),
                                         copy.deepcopy(cfg), [source, bad], str(output)), nprocs=2, join=False)
                    try:
                        deadline = time.monotonic() + 45
                        while not processes.join(timeout=1):
                            self.assertLess(time.monotonic(), deadline, "incomplete-state refusal hung a rank")
                    finally:
                        for process in processes.processes:
                            if process.is_alive():
                                process.terminate()
                            process.join(timeout=5)
                    for rank in range(2):
                        result = json.loads((output / f"rank-{rank}.json").read_text())
                        self.assertEqual(result["code"], "RESUME_QUARTET_INCOMPLETE")
                        self.assertIn(field, result["message"])
                    self.assertEqual(snapshot(root / "runs"), before)


if __name__ == "__main__":
    unittest.main()
