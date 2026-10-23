"""Unit tests for the gradient-norm receipt helper in the tokenizer train loop.

The full loop is exercised end-to-end by `smoke_test.py` (which asserts
`grad_norm_g` reaches the components dict); here we pin the pure helper so a
regression in the "read the norm without clipping" contract fails fast, with no
GPU and no training step.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

import torch
import torch.nn as nn
import torch.nn.utils as U

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from research.training.tokenizer.train import _total_grad_norm  # noqa: E402
from research.training._shared.eval import codebook_perplexity  # noqa: E402


class TotalGradNormTests(unittest.TestCase):
    def test_reports_l2_norm_without_clipping(self) -> None:
        layer = nn.Linear(4, 3)
        (layer(torch.randn(2, 4)) ** 2).sum().backward()
        before = [p.grad.clone() for p in layer.parameters()]

        norm = _total_grad_norm(layer.parameters())

        self.assertGreater(norm, 0.0)
        reference = float(U.get_total_norm([p.grad for p in layer.parameters()]))
        self.assertAlmostEqual(norm, reference, places=6)
        # Pure-additive: reading the norm must not modify the gradients.
        for param, grad in zip(layer.parameters(), before):
            self.assertTrue(torch.equal(param.grad, grad))

    def test_zero_when_no_gradients_present(self) -> None:
        layer = nn.Linear(2, 2)
        self.assertEqual(_total_grad_norm(layer.parameters()), 0.0)


class CodebookPerplexityTests(unittest.TestCase):
    def test_uniform_over_four_codes_is_four(self) -> None:
        self.assertAlmostEqual(codebook_perplexity([1, 1, 1, 1]), 4.0, places=6)

    def test_collapse_to_one_code_is_one(self) -> None:
        self.assertAlmostEqual(codebook_perplexity([0, 7, 0]), 1.0, places=6)

    def test_empty_histogram_is_zero(self) -> None:
        self.assertEqual(codebook_perplexity([0, 0, 0]), 0.0)

    def test_half_the_codes_unused_shifts_perplexity(self) -> None:
        # More mass on fewer used codes -> lower perplexity than uniform-over-4.
        self.assertLess(codebook_perplexity([3, 1, 0, 0]), 4.0)


if __name__ == "__main__":
    unittest.main()