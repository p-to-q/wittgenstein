#!/usr/bin/env python3
"""Spectrum health checks for M1B adapter / projector scaffolds.

This is not a quality score. It's a cheap probe for rank-collapse / low-rank
bottlenecks that can masquerade as training progress.

Inputs:
- `--weights`: path to `adapter_mlp.json` (witt.image.adapter.mlp/v0.1)
- `--latent-dump` (optional): `.npy` array of latents/features (N x D) to report
  covariance eigen-spectrum (if you have a dump from an experiment).
"""

from __future__ import annotations

import argparse
import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import numpy as np

from features import FEATURE_SCHEMA_SHA256


@dataclass(frozen=True)
class SpectrumSummary:
    name: str
    shape: tuple[int, int]
    fro_norm_sq: float
    s_max: float
    stable_rank: float
    effective_rank: float
    top_singular_values: list[float]


def stable_rank_from_singular_values(s: np.ndarray) -> float:
    # stable rank = ||W||_F^2 / ||W||_2^2
    if s.size == 0:
        return 0.0
    s_max = float(np.max(s))
    if s_max <= 0:
        return 0.0
    fro_norm_sq = float(np.sum(s**2))
    return fro_norm_sq / (s_max**2)


def effective_rank_from_singular_values(s: np.ndarray) -> float:
    # effective rank = exp(H(p)), where p_i = s_i / sum(s)
    # Uses singular values (not squared) as a simple capacity proxy.
    if s.size == 0:
        return 0.0
    total = float(np.sum(s))
    if total <= 0:
        return 0.0
    p = (s / total).astype(np.float64)
    # Numerical safety: ignore zeros in entropy.
    p = p[p > 0]
    if p.size == 0:
        return 0.0
    h = float(-np.sum(p * np.log(p)))
    return float(math.exp(h))


def summarize_matrix(name: str, w: np.ndarray, top_k: int) -> SpectrumSummary:
    if w.ndim != 2:
        raise SystemExit(f"{name}: expected 2D matrix, got shape {tuple(w.shape)}")
    # Full SVD is fine here (MLP dims are small). If this grows, switch to
    # randomized svd or power iteration.
    s = np.linalg.svd(w, compute_uv=False)
    s = np.asarray(s, dtype=np.float64)
    s_max = float(np.max(s)) if s.size else 0.0
    fro_norm_sq = float(np.sum(w.astype(np.float64) ** 2))
    stable_rank = stable_rank_from_singular_values(s)
    effective_rank = effective_rank_from_singular_values(s)
    top = [float(x) for x in s[: max(0, top_k)]]
    return SpectrumSummary(
        name=name,
        shape=(int(w.shape[0]), int(w.shape[1])),
        fro_norm_sq=fro_norm_sq,
        s_max=s_max,
        stable_rank=stable_rank,
        effective_rank=effective_rank,
        top_singular_values=top,
    )


def print_summary(summaries: Iterable[SpectrumSummary]) -> None:
    for s in summaries:
        print(
            f"{s.name}: shape={s.shape} s_max={s.s_max:.6g} "
            f"stable_rank={s.stable_rank:.3f} effective_rank={s.effective_rank:.3f} "
            f"top_singular_values={','.join(f'{x:.6g}' for x in s.top_singular_values)}"
        )


def warn_if_degenerate(s: SpectrumSummary) -> None:
    # Conservative warning: if effective rank is tiny relative to min(m,n).
    min_dim = min(s.shape)
    if min_dim <= 0:
        return
    if s.effective_rank <= max(2.0, 0.05 * float(min_dim)):
        print(
            f"WARNING: {s.name} effective_rank={s.effective_rank:.2f} "
            f"is very low vs min_dim={min_dim}; possible low-rank bottleneck."
        )


def load_mlp_adapter_json(path: Path) -> dict:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("version") != "witt.image.adapter.mlp/v0.1":
        raise SystemExit("Unsupported adapter file (expected witt.image.adapter.mlp/v0.1)")
    feature_schema = raw.get("featureSchema", FEATURE_SCHEMA_SHA256)
    if feature_schema != FEATURE_SCHEMA_SHA256:
        raise SystemExit(
            "Unsupported adapter featureSchema "
            f"{feature_schema!r}; this checker only supports {FEATURE_SCHEMA_SHA256}"
        )
    return raw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True, help="Path to adapter_mlp.json")
    parser.add_argument("--top-k", type=int, default=8, help="How many top singular values to print")
    parser.add_argument(
        "--latent-dump",
        type=Path,
        default=None,
        help="Optional .npy file with an (N,D) array; reports covariance eigen-spectrum",
    )
    args = parser.parse_args()

    raw = load_mlp_adapter_json(args.weights)
    hidden = int(raw["hiddenDim"])
    gw, gh = raw["tokenGrid"]
    num_tokens = int(gw) * int(gh)

    w1 = np.array(raw["w1"], dtype=np.float64).reshape(hidden, 128)
    w2 = np.array(raw["w2"], dtype=np.float64).reshape(num_tokens, hidden)

    summaries: list[SpectrumSummary] = [
        summarize_matrix("mlp.w1", w1, args.top_k),
        summarize_matrix("mlp.w2", w2, args.top_k),
    ]

    print_summary(summaries)
    for s in summaries:
        warn_if_degenerate(s)

    if args.latent_dump is not None:
        arr = np.load(args.latent_dump)
        if arr.ndim != 2:
            raise SystemExit(f"latent dump must be 2D (N,D); got shape {tuple(arr.shape)}")
        # Center and compute covariance (D x D).
        x = arr.astype(np.float64)
        x = x - np.mean(x, axis=0, keepdims=True)
        cov = (x.T @ x) / max(1, x.shape[0] - 1)
        # eigenvalues of covariance are squared singular values of centered data / (N-1)
        eig = np.linalg.eigvalsh(cov)
        eig = np.sort(np.maximum(eig, 0.0))[::-1]
        top = [float(v) for v in eig[: max(0, args.top_k)]]
        total = float(np.sum(eig))
        explained = [v / total for v in top] if total > 0 else [0.0 for _ in top]
        print(
            "latent.cov: "
            f"shape={(int(cov.shape[0]), int(cov.shape[1]))} "
            f"top_eigenvalues={','.join(f'{v:.6g}' for v in top)} "
            f"top_explained_var={','.join(f'{p:.4f}' for p in explained)}"
        )


if __name__ == "__main__":
    main()
