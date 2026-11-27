"""Real-loop corpus continuity regressions: generated pixels and scalar CPU models."""

from __future__ import annotations

import json
import tempfile
import time
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from PIL import Image
from torch import nn

from . import train as trainer
from .config import smoke_config
from .resume import ResumeDatasetDrift, manifest_path_for
from .test_distributed_forward import TinyTokenizer


class ScalarLoss(nn.Module):
    def forward(self, image, recon, vq_total, global_step=0):
        loss = recon.square().mean() + vq_total
        return loss, {"total": float(loss.detach())}


def real_config(root):
    cfg = smoke_config()
    cfg.smoke = False
    cfg.lpips_enabled = False
    cfg.num_workers = 0
    cfg.image_size = cfg.tokenizer.image_size = 16
    cfg.batch_size_per_gpu = 1
    cfg.max_steps = 3
    cfg.checkpoint_every = 1
    cfg.out_root = str(root / "runs")
    corpus = root / "corpus"
    corpus.mkdir()
    for index in range(2):
        Image.new("RGB", (16, 16), (10 + index, 20, 30)).save(corpus / f"{index}.png")
    cfg.train_data_root = str(corpus)
    return cfg


def scalar_run(cfg):
    with (
        patch.object(trainer, "init_distributed", return_value=(0, 1, 0, torch.device("cpu"))),
        patch.object(trainer, "build_tokenizer", return_value=TinyTokenizer(0)),
        patch.object(trainer, "TokenizerLoss", return_value=ScalarLoss()),
        patch.object(trainer, "_maybe_run_eval", return_value=([], None)),
        patch.object(torch.cuda, "is_available", return_value=False),
    ):
        return trainer.train(cfg)


def snapshot(root):
    return {str(path.relative_to(root)): path.read_bytes() for path in root.rglob("*") if path.is_file()}


def refused_worker(rank, rendezvous, cfg, output):
    torch.set_num_threads(1)
    dist.init_process_group(
        "gloo", init_method=rendezvous, rank=rank, world_size=2,
        timeout=timedelta(seconds=30),
    )
    try:
        with (
            patch.object(trainer, "init_distributed", return_value=(rank, 2, rank, torch.device("cpu"))),
            patch.object(trainer, "build_tokenizer", return_value=TinyTokenizer(0)) as build,
            patch.object(torch.cuda, "is_available", return_value=False),
        ):
            try:
                trainer.train(cfg)
            except ResumeDatasetDrift as exc:
                build.assert_not_called()
                (Path(output) / f"rank-{rank}.json").write_text(json.dumps({"code": exc.code}))
            else:
                raise AssertionError("changed corpus was accepted")
    finally:
        dist.destroy_process_group()


class ResumeDatasetTests(unittest.TestCase):
    def test_unchanged_corpus_resumes_periodic_and_zero_update_final(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = real_config(root)
            initial = scalar_run(cfg)
            run_dir = Path(initial["run_dir"])
            for name in ("step_00000001.pt", "final.pt"):
                cfg.resume_from = str(run_dir / "ckpts" / name)
                cfg.out_root = str(root / name)
                result = scalar_run(cfg)
                self.assertTrue(result["acceptance"]["manifest_written"])
                self.assertEqual(result["final_step"], 3)
                saved = json.loads(manifest_path_for(cfg.resume_from).read_text())
                current = json.loads((Path(result["run_dir"]) / "ckpts/final.manifest.json").read_text())
                self.assertEqual(current["dataset"], saved["dataset"])
                self.assertEqual(current["runId"], saved["runId"])

    def test_changed_corpus_is_refused_before_model_or_existing_output_mutation(self):
        for change in ("replace", "add", "remove", "rename"):
            for name in ("step_00000001.pt", "final.pt"):
                with self.subTest(change=change, checkpoint=name), tempfile.TemporaryDirectory() as tmp:
                    root = Path(tmp)
                    cfg = real_config(root)
                    initial = scalar_run(cfg)
                    cfg.resume_from = str(Path(initial["run_dir"]) / "ckpts" / name)
                    corpus = Path(cfg.train_data_root)
                    if change == "replace":
                        Image.new("RGB", (16, 16), (250, 20, 30)).save(corpus / "0.png")
                    elif change == "add":
                        (corpus / "2.png").write_bytes((corpus / "0.png").read_bytes())
                    elif change == "remove":
                        (corpus / "0.png").unlink()
                    else:
                        (corpus / "0.png").rename(corpus / "renamed.png")
                    before = snapshot(root / "runs")
                    with patch.object(trainer, "build_tokenizer", return_value=TinyTokenizer(0)) as build:
                        with self.assertRaisesRegex(ResumeDatasetDrift, "RESUME_DATASET_DRIFT"):
                            trainer.train(cfg)
                        build.assert_not_called()
                    self.assertEqual(snapshot(root / "runs"), before)

    def test_revision_drift_with_unchanged_bytes_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            cfg = real_config(Path(tmp))
            with patch.dict("os.environ", {"WITT_DVC_REV": "original-fixture"}):
                initial = scalar_run(cfg)
            cfg.resume_from = str(Path(initial["run_dir"]) / "ckpts/final.pt")
            with patch.dict("os.environ", {"WITT_DVC_REV": "other-fixture"}):
                with self.assertRaisesRegex(ResumeDatasetDrift, "dvcRev"):
                    scalar_run(cfg)

    @unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
    def test_rank_zero_refusal_stops_both_ranks_before_model_collectives(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            cfg = real_config(root)
            initial = scalar_run(cfg)
            cfg.resume_from = str(Path(initial["run_dir"]) / "ckpts/final.pt")
            Image.new("RGB", (16, 16), (250, 20, 30)).save(Path(cfg.train_data_root) / "0.png")
            before = snapshot(root / "runs")
            processes = mp.spawn(
                refused_worker, args=((root / "rendezvous").as_uri(), cfg, tmp),
                nprocs=2, join=False,
            )
            try:
                deadline = time.monotonic() + 45
                while not processes.join(timeout=1):
                    self.assertLess(time.monotonic(), deadline, "corpus refusal hung a rank")
            finally:
                for process in processes.processes:
                    if process.is_alive():
                        process.terminate()
                    process.join(timeout=5)
            for rank in range(2):
                self.assertEqual(json.loads((root / f"rank-{rank}.json").read_text())["code"], "RESUME_DATASET_DRIFT")
            self.assertEqual(snapshot(root / "runs"), before)


if __name__ == "__main__":
    unittest.main()
