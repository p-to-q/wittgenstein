"""DVC-backed dataset snapshot receipts for training runs.

The DVC pointer is the data-access primitive; this module emits the
Wittgenstein receipt that training manifests and sweep rows can reference.
It intentionally keeps DVC md5/etag/checksum fields separate from the
canonical Wittgenstein sha256 identity.
"""

from __future__ import annotations

import json
import math
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .manifest import SHA256_RE, capture_git_sha, sha256_bytes, sha256_file, utc_now_iso


TRAINING_DATASET_SNAPSHOT_SCHEMA_VERSION = "witt.training.dataset-snapshot/v0.1"
DATASET_ROLES = {"train", "validation", "eval", "smoke"}
DATASET_LICENSES = {"permissive", "research-only", "restricted", "unknown"}


@dataclass(frozen=True)
class TrainingDvcOutput:
    path: str
    size: int | None = None
    md5: str | None = None
    etag: str | None = None
    checksum: str | None = None
    hash: str | None = None


@dataclass(frozen=True)
class TrainingDvcRemote:
    name: str
    url: str | None = None


@dataclass(frozen=True)
class TrainingDatasetDescriptor:
    name: str
    split: str
    role: str
    uri: str | None
    license: str
    sampleCount: int | None = None
    deadLinkRate: float | None = None


@dataclass(frozen=True)
class TrainingDvcReference:
    path: str
    repoRevLock: str
    outs: list[TrainingDvcOutput]
    remote: TrainingDvcRemote | None = None


@dataclass(frozen=True)
class TrainingDatasetSnapshot:
    schemaVersion: str
    snapshotId: str
    generatedAt: str
    dataset: TrainingDatasetDescriptor
    dvc: TrainingDvcReference
    sha256: str


def load_dvc_pointer(path: Path) -> list[TrainingDvcOutput]:
    """Load a DVC pointer file.

    Tests use JSON-subset YAML so the smoke path stays stdlib-only. Real DVC
    files can be parsed when PyYAML or ruamel.yaml is present in the training
    environment.
    """

    payload = _load_yamlish(path)
    outs = payload.get("outs")
    if not isinstance(outs, list) or not outs:
        raise ValueError(f"DVC pointer must contain a nonempty outs list: {path}")
    parsed: list[TrainingDvcOutput] = []
    for index, raw in enumerate(outs):
        if not isinstance(raw, dict):
            raise ValueError(f"DVC output {index} must be an object")
        raw_path = raw.get("path")
        if not isinstance(raw_path, str) or not raw_path:
            raise ValueError(f"DVC output {index} must carry a nonempty path")
        size = raw.get("size")
        if size is not None and (isinstance(size, bool) or not isinstance(size, int) or size < 0):
            raise ValueError(f"DVC output {index} size must be a nonnegative integer")
        parsed.append(
            TrainingDvcOutput(
                path=raw_path,
                size=size,
                md5=_optional_string(raw.get("md5")),
                etag=_optional_string(raw.get("etag")),
                checksum=_optional_string(raw.get("checksum")),
                hash=_optional_string(raw.get("hash")),
            )
        )
    return parsed


def build_dataset_snapshot_from_dvc(
    *,
    snapshot_id: str,
    dvc_path: Path,
    dataset_name: str,
    split: str,
    role: str,
    license: str,
    uri: str | None = None,
    sample_count: int | None = None,
    dead_link_rate: float | None = None,
    remote: TrainingDvcRemote | None = None,
    repo_rev_lock: str | None = None,
    repo_root: Path | None = None,
) -> TrainingDatasetSnapshot:
    outs = load_dvc_pointer(dvc_path)
    display_dvc_path = dvc_path
    if repo_root is not None:
        try:
            display_dvc_path = dvc_path.resolve().relative_to(repo_root.resolve())
        except ValueError:
            display_dvc_path = dvc_path
    descriptor = TrainingDatasetDescriptor(
        name=dataset_name,
        split=split,
        role=role,
        uri=uri,
        license=license,
        sampleCount=sample_count,
        deadLinkRate=dead_link_rate,
    )
    dvc_ref = TrainingDvcReference(
        path=display_dvc_path.as_posix(),
        repoRevLock=repo_rev_lock or capture_git_sha(repo_root),
        remote=remote,
        outs=outs,
    )
    payload = {
        "dataset": _drop_none(asdict(descriptor)),
        "dvc": _drop_none(asdict(dvc_ref)),
    }
    if "remote" in payload["dvc"]:
        payload["dvc"]["remote"] = _drop_none(payload["dvc"]["remote"])
    payload["dvc"]["outs"] = [_drop_none(out) for out in payload["dvc"]["outs"]]
    digest = sha256_bytes(json.dumps(payload, sort_keys=True).encode("utf-8"))
    snapshot = TrainingDatasetSnapshot(
        schemaVersion=TRAINING_DATASET_SNAPSHOT_SCHEMA_VERSION,
        snapshotId=snapshot_id,
        generatedAt=utc_now_iso(),
        dataset=descriptor,
        dvc=dvc_ref,
        sha256=digest,
    )
    assert_training_dataset_snapshot_shape(snapshot)
    return snapshot


def dataset_snapshot_to_dict(
    snapshot: TrainingDatasetSnapshot | dict[str, Any],
) -> dict[str, Any]:
    payload = asdict(snapshot) if isinstance(snapshot, TrainingDatasetSnapshot) else dict(snapshot)
    payload["dataset"] = _drop_none(payload["dataset"])
    payload["dvc"] = _drop_none(payload["dvc"])
    if "remote" in payload["dvc"]:
        payload["dvc"]["remote"] = _drop_none(payload["dvc"]["remote"])
    payload["dvc"]["outs"] = [_drop_none(out) for out in payload["dvc"]["outs"]]
    return payload


