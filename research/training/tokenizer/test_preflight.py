"""Pre-launch failures are tested without torch, real data, or training."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from research.training.tokenizer.preflight import (
    validate_training_batch_count,
    validate_training_inputs,
)


def inputs(**overrides):
    values = dict(
        smoke=False, train_data_root="", val_data_root="", resume_from="",
        max_steps=10, batch_size_per_gpu=2, image_size=64, num_workers=0,
        log_every=1, eval_every=10, checkpoint_every=10, lpips_enabled=False,
    )
    return SimpleNamespace(**(values | overrides))


class TrainingPreflightTests(unittest.TestCase):
    def test_real_training_requires_explicit_data(self):
        for root in ("", " "):
            with self.subTest(root=root), self.assertRaisesRegex(ValueError, "--smoke"):
                validate_training_inputs(inputs(train_data_root=root))

    def test_smoke_is_explicit_and_needs_no_data_or_lpips(self):
        validate_training_inputs(inputs(smoke=True, lpips_enabled=True))

    def test_real_data_must_be_a_directory(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "not-a-directory"
            file.write_text("fixture")
            for root in (str(file), str(Path(tmp) / "missing")):
                with self.subTest(root=root), self.assertRaisesRegex(ValueError, "Training data"):
                    validate_training_inputs(inputs(train_data_root=root))
            validate_training_inputs(inputs(train_data_root=tmp))

    def test_optional_input_paths_are_checked(self):
        with tempfile.TemporaryDirectory() as tmp:
            for field in ("val_data_root", "resume_from"):
                with self.subTest(field=field), self.assertRaises(ValueError):
                    validate_training_inputs(inputs(train_data_root=tmp, **{field: str(Path(tmp) / "missing")}))
            checkpoint = Path(tmp) / "checkpoint.pt"
            checkpoint.write_bytes(b"fixture")
            with self.assertRaisesRegex(ValueError, "Resume checkpoint integrity"):
                validate_training_inputs(inputs(train_data_root=tmp, resume_from=str(checkpoint)))
            with patch("research.training.tokenizer.preflight.verify_resume_checkpoint", return_value=None):
                validate_training_inputs(inputs(train_data_root=tmp, val_data_root=tmp, resume_from=str(checkpoint)))

    def test_lpips_never_silently_changes_the_training_objective(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("research.training.tokenizer.preflight.importlib.util.find_spec", return_value=None):
                with self.assertRaisesRegex(ValueError, "--no-lpips"):
                    validate_training_inputs(inputs(train_data_root=tmp, lpips_enabled=True))
                validate_training_inputs(inputs(train_data_root=tmp, lpips_enabled=False))
            with patch("research.training.tokenizer.preflight.importlib.util.find_spec", return_value=object()):
                validate_training_inputs(inputs(train_data_root=tmp, lpips_enabled=True))

    def test_small_datasets_fail_instead_of_creating_an_empty_loader(self):
        for size, batch, world in ((0, 1, 1), (1, 2, 1), (8, 8, 2)):
            with self.subTest(size=size, batch=batch, world=world):
                with self.assertRaisesRegex(ValueError, "No complete training batch"):
                    validate_training_batch_count(size, batch, world)
        validate_training_batch_count(8, 4, 2)
        # DistributedSampler pads an uneven dataset to ceil(N/world).
        validate_training_batch_count(7, 4, 2)

    def test_invalid_loop_parameters_fail_before_launch(self):
        for field in ("max_steps", "batch_size_per_gpu", "image_size", "log_every", "eval_every", "checkpoint_every"):
            for value in (0, -1, True, 1.5):
                with self.subTest(field=field, value=value), self.assertRaisesRegex(ValueError, field):
                    validate_training_inputs(inputs(smoke=True, **{field: value}))
        with self.assertRaisesRegex(ValueError, "num_workers"):
            validate_training_inputs(inputs(smoke=True, num_workers=-1))


if __name__ == "__main__":
    unittest.main()
