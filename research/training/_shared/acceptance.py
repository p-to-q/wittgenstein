"""Post-run acceptance receipt — the sibling of the checkpoint manifest.

`train()` computes a run self-check (did the final manifest land, did the final
checkpoint land, was the data synthetic, how many samples were rejected) and,
before this module, `main()` discarded it, so a finished run's self-check was
never citable after the fact. This module persists that block as an atomic
`acceptance.json` next to the run's checkpoints.

The writer is stdlib only (torch-free) so CI can prove the receipt shape
without a GPU, mirroring `_shared/experiment_tracking.py`.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any

from .manifest import utc_now_iso


TRAINING_ACCEPTANCE_SCHEMA_VERSION = "witt.training.acceptance/v0.1"
ACCEPTANCE_FILENAME = "acceptance.json"

_TOP_LEVEL_KEYS = {"schemaVersion", "runId", "generatedAt", "acceptance"}
_REQUIRED_BOOL_FLAGS = (
    "manifest_written",
    "final_checkpoint_written",
    "used_synthetic_data",
)


def acceptance_receipt_to_dict(
    run_id: str,
    acceptance: dict[str, Any],
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    return {
        "schemaVersion": TRAINING_ACCEPTANCE_SCHEMA_VERSION,
        "runId": run_id,
        "generatedAt": generated_at or utc_now_iso(),
        "acceptance": dict(acceptance),
    }


def write_acceptance_receipt(
    run_dir: Path | str, acceptance: dict[str, Any], *, run_id: str = ""
) -> Path:
    """Atomically write `acceptance.json` (tmp -> os.replace).

    Mirrors `write_training_run_manifest` so a crash mid-write never leaves a
    half-written receipt a later reader could mistake for a real one.
    """

    run_dir = Path(run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    payload = acceptance_receipt_to_dict(run_id, acceptance)
    assert_training_acceptance_shape(payload)
    out_path = run_dir / ACCEPTANCE_FILENAME
    tmp = out_path.with_suffix(out_path.suffix + f".tmp-{os.getpid()}-{int(time.time())}")
    tmp.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, out_path)
    return out_path


def assert_training_acceptance_shape(receipt: dict[str, Any]) -> None:
    if not isinstance(receipt, dict):
        raise ValueError("acceptance receipt must be an object")
    actual = set(receipt)
    missing = {"schemaVersion", "acceptance"} - actual
    extra = actual - _TOP_LEVEL_KEYS
    if missing:
        raise ValueError(f"acceptance missing required keys: {sorted(missing)}")
    if extra:
        raise ValueError(f"acceptance has unrecognized keys: {sorted(extra)}")
    if receipt["schemaVersion"] != TRAINING_ACCEPTANCE_SCHEMA_VERSION:
        raise ValueError(
            f"schemaVersion must be {TRAINING_ACCEPTANCE_SCHEMA_VERSION!r}"
        )
    if not isinstance(receipt.get("runId"), str):
        raise ValueError("runId must be a string")
    block = receipt["acceptance"]
    if not isinstance(block, dict):
        raise ValueError("acceptance must be an object")
    for flag in _REQUIRED_BOOL_FLAGS:
        if flag not in block:
            raise ValueError(f"acceptance.{flag} is required")
        if not isinstance(block[flag], bool):
            raise ValueError(f"acceptance.{flag} must be a boolean")
    # `dataset_corrupt_count` is `int | None` on purpose: None means the count
    # could not be observed (see _shared/corrupt_count.py) and MUST NOT be
    # coerced to a false 0.
    count = block.get("dataset_corrupt_count")
    if count is not None and (isinstance(count, bool) or not isinstance(count, int) or count < 0):
        raise ValueError("acceptance.dataset_corrupt_count must be a nonnegative integer or null")