from __future__ import annotations

import argparse
import json
import random
import tempfile
import time
import unittest
from pathlib import Path

try:  # optional: only the file-roundtrip test needs a real serializer
    import torch
except ImportError:  # pragma: no cover - env-dependent
    torch = None  # type: ignore[assignment]

from research.training.closeout_tokenizer_run import latest_checkpoint
from research.training.supervise_tokenizer_run import (
    build_train_cmd,
    checkpoint_step,
    latest_step_checkpoint,
)
from research.training.tokenizer.resume import (
    WARN_ARGS_MISSING,
    WARN_RNG_MISSING,
    RngState,
    ResumeArgsDrift,
    ResumeArgsMissing,
    ResumeError,
    ResumeQuartetIncomplete,
    ResumeStepsMissing,
    assert_args_compatible,
    build_rng_entry,
    capture_python_rng_state,
    load_checkpoint,
    load_checkpoint_payload,
    restore_python_rng_state,
    restore_rng_state,
    resume_metadata,
    resume_start_step,
    run_id_from_sibling_manifest,
)


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


def _saved_args(**overrides) -> dict:
    """A math-relevant args snapshot shaped like `config.TrainConfig`."""
    snapshot = {
        "seed": 0,
        "max_steps": 100,
        "batch_size_per_gpu": 8,
        "image_size": 256,
        "optim": {
            "lr": 1e-4,
            "beta1": 0.9,
            "beta2": 0.95,
            "weight_decay": 0.05,
            "warmup_steps": 500,
            "grad_clip_norm": 1.0,
        },
        "tokenizer": {
            "codebook_size": 16384,
            "codebook_embed_dim": 32,
            "codebook_l2_norm": True,
            "image_size": 256,
            "commit_loss_beta": 0.25,
            "entropy_loss_ratio": 0.0,
        },
        "gan_enabled": False,
        "gan_on_step": 20_000,
        "gan_weight": 0.1,
        "disc_base_channels": 64,
        "disc_n_layers": 3,
        "disc_lr": 1e-4,
        "out_root": "/runs/tokenizer-a",
    }
    snapshot.update(overrides)
    return snapshot


def _quartet_payload(**overrides) -> dict:
    payload = {
        "model": {"w": 1},
        "optimizer": {"state": {}},
        "step": 2_000,
        "args": _saved_args(),
    }
    payload.update(overrides)
    return payload


