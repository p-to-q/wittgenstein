"""TrainingRunManifest emitter — the receipt spine for training runs.

This module owns the Python-side writer for the canonical
`witt.training.run-manifest/v0.1` JSON shape in
`packages/schemas/src/training-manifest.ts`.

The helper is intentionally mostly-stdlib. Training loops may pass torch
optimizers/checkpoints to the capture helpers, but the CPU-only smoke path can
prove receipt shape without importing torch or touching real datasets.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import platform
import re
import subprocess
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


TRAINING_RUN_MANIFEST_SCHEMA_VERSION = "witt.training.run-manifest/v0.1"
SHA256_RE = re.compile(r"^[a-f0-9]{64}$")
GIT_SHA_RE = re.compile(r"^(?:[a-f0-9]{40}|[a-f0-9]{64})$")
SUBPROGRAMS = {"tokenizer", "adapter", "llm-head"}
MODALITIES = {"image", "audio", "sensor", "svg", "video", "asciipng"}
WEIGHTS_LICENSES = {"permissive", "research-only"}


@dataclass(frozen=True)
class TrainingRunDataset:
    dvcRev: str
    name: str
    sha256: str


@dataclass(frozen=True)
class TrainingRunHardware:
    gpuModel: str
    gpuCount: int
    nodeCount: int


@dataclass(frozen=True)
class TrainingRunOptimizer:
    name: str
    stateSha256: str
    learningRate: float
    weightDecay: float
    betas: tuple[float, float]


@dataclass(frozen=True)
class TrainingRunEvalMetric:
    name: str
    value: float
    unit: str | None = None
    higherIsBetter: bool | None = None


@dataclass(frozen=True)
class TrainingRunEvalDataset:
    name: str
    split: str
    sha256: str


@dataclass(frozen=True)
class TrainingRunEvalSnapshot:
    modality: str
    dataset: TrainingRunEvalDataset
    step: int
    generatedAt: str
    metrics: list[TrainingRunEvalMetric]


@dataclass(frozen=True)
class TrainingRunCheckpoint:
    path: str
    sha256: str
    bytes: int
    weightsLicense: str


@dataclass(frozen=True)
class TrainingRunConfigReference:
    path: str
    sha256: str


@dataclass(frozen=True)
class TrainingRunManifest:
    schemaVersion: str
    runId: str
    subprogram: str
    startedAt: str
    finishedAt: str | None
    harnessGitSha: str
    trainingCodeGitSha: str
    dockerImageSha: str | None
    lockfileSha256: str | None
    dataset: TrainingRunDataset
    seed: int
    stepCount: int
    wallClockSec: float
    hardware: TrainingRunHardware
    optimizer: TrainingRunOptimizer
    evalSnapshots: list[TrainingRunEvalSnapshot]
    checkpoint: TrainingRunCheckpoint
    trainingConfig: TrainingRunConfigReference | None = None


def utc_now_iso() -> str:
    return (
        datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def capture_git_sha(repo_root: Path | None = None) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=str(repo_root) if repo_root else None,
            capture_output=True,
            text=True,
            check=True,
            timeout=5,
        )
        sha = result.stdout.strip()
    except Exception as exc:
        raise RuntimeError("could not capture git SHA for training manifest") from exc
    if not GIT_SHA_RE.match(sha):
        raise RuntimeError(f"git rev-parse HEAD returned an invalid SHA: {sha!r}")
    return sha


def capture_lockfile_sha256(lockfile: Path | None = None) -> str | None:
    if lockfile is None or not lockfile.exists():
        return None
    return sha256_file(lockfile)


def capture_docker_image_sha(raw: str | None = None) -> str | None:
    value = (raw or os.environ.get("WITTGENSTEIN_TRAINING_DOCKER_IMAGE_SHA") or "").strip()
    return value or None


def capture_hardware() -> TrainingRunHardware:
    raw_node_count = os.environ.get("WITTGENSTEIN_TRAINING_NODE_COUNT", "1")
    try:
        node_count = int(raw_node_count)
    except ValueError as exc:
        raise RuntimeError(
            f"WITTGENSTEIN_TRAINING_NODE_COUNT must be an integer, got {raw_node_count!r}"
        ) from exc

    try:
        import torch

        if torch.cuda.is_available():
            return TrainingRunHardware(
                gpuModel=torch.cuda.get_device_name(0),
                gpuCount=torch.cuda.device_count(),
                nodeCount=node_count,
            )
    except Exception:
        pass

    return TrainingRunHardware(
        gpuModel=f"cpu:{platform.machine() or platform.processor() or 'unknown'}",
        gpuCount=0,
        nodeCount=node_count,
    )


def capture_dataset_fingerprint(
    name: str,
    files: list[Path],
    revision: str = "uncommitted",
    notes: str = "",
    cache_per_file: bool = True,
    root: Path | None = None,
) -> TrainingRunDataset:
    """SHA-256 over sorted (path, file-sha-or-size) pairs.

    `notes` is accepted for caller compatibility but intentionally not emitted:
    the canonical manifest is strict and keeps prose outside the receipt.
    `root`, when supplied, keeps the fingerprint independent of the checkout or
    mount point that happened to hold the dataset.
    `cache_per_file=False` is a development shortcut only; publishable training
    receipts must use the default content-level hashing or a DVC-pinned source.
    """

    del notes
    sorted_files = sorted(files, key=lambda p: str(p))
    sha_input: list[tuple[str, str]] = []
    for path in sorted_files:
        if cache_per_file and not path.exists():
            raise FileNotFoundError(f"cannot fingerprint missing dataset file: {path}")
        size = path.stat().st_size if path.exists() else 0
        digest = sha256_file(path) if cache_per_file and path.exists() else str(size)
        manifest_path = path
        if root is not None:
            try:
                manifest_path = path.relative_to(root)
            except ValueError:
                manifest_path = path
        sha_input.append((manifest_path.as_posix(), digest))
    return TrainingRunDataset(
        dvcRev=revision,
        name=name,
        sha256=sha256_bytes(json.dumps(sha_input, sort_keys=True).encode("utf-8")),
    )


def capture_optimizer_checkpoint(optimizer: Any, name: str | None = None) -> TrainingRunOptimizer:
    import io
    import torch

    buf = io.BytesIO()
    torch.save(optimizer.state_dict(), buf)
    param_group = optimizer.param_groups[0]
    betas = param_group.get("betas", (0.0, 0.0))
    return TrainingRunOptimizer(
        name=name or type(optimizer).__name__,
        stateSha256=sha256_bytes(buf.getvalue()),
        learningRate=float(param_group.get("lr", 0.0)),
        weightDecay=float(param_group.get("weight_decay", 0.0)),
        betas=(float(betas[0]), float(betas[1])),
    )


def synthetic_optimizer_checkpoint() -> TrainingRunOptimizer:
    payload = b"wittgenstein stdlib training-manifest smoke has no optimizer state"
    return TrainingRunOptimizer(
        name="stdlib-smoke-none",
        stateSha256=sha256_bytes(payload),
        learningRate=0.0,
        weightDecay=0.0,
        betas=(0.0, 0.0),
    )


def capture_training_checkpoint(
    weights_path: Path,
    weights_license: str,
) -> TrainingRunCheckpoint:
    return TrainingRunCheckpoint(
        path=str(weights_path),
        sha256=sha256_file(weights_path),
        bytes=weights_path.stat().st_size,
        weightsLicense=weights_license,
    )


def write_training_config_snapshot(path: Path, config: dict[str, Any]) -> TrainingRunConfigReference:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return TrainingRunConfigReference(path=str(path), sha256=sha256_file(path))


def manifest_to_dict(manifest: TrainingRunManifest | dict[str, Any]) -> dict[str, Any]:
    payload = asdict(manifest) if isinstance(manifest, TrainingRunManifest) else dict(manifest)
    if payload.get("trainingConfig") is None:
        payload.pop("trainingConfig", None)
    return payload


def assert_training_run_manifest_shape(manifest: TrainingRunManifest | dict[str, Any]) -> None:
    payload = manifest_to_dict(manifest)
    required = {
        "schemaVersion",
        "runId",
        "subprogram",
        "startedAt",
        "finishedAt",
        "harnessGitSha",
        "trainingCodeGitSha",
        "dockerImageSha",
        "lockfileSha256",
        "dataset",
        "seed",
        "stepCount",
        "wallClockSec",
        "hardware",
        "optimizer",
        "evalSnapshots",
        "checkpoint",
    }
    optional = {"trainingConfig"}
    _assert_keys(payload, required, optional, "manifest")
    _require_equal(payload["schemaVersion"], TRAINING_RUN_MANIFEST_SCHEMA_VERSION, "schemaVersion")
    _require_in(payload["subprogram"], SUBPROGRAMS, "subprogram")
    _require_git_sha(payload["harnessGitSha"], "harnessGitSha")
    _require_git_sha(payload["trainingCodeGitSha"], "trainingCodeGitSha")
    if payload["dockerImageSha"] is not None:
        if not re.match(r"^sha256:[a-f0-9]{64}$", str(payload["dockerImageSha"])):
            raise ValueError("dockerImageSha must be null or sha256:<64 hex chars>")
    if payload["lockfileSha256"] is not None:
        _require_sha256(payload["lockfileSha256"], "lockfileSha256")
    started = _parse_timestamp(payload["startedAt"], "startedAt")
    finished_raw = payload["finishedAt"]
    if finished_raw is not None:
        finished = _parse_timestamp(finished_raw, "finishedAt")
        if finished < started:
            raise ValueError("finishedAt must be greater than or equal to startedAt")
    if isinstance(payload["seed"], bool) or not isinstance(payload["seed"], int):
        raise ValueError("seed must be an integer")
    _require_nonnegative_int(payload["stepCount"], "stepCount")
    _require_nonnegative_number(payload["wallClockSec"], "wallClockSec")
    _validate_dataset(payload["dataset"])
    _validate_hardware(payload["hardware"])
    _validate_optimizer(payload["optimizer"])
    _validate_checkpoint(payload["checkpoint"])
    eval_snapshots = payload["evalSnapshots"]
    if not isinstance(eval_snapshots, list):
        raise ValueError("evalSnapshots must be a list")
    for index, snapshot in enumerate(eval_snapshots):
        _validate_eval_snapshot(snapshot, f"evalSnapshots[{index}]")
    if "trainingConfig" in payload:
        _validate_config_reference(payload["trainingConfig"], "trainingConfig")


def write_training_run_manifest(manifest: TrainingRunManifest, out_path: Path) -> None:
    assert_training_run_manifest_shape(manifest)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + f".tmp-{os.getpid()}-{int(time.time())}")
    tmp.write_text(json.dumps(manifest_to_dict(manifest), indent=2) + "\n", encoding="utf-8")
    tmp.replace(out_path)


def write_training_manifest(manifest: TrainingRunManifest, out_path: Path) -> None:
    """Backward-compatible writer name; writes the canonical run-manifest schema."""

    write_training_run_manifest(manifest, out_path)


def new_run_id(program: str) -> str:
    ts = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    rand = sha256_bytes(os.urandom(8))[:8]
    return f"{program}-{ts}-{rand}"


def _assert_keys(
    payload: dict[str, Any],
    required: set[str],
    optional: set[str],
    label: str,
) -> None:
    actual = set(payload)
    missing = required - actual
    extra = actual - required - optional
    if missing:
        raise ValueError(f"{label} missing required keys: {sorted(missing)}")
    if extra:
        raise ValueError(f"{label} has unrecognized keys: {sorted(extra)}")


def _require_equal(value: Any, expected: Any, label: str) -> None:
    if value != expected:
        raise ValueError(f"{label} must be {expected!r}; got {value!r}")


def _require_in(value: Any, allowed: set[str], label: str) -> None:
    if value not in allowed:
        raise ValueError(f"{label} must be one of {sorted(allowed)}; got {value!r}")


def _require_sha256(value: Any, label: str) -> None:
    if not isinstance(value, str) or not SHA256_RE.match(value):
        raise ValueError(f"{label} must be a 64-char lowercase sha256 hex string")


def _require_git_sha(value: Any, label: str) -> None:
    if not isinstance(value, str) or not GIT_SHA_RE.match(value):
        raise ValueError(f"{label} must be a 40- or 64-char lowercase git sha")


def _require_nonnegative_int(value: Any, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{label} must be a nonnegative integer")


def _require_positive_int(value: Any, label: str) -> None:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(f"{label} must be a positive integer")


def _require_nonnegative_number(value: Any, label: str) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
        or value < 0
    ):
        raise ValueError(f"{label} must be a finite nonnegative number")


def _require_finite_number(value: Any, label: str) -> None:
    if (
        isinstance(value, bool)
        or not isinstance(value, (int, float))
        or not math.isfinite(float(value))
    ):
        raise ValueError(f"{label} must be a finite number")


def _parse_timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str):
        raise ValueError(f"{label} must be an ISO timestamp string")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label} must be an ISO timestamp") from exc


def _validate_dataset(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("dataset must be an object")
    _assert_keys(payload, {"dvcRev", "name", "sha256"}, set(), "dataset")
    if not payload["dvcRev"] or not payload["name"]:
        raise ValueError("dataset.dvcRev and dataset.name must be nonempty")
    _require_sha256(payload["sha256"], "dataset.sha256")


def _validate_hardware(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("hardware must be an object")
    _assert_keys(payload, {"gpuModel", "gpuCount", "nodeCount"}, set(), "hardware")
    if not payload["gpuModel"]:
        raise ValueError("hardware.gpuModel must be nonempty")
    _require_nonnegative_int(payload["gpuCount"], "hardware.gpuCount")
    _require_positive_int(payload["nodeCount"], "hardware.nodeCount")


def _validate_optimizer(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("optimizer must be an object")
    _assert_keys(
        payload,
        {"name", "stateSha256", "learningRate", "weightDecay", "betas"},
        set(),
        "optimizer",
    )
    if not payload["name"]:
        raise ValueError("optimizer.name must be nonempty")
    _require_sha256(payload["stateSha256"], "optimizer.stateSha256")
    _require_nonnegative_number(payload["learningRate"], "optimizer.learningRate")
    _require_nonnegative_number(payload["weightDecay"], "optimizer.weightDecay")
    betas = payload["betas"]
    if not isinstance(betas, (list, tuple)) or len(betas) != 2:
        raise ValueError("optimizer.betas must be a two-number tuple/list")
    _require_beta(betas[0], "optimizer.betas[0]")
    _require_beta(betas[1], "optimizer.betas[1]")


def _validate_checkpoint(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("checkpoint must be an object")
    _assert_keys(payload, {"path", "sha256", "bytes", "weightsLicense"}, set(), "checkpoint")
    if not payload["path"]:
        raise ValueError("checkpoint.path must be nonempty")
    _require_sha256(payload["sha256"], "checkpoint.sha256")
    _require_positive_int(payload["bytes"], "checkpoint.bytes")
    _require_in(payload["weightsLicense"], WEIGHTS_LICENSES, "checkpoint.weightsLicense")


def _validate_eval_snapshot(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"modality", "dataset", "step", "generatedAt", "metrics"}, set(), label)
    _require_in(payload["modality"], MODALITIES, f"{label}.modality")
    _validate_eval_dataset(payload["dataset"], f"{label}.dataset")
    _require_nonnegative_int(payload["step"], f"{label}.step")
    _parse_timestamp(payload["generatedAt"], f"{label}.generatedAt")
    metrics = payload["metrics"]
    if not isinstance(metrics, list) or not metrics:
        raise ValueError(f"{label}.metrics must be a nonempty list")
    for index, metric in enumerate(metrics):
        _validate_eval_metric(metric, f"{label}.metrics[{index}]")


def _validate_eval_dataset(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"name", "split", "sha256"}, set(), label)
    if not payload["name"] or not payload["split"]:
        raise ValueError(f"{label}.name and {label}.split must be nonempty")
    _require_sha256(payload["sha256"], f"{label}.sha256")


def _validate_eval_metric(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"name", "value"}, {"unit", "higherIsBetter"}, label)
    if not payload["name"]:
        raise ValueError(f"{label}.name must be nonempty")
    _require_finite_number(payload["value"], f"{label}.value")
    if "unit" in payload and (not isinstance(payload["unit"], str) or not payload["unit"]):
        raise ValueError(f"{label}.unit must be a nonempty string when present")
    if "higherIsBetter" in payload and not isinstance(payload["higherIsBetter"], bool):
        raise ValueError(f"{label}.higherIsBetter must be boolean when present")


def _validate_config_reference(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"path", "sha256"}, set(), label)
    if not payload["path"]:
        raise ValueError(f"{label}.path must be nonempty")
    _require_sha256(payload["sha256"], f"{label}.sha256")


def _require_beta(value: Any, label: str) -> None:
    _require_nonnegative_number(value, label)
    if float(value) > 1:
        raise ValueError(f"{label} must be between 0 and 1")
