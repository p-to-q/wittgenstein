"""Feature extraction — must stay in sync with packages/codec-image/src/adapters/mlp-runtime.ts"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Mapping


FEATURE_SCHEMA_SHA256 = "witt.image.adapter.features/sha256-canonical-json-v0"


def canonicalize(value: Any) -> Any:
    if isinstance(value, list):
        return [canonicalize(x) for x in value]
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key in sorted(value.keys()):
            out[key] = canonicalize(value[key])
        return out
    return value


def canonical_json(value: Any) -> str:
    return json.dumps(canonicalize(value), separators=(",", ":"), ensure_ascii=False)


def scene_dict_to_feature_vector(scene: Mapping[str, Any]) -> list[float]:
    """128 floats from SHA-256 of canonical JSON (spec must not include providerLatents)."""
    payload = dict(scene)
    payload.pop("providerLatents", None)
    s = canonical_json(payload)
    digest = hashlib.sha256(s.encode("utf-8")).digest()
    features: list[float] = []
    for i in range(128):
        b = digest[i % 32]
        features.append(b / 127.5 - 1.0)
    return features
