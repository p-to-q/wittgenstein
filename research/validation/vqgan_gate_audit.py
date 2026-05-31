#!/usr/bin/env python3
"""VQGAN-class Gate C/D audit receipt harness.

This stdlib-only harness does not implement the decoder audit itself. It gives
#334 / #335 a stable receipt shape so a contributor with PyTorch, weights, and
ONNX tooling can attach empirical results without inventing a new report format.

Usage from the repository root:

    python -m research.validation.vqgan_gate_audit --out artifacts/m1b-audit/vqgan.json
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = "m1b-vqgan-gate-audit.v0"
DEFAULT_GATE_C_ACCEPTANCE = {
    "mode": "within-device-determinism",
    "min_sample_count": 3,
    "required_encode_consistency": True,
    "required_decode_consistency": True,
    "cross_device_parity": "structural-only",
    "max_reencode_token_hamming_rate": None,
}
DEFAULT_GATE_D_ACCEPTANCE = {
    "max_cpu_decode_seconds": 30.0,
    "output_shape": [256, 256, 3],
    "requires_node": True,
}
GATE_C_PARITY_CHOICES = ("byte-identical", "token-identical", "structural-only")


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def git_sha() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            encoding="utf-8",
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip()


@dataclass(frozen=True)
class GateReceipt:
    gate: str
    tracker: str
    status: str
    required_inputs: list[str]
    command: list[str] | None = None
    metrics: dict[str, Any] = field(default_factory=dict)
    evidence: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class AuditReceipt:
    schema_version: str
    candidate: str
    status: str
    git_sha: str | None
    generated_at: str
    python_version: str
    platform: str
    environment: dict[str, Any]
    gates: list[GateReceipt]


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Write a VQGAN-class M1B gate audit receipt.")
    parser.add_argument("--out", default="artifacts/m1b-audit/vqgan-gates.json")
    parser.add_argument("--candidate", default="vqgan-class/llamagen")
    parser.add_argument("--weights", help="Path to a local decoder/tokenizer weights file.")
    parser.add_argument("--onnx", help="Path to an exported ONNX decoder file.")
    parser.add_argument("--roundtrip-json", help="Optional JSON metrics from a deterministic round-trip run.")
    parser.add_argument("--onnx-json", help="Optional JSON metrics from an ONNX/CPU feasibility run.")
    parser.add_argument("--lab-run-id", help="Lab scheduler/job/run identifier for empirical Gate C/D runs.")
    parser.add_argument("--hardware", help="Machine class or node type used for the audit run.")
    parser.add_argument(
        "--accelerator",
        help="Accelerator class used for the audit run, e.g. A100, H100, MPS, or CPU.",
    )
    parser.add_argument("--torch-version", help="PyTorch version used by the empirical metric producer.")
    parser.add_argument(
        "--onnxruntime-version",
        help="ONNX Runtime version used by the empirical metric producer.",
    )
    parser.add_argument("--cuda-version", help="CUDA version used by the empirical metric producer.")
    parser.add_argument("--driver-version", help="GPU driver version used by the empirical metric producer.")
    parser.add_argument("--gate-c-min-sample-count", type=int, default=3)
    parser.add_argument(
        "--gate-c-cross-device-parity",
        choices=GATE_C_PARITY_CHOICES,
        default="structural-only",
        help="Measured CPU/GPU parity class required by the decoder-family manifest.",
    )
    parser.add_argument(
        "--gate-c-max-reencode-token-hamming-rate",
        type=float,
        help="Optional hard cap for encode->decode->re-encode token drift. Omit to keep it advisory.",
    )
    parser.add_argument("--gate-d-max-cpu-decode-seconds", type=float, default=30.0)
    parser.add_argument("--gate-d-output-shape", default="256,256,3", help="Expected H,W,C output shape.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    acceptance = build_acceptance(args)
    gates = [
        build_gate_c(args.weights, args.roundtrip_json, acceptance["gate_c"]),
        build_gate_d(args.weights, args.onnx, args.onnx_json, acceptance["gate_d"]),
    ]
    status = "passed" if all(gate.status == "passed" for gate in gates) else "blocked"
    receipt = AuditReceipt(
        schema_version=SCHEMA_VERSION,
        candidate=args.candidate,
        status=status,
        git_sha=git_sha(),
        generated_at=utc_now_iso(),
        python_version=platform.python_version(),
        platform=platform.platform(),
        environment=build_environment(args),
        gates=gates,
    )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(asdict(receipt), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(out_path)
    return 0


def build_environment(args: argparse.Namespace) -> dict[str, Any]:
    return compact_dict(
        {
            "labRunId": args.lab_run_id or os.environ.get("WITTGENSTEIN_LAB_RUN_ID"),
            "hardware": args.hardware or os.environ.get("WITTGENSTEIN_AUDIT_HARDWARE"),
            "accelerator": args.accelerator or os.environ.get("WITTGENSTEIN_AUDIT_ACCELERATOR"),
            "torchVersion": args.torch_version or os.environ.get("WITTGENSTEIN_AUDIT_TORCH_VERSION"),
            "onnxRuntimeVersion": args.onnxruntime_version
            or os.environ.get("WITTGENSTEIN_AUDIT_ONNXRUNTIME_VERSION"),
            "cudaVersion": args.cuda_version or os.environ.get("WITTGENSTEIN_AUDIT_CUDA_VERSION"),
            "driverVersion": args.driver_version or os.environ.get("WITTGENSTEIN_AUDIT_DRIVER_VERSION"),
        }
    )


def compact_dict(values: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in values.items() if value}


def build_acceptance(args: argparse.Namespace) -> dict[str, dict[str, Any]]:
    if args.gate_c_min_sample_count < 1:
        raise SystemExit("--gate-c-min-sample-count must be >= 1")
    if args.gate_d_max_cpu_decode_seconds <= 0:
        raise SystemExit("--gate-d-max-cpu-decode-seconds must be > 0")
    return {
        "gate_c": {
            **DEFAULT_GATE_C_ACCEPTANCE,
            "min_sample_count": args.gate_c_min_sample_count,
            "cross_device_parity": args.gate_c_cross_device_parity,
            "max_reencode_token_hamming_rate": args.gate_c_max_reencode_token_hamming_rate,
        },
        "gate_d": {
            **DEFAULT_GATE_D_ACCEPTANCE,
            "max_cpu_decode_seconds": args.gate_d_max_cpu_decode_seconds,
            "output_shape": parse_shape(args.gate_d_output_shape, 3, "--gate-d-output-shape"),
        },
    }


def parse_shape(value: str, length: int, flag: str) -> list[int]:
    try:
        parsed = [int(part.strip()) for part in value.split(",") if part.strip()]
    except ValueError as error:
        raise SystemExit(f"{flag} must contain {length} positive integers.") from error
    if len(parsed) != length or any(part <= 0 for part in parsed):
        raise SystemExit(f"{flag} must contain {length} positive integers.")
    return parsed


def build_gate_c(
    weights: str | None,
    metrics_path: str | None,
    acceptance: dict[str, Any] | None = None,
) -> GateReceipt:
    acceptance = acceptance or DEFAULT_GATE_C_ACCEPTANCE
    required_inputs = [
        "local PyTorch environment",
        "SHA-pinned VQGAN-class weights",
        "within-device encode/decode determinism metric JSON",
        "measured CPU/GPU parity class",
    ]
    if not weights or not Path(weights).exists():
        return GateReceipt(
            gate="C",
            tracker="https://github.com/p-to-q/wittgenstein/issues/334",
            status="skipped",
            required_inputs=required_inputs,
            notes=["Weights path missing; deterministic round-trip was not attempted."],
        )

    metrics = load_metrics(metrics_path)
    metrics.setdefault("cross_device_parity", acceptance["cross_device_parity"])
    pass_check = gate_c_passes(metrics, acceptance)
    status = "passed" if pass_check["passed"] else "blocked"
    return GateReceipt(
        gate="C",
        tracker="https://github.com/p-to-q/wittgenstein/issues/334",
        status=status,
        required_inputs=required_inputs,
        command=["python3", "-m", "research.validation.vqgan_gate_audit", "--weights", weights],
        metrics={**metrics, "pass_check": pass_check},
        evidence=[weights, *([metrics_path] if metrics_path else [])],
        notes=[gate_c_policy_note(acceptance)],
    )


def build_gate_d(
    weights: str | None,
    onnx: str | None,
    metrics_path: str | None,
    acceptance: dict[str, Any] | None = None,
) -> GateReceipt:
    acceptance = acceptance or DEFAULT_GATE_D_ACCEPTANCE
    required_inputs = [
        "local PyTorch export environment",
        "SHA-pinned VQGAN-class weights",
        "exported ONNX decoder",
        "Node/ONNX CPU smoke metric JSON",
    ]
    if not weights or not Path(weights).exists():
        return GateReceipt(
            gate="D",
            tracker="https://github.com/p-to-q/wittgenstein/issues/335",
            status="skipped",
            required_inputs=required_inputs,
            notes=["Weights path missing; ONNX export was not attempted."],
        )
    if not onnx or not Path(onnx).exists():
        return GateReceipt(
            gate="D",
            tracker="https://github.com/p-to-q/wittgenstein/issues/335",
            status="blocked",
            required_inputs=required_inputs,
            notes=["ONNX path missing; export/CPU feasibility is still open."],
        )

    metrics = load_metrics(metrics_path)
    node_available = shutil.which("node") is not None
    pass_check = gate_d_passes(metrics, node_available, acceptance)
    status = "passed" if pass_check["passed"] else "blocked"
    return GateReceipt(
        gate="D",
        tracker="https://github.com/p-to-q/wittgenstein/issues/335",
        status=status,
        required_inputs=required_inputs,
        command=[
            "python3",
            "-m",
            "research.validation.vqgan_gate_audit",
            "--weights",
            weights,
            "--onnx",
            onnx,
        ],
        metrics={"node_available": node_available, **metrics, "pass_check": pass_check},
        evidence=[weights, onnx, *([metrics_path] if metrics_path else [])],
        notes=[
            "Gate D passes only with onnx_cpu_passed=true, Node present, "
            f"cpu_decode_seconds<={acceptance['max_cpu_decode_seconds']}, "
            f"and output_shape={acceptance['output_shape']}.",
        ],
    )


def gate_c_policy_note(acceptance: dict[str, Any]) -> str:
    base = (
        "Gate C passes with encode_consistent=true, decode_consistent=true, "
        f"sample_count>={acceptance['min_sample_count']}, and "
        f"cross_device_parity={acceptance['cross_device_parity']!r}."
    )
    max_hamming = acceptance.get("max_reencode_token_hamming_rate")
    if max_hamming is None:
        return base + " Re-encode token_hamming_rate is advisory for non-fixed-point VQ tokenizers."
    return base + f" Re-encode token_hamming_rate must be <= {max_hamming}."


def load_metrics(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    metrics_path = Path(path)
    if not metrics_path.exists():
        return {"metrics_error": f"metrics file not found: {path}"}
    try:
        parsed = json.loads(metrics_path.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError) as error:
        return {"metrics_error": f"invalid JSON: {error}"}
    if not isinstance(parsed, dict):
        return {"metrics_error": "metrics JSON must be an object"}
    return parsed


def gate_c_passes(metrics: dict[str, Any], acceptance: dict[str, Any] | None = None) -> dict[str, Any]:
    acceptance = acceptance or DEFAULT_GATE_C_ACCEPTANCE
    sample_count = metrics.get("sample_count")
    token_hamming_rate = metrics.get("reencode_token_hamming_rate", metrics.get("token_hamming_rate"))
    max_hamming = acceptance.get("max_reencode_token_hamming_rate")
    hamming_passed = max_hamming is None or (
        isinstance(token_hamming_rate, (int, float)) and float(token_hamming_rate) <= float(max_hamming)
    )
    passed = (
        (metrics.get("encode_consistent") is True or metrics.get("roundtrip_passed") is True)
        and (metrics.get("decode_consistent") is True or metrics.get("roundtrip_passed") is True)
        and metrics.get("cross_device_parity") == acceptance["cross_device_parity"]
        and isinstance(sample_count, int)
        and sample_count >= acceptance["min_sample_count"]
        and hamming_passed
    )
    return {
        "passed": passed,
        "required": {
            "mode": acceptance["mode"],
            "encode_consistent": True,
            "decode_consistent": True,
            "sample_count_min": acceptance["min_sample_count"],
            "cross_device_parity": acceptance["cross_device_parity"],
            "reencode_token_hamming_rate_max": max_hamming,
            "reencode_token_hamming_rate_hard_blocker": max_hamming is not None,
        },
    }


def gate_d_passes(
    metrics: dict[str, Any],
    node_available: bool,
    acceptance: dict[str, Any] | None = None,
) -> dict[str, Any]:
    acceptance = acceptance or DEFAULT_GATE_D_ACCEPTANCE
    cpu_decode_seconds = metrics.get("cpu_decode_seconds")
    output_shape = metrics.get("output_shape")
    passed = (
        node_available
        and metrics.get("onnx_cpu_passed") is True
        and isinstance(cpu_decode_seconds, (int, float))
        and float(cpu_decode_seconds) <= acceptance["max_cpu_decode_seconds"]
        and output_shape == acceptance["output_shape"]
    )
    return {
        "passed": passed,
        "required": {
            "node_available": True,
            "onnx_cpu_passed": True,
            "cpu_decode_seconds_max": acceptance["max_cpu_decode_seconds"],
            "output_shape": acceptance["output_shape"],
        },
    }


if __name__ == "__main__":
    raise SystemExit(main())
