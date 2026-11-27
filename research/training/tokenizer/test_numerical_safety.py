"""Real-loop numeric failure regressions using scalar CPU models only."""

from __future__ import annotations

import hashlib
import json
import sys
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch import nn

from . import train as train_mod
from .config import smoke_config
from .test_distributed_forward import TinyDiscriminator, TinyTokenizer


class InvalidGradient(torch.autograd.Function):
    @staticmethod
    def forward(ctx, value):
        return value.clone()

    @staticmethod
    def backward(ctx, gradient):
        return gradient * float("inf")


class FaultLoss(nn.Module):
    def __init__(self, stage, inject, fail_step=0):
        super().__init__()
        self.stage, self.inject, self.fail_step = stage, inject, fail_step

    def forward(self, image, recon, vq_total, global_step=0):
        loss = recon.square().mean() + vq_total
        if self.inject and global_step == self.fail_step:
            loss = loss * float("nan") if self.stage.endswith("loss") else InvalidGradient.apply(loss)
        return loss, {"total": float(loss.detach())}


def run_fault(root: Path, stage: str, rank=0, world=1, fail_step=0):
    model, discriminator = TinyTokenizer(rank), TinyDiscriminator()
    cfg = smoke_config()
    cfg.image_size = cfg.tokenizer.image_size = 16
    cfg.batch_size_per_gpu = 1
    cfg.max_steps = fail_step + 2
    cfg.checkpoint_every = 1
    cfg.optim.warmup_steps = 0
    cfg.out_root = str(root / "runs")
    cfg.gan_enabled = stage.startswith("discriminator")
    cfg.gan_on_step = 0
    inject = world == 1 or rank == 1
    steps = {"generator": 0, "discriminator": 0}
    step = torch.optim.AdamW.step

    def record_step(optimizer, *args, **kwargs):
        target = "generator" if optimizer.param_groups[0]["params"][0] is model.scale else "discriminator"
        steps[target] += 1
        return step(optimizer, *args, **kwargs)

    def bad_discriminator_loss(real, fake):
        loss = real.mean() - fake.mean()
        if inject:
            loss = loss * float("nan") if stage.endswith("loss") else InvalidGradient.apply(loss)
        return loss

    with (
        patch.object(train_mod, "init_distributed", return_value=(rank, world, rank, torch.device("cpu"))),
        patch.object(train_mod, "build_tokenizer", return_value=model),
        patch.object(train_mod, "PatchGANDiscriminator", return_value=discriminator),
        patch.object(train_mod, "_maybe_run_eval", return_value=([], None)) as evaluate,
        patch.object(torch.optim.AdamW, "step", record_step),
        patch.object(torch.cuda, "is_available", return_value=False),
    ):
        if stage.startswith("generator"):
            loss_patch = patch.object(train_mod, "TokenizerLoss", return_value=FaultLoss(stage, inject, fail_step))
        else:
            loss_patch = patch.object(train_mod, "discriminator_loss", bad_discriminator_loss)
        with loss_patch:
            try:
                train_mod.train(cfg)
            except FloatingPointError as exc:
                assert stage in str(exc), str(exc)
            else:
                raise AssertionError(f"{stage} was accepted; optimizer steps={steps}")
        evaluate.assert_not_called()
    target = "generator" if stage.startswith("generator") else "discriminator"
    assert steps[target] == fail_step, steps
    parameter = model.scale if target == "generator" else discriminator.scale
    assert torch.isfinite(parameter).all(), parameter
    if fail_step == 0:
        assert float(parameter.detach()) == (0.5 if target == "generator" else float(torch.tensor(0.2)))
    return steps


def fault_worker(rank: int, rendezvous: str, root: str, stage: str):
    torch.set_num_threads(1)
    dist.init_process_group(
        "gloo", init_method=rendezvous, rank=rank, world_size=2,
        timeout=timedelta(seconds=30),
    )
    try:
        steps = run_fault(Path(root), stage, rank, 2)
        (Path(root) / f"rank-{rank}.json").write_text(json.dumps(steps))
    finally:
        if dist.is_initialized():
            dist.destroy_process_group()


STAGES = ("generator_loss", "generator_gradients", "discriminator_loss", "discriminator_gradients")


class NumericalSafetyTests(unittest.TestCase):
    def assert_failed_receipt(self, root, stage):
        receipts = list((root / "runs").glob("*/acceptance.json"))
        self.assertEqual(len(receipts), 1)
        receipt = json.loads(receipts[0].read_text())
        block = receipt["acceptance"]
        self.assertFalse(block["manifest_written"])
        self.assertFalse(block["final_checkpoint_written"])
        self.assertEqual(block["failure_code"], "NONFINITE_TRAINING")
        self.assertEqual(block["failure_stage"], stage)
        self.assertEqual(block["failure_step"], 0)
        self.assertEqual(list(receipts[0].parent.glob("ckpts/*.pt")), [])
        events = [json.loads(line) for line in (receipts[0].parent / "experiment-metrics.jsonl").read_text().splitlines()]
        failures = [event for event in events if event.get("event") == "training_failed"]
        self.assertEqual(len(failures), 1)
        self.assertEqual(failures[0]["stage"], stage)
        tracker = json.loads((receipts[0].parent / "experiment.json").read_text())
        raw = (receipts[0].parent / "experiment-metrics.jsonl").read_bytes()
        self.assertEqual(tracker["metricsLog"]["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertNotIn("manifest", tracker)

    def test_finite_float64_norm_is_not_downcast_to_infinity(self):
        train_mod._require_finite_on_all_ranks(
            sys.float_info.max, stage="generator_gradients", step=0,
            device=torch.device("cpu"), world=1,
        )

    def test_failure_preserves_an_earlier_valid_checkpoint(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_fault(root, "generator_loss", fail_step=2)
            runs = list((root / "runs").iterdir())
            self.assertEqual(len(runs), 1)
            checkpoints = list((runs[0] / "ckpts").glob("*.pt"))
            self.assertEqual([p.name for p in checkpoints], ["step_00000001.pt"])
            checkpoint = torch.load(checkpoints[0], weights_only=True)
            self.assertTrue(all(torch.isfinite(value).all() for value in checkpoint["model"].values()))
            from .resume import verify_resume_checkpoint
            self.assertIsNone(verify_resume_checkpoint(checkpoints[0]))
            block = json.loads((runs[0] / "acceptance.json").read_text())["acceptance"]
            self.assertEqual(block["failure_step"], 2)
            self.assertFalse(block["final_checkpoint_written"])

    def test_invalid_loss_and_gradients_stop_before_the_affected_optimizer_step(self):
        for stage in STAGES:
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                run_fault(root, stage)
                self.assert_failed_receipt(root, stage)

    @unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
    def test_one_bad_rank_stops_both_ranks_before_the_affected_update_without_hanging(self):
        for stage in STAGES:
            with self.subTest(stage=stage), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                processes = mp.spawn(
                    fault_worker, args=((root / "rendezvous").as_uri(), tmp, stage),
                    nprocs=2, join=False,
                )
                deadline = time.monotonic() + 60
                try:
                    while not processes.join(timeout=1):
                        if time.monotonic() >= deadline:
                            self.fail(f"{stage}: workers did not exit within 60 seconds")
                finally:
                    for process in processes.processes:
                        if process.is_alive():
                            process.terminate()
                        process.join(timeout=5)
                for rank in range(2):
                    self.assertTrue((root / f"rank-{rank}.json").is_file())
                self.assert_failed_receipt(root, stage)


if __name__ == "__main__":
    unittest.main()