class TokenizerResumeHardeningTests(unittest.TestCase):
    """E1–E5: quartet validation, args-drift, RNG hooks, run-id, no guessing."""

    # ---- E1: typed four-piece loader --------------------------------------
    def test_e1_loads_full_quartet_and_accepts_upstream_steps_key(self) -> None:
        payload = _quartet_payload()
        del payload["step"]
        payload["steps"] = 2_000  # upstream's plural key
        loaded = load_checkpoint_payload(payload)
        # upstream's `steps` key normalizes onto the single `step` field
        self.assertEqual(loaded.step, 2_000)
        self.assertEqual(loaded.args, _saved_args())
        self.assertIsNotNone(loaded.optimizer)

    def test_e1_missing_model_raises_quartet_incomplete_naming_path(self) -> None:
        payload = _quartet_payload()
        del payload["model"]
        with self.assertRaises(ResumeQuartetIncomplete) as ctx:
            load_checkpoint_payload(payload, source="ckpts/step_00002000.pt")
        self.assertIn("model", ctx.exception.missing)
        self.assertIn("step_00002000.pt", str(ctx.exception))

    def test_e1_non_mapping_payload_is_rejected(self) -> None:
        with self.assertRaises(ResumeError):
            load_checkpoint_payload(["not", "a", "mapping"])  # type: ignore[arg-type]

    # ---- E2: args snapshot + drift rejection ------------------------------
    def test_e2_args_drift_lists_every_math_key(self) -> None:
        saved = _saved_args()
        current = _saved_args()
        current["optim"]["lr"] = 5e-5
        current["max_steps"] = 200
        with self.assertRaises(ResumeArgsDrift) as ctx:
            assert_args_compatible(saved, current, source="step_00002000.pt")
        self.assertEqual(set(ctx.exception.drifted), {"optim.lr", "max_steps"})

    def test_e2_non_math_change_does_not_drift(self) -> None:
        saved = _saved_args()
        current = _saved_args(out_root="/runs/tokenizer-b")
        # retargeting the output dir is not training drift
        assert_args_compatible(saved, current)

    def test_e2_missing_args_snapshot_is_rejected_not_silent(self) -> None:
        with self.assertRaises(ResumeArgsMissing):
            assert_args_compatible(None, _saved_args())

    def test_e2_loader_rejects_missing_args_by_default(self) -> None:
        payload = _quartet_payload()
        del payload["args"]
        with self.assertRaises(ResumeArgsMissing) as ctx:
            load_checkpoint_payload(payload, source="ckpts/final.pt")
        self.assertIn("final.pt", str(ctx.exception))

    def test_e2_loader_can_opt_out_with_explicit_warning(self) -> None:
        payload = _quartet_payload()
        del payload["args"]
        loaded = load_checkpoint_payload(payload, require_args=False)
        self.assertIsNone(loaded.args)
        self.assertIn(WARN_ARGS_MISSING, loaded.warnings)

    # ---- E3: RNG capture/restore hooks ------------------------------------
    def test_e3_python_rng_roundtrip_reproduces_stream(self) -> None:
        random.seed(1234)
        state = capture_python_rng_state()
        first = [random.random() for _ in range(5)]
        restore_python_rng_state(state)
        second = [random.random() for _ in range(5)]
        self.assertEqual(first, second)

    def test_e3_build_rng_entry_omits_absent_generators(self) -> None:
        entry = build_rng_entry(python_state=(1, 2), torch_state=b"abc")
        self.assertEqual(entry, {"python": (1, 2), "torch": b"abc"})

    def test_e3_restore_warns_when_module_not_injected(self) -> None:
        warnings = restore_rng_state(RngState(torch=object(), numpy=object()))
        self.assertEqual(len(warnings), 2)

    def test_e3_missing_rng_state_emits_explicit_warning(self) -> None:
        loaded = load_checkpoint_payload(_quartet_payload())
        self.assertIn(WARN_RNG_MISSING, loaded.warnings)

    # ---- E4: run-id continuity --------------------------------------------
    def test_e4_run_id_continuity_from_sibling_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "run" / "ckpts" / "step_00002000.pt"
            ckpt.parent.mkdir(parents=True)
            ckpt.write_bytes(b"stub")
            (ckpt.parent / "step_00002000.manifest.json").write_text(
                json.dumps({"runId": "tokenizer-20260530T214518Z-9f2c6a84"}),
                encoding="utf-8",
            )
            self.assertEqual(
                run_id_from_sibling_manifest(ckpt),
                "tokenizer-20260530T214518Z-9f2c6a84",
            )
            meta = resume_metadata(_quartet_payload(), checkpoint_path=ckpt)
            self.assertEqual(meta.run_id, "tokenizer-20260530T214518Z-9f2c6a84")
            self.assertEqual(meta.step, 2_000)
            self.assertEqual(meta.start_step, 2_001)  # periodic naming
            self.assertTrue(meta.args_present)
            self.assertFalse(meta.rng_present)

    def test_e4_malformed_sibling_manifest_is_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "final.pt"
            ckpt.write_bytes(b"stub")
            (Path(tmp) / "final.manifest.json").write_text("{not json", encoding="utf-8")
            self.assertIsNone(run_id_from_sibling_manifest(ckpt))

    # ---- E5: never guess the step from the filename -----------------------
    def test_e5_missing_step_is_never_parsed_from_filename(self) -> None:
        for name in ("step_00002000.pt", "final.pt"):
            payload = _quartet_payload()
            del payload["step"]
            with self.assertRaises(ResumeStepsMissing):
                load_checkpoint_payload(payload, source=name)

    def test_e5_resume_start_step_distinguishes_step_and_final_naming(self) -> None:
        self.assertEqual(resume_start_step(2_000, Path("step_00002000.pt")), 2_001)
        self.assertEqual(resume_start_step(2_000, Path("final.pt")), 2_000)

    # ---- file roundtrip (needs a real serializer) -------------------------
    @unittest.skipIf(torch is None, "torch not installed")
    def test_torch_file_roundtrip_preserves_quartet(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00000010.pt"
            payload = {
                "model": {"w": torch.zeros(2)},
                "optimizer": {},
                "step": 10,
                "args": _saved_args(),
                "rng": {"torch": torch.get_rng_state()},
            }
            torch.save(payload, ckpt)
            loaded = load_checkpoint(ckpt)
            self.assertEqual(loaded.step, 10)
            self.assertEqual(loaded.args, _saved_args())
            self.assertFalse(loaded.rng.is_empty())


if __name__ == "__main__":
    unittest.main()
