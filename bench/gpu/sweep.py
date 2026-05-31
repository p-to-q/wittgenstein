"""Maintainer-run Phase 1 training sweep harness.

This is the #400 receipt floor, not managed GPU CI. It reads a JSON-subset
YAML spec, dispatches each row command locally, and writes one sweep manifest
that indexes DVC dataset snapshots, training-run manifests, and tracker
receipts.

Run the stdlib smoke:
    python3 bench/gpu/sweep.py --spec bench/gpu/smoke-sweep.yaml
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from research.training._shared.data_versioning import (  # noqa: E402
    TrainingDvcRemote,
    build_dataset_snapshot_from_dvc,
    write_training_dataset_snapshot,
)
from research.training._shared.sweep_manifest import (  # noqa: E402
    TRAINING_SWEEP_MANIFEST_SCHEMA_VERSION,
    TrainingSweepManifest,
    TrainingSweepRow,
    TrainingSweepSource,
    blocked_sweep_row,
    build_passed_sweep_row,
    failed_sweep_row,
    summarize_sweep_rows,
    write_training_sweep_manifest,
)
from research.training._shared.manifest import sha256_file, utc_now_iso  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Run a Wittgenstein training sweep spec.")
    parser.add_argument("--spec", type=Path, default=REPO_ROOT / "bench" / "gpu" / "smoke-sweep.yaml")
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("artifacts") / "benchmarks" / "training-sweep.json",
        help="Sweep manifest output path.",
    )
    parser.add_argument(
        "--run-root",
        type=Path,
        default=Path("artifacts") / "benchmarks" / "training-sweep-runs",
        help="Local run-output root passed to stdlib smoke commands.",
    )
    parser.add_argument(
        "--keep-going",
        action="store_true",
        help="Continue after a failed row and record the failure in the sweep manifest.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return nonzero when any row fails. By default the harness writes the receipt and exits 0.",
    )
    args = parser.parse_args()

    spec_path = _resolve(args.spec)
    spec = _load_yamlish(spec_path)
    rows = spec.get("rows")
    if not isinstance(rows, list) or not rows:
        raise SystemExit("sweep spec must contain a nonempty rows list")

    emitted_rows: list[TrainingSweepRow] = []
    for raw_row in rows:
        if not isinstance(raw_row, dict):
            raise SystemExit("each sweep row must be an object")
        row_id = _required_str(raw_row, "rowId")
        subprogram = _required_str(raw_row, "subprogram")
        command = _required_string_list(raw_row, "command")
        dataset_snapshot_path = _write_dataset_snapshot(raw_row)
        row_run_root = _resolve(args.run_root) / row_id
        dispatch_command = _dispatch_command(command, row_run_root, row_id)
        try:
            result = subprocess.run(
                dispatch_command,
                cwd=str(REPO_ROOT),
                capture_output=True,
                text=True,
                check=True,
            )
            summary = _parse_row_receipts(result.stdout, row_id)
            emitted_rows.append(
                build_passed_sweep_row(
                    row_id=row_id,
                    subprogram=subprogram,
                    command=dispatch_command,
                    dataset_snapshot_path=dataset_snapshot_path,
                    training_manifest_path=_resolve(Path(summary["manifestPath"])),
                    experiment_receipt_path=_resolve(Path(summary["experimentReceiptPath"])),
                    metrics=[{"name": "loss", "value": 0.0, "unit": "loss", "higherIsBetter": False}],
                )
            )
            emitted_rows[-1] = _relativize_row_paths(emitted_rows[-1])
        except Exception as exc:
            message = _error_message(exc)
            blocked_code = _blocked_row_error_code(message)
            row_factory = blocked_sweep_row if blocked_code else failed_sweep_row
            emitted_rows.append(
                row_factory(
                    row_id=row_id,
                    subprogram=subprogram,
                    command=dispatch_command,
                    dataset_snapshot_path=dataset_snapshot_path,
                    code=blocked_code or type(exc).__name__,
                    message=message,
                )
            )
            emitted_rows[-1] = _relativize_row_paths(emitted_rows[-1])
            if not args.keep_going and args.strict:
                break

    manifest = TrainingSweepManifest(
        schemaVersion=TRAINING_SWEEP_MANIFEST_SCHEMA_VERSION,
        sweepId=_required_str(spec, "sweepId"),
        generatedAt=utc_now_iso(),
        tracker=spec.get("tracker"),
        source=TrainingSweepSource(specPath=_display_path(spec_path).as_posix(), specSha256=sha256_file(spec_path)),
        rows=emitted_rows,
        summary=summarize_sweep_rows(emitted_rows),
    )
    write_training_sweep_manifest(manifest, _resolve(args.out))
    ok = manifest.summary.failed == 0 and manifest.summary.blocked == 0
    print(json.dumps({"ok": ok, "manifestPath": str(_resolve(args.out))}, indent=2))
    return 1 if args.strict and not ok else 0


def _write_dataset_snapshot(raw_row: dict[str, Any]) -> Path:
    raw_snapshot = raw_row.get("datasetSnapshot")
    if not isinstance(raw_snapshot, dict):
        raise ValueError("row.datasetSnapshot must be an object")
    out_path = _resolve(Path(_required_str(raw_snapshot, "outPath")))
    remote_name = raw_snapshot.get("remoteName")
    remote_url = raw_snapshot.get("remoteUrl")
    snapshot = build_dataset_snapshot_from_dvc(
        snapshot_id=_required_str(raw_snapshot, "snapshotId"),
        dvc_path=_resolve(Path(_required_str(raw_snapshot, "dvcPath"))),
        dataset_name=_required_str(raw_snapshot, "name"),
        split=_required_str(raw_snapshot, "split"),
        role=_required_str(raw_snapshot, "role"),
        license=_required_str(raw_snapshot, "license"),
        uri=raw_snapshot.get("uri"),
        sample_count=raw_snapshot.get("sampleCount"),
        dead_link_rate=raw_snapshot.get("deadLinkRate"),
        remote=(
            TrainingDvcRemote(name=remote_name, url=remote_url)
            if isinstance(remote_name, str) and remote_name
            else None
        ),
        repo_rev_lock=raw_snapshot.get("repoRevLock"),
        repo_root=REPO_ROOT,
    )
    write_training_dataset_snapshot(snapshot, out_path)
    return out_path


def _dispatch_command(command: list[str], run_root: Path, row_id: str) -> list[str]:
    if command[:3] == ["python3", "-m", "research.training._shared.smoke_manifest"]:
        run_root_arg = _display_path(_resolve(run_root)).as_posix()
        return [
            *command,
            "--out-root",
            run_root_arg,
            "--run-id",
            row_id,
        ]
    return command


def _relativize_row_paths(row: TrainingSweepRow) -> TrainingSweepRow:
    return TrainingSweepRow(
        rowId=row.rowId,
        subprogram=row.subprogram,
        status=row.status,
        dataset=_relativize_path_fields(row.dataset, {"snapshotPath"}),
        command=[_display_arg(part) for part in row.command],
        config=(
            _relativize_path_fields(row.config, {"path"}) if row.config is not None else None
        ),
        trainingRun=(
            _relativize_path_fields(row.trainingRun, {"manifestPath"})
            if row.trainingRun is not None
            else None
        ),
        experiment=(
            _relativize_path_fields(row.experiment, {"receiptPath"})
            if row.experiment is not None
            else None
        ),
        metrics=row.metrics,
        error=row.error,
    )


def _relativize_path_fields(payload: dict[str, str], path_fields: set[str]) -> dict[str, str]:
    updated = dict(payload)
    for key in path_fields:
        value = updated.get(key)
        if value:
            updated[key] = _display_path(Path(value)).as_posix()
    return updated


def _display_arg(arg: str) -> str:
    return _display_path(Path(arg)).as_posix() if arg.startswith(str(REPO_ROOT)) else arg


def _parse_row_receipts(stdout: str, row_id: str) -> dict[str, Any]:
    start = stdout.find("{")
    end = stdout.rfind("}")
    if start == -1 or end == -1 or end < start:
        raise ValueError("row command did not print a JSON summary")
    payload = json.loads(stdout[start : end + 1])
    if "run_dir" in payload and "manifestPath" not in payload:
        run_dir = Path(payload["run_dir"])
        manifest_path = run_dir / "ckpts" / "final.manifest.json"
        checkpoint_path = run_dir / "ckpts" / "final.pt"
        payload = {
            **payload,
            "manifestPath": str(manifest_path),
            "checkpointPath": str(checkpoint_path),
            "experimentReceiptPath": str(run_dir / "experiment.json"),
        }
    for key in ("manifestPath", "checkpointPath", "experimentReceiptPath"):
        if not isinstance(payload.get(key), str) or not payload[key]:
            raise ValueError(f"row {row_id} summary missing {key}")
    return payload


def _load_yamlish(path: Path) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8")
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        try:
            import yaml  # type: ignore

            payload = yaml.safe_load(text)
        except ImportError as exc:
            raise RuntimeError(
                f"{path} is not JSON-subset YAML; install PyYAML in the training env for full YAML"
            ) from exc
    if not isinstance(payload, dict):
        raise ValueError("sweep spec must be a mapping")
    return payload


def _resolve(path: Path) -> Path:
    return path if path.is_absolute() else REPO_ROOT / path


def _display_path(path: Path) -> Path:
    resolved = path.resolve() if path.is_absolute() else (REPO_ROOT / path).resolve()
    try:
        return resolved.relative_to(REPO_ROOT)
    except ValueError:
        return path


def _required_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"{key} must be a nonempty string")
    return value


def _required_string_list(payload: dict[str, Any], key: str) -> list[str]:
    value = payload.get(key)
    if not isinstance(value, list) or not value:
        raise ValueError(f"{key} must be a nonempty list")
    for index, item in enumerate(value):
        if not isinstance(item, str) or not item:
            raise ValueError(f"{key}[{index}] must be a nonempty string")
    return value


def _error_message(exc: Exception) -> str:
    if isinstance(exc, subprocess.CalledProcessError):
        stderr = (exc.stderr or "").strip()
        stdout = (exc.stdout or "").strip()
        return stderr or stdout or str(exc)
    return str(exc)


def _blocked_row_error_code(message: str) -> str | None:
    lowered = message.lower()
    missing_modules = {
        "torch": "MISSING_TORCH",
        "torchvision": "MISSING_TORCHVISION",
        "dvc": "MISSING_DVC",
    }
    for module, code in missing_modules.items():
        if f"no module named '{module}'" in lowered or f'no module named "{module}"' in lowered:
            return code
    if "requires torch in the lab environment" in lowered:
        return "MISSING_TORCH"
    if "no gpu available" in lowered or "cuda is not available" in lowered:
        return "NO_GPU"
    if "dvc" in lowered and any(marker in lowered for marker in ("remote", "credential", "pull")):
        return "DVC_REMOTE_UNAVAILABLE"
    return None


if __name__ == "__main__":
    raise SystemExit(main())
