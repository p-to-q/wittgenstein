"""End-to-end smoke test for GAN-enabled tokenizer training (CPU, synthetic).

Proves the PatchGAN discriminator is actually wired into the train loop:
  - a GAN-on run completes without error on synthetic data,
  - the discriminator trains (d_loss appears once past gan_on_step),
  - the checkpoint carries BOTH the generator ("model") and "discriminator"
    state, while keeping the "model"/"step" keys that recon_check.py and
    integrity_check.py depend on.

Run:  python -m research.training.tokenizer.test_gan_smoke
Exit 0 = pass. Single-process / CPU; the DDP path is exercised on the cluster.
"""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

import torch

_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from research.training.tokenizer.config import OptimConfig, TrainConfig  # noqa: E402
from research.training.tokenizer.model import TokenizerConfig  # noqa: E402
from research.training.tokenizer.train import train  # noqa: E402


def _gan_smoke_config(out_root: str) -> TrainConfig:
    cfg = TrainConfig()
    cfg.tokenizer = TokenizerConfig(codebook_size=256, codebook_embed_dim=16, image_size=64)
    cfg.image_size = 64
    cfg.batch_size_per_gpu = 2
    cfg.max_steps = 4
    cfg.log_every = 1
    cfg.eval_every = 999_999
    cfg.checkpoint_every = 999_999  # only the final checkpoint is written
    cfg.num_workers = 0
    cfg.smoke = True              # synthetic data + use_batchnorm off in discriminator
    cfg.lpips_enabled = False     # avoid the optional lpips dependency
    cfg.gan_enabled = True        # <-- the thing under test
    cfg.gan_on_step = 1           # turn the GAN on almost immediately
    cfg.disc_base_channels = 16   # tiny for CPU speed
    cfg.disc_n_layers = 2
    cfg.optim = OptimConfig(lr=1e-4)
    cfg.optim.warmup_steps = 1
    cfg.out_root = out_root
    cfg.train_data_root = ""      # forces SyntheticImageDataset
    return cfg


def main() -> int:
    torch.manual_seed(0)
    with tempfile.TemporaryDirectory() as tmp:
        cfg = _gan_smoke_config(tmp)
        summary = train(cfg)

        assert summary["final_step"] == 4, f"expected 4 steps, got {summary['final_step']}"
        comps = summary.get("final_components", {})
        assert "d_loss" in comps, f"discriminator never trained; components={list(comps)}"
        assert "gan_g" in comps, f"generator GAN term never applied; components={list(comps)}"

        final_ckpt = Path(summary["run_dir"]) / "ckpts" / "final.pt"
        assert final_ckpt.exists(), f"no final checkpoint at {final_ckpt}"
        payload = torch.load(final_ckpt, map_location="cpu", weights_only=True)
        for key in ("model", "step", "discriminator"):
            assert key in payload, f"checkpoint missing '{key}'; keys={list(payload)}"

        print(f"[gan-smoke] steps={summary['final_step']} "
              f"d_loss={comps['d_loss']:.4f} gan_g={comps['gan_g']:.4f} "
              f"l2={comps.get('l2', float('nan')):.4f}")
        print(f"[gan-smoke] checkpoint keys={sorted(payload)} "
              f"disc_tensors={len(payload['discriminator'])}")
        print("[gan-smoke] PASS")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
