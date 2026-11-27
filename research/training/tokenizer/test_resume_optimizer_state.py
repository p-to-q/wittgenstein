"""CPU AdamW state validation: real-loop refusals and positional mapping controls."""

from __future__ import annotations

import copy
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

from . import test_numerical_safety as numerical_tests
from . import train as trainer
from .resume import (
    ResumeOptimizerStateInvalid,
    manifest_path_for,
    verify_resume_checkpoint,
)
from .test_distributed_forward import TinyDiscriminator, TinyTokenizer
from .test_resume_dataset import snapshot
from .test_resume_optimizer import config, scalar_run


def mutate_state(payload, target, fault):
    saved = payload["optimizer" if target == "generator" else "disc_optimizer"]
    state = next(iter(saved["state"].values()))
    if fault == "moment_shape":
        state["exp_avg"] = state["exp_avg"].reshape(1)
    elif fault == "negative_variance":
        state["exp_avg_sq"].fill_(-1)
    elif fault == "missing_moment":
        del state["exp_avg"]
    elif fault in ("negative_step", "fractional_step", "future_step"):
        state["step"].fill_({"negative_step": -1, "fractional_step": 1.5, "future_step": 1000}[fault])
    elif fault == "orphan_state":
        saved["state"][1000] = copy.deepcopy(state)
    else:
        raise AssertionError(fault)


def write_pair(source, destination, payload):
    destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save(payload, destination)
    document = json.loads(manifest_path_for(source).read_text())
    document["checkpoint"].update(path=str(destination), bytes=destination.stat().st_size, sha256=sha256_file(destination))
    # Truthful receipt, including invalid state: this is not just a stale hash test.
    optimizer = torch.optim.AdamW([torch.nn.Parameter(torch.tensor(0.5))])
    optimizer.load_state_dict(payload["optimizer"])
    document["optimizer"] = asdict(capture_optimizer_checkpoint(optimizer, name="AdamW"))
    manifest_path_for(destination).write_text(json.dumps(document))
    assert verify_resume_checkpoint(destination) is None
    return destination


def refused_worker(rank, rendezvous, cfg, checkpoints, output):
    torch.set_num_threads(1)
    dist.init_process_group("gloo", init_method=rendezvous, rank=rank, world_size=2, timeout=timedelta(seconds=30))
    try:
        cfg.resume_from = str(checkpoints[rank])
        with patch.object(TinyTokenizer, "load_state_dict") as load:
            try:
                scalar_run(cfg, rank, 2)
            except ResumeOptimizerStateInvalid as exc:
                load.assert_not_called()
                (Path(output) / f"rank-{rank}.json").write_text(json.dumps({"code": exc.code, "message": str(exc)}))
            else:
                raise AssertionError("one-rank invalid optimizer state was accepted")
    finally:
        dist.destroy_process_group()


