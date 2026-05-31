"""Multi-process (DDP) smoke test for GAN-enabled tokenizer training, on CPU.

Single-process `test_gan_smoke.py` exercises the loss/optimizer wiring but NOT
the distributed path. This launches 2 ranks via torchrun so the gloo/CPU DDP
fallback, the dual-DDP wrap (generator + discriminator), and the two-optimizer
step are actually executed together — the interaction flagged as "untested
locally" when the GAN code first landed (#572).

Run:  python -m torch.distributed.run --nproc-per-node 2 --master-port 29555 \
          -m research.training.tokenizer.test_gan_ddp_smoke
Exit 0 on all ranks = pass. Rank 0 asserts the checkpoint + manifest; non-zero
ranks just need to complete train() without raising.
"""

from __future__ import annotations

import os
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
from research.training.tokenizer.train import train, init_distributed, is_main  # noqa: E402


def _ddp_gan_config(out_root: str) -> TrainConfig:
    cfg = TrainConfig()
    cfg.tokenizer = TokenizerConfig(codebook_size=256, codebook_embed_dim=16, image_size=64)
    cfg.image_size = 64
    cfg.batch_size_per_gpu = 2
    cfg.max_steps = 4
    cfg.log_every = 1
    cfg.eval_every = 999_999
    cfg.checkpoint_every = 999_999
    cfg.num_workers = 0
    cfg.smoke = True
    cfg.lpips_enabled = False
    cfg.gan_enabled = True
    cfg.gan_on_step = 1
    cfg.disc_base_channels = 16
    cfg.disc_n_layers = 2
    cfg.optim = OptimConfig(lr=1e-4)
    cfg.optim.warmup_steps = 1
    cfg.out_root = out_root
    cfg.train_data_root = ""
    return cfg


def main() -> int:
    torch.manual_seed(0)
    # Peek at the world size init_distributed will see (without consuming it).
    expected_world = int(os.environ.get("WORLD_SIZE", "1"))

    # Each rank writes under the SAME shared out_root so the run_dir broadcast
    # (rank 0 invents run_id) resolves to one place all ranks can see.
    shared_out = os.environ.get("WITT_DDP_TEST_OUT")
    if not shared_out:
        shared_out = tempfile.mkdtemp(prefix="witt_ddp_")
        os.environ["WITT_DDP_TEST_OUT"] = shared_out

    cfg = _ddp_gan_config(shared_out)
    summary = train(cfg)

    # Only rank 0 owns the checkpoint/manifest assertions.
    rank = int(os.environ.get("RANK", "0"))
    if rank == 0:
        assert summary["final_step"] == 4, f"steps={summary['final_step']}"
        comps = summary.get("final_components", {})
        assert "d_loss" in comps, f"no d_loss; components={list(comps)}"
        final_ckpt = Path(summary["run_dir"]) / "ckpts" / "final.pt"
        assert final_ckpt.exists(), f"no checkpoint at {final_ckpt}"
        payload = torch.load(final_ckpt, map_location="cpu", weights_only=True)
        assert "discriminator" in payload, f"checkpoint keys={list(payload)}"
        print(f"[ddp-gan-smoke] world={expected_world} rank=0 steps={summary['final_step']} "
              f"d_loss={comps['d_loss']:.4f} gan_g={comps.get('gan_g', float('nan')):.4f}")
        print("[ddp-gan-smoke] PASS")
    else:
        print(f"[ddp-gan-smoke] world={expected_world} rank={rank} completed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
