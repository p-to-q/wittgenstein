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


class LargeFiniteGradientLoss(nn.Module):
    def forward(self, image, recon, vq_total, global_step=0):
        loss = recon.mean() * 1e25
        return loss, {"total": float(loss.detach())}


def run_state_fault(root: Path, fault: str, target="generator", rank=0, world=1, fail_step=0):
    model, discriminator = TinyTokenizer(rank), TinyDiscriminator()
    model.register_buffer("running", torch.ones(()))
    discriminator.register_buffer("running", torch.ones(()))
    cfg = smoke_config()
    cfg.image_size = cfg.tokenizer.image_size = 16
    cfg.batch_size_per_gpu = 1
    cfg.max_steps = fail_step + 1  # fault on the final attempted update
    cfg.checkpoint_every = 1
    cfg.optim.warmup_steps = cfg.optim.grad_clip_norm = 0
    cfg.out_root = str(root / "runs")
    cfg.gan_enabled = not fault.endswith("overflow")
    cfg.gan_on_step = 0
    if fault == "parameter_overflow":
        cfg.optim.lr = cfg.optim.weight_decay = 1e20
    if fault == "moment_overflow":
        cfg.optim.weight_decay = 0
    applied = {"generator": 0, "discriminator": 0}
    original_step = torch.optim.AdamW.step

    def update(optimizer, *args, **kwargs):
        kind = "generator" if optimizer.param_groups[0]["params"][0] is model.scale else "discriminator"
        parameters = [p for group in optimizer.param_groups for p in group["params"]]
        assert all(torch.isfinite(p).all() for p in parameters)
        assert all(torch.isfinite(p.grad).all() for p in parameters if p.grad is not None)
        result = original_step(optimizer, *args, **kwargs)
        applied[kind] += 1
        if kind == target and applied[kind] == fail_step + 1 and (world == 1 or rank == 1):
            module = model if target == "generator" else discriminator
            if fault == "parameter":
                module.scale.data.fill_(float("inf"))
            elif fault == "moment":
                optimizer.state[module.scale]["exp_avg_sq"].fill_(float("inf"))
            elif fault == "buffer":
                module.running.fill_(float("nan"))
        return result

    with (
        patch.object(train_mod, "init_distributed", return_value=(rank, world, rank, torch.device("cpu"))),
        patch.object(train_mod, "build_tokenizer", return_value=model),
        patch.object(train_mod, "PatchGANDiscriminator", return_value=discriminator),
        patch.object(train_mod, "_maybe_run_eval", return_value=([], None)) as evaluate,
        patch.object(torch.optim.AdamW, "step", update),
        patch.object(torch.cuda, "is_available", return_value=False),
        patch.object(train_mod, "TokenizerLoss", return_value=(
            LargeFiniteGradientLoss() if fault == "moment_overflow" else FaultLoss("unused", False)
        )),
    ):
        try:
            train_mod.train(cfg)
        except FloatingPointError as exc:
            assert f"{target}_state" in str(exc), str(exc)
        else:
            raise AssertionError(f"{fault} {target} state was accepted after {applied}")
        evaluate.assert_not_called()
    assert applied[target] == fail_step + 1, applied
    if target == "generator" and cfg.gan_enabled:
        assert applied["discriminator"] == fail_step, applied
    return applied


def state_fault_worker(rank: int, rendezvous: str, root: str, fault: str, target: str):
    torch.set_num_threads(1)
    dist.init_process_group(
        "gloo", init_method=rendezvous, rank=rank, world_size=2,
        timeout=timedelta(seconds=30),
    )
    try:
        applied = run_state_fault(Path(root), fault, target, rank, 2)
        (Path(root) / f"rank-{rank}.json").write_text(json.dumps(applied))
    finally:
        if dist.is_initialized():
            dist.destroy_process_group()