class AdamWStateTests(unittest.TestCase):
    def setUp(self):
        self.parameters = [torch.nn.Parameter(torch.ones(())), torch.nn.Parameter(torch.ones(2))]
        self.optimizer = torch.optim.AdamW(self.parameters, amsgrad=True)
        sum(parameter.sum() for parameter in self.parameters).backward()
        self.optimizer.step()
        self.saved = copy.deepcopy(self.optimizer.state_dict())

    def validate(self, saved):
        trainer._assert_adamw_state_valid(saved, self.optimizer, label="fixture", completed_updates=3)

    def test_healthy_positional_mapping_opaque_ids_and_legacy_counter(self):
        self.validate(self.saved)
        saved = self.saved
        # IDs are opaque. Preserve the positional mapping, not the spelling.
        saved["param_groups"][0]["params"] = [42, -7]
        saved["state"] = {42: saved["state"][0], -7: saved["state"][1]}
        saved["state"][42]["step"] = 1  # valid older AdamW format
        self.validate(saved)
        self.optimizer.load_state_dict(saved)
        self.optimizer.zero_grad()
        sum(parameter.sum() for parameter in self.parameters).backward()
        self.optimizer.step()
        self.assertEqual([entry["step"].item() for entry in self.optimizer.state.values()], [2, 2])

    def test_unused_parameters_allow_absent_or_empty_state_and_lower_counters(self):
        del self.saved["state"][0]
        self.saved["state"][1] = {}
        self.validate(self.saved)
        self.validate(self.optimizer.state_dict())  # per-parameter 1 is below global 3

    def test_duplicate_and_unreferenced_and_noninteger_ids_are_refused(self):
        for fault in ("duplicate", "orphan", "bool", "string"):
            with self.subTest(fault=fault):
                saved = copy.deepcopy(self.saved)
                if fault == "duplicate":
                    saved["param_groups"][0]["params"] = [0, 0]
                elif fault == "orphan":
                    saved["state"][42] = saved["state"][0]
                else:
                    saved["param_groups"][0]["params"][0] = True if fault == "bool" else "0"
                with self.assertRaises(ResumeOptimizerStateInvalid):
                    self.validate(saved)

    def test_moments_require_real_dense_floating_tensors_of_mapped_shape(self):
        invalid = (None, [0.0], torch.zeros(1), torch.zeros((), dtype=torch.int64),
                   torch.zeros((), dtype=torch.complex64), torch.zeros(()).to_sparse())
        for field in ("exp_avg", "exp_avg_sq", "max_exp_avg_sq"):
            for value in invalid:
                with self.subTest(field=field, value=str(value)):
                    saved = copy.deepcopy(self.saved)
                    saved["state"][0][field] = value
                    with self.assertRaisesRegex(ResumeOptimizerStateInvalid, field):
                        self.validate(saved)
            saved = copy.deepcopy(self.saved)
            del saved["state"][0][field]
            with self.assertRaisesRegex(ResumeOptimizerStateInvalid, f"missing.*{field}"):
                self.validate(saved)
        saved = copy.deepcopy(self.saved)
        saved["state"][0], saved["state"][1] = saved["state"][1], saved["state"][0]
        with self.assertRaisesRegex(ResumeOptimizerStateInvalid, "shape"):
            self.validate(saved)

    def test_counter_domain_and_variance_domain(self):
        counters = (True, "1", [1], -1, 0.5, 4, torch.ones(2), torch.tensor(True), torch.tensor(1j))
        for value in counters:
            with self.subTest(counter=str(value)):
                saved = copy.deepcopy(self.saved)
                saved["state"][0]["step"] = value
                with self.assertRaisesRegex(ResumeOptimizerStateInvalid, "step"):
                    self.validate(saved)
        for field in ("exp_avg_sq", "max_exp_avg_sq"):
            saved = copy.deepcopy(self.saved)
            saved["state"][0][field].fill_(-1)
            with self.assertRaisesRegex(ResumeOptimizerStateInvalid, "negative variance"):
                self.validate(saved)
        for value in (None, 1):
            saved = copy.deepcopy(self.saved)
            saved["state"][0] = value
            with self.assertRaisesRegex(ResumeOptimizerStateInvalid, "mapping"):
                self.validate(saved)
        self.saved["state"] = []
        with self.assertRaisesRegex(ResumeOptimizerStateInvalid, "mapping"):
            self.validate(self.saved)

    def test_nonfinite_tensors_remain_for_existing_numerical_failure_receipts(self):
        for field in ("step", "exp_avg", "exp_avg_sq", "max_exp_avg_sq"):
            for value in (float("nan"), float("inf"), -float("inf")):
                saved = copy.deepcopy(self.saved)
                saved["state"][0][field].fill_(value)
                self.validate(saved)


