"""Training sweep manifest receipts.

A sweep row is intentionally a receipt index, not a scheduler API. It points at
DVC-pinned dataset snapshots, training manifests, and tracker receipts that
already carry the evidence.
"""

from __future__ import annotations

import json
import math
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .data_versioning import dataset_snapshot_reference
from .experiment_tracking import (
    TRACKERS,
    assert_training_experiment_receipt_shape,
)
from .manifest import (
    SHA256_RE,
    SUBPROGRAMS,
    assert_training_run_manifest_shape,
    sha256_file,
    utc_now_iso,
)


TRAINING_SWEEP_MANIFEST_SCHEMA_VERSION = "witt.training.sweep-manifest/v0.1"
SWEEP_ROW_STATUSES = {"planned", "running", "passed", "failed", "skipped", "blocked"}


@dataclass(frozen=True)
class TrainingSweepError:
    code: str
    message: str


@dataclass(frozen=True)
class TrainingSweepRow:
    rowId: str
    subprogram: str
    status: str
    dataset: dict[str, str]
    command: list[str]
    config: dict[str, str] | None = None
    trainingRun: dict[str, str] | None = None
    experiment: dict[str, str] | None = None
    metrics: list[dict[str, Any]] | None = None
    error: TrainingSweepError | None = None


@dataclass(frozen=True)
class TrainingSweepSource:
    specPath: str
    specSha256: str


@dataclass(frozen=True)
class TrainingSweepSummary:
    total: int
    passed: int
    failed: int
    skipped: int
    blocked: int


@dataclass(frozen=True)
class TrainingSweepManifest:
    schemaVersion: str
    sweepId: str
    generatedAt: str
    source: TrainingSweepSource
    rows: list[TrainingSweepRow]
    summary: TrainingSweepSummary
    tracker: str | None = None


def build_passed_sweep_row(
    *,
    row_id: str,
    subprogram: str,
    command: list[str],
    dataset_snapshot_path: Path,
    training_manifest_path: Path,
    experiment_receipt_path: Path | None = None,
    metrics: list[dict[str, Any]] | None = None,
) -> TrainingSweepRow:
    manifest_payload = json.loads(training_manifest_path.read_text(encoding="utf-8"))
    assert_training_run_manifest_shape(manifest_payload)
    checkpoint_sha = manifest_payload["checkpoint"]["sha256"]
    row = TrainingSweepRow(
        rowId=row_id,
        subprogram=subprogram,
        status="passed",
        dataset=dataset_snapshot_reference(dataset_snapshot_path),
        command=command,
        config=manifest_payload.get("trainingConfig"),
        trainingRun={
            "runId": manifest_payload["runId"],
            "manifestPath": training_manifest_path.as_posix(),
            "manifestSha256": sha256_file(training_manifest_path),
            "checkpointSha256": checkpoint_sha,
        },
        experiment=(
            experiment_reference(experiment_receipt_path) if experiment_receipt_path else None
        ),
        metrics=metrics or None,
    )
    assert_training_sweep_row_shape(row)
    return row


def experiment_reference(receipt_path: Path) -> dict[str, str]:
    payload = json.loads(receipt_path.read_text(encoding="utf-8"))
    assert_training_experiment_receipt_shape(payload)
    return {
        "tracker": payload["tracker"],
        "uri": payload["uri"],
        "runId": payload["runId"],
        "receiptPath": receipt_path.as_posix(),
        "receiptSha256": sha256_file(receipt_path),
        "metricsSha256": payload["metricsLog"]["sha256"],
    }


def summarize_sweep_rows(rows: list[TrainingSweepRow]) -> TrainingSweepSummary:
    return TrainingSweepSummary(
        total=len(rows),
        passed=sum(1 for row in rows if row.status == "passed"),
        failed=sum(1 for row in rows if row.status == "failed"),
        skipped=sum(1 for row in rows if row.status == "skipped"),
        blocked=sum(1 for row in rows if row.status == "blocked"),
    )


def sweep_manifest_to_dict(manifest: TrainingSweepManifest | dict[str, Any]) -> dict[str, Any]:
    payload = asdict(manifest) if isinstance(manifest, TrainingSweepManifest) else dict(manifest)
    if payload.get("tracker") is None:
        payload.pop("tracker", None)
    payload["rows"] = [sweep_row_to_dict(row) for row in payload["rows"]]
    payload["summary"] = asdict(payload["summary"]) if isinstance(payload["summary"], TrainingSweepSummary) else payload["summary"]
    payload["source"] = asdict(payload["source"]) if isinstance(payload["source"], TrainingSweepSource) else payload["source"]
    return payload


