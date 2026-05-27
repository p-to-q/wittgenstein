"""Wittgenstein-native VQGAN-class tokenizer — factory + config.

This module is the **factory boundary** for the Phase 1.1 tokenizer.
The underlying VQGAN architecture is vendored MIT-licensed code from
LlamaGen (see `_shared/_third_party/`); what makes it "Wittgenstein-
native" is the configuration (D=32 instead of LlamaGen's D=8), the
training data (ImageNet + CC12M + COCO, ours), and the resulting
weights (under our Apache-2.0 release).

Config defaults follow `docs/research/2026-05-13-wittgenstein-research-program.md` §1.1:

  - codebook K = 16384
  - codebook embed dim D = 32 (richer per-site latents for a learned adapter
    — LlamaGen's D=8 was intentionally low because their AR head carried the
    semantic load; our adapter is BERT-shaped and benefits from richer dims)
  - downsample factor p = 16 (256² input → 16×16 = 256 tokens)
  - z_channels = 256, encoder/decoder ch_mult = [1, 1, 2, 2, 4]

Use:
    from research.training.tokenizer.model import build_tokenizer, TokenizerConfig
    cfg = TokenizerConfig()  # or override
    model = build_tokenizer(cfg)

The returned model conforms to LlamaGen's `VQModel` API:
    quant, emb_loss, info = model.encode(image_nchw_in_[-1,1])
    decoded = model.decode_code(token_indices, latent_shape)
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field
from pathlib import Path

# Resolve the vendored LlamaGen module. _shared/ is sibling of tokenizer/.
_HERE = Path(__file__).resolve().parent
_SHARED = (_HERE / ".." / "_shared").resolve()
if str(_SHARED) not in sys.path:
    sys.path.insert(0, str(_SHARED))

from _third_party.llamagen_vq_model import (  # noqa: E402
    VQModel,
    ModelArgs,
)


@dataclass
class TokenizerConfig:
    """Hyperparameters for the Wittgenstein-native VQGAN tokenizer.

    Defaults match research-program note §1.1; overridable per-experiment.
    """

    codebook_size: int = 16384
    codebook_embed_dim: int = 32  # Wittgenstein-native default (vs LlamaGen D=8)
    codebook_l2_norm: bool = True
    codebook_show_usage: bool = True
    commit_loss_beta: float = 0.25  # standard VQGAN
    entropy_loss_ratio: float = 0.0  # off by default; enable for codebook usage pressure
    encoder_ch_mult: tuple[int, ...] = (1, 1, 2, 2, 4)
    decoder_ch_mult: tuple[int, ...] = (1, 1, 2, 2, 4)
    z_channels: int = 256
    dropout_p: float = 0.0
    image_size: int = 256  # affects token grid: 256/p=16 = 16x16 tokens
    # Provenance — pinned by training manifest, surfaces in checkpoint receipts
    architecture_lineage: str = "llamagen-vqgan-mit-2024@ce98ec41"


def build_tokenizer(cfg: TokenizerConfig | None = None) -> VQModel:
    """Construct a fresh-init VQGAN-class tokenizer per cfg.

    The model is on CPU after construction. Caller moves to GPU + wraps in
    DDP/FSDP as needed.

    Note: LlamaGen's `VQModel.__init__` accepts a `ModelArgs` dataclass with
    `List[int]` for ch_mult. We pass tuples here because they're immutable;
    convert at the boundary.
    """
    cfg = cfg or TokenizerConfig()
    args = ModelArgs(
        codebook_size=cfg.codebook_size,
        codebook_embed_dim=cfg.codebook_embed_dim,
        codebook_l2_norm=cfg.codebook_l2_norm,
        codebook_show_usage=cfg.codebook_show_usage,
        commit_loss_beta=cfg.commit_loss_beta,
        entropy_loss_ratio=cfg.entropy_loss_ratio,
        encoder_ch_mult=list(cfg.encoder_ch_mult),
        decoder_ch_mult=list(cfg.decoder_ch_mult),
        z_channels=cfg.z_channels,
        dropout_p=cfg.dropout_p,
    )
    return VQModel(args)


def param_count(model: VQModel) -> int:
    return sum(p.numel() for p in model.parameters())


def latent_grid(cfg: TokenizerConfig) -> tuple[int, int]:
    """Spatial token grid given config."""
    downsample = 2 ** (len(cfg.encoder_ch_mult) - 1)
    if cfg.image_size % downsample != 0:
        raise ValueError(
            f"image_size={cfg.image_size} not divisible by downsample factor {downsample}"
        )
    side = cfg.image_size // downsample
    return (side, side)