class UpdatedStateSafetyTests(unittest.TestCase):
    def assert_failed_state(self, root, target="generator", step=0):
        receipts = list((root / "runs").glob("*/acceptance.json"))
        self.assertEqual(len(receipts), 1)
        run = receipts[0].parent
        block = json.loads(receipts[0].read_text())["acceptance"]
        self.assertEqual(block["failure_code"], "NONFINITE_TRAINING")
        self.assertEqual(block["failure_stage"], f"{target}_state")
        self.assertEqual(block["failure_step"], step)
        self.assertFalse(block["final_checkpoint_written"])
        self.assertFalse(block["manifest_written"])
        self.assertFalse((run / "ckpts/final.pt").exists())
        events = [json.loads(line) for line in (run / "experiment-metrics.jsonl").read_text().splitlines()]
        self.assertTrue(any(event.get("event") == "training_failed" for event in events))
        experiment = json.loads((run / "experiment.json").read_text())
        self.assertNotIn("manifest", experiment)
        self.assertEqual(experiment["metricsLog"]["sha256"], hashlib.sha256((run / "experiment-metrics.jsonl").read_bytes()).hexdigest())
        return run

    def test_real_adamw_overflow_with_finite_loss_and_gradients_is_refused(self):
        for fault in ("parameter_overflow", "moment_overflow"):
            with self.subTest(fault=fault), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                run_state_fault(root, fault)
                self.assert_failed_state(root)

    def test_generator_and_discriminator_parameters_moments_and_buffers_are_checked(self):
        for target in ("generator", "discriminator"):
            for fault in ("parameter", "moment", "buffer"):
                with self.subTest(target=target, fault=fault), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    run_state_fault(root, fault, target)
                    self.assert_failed_state(root, target)

    def test_state_failure_preserves_earlier_finite_checkpoint_pair(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            run_state_fault(root, "moment", fail_step=2)
            run = self.assert_failed_state(root, step=2)
            checkpoints = list((run / "ckpts").glob("*.pt"))
            self.assertEqual([p.name for p in checkpoints], ["step_00000001.pt"])
            from .resume import verify_resume_checkpoint
            self.assertIsNone(verify_resume_checkpoint(checkpoints[0]))
            saved = torch.load(checkpoints[0], weights_only=True)
            self.assertTrue(all(torch.isfinite(value).all() for value in saved["model"].values()))
            self.assertTrue(all(torch.isfinite(value).all() for state in saved["optimizer"]["state"].values() for value in state.values() if torch.is_tensor(value)))

    def test_zero_update_resume_rejects_nonfinite_state_even_with_valid_file_hash(self):
        import copy

        from .resume import manifest_path_for, verify_resume_checkpoint

        def tokenizer(*args, **kwargs):
            model = TinyTokenizer(0)
            model.register_buffer("running", torch.ones(()))
            return model

        def discriminator(*args, **kwargs):
            model = TinyDiscriminator()
            model.register_buffer("running", torch.ones(()))
            return model

        with (
            tempfile.TemporaryDirectory() as tmp,
            patch.object(train_mod, "init_distributed", return_value=(0, 1, 0, torch.device("cpu"))),
            patch.object(train_mod, "build_tokenizer", side_effect=tokenizer),
            patch.object(train_mod, "PatchGANDiscriminator", side_effect=discriminator),
            patch.object(train_mod, "_maybe_run_eval", return_value=([], None)),
            patch.object(torch.cuda, "is_available", return_value=False),
        ):
            root = Path(tmp)
            cfg = smoke_config()
            cfg.image_size = cfg.tokenizer.image_size = 16
            cfg.batch_size_per_gpu = cfg.max_steps = 1
            cfg.optim.warmup_steps = 0
            cfg.gan_enabled = True
            cfg.gan_on_step = 0
            cfg.out_root = str(root / "source")
            summary = train_mod.train(cfg)
            original = Path(summary["run_dir"]) / "ckpts/final.pt"
            payload = torch.load(original, weights_only=True)
            manifest = json.loads(manifest_path_for(original).read_text())
            original_hash = hashlib.sha256(original.read_bytes()).hexdigest()
            for target in ("generator", "discriminator"):
                for fault in ("parameter", "moment", "buffer"):
                    with self.subTest(target=target, fault=fault):
                        case = root / f"{target}-{fault}"
                        checkpoint = case / "input/final.pt"
                        checkpoint.parent.mkdir(parents=True)
                        poisoned = copy.deepcopy(payload)
                        if fault == "moment":
                            key = "optimizer" if target == "generator" else "disc_optimizer"
                            next(iter(poisoned[key]["state"].values()))["exp_avg_sq"].fill_(float("inf"))
                        else:
                            key = "model" if target == "generator" else "discriminator"
                            poisoned[key]["scale" if fault == "parameter" else "running"].fill_(float("nan"))
                        torch.save(poisoned, checkpoint)
                        document = copy.deepcopy(manifest)
                        document["checkpoint"].update(
                            path=str(checkpoint), bytes=checkpoint.stat().st_size,
                            sha256=hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
                        )
                        manifest_path_for(checkpoint).write_text(json.dumps(document))
                        self.assertIsNone(verify_resume_checkpoint(checkpoint))
                        resumed = copy.deepcopy(cfg)
                        resumed.resume_from = str(checkpoint)
                        resumed.out_root = str(case / "runs")
                        with (
                            patch.object(torch.optim.AdamW, "step") as update,
                            patch.object(train_mod, "_maybe_run_eval", return_value=([], None)) as evaluate,
                            self.assertRaisesRegex(FloatingPointError, f"{target}_state"),
                        ):
                            train_mod.train(resumed)
                        update.assert_not_called()
                        evaluate.assert_not_called()
                        self.assert_failed_state(case, target, step=1)
            healthy = copy.deepcopy(cfg)
            healthy.resume_from = str(original)
            healthy.out_root = str(root / "healthy-resume")
            with patch.object(torch.optim.AdamW, "step") as update:
                resumed_summary = train_mod.train(healthy)
            update.assert_not_called()
            self.assertEqual(resumed_summary["final_step"], 1)
            self.assertTrue(resumed_summary["acceptance"]["final_checkpoint_written"])
            self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), original_hash)

    @unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
    def test_one_bad_post_update_rank_stops_both_without_hanging(self):
        for target in ("generator", "discriminator"):
            for fault in ("parameter", "moment"):
                with self.subTest(target=target, fault=fault), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    processes = mp.spawn(
                        state_fault_worker,
                        args=((root / "rendezvous").as_uri(), tmp, fault, target),
                        nprocs=2, join=False,
                    )
                    deadline = time.monotonic() + 60
                    try:
                        while not processes.join(timeout=1):
                            if time.monotonic() >= deadline:
                                self.fail(f"{target}/{fault}: workers did not exit within 60 seconds")
                    finally:
                        for process in processes.processes:
                            if process.is_alive():
                                process.terminate()
                            process.join(timeout=5)
                    for rank in range(2):
                        self.assertTrue((root / f"rank-{rank}.json").is_file())
                    self.assert_failed_state(root, target)


if __name__ == "__main__":
    unittest.main()
