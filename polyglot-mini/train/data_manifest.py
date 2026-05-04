"""Dataset manifest helper — pins (input, seed, output) for reproducibility.

Used by build_dataset_coco.py to emit `data_manifest.json` alongside `data.jsonl`.
See docs/reproducibility.md and Issue #114.
"""
from __future__ import annotations

import datetime
import hashlib
import json
import os
import subprocess
from typing import Optional


MANIFEST_VERSION = 1


def _sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _git_sha(cwd: Optional[str] = None) -> Optional[str]:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, check=True, cwd=cwd,
        ).stdout.strip()
        return out or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def prompts_canonical_sha256(prompts: list[str]) -> str:
    """SHA-256 over the sorted, newline-joined prompt list.

    Sorting makes the hash invariant to write-order while still capturing
    set membership. A different sample selection (different seed) produces
    a different hash; the same selection re-emitted produces the same hash.
    """
    canonical = "\n".join(sorted(prompts))
    return _sha256_text(canonical)


def read_prompts_jsonl(path: str) -> list[str]:
    prompts: list[str] = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rec = json.loads(line)
            prompts.append(rec["prompt"])
    return prompts


def build_manifest(
    *,
    output_path: str,
    seed: Optional[int],
    n_requested: Optional[int],
    karpathy_input_path: Optional[str] = None,
    note: Optional[str] = None,
    repo_cwd: Optional[str] = None,
) -> dict:
    """Build the manifest dict from the freshly-written output_path.

    Hashing happens here (not the caller) so the manifest is grounded
    in the actual on-disk artifact, not the in-memory view of it.
    """
    output_sha256 = _sha256_file(output_path)
    prompts = read_prompts_jsonl(output_path)
    n_written = len(prompts)
    prompts_sha = prompts_canonical_sha256(prompts)

    karpathy: dict[str, Optional[str]] = {"path": karpathy_input_path, "sha256": None}
    if karpathy_input_path and os.path.exists(karpathy_input_path):
        karpathy["sha256"] = _sha256_file(karpathy_input_path)

    manifest: dict = {
        "version": MANIFEST_VERSION,
        "generatedBy": "polyglot-mini/train/build_dataset_coco.py",
        "generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "gitSha": _git_sha(repo_cwd),
        "karpathyInput": karpathy,
        "seed": seed,
        "nRequested": n_requested,
        "nWritten": n_written,
        "output": {"path": os.path.basename(output_path), "sha256": output_sha256},
        "promptsSha256": prompts_sha,
    }
    if note:
        manifest["note"] = note
    return manifest


def write_manifest(manifest: dict, manifest_path: str) -> None:
    with open(manifest_path, "w") as f:
        json.dump(manifest, f, indent=2)
        f.write("\n")
