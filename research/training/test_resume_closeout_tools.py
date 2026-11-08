from __future__ import annotations

import argparse
import os
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from research.training import supervise_tokenizer_run as supervisor
from research.training.closeout_tokenizer_run import latest_checkpoint
from research.training.supervise_tokenizer_run import (
    build_train_cmd,
    checkpoint_step,
    latest_step_checkpoint,
)
from research.training.tokenizer.resume import resume_start_step


class TokenizerResumeCloseoutToolTests(unittest.TestCase):
    def test_checkpoint_step_parses_only_step_checkpoints(self) -> None:
        self.assertEqual(checkpoint_step(Path("step_00054000.pt")), 54000)
        self.assertEqual(checkpoint_step(Path("final.pt")), -1)
        self.assertEqual(checkpoint_step(Path("step_latest.pt")), -1)

    def test_supervisor_selects_highest_step_over_mtime(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpts = Path(tmp) / "run" / "ckpts"
            ckpts.mkdir(parents=True)
            older_high_step = ckpts / "step_00002000.pt"
            newer_low_step = ckpts / "step_00001000.pt"
            older_high_step.write_text("high", encoding="utf-8")
            time.sleep(0.01)
            newer_low_step.write_text("low", encoding="utf-8")

            self.assertEqual(latest_step_checkpoint(Path(tmp), None), older_high_step)

    def test_supervisor_includes_resume_checkpoint_in_train_command(self) -> None:
        args = argparse.Namespace(
            nproc_per_node=4,
            master_port=29701,
            train_data_root="/data/train",
            out_root="/runs",
            max_steps=200_000,
            batch_size_per_gpu=12,
            codebook_embed_dim=32,
            lr=1e-4,
            seed=7,
            num_workers=8,
            checkpoint_every=1000,
            dataset_license="research-only",
            val_data_root="",
            entropy_loss_ratio=0.05,
            gan=False,
            gan_on_step=20_000,
            no_lpips=True,
        )
        cmd = build_train_cmd(args, Path("/runs/ckpts/step_00002000.pt"))

        self.assertIn("--resume-from", cmd)
        self.assertIn("/runs/ckpts/step_00002000.pt", cmd)
        self.assertIn("--no-lpips", cmd)
        self.assertIn("--no-gan", cmd)

    def test_supervisor_scans_and_writes_the_same_relative_output_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            caller_root = Path(tmp).resolve()
            repo_root = caller_root / "repo"
            repo_root.mkdir()
            original_cwd = Path.cwd()
            try:
                os.chdir(caller_root)
                with (
                    patch.object(sys, "argv", [
                        "supervise", "--repo-root", str(repo_root),
                        "--train-data-root", "/data/train", "--out-root", "runs",
                        "--log", str(caller_root / "supervise.log"),
                        "--deadline-hours", "1",
                    ]),
                    patch.object(supervisor, "git_sha", return_value=""),
                    patch.object(supervisor, "latest_step_checkpoint", return_value=None) as latest,
                    patch.object(supervisor, "run_once", return_value=0) as run_once,
                ):
                    self.assertEqual(supervisor.main(), 0)
            finally:
                os.chdir(original_cwd)

            expected_root = caller_root / "runs"
            self.assertEqual(latest.call_args.args[0], expected_root)
            args, cmd = run_once.call_args.args[:2]
            self.assertEqual(args.repo_root, repo_root)
            self.assertEqual(cmd[cmd.index("--out-root") + 1], str(expected_root))

    def test_closeout_latest_checkpoint_considers_final_checkpoint(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpts = Path(tmp) / "run" / "ckpts"
            ckpts.mkdir(parents=True)
            step = ckpts / "step_00002000.pt"
            final = ckpts / "final.pt"
            step.write_text("step", encoding="utf-8")
            time.sleep(0.01)
            final.write_text("final", encoding="utf-8")

            self.assertEqual(latest_checkpoint(Path(tmp)), final)

    def test_resume_start_step_does_not_repeat_periodic_checkpoint_step(self) -> None:
        self.assertEqual(resume_start_step(2000, Path("step_00002000.pt")), 2001)
        self.assertEqual(resume_start_step(2000, Path("final.pt")), 2000)


if __name__ == "__main__":
    unittest.main()
