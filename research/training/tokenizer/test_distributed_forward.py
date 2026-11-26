"""CPU-only regression: exercise the real loop and DDP reducer on tiny tensors.

No pretrained models, images, downloads, CUDA, or research training are used.
The rank-local objectives intentionally disagree; synchronized
parameters must still agree after two steps. Merely completing two processes is not enough.
"""

from __future__ import annotations

import tempfile
import unittest
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import torch
import torch.distributed as dist
import torch.multiprocessing as mp
from torch import nn


class TinyTokenizer(nn.Module):
    def __init__(self, rank: int):
        super().__init__()
        self.scale = nn.Parameter(torch.tensor(0.5))
        self.target = -10.0 if rank == 0 else 10.0
        self.forward_calls = 0

    def encode(self, image):
        vq_loss = (self.scale - self.target).square()
        return image * self.scale, (vq_loss, None, None, 1.0), None

    def decode(self, quant):
        return quant

    def forward(self, image):
        self.forward_calls += 1
        quant, components, _ = self.encode(image)
        return self.decode(quant), components


class TinyDiscriminator(nn.Module):
    def __init__(self):
        super().__init__()
        self.scale = nn.Parameter(torch.tensor(0.2))

    def forward(self, image):
        return image.mean(dim=(1, 2, 3)) * self.scale


def _worker(rank: int, rendezvous: str, out_root: str, gan_enabled: bool):
    from research.training.tokenizer import train as train_mod
    from research.training.tokenizer.config import smoke_config

    torch.set_num_threads(1)
    dist.init_process_group(
        "gloo", init_method=rendezvous, rank=rank, world_size=2,
        timeout=timedelta(seconds=90),
    )
    model = TinyTokenizer(rank)
    discriminator = TinyDiscriminator()
    cfg = smoke_config()
    cfg.image_size = cfg.tokenizer.image_size = 16
    cfg.batch_size_per_gpu = 1
    cfg.max_steps = 2
    cfg.optim.warmup_steps = 1
    cfg.optim.grad_clip_norm = 0.0
    cfg.out_root = out_root
    cfg.gan_enabled = gan_enabled
    cfg.gan_on_step = 0
    try:
        with (
            patch.object(train_mod, "init_distributed", return_value=(rank, 2, rank, torch.device("cpu"))),
            patch.object(train_mod, "build_tokenizer", return_value=model),
            patch.object(train_mod, "PatchGANDiscriminator", return_value=discriminator),
            patch.object(train_mod, "_maybe_run_eval", return_value=([], None)),
            patch.object(train_mod, "cleanup_distributed"),
            patch.object(torch.cuda, "is_available", return_value=False),
        ):
            summary = train_mod.train(cfg)
        gathered = [torch.empty_like(model.scale) for _ in range(2)]
        dist.all_gather(gathered, model.scale.detach())
        assert torch.equal(gathered[0], gathered[1]), (
            f"DDP parameters diverged: {[float(value) for value in gathered]}"
        )
        if gan_enabled:
            dist.all_gather(gathered, discriminator.scale.detach())
            assert torch.equal(gathered[0], gathered[1]), "discriminator parameters diverged"
        assert model.forward_calls == 2, "training bypassed the DDP forward boundary"
        assert summary["final_step"] == 2
        if rank == 0:
            assert summary["acceptance"]["manifest_written"]
            assert summary["acceptance"]["final_checkpoint_written"]
    finally:
        dist.destroy_process_group()


@unittest.skipUnless(dist.is_available() and dist.is_gloo_available(), "requires CPU gloo")
class DistributedForwardTests(unittest.TestCase):
    def test_real_loop_keeps_rank_parameters_synchronized(self):
        for gan_enabled in (False, True):
            with self.subTest(gan_enabled=gan_enabled), tempfile.TemporaryDirectory() as tmp:
                mp.spawn(
                    _worker,
                    args=((Path(tmp) / "rendezvous").as_uri(), str(Path(tmp) / "runs"), gan_enabled),
                    nprocs=2,
                    join=True,
                )


if __name__ == "__main__":
    unittest.main()
