#!/usr/bin/env python3
"""Produce Gate D ONNX Runtime CPU feasibility metrics.

This script performs inference only. It assumes the decoder ONNX file has
already been exported by the lab environment and checks that CPU execution
produces a 256x256 RGB output within the M1B threshold.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Write M1B Gate D ONNX/CPU metrics.")
    parser.add_argument("--out", default="artifacts/m1b-audit/gate-d-onnx-cpu.json")
    parser.add_argument("--onnx", required=True, help="Path to exported decoder ONNX file.")
    parser.add_argument("--token-grid", default="16,16", help="Token grid as H,W.")
    parser.add_argument("--output-shape", default="256,256,3", help="Expected output shape as H,W,C.")
    parser.add_argument("--codebook-size", type=int, default=16384)
    parser.add_argument("--sample-count", type=int, default=3)
    parser.add_argument("--warmup-count", type=int, default=1)
    parser.add_argument("--input-name", help="Override ONNX input name.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.sample_count < 1:
        raise SystemExit("--sample-count must be >= 1")

    ort = import_onnxruntime()
    np = import_numpy()
    token_grid = parse_shape(args.token_grid, 2, "--token-grid")
    expected_shape = parse_shape(args.output_shape, 3, "--output-shape")
    session = ort.InferenceSession(str(Path(args.onnx).resolve()), providers=["CPUExecutionProvider"])
    input_meta = pick_input(session, args.input_name)
    tokens = deterministic_tokens(np, input_meta, token_grid, args.codebook_size)

    for _ in range(args.warmup_count):
        session.run(None, {input_meta.name: tokens})

    timings = []
    output = None
    for _ in range(args.sample_count):
        started = time.perf_counter()
        outputs = session.run(None, {input_meta.name: tokens})
        timings.append(time.perf_counter() - started)
        output = outputs[0]

    output_array = normalize_output(np, output)
    observed_shape = list(output_array.shape)
    max_seconds = max(timings)
    onnx_cpu_passed = observed_shape == expected_shape and max_seconds <= 30.0

    write_json(
        Path(args.out),
        {
            "schema_version": "m1b-gate-d-onnx-cpu-metrics.v0",
            "generated_at": utc_now_iso(),
            "onnx_cpu_passed": onnx_cpu_passed,
            "cpu_decode_seconds": max_seconds,
            "cpu_decode_seconds_all": timings,
            "output_shape": observed_shape,
            "output_sha256": sha256(output_array.tobytes(order="C")),
            "sample_count": args.sample_count,
            "environment": {
                "python_version": platform.python_version(),
                "platform": platform.platform(),
                "onnxruntime_version": ort.__version__,
                "providers": session.get_providers(),
            },
            "inputs": {
                "onnx": str(Path(args.onnx).resolve()),
                "onnx_sha256": file_sha256(Path(args.onnx)),
                "input_name": input_meta.name,
                "input_shape": input_shape_for_json(input_meta.shape),
                "input_dtype": input_meta.type,
                "token_grid": token_grid,
                "expected_output_shape": expected_shape,
            },
        },
    )
    print(args.out)
    return 0 if onnx_cpu_passed else 1


def import_onnxruntime():
    try:
        import onnxruntime as ort  # type: ignore
    except ImportError as error:
        raise SystemExit("Gate D requires onnxruntime in the lab environment.") from error
    return ort


def import_numpy():
    try:
        import numpy as np  # type: ignore
    except ImportError as error:
        raise SystemExit("Gate D requires numpy in the lab environment.") from error
    return np


def parse_shape(value: str, length: int, flag: str) -> list[int]:
    try:
        parsed = [int(part.strip()) for part in value.split(",") if part.strip()]
    except ValueError as error:
        raise SystemExit(f"{flag} must contain {length} positive integers.") from error
    if len(parsed) != length or any(part <= 0 for part in parsed):
        raise SystemExit(f"{flag} must contain {length} positive integers.")
    return parsed


def pick_input(session: Any, input_name: str | None) -> Any:
    inputs = session.get_inputs()
    if not inputs:
        raise SystemExit("ONNX model has no inputs.")
    if input_name is None:
        return inputs[0]
    for item in inputs:
        if item.name == input_name:
            return item
    raise SystemExit(f"Input {input_name!r} not found. Available: {[item.name for item in inputs]}")


def deterministic_tokens(np: Any, input_meta: Any, token_grid: list[int], codebook_size: int) -> Any:
    shape = concrete_input_shape(input_meta.shape, token_grid)
    total = int(np.prod(shape))
    values = np.arange(total, dtype=np.int64).reshape(shape) % codebook_size
    if "int64" in input_meta.type:
        return values.astype(np.int64)
    if "int32" in input_meta.type:
        return values.astype(np.int32)
    return values.astype(np.float32)


def concrete_input_shape(input_shape: list[Any], token_grid: list[int]) -> list[int]:
    if len(input_shape) == 4:
        return [1, 1, token_grid[0], token_grid[1]]
    if len(input_shape) == 3:
        return [1, token_grid[0], token_grid[1]]
    if len(input_shape) == 2:
        return [1, token_grid[0] * token_grid[1]]
    return [1, token_grid[0] * token_grid[1]]


def normalize_output(np: Any, output: Any) -> Any:
    array = np.asarray(output)
    if array.ndim == 4 and array.shape[0] == 1:
        array = array[0]
    if array.ndim == 3 and array.shape[0] in (1, 3):
        array = np.transpose(array, (1, 2, 0))
    return array


def input_shape_for_json(shape: list[Any]) -> list[Any]:
    return [item if isinstance(item, int) else str(item) for item in shape]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