class ResumeOptimizerStateTests(unittest.TestCase):
    def test_final_and_periodic_invalid_states_refuse_before_mutation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            first = scalar_run(cfg)
            for name in ("final.pt", "step_00000001.pt"):
                source = Path(first["run_dir"]) / "ckpts" / name
                for target in ("generator", "discriminator"):
                    for fault in ("moment_shape", "negative_variance", "missing_moment", "negative_step", "fractional_step", "future_step", "orphan_state"):
                        with self.subTest(checkpoint=name, target=target, fault=fault):
                            payload = torch.load(source, weights_only=True)
                            mutate_state(payload, target, fault)
                            cfg.resume_from = str(write_pair(source, root / target / fault / name, payload))
                            before = snapshot(root / "runs")
                            with (
                                patch.object(TinyTokenizer, "load_state_dict") as load,
                                patch.object(TinyDiscriminator, "load_state_dict") as d_load,
                                patch.object(torch.optim.AdamW, "load_state_dict") as opt_load,
                                patch.object(torch.optim.AdamW, "step") as update,
                            ):
                                with self.assertRaisesRegex(ResumeOptimizerStateInvalid, target):
                                    scalar_run(cfg)
                                for method in (load, d_load, opt_load, update):
                                    method.assert_not_called()
                            self.assertEqual(snapshot(root / "runs"), before)

    def test_legacy_nonfinite_numeric_counters_keep_failed_numerical_receipts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            first = scalar_run(cfg)
            source = Path(first["run_dir"]) / "ckpts/final.pt"
            for target in ("generator", "discriminator"):
                for value in (float("nan"), float("inf"), -float("inf")):
                    with self.subTest(target=target, value=str(value)):
                        case = root / f"{target}-{value}"
                        payload = torch.load(source, weights_only=True)
                        key = "optimizer" if target == "generator" else "disc_optimizer"
                        next(iter(payload[key]["state"].values()))["step"] = value
                        cfg.resume_from = str(write_pair(source, case / "input/final.pt", payload))
                        cfg.out_root = str(case / "runs")
                        with patch.object(torch.optim.AdamW, "step") as update:
                            with self.assertRaisesRegex(FloatingPointError, f"{target}_state"):
                                scalar_run(cfg)
                            update.assert_not_called()
                        numerical_tests.UpdatedStateSafetyTests().assert_failed_state(case, target, step=3)

    def test_discriminator_delayed_start_accepts_lazy_state_and_bounds_active_updates(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = config(root)
            cfg.gan_on_step = 2
            first = scalar_run(cfg)
            for name in ("step_00000001.pt", "final.pt"):
                cfg.resume_from = str(Path(first["run_dir"]) / "ckpts" / name)
                cfg.out_root = str(root / name)
                resumed = scalar_run(cfg)
                saved = torch.load(Path(resumed["run_dir"]) / "ckpts/final.pt", weights_only=True)
                self.assertEqual(next(iter(saved["disc_optimizer"]["state"].values()))["step"].item(), 1)
            source = Path(first["run_dir"]) / "ckpts/final.pt"
            saved = torch.load(source, weights_only=True)
            next(iter(saved["disc_optimizer"]["state"].values()))["step"].fill_(2)
            cfg.resume_from = str(write_pair(source, root / "bad/final.pt", saved))
            with self.assertRaisesRegex(ResumeOptimizerStateInvalid, "range 0..1"):
                scalar_run(cfg)

    @unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
    def test_one_bad_rank_refuses_both_before_state_loading(self):
        for target in ("generator", "discriminator"):
            with self.subTest(target=target), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                cfg = config(root)
                first = scalar_run(cfg)
                source = Path(first["run_dir"]) / "ckpts/final.pt"
                payload = torch.load(source, weights_only=True)
                mutate_state(payload, target, "negative_variance")
                bad = write_pair(source, root / "bad/final.pt", payload)
                before = snapshot(root / "runs")
                processes = mp.spawn(refused_worker, args=((root / "rendezvous").as_uri(), cfg, [source, bad], tmp), nprocs=2, join=False)
                try:
                    deadline = time.monotonic() + 45
                    while not processes.join(timeout=1):
                        self.assertLess(time.monotonic(), deadline, "state refusal hung a rank")
                finally:
                    for process in processes.processes:
                        if process.is_alive():
                            process.terminate()
                        process.join(timeout=5)
                for rank in range(2):
                    receipt = json.loads((root / f"rank-{rank}.json").read_text())
                    self.assertEqual(receipt["code"], "RESUME_OPTIMIZER_STATE_INVALID")
                    self.assertIn(f"rank 1: RESUME_OPTIMIZER_STATE_INVALID: {target}", receipt["message"])
                self.assertEqual(snapshot(root / "runs"), before)


if __name__ == "__main__":
    unittest.main()