def assert_training_dataset_snapshot_shape(
    snapshot: TrainingDatasetSnapshot | dict[str, Any],
) -> None:
    payload = dataset_snapshot_to_dict(snapshot)
    _assert_keys(
        payload,
        {"schemaVersion", "snapshotId", "generatedAt", "dataset", "dvc", "sha256"},
        set(),
        "datasetSnapshot",
    )
    if payload["schemaVersion"] != TRAINING_DATASET_SNAPSHOT_SCHEMA_VERSION:
        raise ValueError("schemaVersion must be witt.training.dataset-snapshot/v0.1")
    _require_nonempty_string(payload["snapshotId"], "snapshotId")
    _require_nonempty_string(payload["generatedAt"], "generatedAt")
    _require_sha256(payload["sha256"], "sha256")
    _validate_dataset_descriptor(payload["dataset"])
    _validate_dvc_reference(payload["dvc"])


def write_training_dataset_snapshot(snapshot: TrainingDatasetSnapshot, out_path: Path) -> None:
    assert_training_dataset_snapshot_shape(snapshot)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + f".tmp-{os.getpid()}-{int(time.time())}")
    tmp.write_text(
        json.dumps(dataset_snapshot_to_dict(snapshot), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp.replace(out_path)


def dataset_snapshot_reference(snapshot_path: Path) -> dict[str, str]:
    payload = json.loads(snapshot_path.read_text(encoding="utf-8"))
    assert_training_dataset_snapshot_shape(payload)
    return {
        "snapshotId": payload["snapshotId"],
        "snapshotPath": snapshot_path.as_posix(),
        "snapshotSha256": sha256_file(snapshot_path),
        "datasetSha256": payload["sha256"],
    }


def _load_yamlish(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        try:
            import yaml  # type: ignore

            payload = yaml.safe_load(text)
        except ImportError:
            try:
                from ruamel.yaml import YAML  # type: ignore

                payload = YAML(typ="safe").load(text)
            except ImportError as exc:
                raise RuntimeError(
                    f"{path} is not JSON-subset YAML; install PyYAML or run inside the DVC training environment"
                ) from exc
    if not isinstance(payload, dict):
        raise ValueError(f"YAML/JSON payload must be an object: {path}")
    return payload


def _drop_none(payload: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in payload.items() if v is not None}


def _optional_string(value: Any) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or not value:
        raise ValueError("optional DVC string fields must be nonempty strings")
    return value


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


def _require_nonempty_string(value: Any, label: str) -> None:
    if not isinstance(value, str) or not value:
        raise ValueError(f"{label} must be a nonempty string")


def _require_sha256(value: Any, label: str) -> None:
    if not isinstance(value, str) or not SHA256_RE.match(value):
        raise ValueError(f"{label} must be a 64-char lowercase sha256 hex string")


def _validate_dataset_descriptor(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("dataset must be an object")
    _assert_keys(
        payload,
        {"name", "split", "role", "license"},
        {"uri", "sampleCount", "deadLinkRate"},
        "dataset",
    )
    _require_nonempty_string(payload["name"], "dataset.name")
    _require_nonempty_string(payload["split"], "dataset.split")
    if payload["role"] not in DATASET_ROLES:
        raise ValueError(f"dataset.role must be one of {sorted(DATASET_ROLES)}")
    if payload["license"] not in DATASET_LICENSES:
        raise ValueError(f"dataset.license must be one of {sorted(DATASET_LICENSES)}")
    if "uri" in payload:
        _require_nonempty_string(payload["uri"], "dataset.uri")
    if "sampleCount" in payload:
        value = payload["sampleCount"]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError("dataset.sampleCount must be a nonnegative integer")
    if "deadLinkRate" in payload:
        value = payload["deadLinkRate"]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(float(value))
            or value < 0
            or value > 1
        ):
            raise ValueError("dataset.deadLinkRate must be between 0 and 1")


def _validate_dvc_reference(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("dvc must be an object")
    _assert_keys(payload, {"path", "repoRevLock", "outs"}, {"remote"}, "dvc")
    _require_nonempty_string(payload["path"], "dvc.path")
    _require_nonempty_string(payload["repoRevLock"], "dvc.repoRevLock")
    outs = payload["outs"]
    if not isinstance(outs, list) or not outs:
        raise ValueError("dvc.outs must be a nonempty list")
    for index, out in enumerate(outs):
        _validate_dvc_output(out, f"dvc.outs[{index}]")
    if "remote" in payload:
        remote = payload["remote"]
        if not isinstance(remote, dict):
            raise ValueError("dvc.remote must be an object")
        _assert_keys(remote, {"name"}, {"url"}, "dvc.remote")
        _require_nonempty_string(remote["name"], "dvc.remote.name")
        if "url" in remote:
            _require_nonempty_string(remote["url"], "dvc.remote.url")


def _validate_dvc_output(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"path"}, {"size", "md5", "etag", "checksum", "hash"}, label)
    _require_nonempty_string(payload["path"], f"{label}.path")
    if "size" in payload:
        value = payload["size"]
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            raise ValueError(f"{label}.size must be a nonnegative integer")
    if not (payload.get("md5") or payload.get("etag") or payload.get("checksum")):
        raise ValueError(f"{label} must carry at least one checksum field")
    for key in ("md5", "etag", "checksum", "hash"):
        if key in payload:
            _require_nonempty_string(payload[key], f"{label}.{key}")
