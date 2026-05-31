"""PatchGAN discriminator for tokenizer adversarial training.

The reconstruction-only loss stack (L2 + LPIPS + commit) converges to a soft,
blurry tokenizer — perceptual loss alone does not penalize the high-frequency
texture a VQGAN needs. The adversarial term is the standard fix (Esser et al.
"Taming Transformers", CVPR 2021): a PatchGAN discriminator scores local
patches as real/fake, pushing the decoder toward sharp, plausible texture.

`losses.TokenizerLoss` already carries the GENERATOR side of the GAN term
(`softplus(-D(recon))`), gated on a discriminator being present. This module
supplies (a) the discriminator network and (b) the DISCRIMINATOR loss + a
weight-warmup helper, so the train loop can run the second optimizer that
actually trains D. Without this module the GAN term is inert.

Convention: logits (no final sigmoid). The matching non-saturating losses:
  - generator (in losses.py):  softplus(-D(fake)).mean()
  - discriminator (here):      softplus(-D(real)).mean() + softplus(D(fake)).mean()

This is the BCE-with-logits GAN pair; it matches the generator term already in
`losses.py` so G and D optimize a consistent objective.
"""

from __future__ import annotations

import torch
import torch.nn as nn


def _init_weights(m: nn.Module) -> None:
    """DCGAN-style init (Radford et al.): N(0, 0.02) for conv, 1.0 for norm."""
    classname = m.__class__.__name__
    if "Conv" in classname and hasattr(m, "weight") and m.weight is not None:
        nn.init.normal_(m.weight.data, 0.0, 0.02)
    elif "BatchNorm" in classname and hasattr(m, "weight") and m.weight is not None:
        nn.init.normal_(m.weight.data, 1.0, 0.02)
        nn.init.constant_(m.bias.data, 0.0)


class PatchGANDiscriminator(nn.Module):
    """N-layer PatchGAN (pix2pix / VQGAN convention).

    Maps an image [N, in_channels, H, W] in [-1, 1] to a logit map
    [N, 1, H', W'] where each cell scores a receptive-field patch. No final
    activation — callers consume raw logits.

    Args:
        in_channels: image channels (3 for RGB).
        base_channels: channels after the first conv (ndf; doubles per layer).
        n_layers: number of stride-2 downsampling conv blocks.
        use_batchnorm: BatchNorm between blocks (off → InstanceNorm-free plain,
            useful for tiny CPU smoke batches where BN stats are unstable).
    """

    def __init__(
        self,
        in_channels: int = 3,
        base_channels: int = 64,
        n_layers: int = 3,
        use_batchnorm: bool = True,
    ):
        super().__init__()
        kw = 4
        pad = 1
        norm = nn.BatchNorm2d if use_batchnorm else nn.Identity

        layers: list[nn.Module] = [
            nn.Conv2d(in_channels, base_channels, kernel_size=kw, stride=2, padding=pad),
            nn.LeakyReLU(0.2, inplace=True),
        ]

        ch_mult = 1
        ch_mult_prev = 1
        for n in range(1, n_layers):
            ch_mult_prev = ch_mult
            ch_mult = min(2**n, 8)
            layers += [
                nn.Conv2d(
                    base_channels * ch_mult_prev,
                    base_channels * ch_mult,
                    kernel_size=kw,
                    stride=2,
                    padding=pad,
                    bias=not use_batchnorm,
                ),
                norm(base_channels * ch_mult),
                nn.LeakyReLU(0.2, inplace=True),
            ]

        # One more stride-1 block widens the receptive field without downsampling.
        ch_mult_prev = ch_mult
        ch_mult = min(2**n_layers, 8)
        layers += [
            nn.Conv2d(
                base_channels * ch_mult_prev,
                base_channels * ch_mult,
                kernel_size=kw,
                stride=1,
                padding=pad,
                bias=not use_batchnorm,
            ),
            norm(base_channels * ch_mult),
            nn.LeakyReLU(0.2, inplace=True),
        ]

        # Final 1-channel logit map.
        layers += [nn.Conv2d(base_channels * ch_mult, 1, kernel_size=kw, stride=1, padding=pad)]

        self.main = nn.Sequential(*layers)
        self.apply(_init_weights)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.main(x)


def discriminator_loss(real_logits: torch.Tensor, fake_logits: torch.Tensor) -> torch.Tensor:
    """Non-saturating BCE-with-logits discriminator loss.

    D wants real→+∞, fake→−∞:
        softplus(-real) + softplus(fake)
    Pairs with the generator term softplus(-fake) used in losses.TokenizerLoss.
    """
    real_term = nn.functional.softplus(-real_logits).mean()
    fake_term = nn.functional.softplus(fake_logits).mean()
    return real_term + fake_term


def adopt_weight(weight: float, step: int, threshold: int) -> float:
    """GAN weight warmup: 0 until `threshold`, then `weight`.

    Mirrors the `gan_on_step` gate in losses.py so the generator and the
    discriminator turn on at the same step (D learns nothing useful before the
    reconstruction has stabilized, and an early GAN term destabilizes G)."""
    return 0.0 if step < threshold else weight
