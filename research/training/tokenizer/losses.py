"""Tokenizer training losses.

Phase 1.1 loss stack per research-program note §1.1:
  - L2 reconstruction (always on)
  - LPIPS perceptual (always on; AlexNet backbone for cheap-ish CPU/GPU)
  - PatchGAN adversarial (turned on after warmup_iters; off for smoke)
  - Commitment loss (β=0.25; emitted by the VectorQuantizer itself)

The total loss is:
    L = recon_l2_weight * L2 + lpips_weight * LPIPS + (gan_weight * GAN if gan_on)
        + commit_beta * commit_loss

`commit_loss` is returned by `VQModel.encode()` as the second value; this
module receives it and weighs/passes through. The model already applies
`commit_loss_beta` internally — we just sum it into the total.

For the FIRST tokenizer training run (smoke + first ablation), keep
gan_on=False to get a stable training trajectory before adding the GAN.
"""

from __future__ import annotations

from dataclasses import dataclass

import torch
import torch.nn as nn
import torch.nn.functional as F


@dataclass
class LossWeights:
    """Per-term weights for the total loss. Tune via config."""

    recon_l2: float = 1.0
    lpips: float = 1.0
    gan: float = 0.1
    commit_passthrough: float = 1.0  # the VQ commitment is already β-weighted inside VQModel


class TokenizerLoss(nn.Module):
    """Aggregated tokenizer training loss.

    Wraps optional LPIPS / discriminator submodules so they can be added
    later without changing the train loop's call shape.

    Usage:
        loss_fn = TokenizerLoss(
            weights=LossWeights(),
            lpips_module=lpips.LPIPS(net="alex"),  # or None for smoke
            discriminator=None,                     # add after warmup_iters
        ).to(device)
        total, components = loss_fn(image, recon, commit_loss)
    """

    def __init__(
        self,
        weights: LossWeights | None = None,
        lpips_module: nn.Module | None = None,
        discriminator: nn.Module | None = None,
        gan_on_step: int = 20_000,  # step at which GAN turns on
    ):
        super().__init__()
        self.weights = weights or LossWeights()
        self.lpips_module = lpips_module
        self.discriminator = discriminator
        self.gan_on_step = gan_on_step
        if self.lpips_module is not None:
            for p in self.lpips_module.parameters():
                p.requires_grad = False  # frozen perceptual loss

    @torch.compiler.disable  # type: ignore[attr-defined]  # compile-safety for diverse submodules
    def forward(
        self,
        image: torch.Tensor,  # NCHW in [-1, 1]
        recon: torch.Tensor,  # NCHW in [-1, 1]
        commit_loss: torch.Tensor,  # scalar
        global_step: int = 0,
    ) -> tuple[torch.Tensor, dict[str, float]]:
        components: dict[str, float] = {}

        l2 = F.mse_loss(recon, image)
        components["l2"] = float(l2.detach().cpu())
        total = self.weights.recon_l2 * l2

        if self.lpips_module is not None:
            # LPIPS expects inputs in [-1, 1] which is what we pass
            lp = self.lpips_module(recon, image).mean()
            components["lpips"] = float(lp.detach().cpu())
            total = total + self.weights.lpips * lp

        # Pass-through commit (already β-weighted inside VQModel.encode)
        components["commit"] = float(commit_loss.detach().cpu())
        total = total + self.weights.commit_passthrough * commit_loss

        if self.discriminator is not None and global_step >= self.gan_on_step:
            # Non-saturating GAN generator loss (Goodfellow et al.)
            fake_logits = self.discriminator(recon)
            g = F.softplus(-fake_logits).mean()
            components["gan_g"] = float(g.detach().cpu())
            total = total + self.weights.gan * g

        components["total"] = float(total.detach().cpu())
        return total, components
