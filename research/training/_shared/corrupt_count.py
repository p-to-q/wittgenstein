"""Gather the corrupt-sample count across DataLoader workers and ranks.

`ImageFolderDataset.corrupt_count` is incremented inside `__getitem__`, which
runs in DataLoader WORKER processes once `num_workers > 0`. The parent's own
copy therefore stays `0`, and `train()` read that parent copy on rank 0 — so
every multi-worker run reported a silent, false `0`.

This module reduces the honest value instead:

  - `num_workers == 0`: the parent owns the counter; read it directly.
  - `num_workers > 0`: read `dataset.corrupt_tally`, a `multiprocessing.Value`
    that every worker increments under a lock. This is exact when workers are
    started by `fork` (the Linux/torchrun default), where the shared value is
    inherited by the child.
  - anything we cannot observe returns `None` ("unknown"), NEVER a false 0.
    This is the repo's "no silent fallback" rule applied to a receipt number.

Stdlib only; torch is imported lazily only for the multi-rank all-reduce.
"""

from __future__ import annotations

from typing import Any


def local_corrupt_count(dataset: Any, *, num_workers: int, start_method: str) -> int | None:
    """Corrupt count observable from THIS process, or None if unknowable."""

    if num_workers <= 0:
        # No worker processes: the dataset's own counter is authoritative.
        return int(getattr(dataset, "corrupt_count", 0))
    tally = getattr(dataset, "corrupt_tally", None)
    if tally is None:
        # Workers exist but there is no channel back to the parent: the parent
        # counter is 0 for a reason that has nothing to do with clean data.
        return None
    if start_method != "fork":
        # A spawn/forkserver worker gets a copy, not the shared value, so the
        # tally would silently stay 0 — report unknown rather than a false 0.
        return None
    return int(tally.value)


def resolve_dataset_corrupt_count(
    dataset: Any,
    *,
    num_workers: int,
    start_method: str,
    world: int = 1,
    device: Any = None,
) -> int | None:
    """Corrupt count reduced across DataLoader workers and DDP ranks."""

    local = local_corrupt_count(dataset, num_workers=num_workers, start_method=start_method)
    if world <= 1:
        return local

    import torch
    import torch.distributed as dist

    if not dist.is_initialized():
        return local
    # All ranks must join the collective. `known` guards against a partial
    # gather: if ANY rank cannot observe its count, the run total is unknown.
    known = 0 if local is None else 1
    tensor = torch.tensor([local or 0, known], dtype=torch.long, device=device)
    dist.all_reduce(tensor, op=dist.ReduceOp.SUM)
    total, observers = int(tensor[0].item()), int(tensor[1].item())
    if observers != world:
        return None
    return total