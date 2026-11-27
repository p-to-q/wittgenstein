"""Checkpoint identity reconciliation stays torch-free except one file roundtrip."""

from __future__ import annotations

import copy
import json
import tempfile
import unittest
from pathlib import Path

from research.training._shared.manifest import sha256_file
from research.training._shared.smoke_manifest import build_smoke_manifest
from research.training.test_resume_closeout_tools import (
    _quartet_payload,
    _saved_args,
    _StubTorch,
)

from .resume import (
    ResumeError,
    load_checkpoint,
    load_checkpoint_payload,
    load_for_resume,
    manifest_path_for,
    verify_resume_checkpoint,
)


class ResumeIdentityTests(unittest.TestCase):
    def test_payload_run_ids_must_be_safe_single_directory_names(self):
        invalid = ("../outside", "/tmp/outside", "a/b", "a\\b", ".", "..", "C:outside", "bad\x00id", "", 123)
        for run_id in invalid:
            for location in ("direct", "args"):
                with self.subTest(run_id=run_id, location=location):
                    payload = _quartet_payload()
                    if location == "direct":
                        payload["run_id"] = run_id
                    else:
                        payload["args"]["run_id"] = run_id
                    with self.assertRaisesRegex(ResumeError, "run.id"):
                        load_checkpoint_payload(payload)

    def test_conflicting_payload_and_args_run_ids_are_not_silently_prioritized(self):
        payload = _quartet_payload(run_id="tokenizer-a")
        payload["args"]["run_id"] = "tokenizer-b"
        with self.assertRaisesRegex(ResumeError, "run.id"):
            load_checkpoint_payload(payload)
        payload["args"]["run_id"] = "tokenizer-a"
        self.assertEqual(load_checkpoint_payload(payload).run_id, "tokenizer-a")

    def test_sibling_and_payload_run_ids_must_agree(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "final.pt"
            path.write_bytes(b"fixture")
            manifest_path_for(path).write_text(json.dumps({"runId": "tokenizer-original"}))
            for location in ("direct", "args"):
                payload = _quartet_payload()
                if location == "direct":
                    payload["run_id"] = "tokenizer-other"
                else:
                    payload["args"]["run_id"] = "tokenizer-other"
                with self.subTest(location=location), self.assertRaisesRegex(ResumeError, "run.id"):
                    load_checkpoint(path, torch_module=_StubTorch(payload))

    def test_sibling_cannot_supply_an_unsafe_output_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "final.pt"
            path.write_bytes(b"fixture")
            manifest_path_for(path).write_text(json.dumps({"runId": "../outside"}))
            with self.assertRaisesRegex(ResumeError, "run.id"):
                load_checkpoint(path, torch_module=_StubTorch(_quartet_payload()))

    def test_payload_step_must_agree_with_sibling_on_periodic_and_final_checkpoints(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("step_00002000.pt", "final.pt"):
                path = Path(tmp) / name
                path.write_bytes(b"fixture")
                manifest_path_for(path).write_text(json.dumps({"runId": "fixture", "stepCount": 2001}))
                with self.subTest(name=name), self.assertRaisesRegex(ResumeError, "step"):
                    load_checkpoint(path, torch_module=_StubTorch(_quartet_payload()))

    def test_legacy_without_sibling_keeps_explicit_warning_behavior(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "final.pt"
            path.write_bytes(b"fixture")
            loaded = load_checkpoint(path, torch_module=_StubTorch(_quartet_payload()))
            self.assertIsNone(loaded.run_id)
            self.assertIn("RESUME_RUN_ID_MISSING", loaded.warnings)

    def test_real_serialized_payload_mismatch_is_rejected_even_when_byte_hash_matches(self):
        try:
            import torch
        except ImportError:
            self.skipTest("torch not installed")
        with tempfile.TemporaryDirectory() as tmp:
            summary = build_smoke_manifest(Path(tmp), run_id="tokenizer-original")
            path = Path(summary["checkpointPath"]).with_name("final.pt")
            payload = _quartet_payload(run_id="tokenizer-other")
            torch.save(payload, path)
            document = json.loads(Path(summary["manifestPath"]).read_text())
            document["stepCount"] = payload["step"]
            document["checkpoint"].update(path=str(path), bytes=path.stat().st_size, sha256=sha256_file(path))
            manifest_path_for(path).write_text(json.dumps(document))
            # The pre-device byte/shape gate passes; the decoded identity is the defect.
            self.assertIsNone(verify_resume_checkpoint(path))
            with self.assertRaisesRegex(ResumeError, "run.id"):
                load_for_resume(path, copy.deepcopy(_saved_args()))
            payload["run_id"] = "tokenizer-original"
            torch.save(payload, path)
            document["checkpoint"].update(bytes=path.stat().st_size, sha256=sha256_file(path))
            manifest_path_for(path).write_text(json.dumps(document))
            decision = load_for_resume(path, copy.deepcopy(_saved_args()))
            self.assertEqual(decision.run_id, "tokenizer-original")
            self.assertEqual(decision.start_step, 2000)
            payload["step"] = 2001
            torch.save(payload, path)
            document["checkpoint"].update(bytes=path.stat().st_size, sha256=sha256_file(path))
            manifest_path_for(path).write_text(json.dumps(document))
            self.assertIsNone(verify_resume_checkpoint(path))
            with self.assertRaisesRegex(ResumeError, "step"):
                load_for_resume(path, copy.deepcopy(_saved_args()))


if __name__ == "__main__":
    unittest.main()
