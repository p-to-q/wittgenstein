"""Minimal training manifest helpers.

This module intentionally stays stdlib-only. It is the receipt floor for
Phase-1 training work, not a framework abstraction over PyTorch, FSDP, or
DeepSpeed.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import tempfile
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "training-manifest.v0"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def hash_file_sha256(path: str | Path) -> str:
    """Return the SHA-256 hex digest for a local file."""

    file_path = Path(path)
    digest = hashlib.sha256()
    with file_path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


@dataclass(frozen=True)
class TrainingDatasetRef:
    """A dataset snapshot reference recorded in every training receipt."""

    name: str
    split: str
    uri: str
    sha256: str | None = None
    dvc_hash: str | None = None
    sample_count: int | None = None


@dataclass(frozen=True)
class MetricSnapshot:
    """A named metric value with optional step context."""

    name: str
    value: float
    step: int | None = None
    split: str | None = None


@dataclass(frozen=True)
class TrainingManifest:
    """Framework-neutral receipt for a training checkpoint or smoke run."""

    run_id: str
    program: str
    git_sha: str | None
    seed: int | None
    command: list[str]
    checkpoint_path: str
    checkpoint_sha256: str
    datasets: list[TrainingDatasetRef]
    metrics: list[MetricSnapshot] = field(default_factory=list)
    framework: dict[str, str] = field(default_factory=dict)
    experiment: dict[str, str] | None = None
    notes: list[str] = field(default_factory=list)
    started_at: str = field(default_factory=_utc_now_iso)
    finished_at: str = field(default_factory=_utc_now_iso)
    schema_version: str = SCHEMA_VERSION
    python_version: str = field(default_factory=platform.python_version)

    def to_json_dict(self) -> dict[str, Any]:
        return asdict(self)


def write_training_manifest(manifest: TrainingManifest, out_path: str | Path) -> Path:
    """Write a deterministic, human-reviewable training manifest JSON file."""

    path = Path(out_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temp_path = Path(handle.name)
            handle.write(json.dumps(manifest.to_json_dict(), indent=2, sort_keys=True) + "\n")
        os.replace(temp_path, path)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()
    return path
