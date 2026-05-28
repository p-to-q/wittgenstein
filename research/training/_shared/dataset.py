"""Image dataset loaders for tokenizer / adapter training.

Phase 1.1 (tokenizer training) uses three datasets:
  - ImageNet train (1.28M images) — primary reconstruction signal
  - CC12M filtered (~5-9M after dead-link rot) — diversity
  - COCO 2017 train (118K) — text-conditional pairing

This module provides a UNIFIED interface so train.py doesn't have to
know which dataset is which. All return (image_tensor [3, H, W] in [-1, 1],
caption_or_label) pairs.

Design notes:
  - Pure PyTorch Dataset interface (no Lightning / no HF Datasets dep here)
  - Iterable streaming for very large sets (CC12M); index-mappable for
    smaller ones (COCO, ImageNet val).
  - Center-crop + LlamaGen-canonical [-1, 1] normalization (matches the
    Gate D ONNX export's expected input convention).
  - Worker-safe (no shared file handles); torch DataLoader compatible.

For smoke testing without real data, use SyntheticImageDataset which
generates deterministic pseudo-random tensors. Used by tokenizer/smoke_test.py.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Iterator

import numpy as np
import torch
from PIL import Image
from torch.utils.data import Dataset, IterableDataset


def llamagen_canonical_preprocess(pil: Image.Image, image_size: int) -> torch.Tensor:
    """Mirror of LlamaGen `dataset/augmentation.py:center_crop_arr`.

    Box-resample down to >=2x target, bicubic to exact 2x, center-crop. This
    matches the Gate D ONNX decoder's expected input pipeline so trained-
    tokenizer outputs sit in the same statistical regime as the LlamaGen
    baseline (apples-to-apples for the Phase 1 eval matrix).
    """
    pil = pil.convert("RGB")
    while min(*pil.size) >= 2 * image_size:
        pil = pil.resize(tuple(x // 2 for x in pil.size), resample=Image.Resampling.BOX)
    scale = image_size / min(*pil.size)
    pil = pil.resize(tuple(round(x * scale) for x in pil.size), resample=Image.Resampling.BICUBIC)
    arr = np.array(pil)
    crop_y = (arr.shape[0] - image_size) // 2
    crop_x = (arr.shape[1] - image_size) // 2
    arr = arr[crop_y : crop_y + image_size, crop_x : crop_x + image_size]
    x = (arr.astype(np.float32) / 255.0) * 2.0 - 1.0  # [-1, 1]
    return torch.from_numpy(x).permute(2, 0, 1).contiguous()  # CHW


class ImageFolderDataset(Dataset):
    """Index-mappable dataset over a flat folder of image files.

    Designed for ImageNet-style layouts (a folder of classes, each
    containing JPEGs) AND for a flat smoke folder (no class structure).
    Class labels are derived from immediate parent directory name if present
    and `with_labels=True`; otherwise the second tuple value is None.

    Robust to corrupt files: any decoder error returns the previous sample
    (avoids killing a multi-day training run for one bad jpeg). Counts get
    surfaced through `corrupt_count` for the manifest receipt.
    """

    def __init__(
        self,
        root: Path | str,
        image_size: int = 256,
        with_labels: bool = False,
        extensions: tuple[str, ...] = (".jpg", ".jpeg", ".png", ".webp"),
    ):
        self.root = Path(root)
        self.image_size = image_size
        self.with_labels = with_labels
        if not self.root.exists():
            raise FileNotFoundError(f"Dataset root does not exist: {self.root}")
        self.files: list[Path] = sorted(
            p for p in self.root.rglob("*") if p.suffix.lower() in extensions
        )
        if not self.files:
            raise ValueError(f"No images found under {self.root} (extensions={extensions})")
        self.corrupt_count = 0
        if with_labels:
            classes = sorted({p.parent.name for p in self.files})
            self.class_to_idx = {c: i for i, c in enumerate(classes)}
        else:
            self.class_to_idx = {}

    def __len__(self) -> int:
        return len(self.files)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        path = self.files[idx]
        try:
            with Image.open(path) as pil:
                img = llamagen_canonical_preprocess(pil, self.image_size)
        except Exception:
            self.corrupt_count += 1
            # Recurse to previous index (deterministic fallback). If idx==0 falls back to a noise tensor.
            if idx > 0:
                return self.__getitem__(idx - 1)
            img = torch.zeros(3, self.image_size, self.image_size)
        # PyTorch default collate can't handle None in a tuple. Always return
        # an int label; -1 = "no label available" (used when with_labels=False
        # or for unknown parent dirs).
        label = self.class_to_idx.get(path.parent.name, -1) if self.with_labels else -1
        return img, label

    def file_list_for_manifest(self) -> list[Path]:
        return list(self.files)


class SyntheticImageDataset(Dataset):
    """Deterministic synthetic dataset for smoke tests.

    Generates 3-channel images from a seeded RNG. Useful for validating
    the training loop end-to-end without requiring real data on disk.
    """

    def __init__(self, n: int = 64, image_size: int = 256, seed: int = 0):
        self.n = n
        self.image_size = image_size
        self.seed = seed

    def __len__(self) -> int:
        return self.n

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, int]:
        # Per-sample reproducible RNG
        g = torch.Generator().manual_seed(self.seed + idx)
        # Pseudo-natural image: low-freq sinusoidal modulation + noise
        H, W = self.image_size, self.image_size
        xs = torch.linspace(-3.14, 3.14, W).view(1, 1, W).expand(3, H, W)
        ys = torch.linspace(-3.14, 3.14, H).view(1, H, 1).expand(3, H, W)
        phase = torch.rand(3, 1, 1, generator=g) * 6.28
        wave = torch.sin(xs * 2 + phase) * torch.cos(ys * 3 + phase)
        noise = torch.randn(3, H, W, generator=g) * 0.1
        img = torch.clamp(wave * 0.7 + noise, -1.0, 1.0)
        return img, idx


class StreamingImageList(IterableDataset):
    """Streaming dataset for very large URL lists (CC12M, LAION).

    Reads a TSV file with columns: url<TAB>caption (LAION/CC12M convention).
    Skips dead links silently; counts get surfaced via `dead_link_count`.
    Real implementation will use img2dataset for parallel downloads + caching;
    this class is the inference-time consumer that reads pre-cached webdataset
    shards.

    For Phase 1.1 launch, prefer downloading CC12M via img2dataset OUTSIDE
    this class (it's a separate job that produces ImageFolderDataset-shaped
    output on disk).
    """

    def __init__(self, manifest_path: Path | str, image_size: int = 256):
        self.manifest_path = Path(manifest_path)
        self.image_size = image_size
        self.dead_link_count = 0

    def __iter__(self) -> Iterator[tuple[torch.Tensor, str]]:
        raise NotImplementedError(
            "StreamingImageList requires img2dataset preprocessing. "
            "Use ImageFolderDataset on the realized webdataset output for now."
        )
