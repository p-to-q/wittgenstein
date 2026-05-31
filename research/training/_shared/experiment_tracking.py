"""Experiment-tracker receipts for training runs.

The canonical TrainingRunManifest remains strict and does not carry a
freeform `experiment` block. Tracker linkage lives in this sibling receipt so
Aim/W&B/MLflow can be added without changing the checkpoint receipt shape.

The `jsonl` tracker is the stdlib floor: it gives CI and CPU smoke tests a
real metrics log and receipt without requiring an Aim server.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from .manifest import SHA256_RE, sha256_file, utc_now_iso


TRAINING_EXPERIMENT_RECEIPT_SCHEMA_VERSION = "witt.training.experiment/v0.1"
TRACKERS = {"aim", "wandb", "mlflow", "jsonl"}


@dataclass(frozen=True)
class TrainingExperimentMetricLog:
    path: str
    sha256: str
    bytes: int


@dataclass(frozen=True)
class TrainingExperimentManifestReference:
    runId: str
    manifestPath: str
    manifestSha256: str
    checkpointSha256: str


@dataclass(frozen=True)
class TrainingExperimentReceipt:
    schemaVersion: str
    tracker: str
    uri: str
    runId: str
    trainingRunId: str
    startedAt: str
    finishedAt: str | None
    metricsLog: TrainingExperimentMetricLog
    manifest: TrainingExperimentManifestReference | None = None


class JsonlExperimentTracker:
    """Small local tracker used by smoke tests and offline training runs."""

    def __init__(self, run_dir: Path, training_run_id: str):
        self.run_dir = run_dir
        self.training_run_id = training_run_id
        self.run_id = f"jsonl-{training_run_id}"
        self.started_at = utc_now_iso()
        self.metrics_path = run_dir / "experiment-metrics.jsonl"
        self.receipt_path = run_dir / "experiment.json"
        run_dir.mkdir(parents=True, exist_ok=True)
        self.metrics_path.touch(exist_ok=True)
        self.write_receipt()

    def config_reference(self) -> dict[str, str]:
        return {
            "tracker": "jsonl",
            "runId": self.run_id,
            "trainingRunId": self.training_run_id,
            "receiptPath": str(self.receipt_path),
            "metricsLogPath": str(self.metrics_path),
            "uri": self.metrics_path.resolve().as_uri(),
        }

    def log_params(self, params: dict[str, Any]) -> None:
        self._append({"type": "params", "at": utc_now_iso(), "params": params})

    def log_metrics(self, step: int, metrics: dict[str, Any]) -> None:
        self._append({"type": "metrics", "at": utc_now_iso(), "step": step, "metrics": metrics})

    def finish(self, manifest: TrainingExperimentManifestReference | None = None) -> None:
        self.write_receipt(finished_at=utc_now_iso(), manifest=manifest)

    def write_receipt(
        self,
        *,
        finished_at: str | None = None,
        manifest: TrainingExperimentManifestReference | None = None,
    ) -> None:
        metrics = TrainingExperimentMetricLog(
            path=str(self.metrics_path),
            sha256=sha256_file(self.metrics_path),
            bytes=self.metrics_path.stat().st_size,
        )
        receipt = TrainingExperimentReceipt(
            schemaVersion=TRAINING_EXPERIMENT_RECEIPT_SCHEMA_VERSION,
            tracker="jsonl",
            uri=self.metrics_path.resolve().as_uri(),
            runId=self.run_id,
            trainingRunId=self.training_run_id,
            startedAt=self.started_at,
            finishedAt=finished_at,
            metricsLog=metrics,
            manifest=manifest,
        )
        assert_training_experiment_receipt_shape(receipt)
        payload = experiment_receipt_to_dict(receipt)
        self.receipt_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    def _append(self, payload: dict[str, Any]) -> None:
        with self.metrics_path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, sort_keys=True) + "\n")


def experiment_receipt_to_dict(
    receipt: TrainingExperimentReceipt | dict[str, Any],
) -> dict[str, Any]:
    payload = asdict(receipt) if isinstance(receipt, TrainingExperimentReceipt) else dict(receipt)
    if payload.get("manifest") is None:
        payload.pop("manifest", None)
    return payload


def assert_training_experiment_receipt_shape(receipt: TrainingExperimentReceipt | dict[str, Any]) -> None:
    payload = experiment_receipt_to_dict(receipt)
    required = {
        "schemaVersion",
        "tracker",
        "uri",
        "runId",
        "trainingRunId",
        "startedAt",
        "finishedAt",
        "metricsLog",
    }
    optional = {"manifest"}
    _assert_keys(payload, required, optional, "experiment")
    if payload["schemaVersion"] != TRAINING_EXPERIMENT_RECEIPT_SCHEMA_VERSION:
        raise ValueError("schemaVersion must be witt.training.experiment/v0.1")
    if payload["tracker"] not in TRACKERS:
        raise ValueError(f"tracker must be one of {sorted(TRACKERS)}")
    if "://" not in payload["uri"]:
        raise ValueError("uri must be an absolute URL")
    for key in ("runId", "trainingRunId", "startedAt"):
        if not isinstance(payload[key], str) or not payload[key]:
            raise ValueError(f"{key} must be a nonempty string")
    started_at = _parse_iso_timestamp(payload["startedAt"], "startedAt")
    if payload["finishedAt"] is not None and not isinstance(payload["finishedAt"], str):
        raise ValueError("finishedAt must be null or an ISO timestamp string")
    if payload["finishedAt"] is not None:
        finished_at = _parse_iso_timestamp(payload["finishedAt"], "finishedAt")
        if finished_at < started_at:
            raise ValueError("finishedAt must be greater than or equal to startedAt")
    _validate_metric_log(payload["metricsLog"])
    if "manifest" in payload:
        _validate_manifest_reference(payload["manifest"])


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


def _validate_metric_log(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("metricsLog must be an object")
    _assert_keys(payload, {"path", "sha256", "bytes"}, set(), "metricsLog")
    if not payload["path"]:
        raise ValueError("metricsLog.path must be nonempty")
    _require_sha256(payload["sha256"], "metricsLog.sha256")
    if isinstance(payload["bytes"], bool) or not isinstance(payload["bytes"], int) or payload["bytes"] < 0:
        raise ValueError("metricsLog.bytes must be a nonnegative integer")


def _validate_manifest_reference(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ValueError("manifest must be an object")
    _assert_keys(
        payload,
        {"runId", "manifestPath", "manifestSha256", "checkpointSha256"},
        set(),
        "manifest",
    )
    if not payload["runId"] or not payload["manifestPath"]:
        raise ValueError("manifest.runId and manifest.manifestPath must be nonempty")
    _require_sha256(payload["manifestSha256"], "manifest.manifestSha256")
    _require_sha256(payload["checkpointSha256"], "manifest.checkpointSha256")


def _parse_iso_timestamp(value: str, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError(f"{label} must be an ISO timestamp string") from exc
    if parsed.tzinfo is None:
        raise ValueError(f"{label} must include a timezone offset")
    return parsed


def _require_sha256(value: Any, label: str) -> None:
    if not isinstance(value, str) or not SHA256_RE.match(value):
        raise ValueError(f"{label} must be a 64-char lowercase sha256 hex string")
