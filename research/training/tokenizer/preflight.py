"""Cheap input checks that run before distributed/GPU initialization.

This module deliberately has no torch dependency so CI can exercise bad-launch
paths without allocating a model, downloading weights, or starting training.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path
from typing import Protocol


class TrainingInputs(Protocol):
    smoke: bool
    train_data_root: str
    val_data_root: str
    resume_from: str
    max_steps: int
    batch_size_per_gpu: int
    image_size: int
    num_workers: int
    log_every: int
    eval_every: int
    checkpoint_every: int
    lpips_enabled: bool


def validate_training_inputs(cfg: TrainingInputs) -> None:
    """Reject invalid or silently degraded runs before any GPU work begins."""
    for name in (
        "max_steps", "batch_size_per_gpu", "image_size", "log_every",
        "eval_every", "checkpoint_every",
    ):
        value = getattr(cfg, name)
        if type(value) is not int or value <= 0:
            raise ValueError(f"{name} must be a positive integer")
    if type(cfg.num_workers) is not int or cfg.num_workers < 0:
        raise ValueError("num_workers must be a nonnegative integer")
    if not cfg.smoke:
        if not cfg.train_data_root.strip():
            raise ValueError(
                "train_data_root is required for real training; "
                "use --smoke explicitly for synthetic data"
            )
        if not Path(cfg.train_data_root).is_dir():
            raise ValueError(f"Training data directory does not exist: {cfg.train_data_root}")
    if cfg.val_data_root and not Path(cfg.val_data_root).is_dir():
        raise ValueError(f"Validation data directory does not exist: {cfg.val_data_root}")
    if cfg.resume_from and not Path(cfg.resume_from).is_file():
        raise ValueError(f"Resume checkpoint does not exist: {cfg.resume_from}")
    if not cfg.smoke and cfg.lpips_enabled and importlib.util.find_spec("lpips") is None:
        raise ValueError(
            "LPIPS is enabled but not installed; install lpips or explicitly "
            "choose --no-lpips for an L2-only run"
        )


def validate_training_batch_count(dataset_size: int, batch_size: int, world_size: int) -> None:
    """DistributedSampler pads to ceil(N/world); DataLoader drops short batches."""
    if world_size < 1:
        raise ValueError("world_size must be positive")
    samples_per_rank = (dataset_size + world_size - 1) // world_size
    if samples_per_rank < batch_size:
        raise ValueError(
            f"No complete training batch: {dataset_size} images across {world_size} "
            f"ranks gives {samples_per_rank} samples/rank, below batch_size_per_gpu="
            f"{batch_size}; reduce the batch size or supply more images"
        )
