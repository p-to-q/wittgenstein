"""Step-key contract tests for recon_check.py (torch-free).

The `.pt` payload written by `_write_checkpoint` uses the checkpoint-native
`step` key; the canonical *manifest* field is `stepCount`. `checkpoint_step`
must read the native key, accept `stepCount` as a forward-compatible alias, and
report "unknown" as -1 rather than guessing.
"""

from __future__ import annotations

import unittest

from research.training.recon_check import checkpoint_step


class ReconCheckStepContractTests(unittest.TestCase):
    def test_reads_checkpoint_native_step(self) -> None:
        self.assertEqual(checkpoint_step({"model": {}, "step": 2000}), 2000)

    def test_accepts_canonical_step_count_alias(self) -> None:
        self.assertEqual(checkpoint_step({"stepCount": 2000}), 2000)

    def test_prefers_native_step_over_alias(self) -> None:
        self.assertEqual(checkpoint_step({"step": 7, "stepCount": 9}), 7)

    def test_unknown_step_is_minus_one(self) -> None:
        self.assertEqual(checkpoint_step({}), -1)


if __name__ == "__main__":
    unittest.main()