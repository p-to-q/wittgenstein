"""Training run configuration.

Pulls hyperparameters into a single dataclass that's snapshotted into the
training manifest (so every checkpoint records exactly what config produced
it). Override via CLI flags in train.py.

Defaults follow research-program note §1.1 with adjustments for an
8× A800-80GB node — see `batch_size` doc below.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .model import TokenizerConfig


@dataclass
class OptimConfig:
    lr: float = 1e-4
    weight_decay: float = 0.05
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip_norm: float = 1.0
    warmup_steps: int = 500  # ~5% of typical 10k-step short training; tune for full runs


@dataclass
class TrainConfig:
    """Top-level training configuration."""

    # Model / arch
    tokenizer: TokenizerConfig = field(default_factory=TokenizerConfig)

    # Optimizer
    optim: OptimConfig = field(default_factory=OptimConfig)

    # Data
    train_data_root: str = ""  # ImageNet train folder path; required at runtime
    val_data_root: str = ""    # ImageNet val folder path; optional but recommended
    image_size: int = 256
    num_workers: int = 8

    # Dataset license → checkpoint publishability. SAFE DEFAULT is
    # "research-only": a checkpoint trained on borrowed/uncommitted data must
    # NOT be published. Set to "permissive" ONLY when the corpus is verified
    # license-clean (e.g. an Apache/CC-BY snapshot). This flows verbatim into
    # the manifest's checkpoint.weightsLicense and gates downstream release.
    dataset_license: str = "research-only"  # {"research-only", "permissive"}

    # Batch size:
    #   - LlamaGen recipe: 128 per-GPU at 256² on A100-80G is comfortable.
    #   - 8× A800-80GB single node → effective 1024 with DDP, no grad
    #     accumulation. Matches the research-program §1.1 target.
    batch_size_per_gpu: int = 128

    # Schedule
    max_steps: int = 200_000     # ~ a few epochs over ImageNet at bs=1024
    log_every: int = 50
    eval_every: int = 5_000      # rFID on val 50k (slow — see eval.py)
    checkpoint_every: int = 5_000
    keep_last_n_checkpoints: int = 3  # rotate to control disk

    # GAN
    gan_on_step: int = 20_000    # warmup recon-only first, then add GAN
    # A PatchGAN discriminator IS wired (discriminator.py + train.py), but it is
    # OPT-IN: default False keeps runs reconstruction-only (cheaper, and avoids
    # recording gan_enabled=True for a run that did no adversarial training).
    # Enable adversarial training with gan_enabled=True or the --gan CLI flag.
    gan_enabled: bool = False
    gan_weight: float = 0.1      # generator adversarial-term weight
    disc_base_channels: int = 64  # PatchGAN ndf
    disc_n_layers: int = 3        # PatchGAN downsampling blocks
    disc_lr: float = 1e-4         # discriminator optimizer lr

    # Losses
    lpips_enabled: bool = True
    lpips_net: str = "alex"

    # Logging / output
    out_root: str = ""           # required; ends up as research/training/_shared/runs/<run-id>/
    resume_from: str = ""        # optional checkpoint .pt path; loads model weights + step
    aim_repo: str = ""           # optional aim tracker repo; "" = disabled
    seed: int = 0

    # Determinism
    cudnn_deterministic: bool = True
    cudnn_benchmark: bool = False

    # Smoke-test mode: small synthetic dataset, few steps, no eval/no checkpoints to disk
    smoke: bool = False


def to_dict(cfg: TrainConfig) -> dict[str, Any]:
    """Snapshot dict suitable for training-manifest serialization."""
    return asdict(cfg)


def smoke_config() -> TrainConfig:
    """Tiny config that runs end-to-end in <60s on a single A800.

    Used by smoke_test.py to validate the loop, manifest emit, and DDP
    plumbing before launching a real training run.
    """
    cfg = TrainConfig()
    cfg.tokenizer = TokenizerConfig(codebook_size=512, codebook_embed_dim=16)
    cfg.optim.warmup_steps = 5
    cfg.batch_size_per_gpu = 2
    cfg.max_steps = 5
    cfg.log_every = 1
    cfg.eval_every = 999_999       # disabled
    cfg.checkpoint_every = 999_999  # disabled
    cfg.gan_enabled = False
    cfg.lpips_enabled = False
    cfg.num_workers = 0
    cfg.smoke = True
    return cfg
