"""Field-contract tests for integrity_check.py (torch-free).

Locks the external-reader field names against the canonical training manifest:
`stepCount` (not `step`) and `checkpoint.sha256` (not a bare legacy
`weights_sha256`).
"""

from __future__ import annotations

import unittest

from research.training.integrity_check import find_digest, manifest_step


class IntegrityCheckFieldContractTests(unittest.TestCase):
    def test_manifest_step_reads_canonical_step_count(self) -> None:
        self.assertEqual(manifest_step({"stepCount": 2000}), ("stepCount", 2000))
        self.assertEqual(manifest_step({"stepCount": 0}), ("stepCount", 0))

    def test_manifest_step_flags_legacy_step(self) -> None:
        self.assertEqual(manifest_step({"step": 2000}), ("step", 2000))

    def test_manifest_step_prefers_canonical_over_legacy(self) -> None:
        self.assertEqual(manifest_step({"stepCount": 5, "step": 9}), ("stepCount", 5))

    def test_manifest_step_missing_is_none(self) -> None:
        self.assertEqual(manifest_step({}), (None, None))

    def test_find_digest_prefers_canonical_checkpoint_field(self) -> None:
        manifest = {"checkpoint": {"sha256": "a" * 64}, "weights_sha256": "b" * 64}
        self.assertEqual(find_digest(manifest), ("checkpoint.sha256", "a" * 64))

    def test_find_digest_falls_back_to_legacy_top_level_key(self) -> None:
        manifest = {"weights_sha256": "c" * 64}
        self.assertEqual(find_digest(manifest), ("weights_sha256", "c" * 64))

    def test_find_digest_absent_returns_none(self) -> None:
        self.assertIsNone(find_digest({"runId": "r"}))


if __name__ == "__main__":
    unittest.main()