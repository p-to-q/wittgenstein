"""Real-loop AdamW profile regressions: scalar CPU models, synthetic data only."""

from __future__ import annotations

import json
import tempfile
import time
import unittest
from dataclasses import asdict
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import torch
import torch.distributed as dist
import torch.multiprocessing as mp

from research.training._shared.manifest import capture_optimizer_checkpoint, sha256_file

from . import train as trainer
from .config import smoke_config
from .resume import ResumeOptimizerDrift, manifest_path_for, verify_resume_checkpoint
from .test_distributed_forward import TinyDiscriminator, TinyTokenizer
from .test_resume_dataset import ScalarLoss, snapshot


def config(root, gan=True):
    cfg = smoke_config()
    cfg.image_size = cfg.tokenizer.image_size = 16
    cfg.batch_size_per_gpu = 1
    cfg.max_steps = 3
    cfg.checkpoint_every = 1
    cfg.optim.warmup_steps = 4
    cfg.out_root = str(root / "runs")
    cfg.gan_enabled = gan
    cfg.gan_on_step = 0
    return cfg


def scalar_run(cfg, rank=0, world=1):
    with (
        patch.object(trainer, "init_distributed", return_value=(rank, world, rank, torch.device("cpu"))),
        patch.object(trainer, "build_tokenizer", return_value=TinyTokenizer(rank)),
        patch.object(trainer, "PatchGANDiscriminator", return_value=TinyDiscriminator()),
        patch.object(trainer, "TokenizerLoss", return_value=ScalarLoss()),
        patch.object(trainer, "_maybe_run_eval", return_value=([], None)),
        patch.object(torch.cuda, "is_available", return_value=False),
    ):
        return trainer.train(cfg)


def edited_checkpoint(source, destination, target, changes, remove=()):
    payload = torch.load(source, weights_only=True)
    key = "optimizer" if target == "generator" else "disc_optimizer"
    group = payload[key]["param_groups"][0]
    group.update(changes)
    for field in remove:
        del group[field]
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, destination)
    document = json.loads(manifest_path_for(source).read_text())
    document["checkpoint"].update(path=str(destination), bytes=destination.stat().st_size, sha256=sha256_file(destination))
    # Truthful actual optimizer receipt: only args/runtime recipe conflicts remain.
    optim = torch.optim.AdamW([torch.nn.Parameter(torch.tensor(0.5))])
    optim.load_state_dict(payload["optimizer"])
    document["optimizer"] = asdict(capture_optimizer_checkpoint(optim, name="AdamW"))
    manifest_path_for(destination).write_text(json.dumps(document))
    assert verify_resume_checkpoint(destination) is None
    return destination


def refused_worker(rank, rendezvous, cfg, checkpoints, output):
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=rendezvous, rank=rank, world_size=2, timeout=timedelta(seconds=30))
    try:
        cfg.resume_from = str(checkpoints[rank])
        try:
            scalar_run(cfg, rank, 2)
        except ResumeOptimizerDrift as exc:
            (Path(output) / f"rank-{rank}.json").write_text(json.dumps({"code": exc.code, "message": str(exc)}))
        else:
            raise AssertionError("one-rank optimizer drift was accepted")
    finally:
        dist.destroy_process_group()


class ResumeOptimizerTests(unittest.TestCase):
    def test_healthy_warmup_and_discriminator_defaults_resume(self):
        for gan in (False, True):
            with self.subTest(gan=gan), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                cfg = config(root, gan)
                first = scalar_run(cfg)
                for name in ("step_00000001.pt", "final.pt"):
                    cfg.resume_from = str(Path(first["run_dir"]) / "ckpts" / name)
                    cfg.out_root = str(root / name)
                    resumed = scalar_run(cfg)
                    self.assertTrue(resumed["acceptance"]["manifest_written"])
                    payload = torch.load(Path(resumed["run_dir"]) / "ckpts/final.pt", weights_only=True)
                    self.assertEqual(payload["optimizer"]["param_groups"][0]["lr"], cfg.optim.lr * 3 / 4)
                    if gan:
                        self.assertEqual(payload["disc_optimizer"]["param_groups"][0]["weight_decay"], 0.01)
                        self.assertNotEqual(cfg.optim.weight_decay, 0.01)

    def assert_profiles_refused(self, name, changes):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            first = scalar_run(cfg)
            source = Path(first["run_dir"]) / "ckpts" / name
            for target in ("generator", "discriminator"):
                for field, value in changes:
                    with self.subTest(target=target, field=field, checkpoint=name):
                        cfg.resume_from = str(edited_checkpoint(source, root / f"{target}-{field}" / name, target, {field: value}))
                        before = snapshot(root / "runs")
                        # A failure must precede state mutation, forwards, updates and output writes.
                        with (
                            patch.object(TinyTokenizer, "load_state_dict") as load,
                            patch.object(torch.optim.AdamW, "step") as update,
                        ):
                            with self.assertRaisesRegex(ResumeOptimizerDrift, f"{target}.*{field}"):
                                scalar_run(cfg)
                            load.assert_not_called()
                            update.assert_not_called()
                        self.assertEqual(snapshot(root / "runs"), before)

    def test_zero_update_resume_refuses_every_supported_profile_conflict(self):
        self.assert_profiles_refused("final.pt", (
            ("betas", (0.5, 0.8)), ("weight_decay", 0.4), ("eps", 0.001),
            ("maximize", True), ("amsgrad", True), ("lr", 0.02),
        ))

    def test_periodic_resume_refuses_profile_conflicts_before_the_next_update(self):
        self.assert_profiles_refused("step_00000001.pt", (
            ("betas", (0.5, 0.8)), ("weight_decay", 0.4), ("eps", 0.001),
            ("maximize", True), ("lr", 0.02),
        ))

    def test_legacy_false_default_flags_remain_loadable(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            first = scalar_run(cfg)
            source = Path(first["run_dir"]) / "ckpts/final.pt"
            path = edited_checkpoint(source, root / "legacy/final.pt", "generator", {}, remove=("amsgrad", "maximize"))
            cfg.resume_from = str(edited_checkpoint(path, root / "legacy-both/final.pt", "discriminator", {}, remove=("amsgrad", "maximize")))
            cfg.out_root = str(root / "resumed")
            self.assertTrue(scalar_run(cfg)["acceptance"]["manifest_written"])

    @unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
    def test_one_bad_rank_refuses_both_ranks_before_loading_state(self):
        for target in ("generator", "discriminator"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                cfg = config(root)
                first = scalar_run(cfg)
                source = Path(first["run_dir"]) / "ckpts/final.pt"
                bad = edited_checkpoint(source, root / "rank-one/final.pt", target, {"betas": (0.5, 0.8)})
                before = snapshot(root / "runs")
                processes = mp.spawn(refused_worker, args=((root / "rendezvous").as_uri(), cfg, [source, bad], tmp), nprocs=2, join=False)
                try:
                    deadline = time.monotonic() + 45
                    while not processes.join(timeout=1):
                        self.assertLess(time.monotonic(), deadline, "optimizer refusal hung a rank")
                finally:
                    for process in processes.processes:
                        if process.is_alive():
                            process.terminate()
                        process.join(timeout=5)
                for rank in range(2):
                    receipt = json.loads((root / f"rank-{rank}.json").read_text())
                    self.assertEqual(receipt["code"], "RESUME_OPTIMIZER_DRIFT")
                    self.assertIn(f"rank 1: RESUME_OPTIMIZER_DRIFT: {target}", receipt["message"])
                self.assertEqual(snapshot(root / "runs"), before)


if __name__ == "__main__":
    unittest.main()
