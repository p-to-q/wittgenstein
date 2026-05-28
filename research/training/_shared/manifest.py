"""Training-manifest emitter — the receipt spine for training runs.

Mirrors Wittgenstein's inference-side `RunManifest` shape (see
`packages/schemas/src/runtime/manifest.ts`) but extends it with training-
specific fields per `docs/research/2026-05-13-wittgenstein-research-program.md`:

  - `dataset.sha256` — SHA over the sorted list of input file paths + per-file SHA
  - `optimizer.state_hash` — SHA over state_dict bytes at checkpoint time
  - `train.step` — global step at checkpoint
  - `eval.metric_snapshot` — pinned metric values

Every checkpoint emits one manifest. The manifest + the checkpoint together
constitute a publishable artifact bundle. `wittgenstein replay <manifest>`
(future tracking #388) walks back from a manifest to reproduce the byte-pinned
inference path.

Doctrine: this module owns the receipt SHAPE; it does NOT own scheduling,
storage, or upload. The caller (training loops) drives writes.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class RuntimeFingerprint:
    """Captured once at training-start. Does not change across checkpoints."""

    git_sha: str
    lockfile_sha256: str
    python_version: str
    torch_version: str
    cuda_version: str | None
    cuda_device_count: int
    cuda_device_name: str | None
    cudnn_version: int | None
    hostname: str
    platform: str


@dataclass(frozen=True)
class DatasetFingerprint:
    """SHA-256 over the canonical sorted-file enumeration + per-file SHA.

    Matches the lockfile pattern at polyglot-mini/train/data_manifest.json
    (PR #130). For very large datasets the per-file SHAs are stored separately;
    the manifest itself carries only the aggregated root SHA + sample stats.
    """

    name: str
    root_sha256: str
    file_count: int
    total_bytes: int
    revision: str  # DVC tag or HF revision, "uncommitted" if neither
    notes: str = ""


@dataclass(frozen=True)
class OptimizerCheckpoint:
    """Captured at checkpoint-write time. SHA over state_dict bytes."""

    name: str  # e.g. "AdamW"
    state_hash: str
    lr: float
    weight_decay: float
    betas: tuple[float, float]


@dataclass(frozen=True)
class TrainingCheckpoint:
    """One checkpoint = one manifest. Run-id ties checkpoints in a single run."""

    run_id: str
    step: int
    epoch: float  # fractional epochs allowed
    wall_clock_s: float
    seed: int
    weights_path: str
    weights_sha256: str


@dataclass(frozen=True)
class EvalSnapshot:
    """Metric values pinned at checkpoint time. Empty {} if no eval ran."""

    eval_set: str  # e.g. "imagenet-val-50k"
    eval_set_sha256: str
    metrics: dict[str, Any] = field(default_factory=dict)
    eval_step: int = -1  # which training step the eval ran AT
    eval_wall_clock_s: float = 0.0


@dataclass(frozen=True)
class TrainingManifest:
    """Sibling of `RunManifest` for training runs. JSON-serializable."""

    schema_version: str  # "witt.training/v0.1"
    program: str  # "tokenizer" | "adapter" | "llm-head"
    family: str  # e.g. "wittgenstein-native-vqgan"
    runtime: RuntimeFingerprint
    dataset: DatasetFingerprint
    optimizer: OptimizerCheckpoint
    checkpoint: TrainingCheckpoint
    eval: EvalSnapshot
    config: dict[str, Any]  # hyperparams snapshot (full config dump)
    experiment_uri: str = ""  # aim/W&B/MLflow link if registered, "" otherwise
    notes: str = ""


# ---------- Capture helpers ----------


def _try_git_sha(repo_root: Path | None = None) -> str:
    try:
        r = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root) if repo_root else None,
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        return r.stdout.strip()
    except Exception:
        return "unknown"


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def capture_runtime_fingerprint(repo_root: Path | None = None, lockfile: Path | None = None) -> RuntimeFingerprint:
    import torch

    cuda_avail = torch.cuda.is_available()
    return RuntimeFingerprint(
        git_sha=_try_git_sha(repo_root),
        lockfile_sha256=_sha256_file(lockfile) if (lockfile and lockfile.exists()) else "unknown",
        python_version=sys.version.split()[0],
        torch_version=torch.__version__,
        cuda_version=getattr(torch.version, "cuda", None) if cuda_avail else None,
        cuda_device_count=torch.cuda.device_count() if cuda_avail else 0,
        cuda_device_name=torch.cuda.get_device_name(0) if cuda_avail else None,
        cudnn_version=torch.backends.cudnn.version() if cuda_avail else None,
        hostname=platform.node(),
        platform=platform.platform(),
    )


def capture_dataset_fingerprint(
    name: str,
    files: list[Path],
    revision: str = "uncommitted",
    notes: str = "",
    cache_per_file: bool = False,
) -> DatasetFingerprint:
    """SHA-256 over sorted (relative-path, file-sha256) pairs.

    cache_per_file=False (default) means we hash file names + sizes only, which
    is the cheap-but-coarser fingerprint suitable for development. Set True for
    publish-quality fingerprints (slow on TB-scale datasets — prefer DVC's own
    .dvc file SHA in that case).
    """
    sorted_files = sorted(files, key=lambda p: str(p))
    total_bytes = 0
    sha_input = []
    for p in sorted_files:
        size = p.stat().st_size if p.exists() else 0
        total_bytes += size
        if cache_per_file:
            sha_input.append((str(p), _sha256_file(p)))
        else:
            sha_input.append((str(p), str(size)))
    root_sha = _sha256_bytes(json.dumps(sha_input, sort_keys=True).encode())
    return DatasetFingerprint(
        name=name,
        root_sha256=root_sha,
        file_count=len(sorted_files),
        total_bytes=total_bytes,
        revision=revision,
        notes=notes,
    )


def capture_optimizer_checkpoint(
    optimizer,
    name: str | None = None,
) -> OptimizerCheckpoint:
    import io
    import torch

    buf = io.BytesIO()
    torch.save(optimizer.state_dict(), buf)
    state_hash = _sha256_bytes(buf.getvalue())
    pg = optimizer.param_groups[0]
    return OptimizerCheckpoint(
        name=name or type(optimizer).__name__,
        state_hash=state_hash,
        lr=float(pg.get("lr", 0.0)),
        weight_decay=float(pg.get("weight_decay", 0.0)),
        betas=tuple(pg.get("betas", (0.0, 0.0))),
    )


def capture_training_checkpoint(
    run_id: str,
    step: int,
    epoch: float,
    wall_clock_s: float,
    seed: int,
    weights_path: Path,
) -> TrainingCheckpoint:
    return TrainingCheckpoint(
        run_id=run_id,
        step=step,
        epoch=epoch,
        wall_clock_s=wall_clock_s,
        seed=seed,
        weights_path=str(weights_path),
        weights_sha256=_sha256_file(weights_path) if weights_path.exists() else "pending-write",
    )


# ---------- Writer ----------


def write_training_manifest(manifest: TrainingManifest, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    # Atomic write so partial files don't shadow good ones during a crash.
    tmp = out_path.with_suffix(out_path.suffix + f".tmp-{os.getpid()}-{int(time.time())}")
    payload = json.dumps(asdict(manifest), indent=2, default=str)
    tmp.write_text(payload)
    tmp.replace(out_path)


def new_run_id(program: str) -> str:
    """Deterministic-ish run-id: ISO timestamp + 8-char random hex."""
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    rand = _sha256_bytes(os.urandom(8))[:8]
    return f"{program}-{ts}-{rand}"
