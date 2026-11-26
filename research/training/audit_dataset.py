"""Exhaustive local image/split audit, not a rights or model-quality approval.

    python -m research.training.audit_dataset --train-root /data/train \
        --validation-root /data/val --out-root artifacts/runs/data-audit-001

Requires Pillow, but neither torch, network access, weights nor a GPU. Inputs
are read-only. Each invocation uses fresh output files and exits nonzero for an
incomplete inventory, decode failure, empty split or any exact duplicate group.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import warnings
from collections import defaultdict
from pathlib import Path
from typing import Any

from ._shared.manifest import capture_git_sha, sha256_file, utc_now_iso

_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
_SCHEMA = "witt.research.dataset-audit/v0.1"


def _json_line(value: Any) -> bytes:
    return (
        json.dumps(value, sort_keys=True, ensure_ascii=True, allow_nan=False) + "\n"
    ).encode("utf-8")


def _read_image(path: Path, max_pixels: int) -> dict[str, Any]:
    from PIL import Image

    if path.is_symlink() or not path.is_file():
        raise ValueError("Only regular, non-symlink image files are accepted")
    with path.open("rb") as stream, warnings.catch_warnings():
        warnings.simplefilter("error", Image.DecompressionBombWarning)
        before = os.fstat(stream.fileno())
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
        stream.seek(0)
        with Image.open(stream) as image:
            if image.width * image.height > max_pixels:
                raise ValueError(f"Image exceeds max_pixels={max_pixels}")
            if getattr(image, "n_frames", 1) != 1:
                raise ValueError(
                    "Animated/multi-frame input is not a single-image sample"
                )
            image.load()  # Full decode, not just a successful header read.
            rgb = image.convert("RGB")  # Same color conversion as the training loader.
            pixels = hashlib.sha256(f"RGB:{rgb.width}:{rgb.height}:".encode("ascii"))
            pixels.update(rgb.tobytes())
            result = {
                "bytes": before.st_size,
                "fileSha256": digest,
                "pixelSha256": pixels.hexdigest(),
                "width": rgb.width,
                "height": rgb.height,
            }
        after = os.fstat(stream.fileno())
        current = path.stat()
        if (
            (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            or (current.st_dev, current.st_ino, current.st_size, current.st_mtime_ns)
            != (after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns)
            or path.is_symlink()
        ):
            raise ValueError("Image changed while being audited")
        return result


def audit_splits(
    splits: dict[str, Path | str],
    out_root: Path | str,
    *,
    max_pixels: int = 20_000_000,
) -> dict[str, Any]:
    """Write a deterministic inventory and a local, versioned audit receipt.

    File-byte and decoded-RGB hashes catch exact copies and metadata/encoding
    variants with identical RGB pixels. They do not detect near duplicates,
    common subjects/captions, cropped versions or semantic leakage.
    """
    from PIL import Image
    from PIL import __version__ as pillow_version

    if set(splits) not in ({"train", "validation"}, {"train", "validation", "eval"}):
        raise ValueError("Expected train and validation roots, plus optional eval")
    if type(max_pixels) is not int or max_pixels <= 0:
        raise ValueError("max_pixels must be a positive integer")
    roots = {
        name: Path(root).expanduser().resolve(strict=True)
        for name, root in splits.items()
    }
    out_root = Path(out_root).expanduser().resolve()
    for name, root in roots.items():
        if not root.is_dir():
            raise ValueError(f"{name} root is not a directory: {root}")
        if out_root.is_relative_to(root):
            raise ValueError("Output must be outside all input roots")
        for other_name, other in roots.items():
            if name != other_name and root.is_relative_to(other):
                raise ValueError(f"Split roots overlap: {name} and {other_name}")
    # Exclusive directory creation rejects concurrent/stale runs instead of
    # overwriting a previous pass receipt after a partial new attempt.
    out_root.mkdir(parents=True, exist_ok=False)
    inventory = out_root / "inventory.jsonl"
    receipt = out_root / "dataset-audit.json"

    groups: dict[str, dict[str, list[dict[str, str]]]] = {
        "fileSha256": defaultdict(list),
        "pixelSha256": defaultdict(list),
    }
    summaries = {}
    errors = 0
    examples = []
    tmp = inventory.with_suffix(f".tmp-{os.getpid()}")
    try:
        with tmp.open("xb") as stream:
            for name, root in sorted(roots.items()):
                identity = hashlib.sha256()
                counts = {"images": 0, "decoded": 0, "errors": 0}

                def record_error(path, exc, *, counts=counts, name=name, root=root):
                    nonlocal errors
                    errors += 1
                    counts["errors"] += 1
                    row = {
                        "split": name,
                        "path": str(path.relative_to(root)),
                        "error": {"type": type(exc).__name__, "message": str(exc)},
                    }
                    stream.write(_json_line(row))
                    if len(examples) < 20:
                        examples.append(row)

                def walk_error(exc, *, root=root, record_error=record_error):
                    record_error(Path(exc.filename) if exc.filename else root, exc)

                for directory, dirs, files in os.walk(
                    root, followlinks=False, onerror=walk_error
                ):
                    dirs.sort()
                    files.sort()
                    for entry in list(dirs):
                        path = Path(directory) / entry
                        if path.is_symlink():
                            record_error(
                                path,
                                ValueError(
                                    "Symlink directory prevents a complete inventory"
                                ),
                            )
                            dirs.remove(entry)
                    for entry in files:
                        path = Path(directory) / entry
                        if path.suffix.lower() not in _IMAGE_EXTENSIONS:
                            continue
                        counts["images"] += 1
                        try:
                            sample = _read_image(path, max_pixels)
                        except (
                            OSError,
                            ValueError,
                            SyntaxError,
                            Image.DecompressionBombError,
                            Image.DecompressionBombWarning,
                        ) as exc:
                            record_error(path, exc)
                            continue
                        row = {
                            "split": name,
                            "path": path.relative_to(root).as_posix(),
                            **sample,
                        }
                        raw = _json_line(row)
                        stream.write(raw)
                        identity.update(raw)
                        counts["decoded"] += 1
                        for key in groups:
                            groups[key][sample[key]].append(
                                {"split": name, "path": row["path"]}
                            )
                summaries[name] = {
                    "root": str(root),
                    **counts,
                    "contentSha256": identity.hexdigest(),
                }
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, inventory)
    finally:
        tmp.unlink(missing_ok=True)

    duplicate_groups = 0
    cross_split_groups = 0
    duplicate_examples = []
    for method, hashes in groups.items():
        for digest, members in sorted(hashes.items()):
            if len(members) < 2:
                continue
            duplicate_groups += 1
            cross_split = len({member["split"] for member in members}) > 1
            cross_split_groups += int(cross_split)
            if len(duplicate_examples) < 20:
                duplicate_examples.append(
                    {
                        "method": method,
                        "sha256": digest,
                        "crossSplit": cross_split,
                        "sampleCount": len(members),
                        "samples": members[:20],
                    }
                )
    reasons = []
    if errors:
        reasons.append("incomplete-inventory-or-decode-failure")
    if any(summary["decoded"] == 0 for summary in summaries.values()):
        reasons.append("empty-split")
    if duplicate_groups:
        reasons.append("exact-duplicate-images")
    repo = Path(__file__).resolve().parents[2]
    report = {
        "schemaVersion": _SCHEMA,
        "runId": out_root.name,
        "generatedAt": utc_now_iso(),
        "status": "fail" if reasons else "pass",
        "scope": "file-integrity-and-exact-duplicates-only",
        "failureReasons": reasons,
        "gitSha": capture_git_sha(repo),
        "lockfileSha256": sha256_file(repo / "pnpm-lock.yaml"),
        "auditCodeSha256": sha256_file(Path(__file__)),
        "pillowVersion": pillow_version,
        "pythonVersion": sys.version.split()[0],
        "maxPixels": max_pixels,
        "splits": summaries,
        "errorCount": errors,
        "errorExamples": examples,
        "inventory": {"path": inventory.name, "sha256": sha256_file(inventory)},
        "datasetSha256": hashlib.sha256(
            _json_line({k: v["contentSha256"] for k, v in summaries.items()})
        ).hexdigest(),
        "duplicates": {
            "groupsByHashMethod": duplicate_groups,
            "crossSplitGroupsByHashMethod": cross_split_groups,
            "examples": duplicate_examples,
            "examplesTruncated": duplicate_groups > len(duplicate_examples),
        },
        "notAssessed": [
            "rights-and-consent",
            "near-duplicates-and-semantic-leakage",
            "DVC-remote-restore",
            "token-cache-identity",
            "model-quality",
            "post-audit-mutation",
        ],
    }
    report_tmp = receipt.with_suffix(f".tmp-{os.getpid()}")
    try:
        with report_tmp.open("xb") as stream:
            stream.write(_json_line(report))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(report_tmp, receipt)
    finally:
        report_tmp.unlink(missing_ok=True)
    return report


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--train-root", required=True, type=Path)
    parser.add_argument("--validation-root", required=True, type=Path)
    parser.add_argument("--eval-root", type=Path)
    parser.add_argument("--out-root", required=True, type=Path)
    parser.add_argument("--max-pixels", type=int, default=20_000_000)
    args = parser.parse_args(argv)
    splits = {"train": args.train_root, "validation": args.validation_root}
    if args.eval_root is not None:
        splits["eval"] = args.eval_root
    try:
        report = audit_splits(splits, args.out_root, max_pixels=args.max_pixels)
    except (OSError, ValueError, ImportError, RuntimeError) as exc:
        print(
            json.dumps(
                {"status": "error", "errorType": type(exc).__name__, "reason": str(exc)}
            ),
            file=sys.stderr,
        )
        return 2
    print(
        json.dumps(
            {
                "status": report["status"],
                "receipt": str(args.out_root / "dataset-audit.json"),
                "failureReasons": report["failureReasons"],
            }
        )
    )
    return 0 if report["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
