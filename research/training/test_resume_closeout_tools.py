from __future__ import annotations

import argparse
import io
import json
import random
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

try:  # optional: only the file-roundtrip test needs a real serializer
    import torch
except ImportError:  # pragma: no cover - env-dependent
    torch = None  # type: ignore[assignment]

from research.training import supervise_tokenizer_run
from research.training._shared.smoke_manifest import build_smoke_manifest
from research.training.closeout_tokenizer_run import latest_checkpoint
from research.training.supervise_tokenizer_run import (
    build_train_cmd,
    checkpoint_step,
    latest_step_checkpoint,
    verify_resume_checkpoint,
)
from research.training.tokenizer.resume import (
    WARN_ARGS_MISSING,
    WARN_RNG_MISSING,
    WARN_RNG_RANK_MISMATCH,
    RngState,
    ResumeArgsDrift,
    ResumeArgsMissing,
    ResumeError,
    ResumeQuartetIncomplete,
    ResumeStepsMissing,
    assert_args_compatible,
    build_checkpoint_payload,
    build_rng_entry,
    capture_python_rng_state,
    load_checkpoint,
    load_checkpoint_payload,
    load_for_resume,
    restore_python_rng_state,
    restore_rng_state,
    rng_state_from_checkpoint,
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


class _StubTorch:
    """Minimal torch stand-in so the resume seam is testable without torch.

    `load_checkpoint` receives the module by injection, which is exactly the
    extension point that keeps resume.py torch-free.
    """

    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def load(self, path, **kwargs):  # noqa: ANN001 - mirrors torch.load signature
        return self._payload


class _StubRecorder:
    """Records RNG restore calls so the hooks are assertable without torch."""

    def __init__(self) -> None:
        self.state = None

    def set_rng_state(self, state) -> None:  # noqa: ANN001
        self.state = state


def _valid_manifest(run_id: str, step_count: int, checkpoint_basename: str) -> dict:
    """Build a shape-valid manifest document via the canonical smoke writer."""
    with tempfile.TemporaryDirectory() as seed_dir:
        summary = build_smoke_manifest(Path(seed_dir), run_id=run_id)
        document = json.loads(Path(summary["manifestPath"]).read_text(encoding="utf-8"))
    document["stepCount"] = step_count
    document["checkpoint"]["path"] = checkpoint_basename
    return document


def _resume_layout(root: Path, run_id: str, step: int) -> tuple[Path, Path, dict]:
    """Lay out ``<root>/<run_id>/ckpts/step_*.pt`` + its sibling manifest."""
    ckpts = root / run_id / "ckpts"
    ckpts.mkdir(parents=True)
    ckpt = ckpts / f"step_{step:08d}.pt"
    ckpt.write_bytes(b"stub")
    document = _valid_manifest(run_id, step, ckpt.name)
    manifest = ckpts / f"step_{step:08d}.manifest.json"
    manifest.write_text(json.dumps(document), encoding="utf-8")
    return ckpt, manifest, document


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

    # ---- D1: training-loop seams (save args, drift guard, run-id) ----------
    def test_d1_build_checkpoint_payload_adds_args_and_preserves_keys(self) -> None:
        payload = build_checkpoint_payload(
            model_state={"w": 1},
            step=2_000,
            optimizer_state={"state": {}},
            args=_saved_args(),
        )
        # additive: existing keys and their spellings are untouched
        self.assertEqual(payload["model"], {"w": 1})
        self.assertEqual(payload["step"], 2_000)
        self.assertEqual(payload["optimizer"], {"state": {}})
        self.assertEqual(payload["args"], _saved_args())
        # adversarial keys stay absent unless supplied (no spurious shape change)
        self.assertNotIn("discriminator", payload)
        self.assertNotIn("disc_optimizer", payload)

    def test_d1_build_checkpoint_payload_includes_adversarial_when_present(self) -> None:
        payload = build_checkpoint_payload(
            model_state={"w": 1},
            step=5,
            optimizer_state={},
            args=_saved_args(),
            discriminator={"d": 1},
            disc_optimizer={"do": 1},
        )
        self.assertEqual(payload["discriminator"], {"d": 1})
        self.assertEqual(payload["disc_optimizer"], {"do": 1})

    def test_d1_load_for_resume_rejects_drift_before_loop(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00002000.pt"
            ckpt.write_bytes(b"stub")
            current = _saved_args()
            current["optim"]["lr"] = 5e-5
            with self.assertRaises(ResumeArgsDrift):
                load_for_resume(ckpt, current, torch_module=_StubTorch(_quartet_payload()))

    def test_d1_load_for_resume_rejects_legacy_missing_args(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00002000.pt"
            ckpt.write_bytes(b"stub")
            legacy = _quartet_payload()
            del legacy["args"]
            with self.assertRaises(ResumeArgsMissing):
                load_for_resume(ckpt, _saved_args(), torch_module=_StubTorch(legacy))

    def test_d1_load_for_resume_carries_run_id_and_start_step(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00002000.pt"
            ckpt.write_bytes(b"stub")
            (Path(tmp) / "step_00002000.manifest.json").write_text(
                json.dumps({"runId": "tokenizer-original-9f2c6a84"}), encoding="utf-8"
            )
            decision = load_for_resume(
                ckpt, _saved_args(), torch_module=_StubTorch(_quartet_payload())
            )
            self.assertEqual(decision.run_id, "tokenizer-original-9f2c6a84")
            self.assertEqual(decision.start_step, 2_001)  # periodic naming
            self.assertEqual(decision.checkpoint.args, _saved_args())
            self.assertIn(WARN_RNG_MISSING, decision.warnings)

    @unittest.skipIf(torch is None, "torch not installed")
    def test_d1_torch_roundtrip_args_survive_weights_only(self) -> None:
        # proves the D1 writer's args dict survives a real torch.save/load with
        # weights_only=True (the loader path), not just the injected-stub path
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00000007.pt"
            payload = build_checkpoint_payload(
                model_state={"w": torch.zeros(2)},
                step=7,
                optimizer_state={"state": {}},
                args=_saved_args(),
                discriminator={"d": torch.zeros(1)},
            )
            torch.save(payload, ckpt)
            decision = load_for_resume(ckpt, _saved_args())
            self.assertEqual(decision.checkpoint.step, 7)
            self.assertEqual(decision.checkpoint.args, _saved_args())
            self.assertEqual(decision.start_step, 8)
            self.assertIsNotNone(decision.checkpoint.discriminator)

    # ---- E3: RNG save/restore wiring --------------------------------------
    def test_e3_build_rng_entry_records_cuda_and_rank(self) -> None:
        entry = build_rng_entry(torch_state=b"t", cuda_state=[b"c0"], rank=2)
        self.assertEqual(entry["cuda"], [b"c0"])
        self.assertEqual(entry["rank"], 2)

    def test_e3_restore_applies_torch_and_cuda_states(self) -> None:
        record: dict = {}

        class _CudaModule:
            @staticmethod
            def set_rng_state_all(states) -> None:  # noqa: ANN001
                record["cuda"] = list(states)

        class _TorchStub:
            cuda = _CudaModule

            @staticmethod
            def set_rng_state(state) -> None:  # noqa: ANN001
                record["torch"] = state

        warnings = restore_rng_state(
            RngState(torch=b"t", cuda=[b"c0", b"c1"]), torch_module=_TorchStub
        )
        self.assertEqual(warnings, ())
        self.assertEqual(record["torch"], b"t")
        self.assertEqual(record["cuda"], [b"c0", b"c1"])

    def test_e3_restore_refuses_foreign_rank(self) -> None:
        recorder = _StubRecorder()
        warnings = restore_rng_state(RngState(torch=b"x", rank=0), torch_module=recorder, rank=3)
        self.assertEqual(len(warnings), 1)
        self.assertIn(WARN_RNG_RANK_MISMATCH, warnings[0])
        self.assertIsNone(recorder.state)  # never restored a foreign stream

    def test_e3_rng_entry_roundtrips_through_stub_torch(self) -> None:
        payload = build_checkpoint_payload(
            model_state={"w": 1},
            step=10,
            optimizer_state={},
            args=_saved_args(),
            rng=build_rng_entry(torch_state=b"state-bytes", rank=0),
        )
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00000010.pt"
            ckpt.write_bytes(b"stub")
            decision = load_for_resume(ckpt, _saved_args(), torch_module=_StubTorch(payload))
        self.assertNotIn(WARN_RNG_MISSING, decision.warnings)
        recorder = _StubRecorder()
        warnings = restore_rng_state(decision.checkpoint.rng, torch_module=recorder, rank=0)
        self.assertEqual(warnings, ())
        self.assertEqual(recorder.state, b"state-bytes")

    def test_e3_legacy_checkpoint_without_rng_warns_not_silent(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt = Path(tmp) / "step_00002000.pt"
            ckpt.write_bytes(b"stub")
            decision = load_for_resume(
                ckpt, _saved_args(), torch_module=_StubTorch(_quartet_payload())
            )
        self.assertIn(WARN_RNG_MISSING, decision.warnings)

    @unittest.skipIf(torch is None, "torch not installed")
    def test_e3_torch_rng_roundtrip_reproduces_stream(self) -> None:
        torch.manual_seed(7)
        entry = build_rng_entry(
            python_state=capture_python_rng_state(),
            torch_state=torch.get_rng_state(),
            rank=0,
        )
        expected = torch.rand(4)
        torch.manual_seed(999)  # perturb, then restore
        warnings = restore_rng_state(
            RngState(python=entry["python"], torch=entry["torch"], rank=0),
            torch_module=torch,
            rank=0,
        )
        self.assertEqual(warnings, ())
        self.assertTrue(torch.equal(torch.rand(4), expected))

    @unittest.skipIf(torch is None, "torch not installed")
    def test_e3_capture_rng_entry_from_train_loop(self) -> None:
        # exercises the E3 capture seam in train.py (torch-heavy import gated)
        from research.training.tokenizer import train as train_mod

        entry = train_mod._capture_rng_entry()
        self.assertIn("torch", entry)
        self.assertIn("python", entry)
        self.assertEqual(entry["rank"], 0)  # single-process: no dist initialized
        # the captured entry loads as a valid rng state for restore
        self.assertFalse(rng_state_from_checkpoint({"rng": entry}).is_empty())

    # ---- E5: supervisor D3 manifest verification ---------------------------
    def test_e5_verify_accepts_matching_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt, _, _ = _resume_layout(Path(tmp), "tokenizer-run-a", 2_000)
            self.assertIsNone(verify_resume_checkpoint(ckpt))

    def test_e5_verify_rejects_missing_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt, manifest, _ = _resume_layout(Path(tmp), "tokenizer-run-a", 2_000)
            manifest.unlink()
            reason = verify_resume_checkpoint(ckpt)
        self.assertIsNotNone(reason)
        self.assertIn("manifest", reason)

    def test_e5_verify_rejects_step_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt, manifest, document = _resume_layout(Path(tmp), "tokenizer-run-a", 2_000)
            document["stepCount"] = 1_500  # disagrees with the filename step
            manifest.write_text(json.dumps(document), encoding="utf-8")
            reason = verify_resume_checkpoint(ckpt)
        self.assertIsNotNone(reason)
        self.assertIn("stepCount", reason)

    def test_e5_verify_rejects_shape_invalid_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt, manifest, document = _resume_layout(Path(tmp), "tokenizer-run-a", 2_000)
            del document["runId"]
            manifest.write_text(json.dumps(document), encoding="utf-8")
            reason = verify_resume_checkpoint(ckpt)
        self.assertIsNotNone(reason)
        self.assertIn("shape", reason)

    def test_e5_verify_rejects_run_id_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt, manifest, document = _resume_layout(Path(tmp), "tokenizer-run-a", 2_000)
            # move the checkpoint into a differently-named run dir than its runId
            wrong_dir = Path(tmp) / "tokenizer-some-other-run" / "ckpts"
            wrong_dir.mkdir(parents=True)
            moved = wrong_dir / ckpt.name
            moved.write_bytes(b"stub")
            moved_manifest = wrong_dir / manifest.name
            moved_manifest.write_text(json.dumps(document), encoding="utf-8")
            reason = verify_resume_checkpoint(moved)
        self.assertIsNotNone(reason)
        self.assertIn("runId", reason)

    def test_e5_verify_rejects_unparseable_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpt, manifest, _ = _resume_layout(Path(tmp), "tokenizer-run-a", 2_000)
            manifest.write_text("{not json", encoding="utf-8")
            reason = verify_resume_checkpoint(ckpt)
        self.assertIsNotNone(reason)
        self.assertIn("unreadable", reason)

    def test_e5_supervisor_fails_closed_without_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            ckpts = Path(tmp) / "run" / "ckpts"
            ckpts.mkdir(parents=True)
            (ckpts / "step_00002000.pt").write_bytes(b"stub")  # no sibling manifest
            argv = [
                "supervise_tokenizer_run",
                "--repo-root",
                str(Path.cwd()),
                "--train-data-root",
                "/data/train",
                "--out-root",
                tmp,
                "--log",
                str(Path(tmp) / "run.log"),
                "--deadline-hours",
                "1",
            ]
            with mock.patch("sys.argv", argv), mock.patch("sys.stderr", new=io.StringIO()):
                rc = supervise_tokenizer_run.main()
        self.assertEqual(rc, 3)  # D3 fail-closed, before torchrun is launched

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
