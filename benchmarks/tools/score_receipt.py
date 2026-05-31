"""Shared score-receipt contract for benchmark tools."""
from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

JsonObject = dict[str, Any]


@dataclass(frozen=True)
class ScoreMetric:
    name: str
    value: float
    unit: str


@dataclass(frozen=True)
class ScoreModel:
    id: str
    deterministic: bool


@dataclass(frozen=True)
class ScoreInputs:
    artifact: str
    manifest: str
    prompt: str | None
    raw: JsonObject


@dataclass(frozen=True)
class ScoreReceipt:
    path: Path
    tool: str
    version: str
    metric: ScoreMetric
    model: ScoreModel
    inputs: ScoreInputs
    generated_at: str
    raw: JsonObject

    @property
    def chart_label(self) -> str:
        return Path(self.inputs.artifact).stem or self.path.stem


def load_score_receipts(receipts_dir: Path) -> list[ScoreReceipt]:
    if not receipts_dir.is_dir():
        raise FileNotFoundError(f"Score-receipts directory not found: {receipts_dir}")

    receipts: list[ScoreReceipt] = []
    for path in sorted(receipts_dir.glob("*.json")):
        payload = json.loads(path.read_text())
        receipts.append(parse_score_receipt(path, payload))
    return receipts


def parse_score_receipt(path: Path, payload: Any) -> ScoreReceipt:
    if not isinstance(payload, dict):
        raise ValueError(f"{path}: score receipt must be a JSON object")

    metric = _required_object(path, payload, "metric")
    model = _required_object(path, payload, "model")
    inputs = _required_object(path, payload, "inputs")
    raw_value = metric.get("value")
    if not isinstance(raw_value, (int, float)) or not math.isfinite(raw_value):
        raise ValueError(f"{path}: receipt.metric.value must be a finite number")

    prompt = inputs.get("prompt")
    if prompt is not None and not isinstance(prompt, str):
        raise ValueError(f"{path}: receipt.inputs.prompt must be a string when present")

    deterministic = model.get("deterministic")
    if not isinstance(deterministic, bool):
        raise ValueError(f"{path}: receipt.model.deterministic must be a boolean")

    return ScoreReceipt(
        path=path,
        tool=_required_string(path, payload, "tool"),
        version=_required_string(path, payload, "version"),
        metric=ScoreMetric(
            name=_required_string(path, metric, "name"),
            value=float(raw_value),
            unit=_required_string(path, metric, "unit"),
        ),
        model=ScoreModel(
            id=_required_string(path, model, "id"),
            deterministic=deterministic,
        ),
        inputs=ScoreInputs(
            artifact=_required_string(path, inputs, "artifact"),
            manifest=_required_string(path, inputs, "manifest"),
            prompt=prompt,
            raw=inputs,
        ),
        generated_at=_required_string(path, payload, "generatedAt"),
        raw=payload,
    )


def _required_object(path: Path, payload: JsonObject, key: str) -> JsonObject:
    value = payload.get(key)
    if not isinstance(value, dict):
        raise ValueError(f"{path}: receipt.{key} must be an object")
    return value


def _required_string(path: Path, payload: JsonObject, key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{path}: receipt.{key} must be a non-empty string")
    return value
