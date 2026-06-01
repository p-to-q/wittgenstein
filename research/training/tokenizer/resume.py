from __future__ import annotations

from pathlib import Path


def resume_start_step(checkpoint_step: int, checkpoint_path: Path) -> int:
    """Return the first global step to run after loading a checkpoint.

    Periodic `step_*.pt` checkpoints are written immediately after that step's
    optimizer update, before the loop increments. Final checkpoints are written
    after the loop exits, so their recorded step is already the next stepCount.
    """
    if checkpoint_path.name.startswith("step_"):
        return checkpoint_step + 1
    return checkpoint_step