def sweep_row_to_dict(row: TrainingSweepRow | dict[str, Any]) -> dict[str, Any]:
    payload = asdict(row) if isinstance(row, TrainingSweepRow) else dict(row)
    payload = {k: v for k, v in payload.items() if v is not None}
    if "error" in payload and isinstance(payload["error"], TrainingSweepError):
        payload["error"] = asdict(payload["error"])
    return payload


def assert_training_sweep_manifest_shape(manifest: TrainingSweepManifest | dict[str, Any]) -> None:
    payload = sweep_manifest_to_dict(manifest)
    _assert_keys(
        payload,
        {"schemaVersion", "sweepId", "generatedAt", "source", "rows", "summary"},
        {"tracker"},
        "sweepManifest",
    )
    if payload["schemaVersion"] != TRAINING_SWEEP_MANIFEST_SCHEMA_VERSION:
        raise ValueError("schemaVersion must be witt.training.sweep-manifest/v0.1")
    _require_nonempty_string(payload["sweepId"], "sweepId")
    _require_nonempty_string(payload["generatedAt"], "generatedAt")
    if "tracker" in payload:
        _require_url(payload["tracker"], "tracker")
    _validate_source(payload["source"])
    rows = payload["rows"]
    if not isinstance(rows, list) or not rows:
        raise ValueError("rows must be a nonempty list")
    for index, row in enumerate(rows):
        assert_training_sweep_row_shape(row, label=f"rows[{index}]")
    _validate_summary(payload["summary"], rows)


def assert_training_sweep_row_shape(
    row: TrainingSweepRow | dict[str, Any],
    *,
    label: str = "row",
) -> None:
    payload = sweep_row_to_dict(row)
    _assert_keys(
        payload,
        {"rowId", "subprogram", "status", "dataset", "command"},
        {"config", "trainingRun", "experiment", "metrics", "error"},
        label,
    )
    _require_nonempty_string(payload["rowId"], f"{label}.rowId")
    if payload["subprogram"] not in SUBPROGRAMS:
        raise ValueError(f"{label}.subprogram must be one of {sorted(SUBPROGRAMS)}")
    if payload["status"] not in SWEEP_ROW_STATUSES:
        raise ValueError(f"{label}.status must be one of {sorted(SWEEP_ROW_STATUSES)}")
    _validate_dataset_reference(payload["dataset"], f"{label}.dataset")
    command = payload["command"]
    if not isinstance(command, list) or not command:
        raise ValueError(f"{label}.command must be a nonempty list")
    for index, part in enumerate(command):
        _require_nonempty_string(part, f"{label}.command[{index}]")
    if "config" in payload:
        _validate_config_reference(payload["config"], f"{label}.config")
    if "trainingRun" in payload:
        _validate_training_run_reference(payload["trainingRun"], f"{label}.trainingRun")
    if "experiment" in payload:
        _validate_experiment_reference(payload["experiment"], f"{label}.experiment")
    if "metrics" in payload:
        metrics = payload["metrics"]
        if not isinstance(metrics, list):
            raise ValueError(f"{label}.metrics must be a list")
        for index, metric in enumerate(metrics):
            _validate_metric(metric, f"{label}.metrics[{index}]")
    if "error" in payload:
        _validate_error(payload["error"], f"{label}.error")
    if payload["status"] == "passed" and "trainingRun" not in payload:
        raise ValueError(f"{label}.trainingRun is required when status is passed")
    if payload["status"] in {"failed", "blocked"} and "error" not in payload:
        raise ValueError(f"{label}.error is required when status is {payload['status']}")


