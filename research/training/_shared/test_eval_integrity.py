"""CPU failure-injection tests; no pretrained weights or research training."""
from __future__ import annotations

import importlib.util
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

_TORCH = importlib.util.find_spec("torch") is not None
_PIL = importlib.util.find_spec("PIL") is not None
if _TORCH and _PIL:
    import torch
    from PIL import Image
    from torch.utils.data import DataLoader, TensorDataset
    from .dataset import ImageFolderDataset
    from .eval import TokenizerEvalConfig, evaluate_tokenizer_reconstruction
    from research.training.tokenizer import train as train_mod
    from research.training.tokenizer.train import _maybe_run_eval

    class IdentityModel(torch.nn.Module):
        def encode(self, images):
            return images, None, (None, None, torch.zeros(images.shape[0], dtype=torch.long))

        def decode(self, quant):
            return quant

    def loader(n=2):
        return DataLoader(TensorDataset(torch.zeros(n, 3, 16, 16), torch.zeros(n)), batch_size=2)

    def config(**kwargs):
        return TokenizerEvalConfig(**(dict(compute_rfid=False, compute_lpips=False,
                                          compute_psnr_ssim=False, compute_codebook_hist=False) | kwargs))


@unittest.skipUnless(_TORCH and _PIL, "torch and Pillow required")
class EvaluationIntegrityTests(unittest.TestCase):
    def test_validation_rejects_corrupt_samples_instead_of_replacing_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            Image.new("RGB", (16, 16), "red").save(Path(tmp) / "a.png")
            (Path(tmp) / "b.png").write_bytes(b"invalid")
            ds = ImageFolderDataset(tmp, image_size=16, corrupt_policy="raise")
            self.assertEqual(tuple(ds[0][0].shape), (3, 16, 16))
            with self.assertRaisesRegex(ValueError, "b.png"):
                ds[1]
            self.assertEqual(ds.corrupt_count, 1)

    def test_validation_entrypoint_uses_strict_decoding(self):
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp) / "broken.png").write_bytes(b"invalid")
            cfg = types.SimpleNamespace(val_data_root=tmp, smoke=False, seed=0, image_size=16, batch_size_per_gpu=2)
            def consume(_model, eval_loader, *_args):
                list(eval_loader)
                return {"perplexity": 1.0}
            with patch.object(train_mod, "evaluate_tokenizer_reconstruction", side_effect=consume):
                snapshots, failure = _maybe_run_eval(cfg, IdentityModel(), torch.device("cpu"), 3, 1)
            self.assertFalse(snapshots)
            self.assertIn("broken.png", failure["reason"])

    def test_invalid_reconstructions_never_reach_pixel_scoring(self):
        for output, reason in ((torch.full((2, 3, 16, 16), float("nan")), "Nonfinite"),
                               (torch.zeros(2, 3, 1, 1), "shape")):
            with patch.object(IdentityModel, "decode", return_value=output):
                with self.assertRaisesRegex(ValueError, reason):
                    evaluate_tokenizer_reconstruction(IdentityModel(), loader(), torch.device("cpu"), config())

    def test_training_replacement_does_not_recurse_through_a_corrupt_run(self):
        with tempfile.TemporaryDirectory() as tmp:
            # One bad path repeated exceeds Python's recursion limit in the old loader.
            path = Path(tmp) / "broken.png"
            path.write_bytes(b"invalid")
            ds = ImageFolderDataset(tmp, image_size=16)
            ds.files = [path] * 1100
            image, _ = ds[1099]
            self.assertTrue(torch.equal(image, torch.zeros_like(image)))
            self.assertEqual(ds.corrupt_count, 1100)

    def test_eval_identity_tracks_bytes_and_synthetic_seed_not_mount_path(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a", Path(tmp) / "b"
            a.mkdir(); b.mkdir()
            (a / "sample.png").write_bytes(b"same")
            (b / "sample.png").write_bytes(b"same")
            first = train_mod._eval_dataset_sha("fixture", "val", [a / "sample.png"])
            self.assertEqual(first, train_mod._eval_dataset_sha("fixture", "val", [b / "sample.png"]))
            (a / "sample.png").write_bytes(b"changed")
            self.assertNotEqual(first, train_mod._eval_dataset_sha("fixture", "val", [a / "sample.png"]))
        self.assertNotEqual(
            train_mod._eval_dataset_sha("synthetic", "synthetic-val", synthetic_seed=64),
            train_mod._eval_dataset_sha("synthetic", "synthetic-val", synthetic_seed=65),
        )

    def test_dataset_mutation_during_eval_refuses_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "sample.png"
            Image.new("RGB", (16, 16), "red").save(path)
            cfg = types.SimpleNamespace(val_data_root=tmp, smoke=False, seed=0, image_size=16, batch_size_per_gpu=2)
            def mutate(*_args):
                Image.new("RGB", (16, 16), "blue").save(path)
                return {"perplexity": 1.5}
            with patch.object(train_mod, "evaluate_tokenizer_reconstruction", side_effect=mutate):
                snapshots, failure = _maybe_run_eval(cfg, IdentityModel(), torch.device("cpu"), 3, 1)
            self.assertEqual(snapshots, [])
            self.assertIn("changed during evaluation", failure["reason"])

    def test_rfid_temp_files_are_removed_on_model_failure(self):
        made = []
        factory = tempfile.TemporaryDirectory
        def make_temp(*args, **kwargs):
            temp = factory(*args, **kwargs)
            made.append(Path(temp.name))
            return temp
        with patch("tempfile.TemporaryDirectory", side_effect=make_temp):
            with patch.object(IdentityModel, "encode", side_effect=ValueError("broken model")):
                with self.assertRaisesRegex(ValueError, "broken model"):
                    evaluate_tokenizer_reconstruction(IdentityModel(), loader(), torch.device("cpu"), config(compute_rfid=True))
        self.assertTrue(made)
        self.assertTrue(all(not path.exists() for path in made))

    def test_missing_and_nonfinite_rfid_are_reported_as_uncomputed(self):
        fake = types.ModuleType("cleanfid")
        fake.fid = types.SimpleNamespace(compute_fid=lambda *a, **kw: float("nan"))
        for module in (None, fake):
            with patch.dict("sys.modules", {"cleanfid": module}):
                result = evaluate_tokenizer_reconstruction(IdentityModel(), loader(), torch.device("cpu"), config(compute_rfid=True))
            self.assertTrue(result["degraded"])
            self.assertFalse(result["computed_metrics"]["rfid"])
            self.assertNotIn("rfid", result)

    def test_empty_evaluation_is_degraded(self):
        result = evaluate_tokenizer_reconstruction(IdentityModel(), loader(0), torch.device("cpu"), config())
        self.assertTrue(result["degraded"])
        self.assertIn("no-images-evaluated", result["degradation_reasons"])

    def test_missing_codebook_is_explicit(self):
        result = evaluate_tokenizer_reconstruction(IdentityModel(), loader(), torch.device("cpu"), config(compute_codebook_hist=True))
        self.assertTrue(result["degraded"])
        self.assertFalse(result["computed_metrics"]["codebook_hist"])
        self.assertIn("codebook-hist-unavailable", result["degradation_reasons"])

    def test_failed_rfid_is_never_marked_computed(self):
        fake = types.ModuleType("cleanfid")
        fake.fid = types.SimpleNamespace(compute_fid=lambda *a, **kw: (_ for _ in ()).throw(ValueError("fixture metric failure")))
        with patch.dict("sys.modules", {"cleanfid": fake}):
            result = evaluate_tokenizer_reconstruction(IdentityModel(), loader(), torch.device("cpu"), config(compute_rfid=True))
        self.assertTrue(result["requested_metrics"]["rfid"])
        self.assertTrue(result["degraded"])
        self.assertFalse(result["computed_metrics"]["rfid"])

    def test_successful_rfid_is_marked_computed(self):
        fake = types.ModuleType("cleanfid")
        fake.fid = types.SimpleNamespace(compute_fid=lambda *a, **kw: 2.5)
        with patch.dict("sys.modules", {"cleanfid": fake}):
            result = evaluate_tokenizer_reconstruction(IdentityModel(), loader(), torch.device("cpu"), config(compute_rfid=True))
        self.assertEqual(result["rfid"], 2.5)
        self.assertTrue(result["computed_metrics"]["rfid"])
        self.assertFalse(result["degraded"])

    def test_model_mode_is_restored_even_when_eval_raises(self):
        cfg = types.SimpleNamespace(val_data_root="", smoke=True, seed=0, image_size=16, batch_size_per_gpu=2)
        for training in (True, False):
            model = IdentityModel().train(training)
            with patch.object(train_mod, "evaluate_tokenizer_reconstruction", side_effect=ValueError("fixture")):
                snapshots, failure = _maybe_run_eval(cfg, model, torch.device("cpu"), 3, 1)
            self.assertEqual(snapshots, [])
            self.assertIsNotNone(failure)
            self.assertEqual(model.training, training)

    def test_partial_metrics_propagate_degradation_to_acceptance(self):
        cfg = types.SimpleNamespace(val_data_root="", smoke=True, seed=0, image_size=16, batch_size_per_gpu=2)
        result = {"n_images_evaluated": 8, "perplexity": 1.5, "degraded": True,
                  "degradation_reasons": ["lpips-missing"]}
        with patch.object(train_mod, "evaluate_tokenizer_reconstruction", return_value=result):
            snapshots, failure = _maybe_run_eval(cfg, IdentityModel(), torch.device("cpu"), 3, 1)
        self.assertTrue(snapshots)
        self.assertIsNotNone(failure)
        self.assertIn("lpips-missing", failure["reason"])

    def test_synthetic_validation_has_disjoint_sample_identities(self):
        cfg = types.SimpleNamespace(val_data_root="", smoke=True, seed=0, image_size=16, batch_size_per_gpu=2)
        def inspect(_model, eval_loader, *_args):
            self.assertGreaterEqual(eval_loader.dataset.seed, cfg.seed + 64)
            return {"n_images_evaluated": 8}
        with patch.object(train_mod, "evaluate_tokenizer_reconstruction", side_effect=inspect):
            _, failure = _maybe_run_eval(cfg, IdentityModel(), torch.device("cpu"), 3, 1)
        self.assertIsNone(failure)


if __name__ == "__main__":
    unittest.main()