def write_training_sweep_manifest(manifest: TrainingSweepManifest, out_path: Path) -> None:
    assert_training_sweep_manifest_shape(manifest)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + f".tmp-{os.getpid()}-{int(time.time())}")
    tmp.write_text(
        json.dumps(sweep_manifest_to_dict(manifest), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp.replace(out_path)


def failed_sweep_row(
    *,
    row_id: str,
    subprogram: str,
    command: list[str],
    dataset_snapshot_path: Path,
    code: str,
    message: str,
) -> TrainingSweepRow:
    return TrainingSweepRow(
        rowId=row_id,
        subprogram=subprogram,
        status="failed",
        dataset=dataset_snapshot_reference(dataset_snapshot_path),
        command=command,
        error=TrainingSweepError(code=code, message=message),
    )


def blocked_sweep_row(
    *,
    row_id: str,
    subprogram: str,
    command: list[str],
    dataset_snapshot_path: Path,
    code: str,
    message: str,
) -> TrainingSweepRow:
    return TrainingSweepRow(
        rowId=row_id,
        subprogram=subprogram,
        status="blocked",
        dataset=dataset_snapshot_reference(dataset_snapshot_path),
        command=command,
        error=TrainingSweepError(code=code, message=message),
    )


def new_sweep_manifest(
    *,
    sweep_id: str,
    spec_path: Path,
    rows: list[TrainingSweepRow],
    tracker: str | None = None,
) -> TrainingSweepManifest:
    manifest = TrainingSweepManifest(
        schemaVersion=TRAINING_SWEEP_MANIFEST_SCHEMA_VERSION,
        sweepId=sweep_id,
        generatedAt=utc_now_iso(),
        tracker=tracker,
        source=TrainingSweepSource(specPath=spec_path.as_posix(), specSha256=sha256_file(spec_path)),
        rows=rows,
        summary=summarize_sweep_rows(rows),
    )
    assert_training_sweep_manifest_shape(manifest)
    return manifest


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


def _require_url(value: Any, label: str) -> None:
    _require_nonempty_string(value, label)
    if "://" not in value:
        raise ValueError(f"{label} must be an absolute URL")


def _validate_source(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("source must be an object")
    _assert_keys(payload, {"specPath", "specSha256"}, set(), "source")
    _require_nonempty_string(payload["specPath"], "source.specPath")
    _require_sha256(payload["specSha256"], "source.specSha256")


def _validate_dataset_reference(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(
        payload,
        {"snapshotId", "snapshotPath", "snapshotSha256", "datasetSha256"},
        set(),
        label,
    )
    _require_nonempty_string(payload["snapshotId"], f"{label}.snapshotId")
    _require_nonempty_string(payload["snapshotPath"], f"{label}.snapshotPath")
    _require_sha256(payload["snapshotSha256"], f"{label}.snapshotSha256")
    _require_sha256(payload["datasetSha256"], f"{label}.datasetSha256")


def _validate_config_reference(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"path", "sha256"}, set(), label)
    _require_nonempty_string(payload["path"], f"{label}.path")
    _require_sha256(payload["sha256"], f"{label}.sha256")


def _validate_training_run_reference(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(
        payload,
        {"runId", "manifestPath", "manifestSha256", "checkpointSha256"},
        set(),
        label,
    )
    _require_nonempty_string(payload["runId"], f"{label}.runId")
    _require_nonempty_string(payload["manifestPath"], f"{label}.manifestPath")
    _require_sha256(payload["manifestSha256"], f"{label}.manifestSha256")
    _require_sha256(payload["checkpointSha256"], f"{label}.checkpointSha256")


def _validate_experiment_reference(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(
        payload,
        {"tracker", "uri", "runId", "receiptPath", "receiptSha256", "metricsSha256"},
        set(),
        label,
    )
    if payload["tracker"] not in TRACKERS:
        raise ValueError(f"{label}.tracker must be one of {sorted(TRACKERS)}")
    _require_url(payload["uri"], f"{label}.uri")
    _require_nonempty_string(payload["runId"], f"{label}.runId")
    _require_nonempty_string(payload["receiptPath"], f"{label}.receiptPath")
    _require_sha256(payload["receiptSha256"], f"{label}.receiptSha256")
    _require_sha256(payload["metricsSha256"], f"{label}.metricsSha256")


def _validate_metric(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"name", "value"}, {"unit", "higherIsBetter"}, label)
    _require_nonempty_string(payload["name"], f"{label}.name")
    value = payload["value"]
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{label}.value must be a finite number")
    if "unit" in payload:
        _require_nonempty_string(payload["unit"], f"{label}.unit")
    if "higherIsBetter" in payload and not isinstance(payload["higherIsBetter"], bool):
        raise ValueError(f"{label}.higherIsBetter must be boolean")


def _validate_error(payload: Any, label: str) -> None:
    if not isinstance(payload, dict):
        raise ValueError(f"{label} must be an object")
    _assert_keys(payload, {"code", "message"}, set(), label)
    _require_nonempty_string(payload["code"], f"{label}.code")
    _require_nonempty_string(payload["message"], f"{label}.message")


def _validate_summary(payload: Any, rows: list[dict[str, Any]]) -> None:
    if not isinstance(payload, dict):
        raise ValueError("summary must be an object")
    _assert_keys(payload, {"total", "passed", "failed", "skipped", "blocked"}, set(), "summary")
    expected = {
        "total": len(rows),
        "passed": sum(1 for row in rows if row["status"] == "passed"),
        "failed": sum(1 for row in rows if row["status"] == "failed"),
        "skipped": sum(1 for row in rows if row["status"] == "skipped"),
        "blocked": sum(1 for row in rows if row["status"] == "blocked"),
    }
    for key, value in expected.items():
        actual = payload[key]
        if isinstance(actual, bool) or not isinstance(actual, int) or actual < 0:
            raise ValueError(f"summary.{key} must be a nonnegative integer")
        if actual != value:
            raise ValueError(f"summary.{key} must equal {value}")
