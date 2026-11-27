"""Tokenizer checkpoint resume: payload schema, args-drift guard, RNG hooks.

`resume_start_step` is the original 15-line contract consumed by
`tokenizer/train.py` (L281): a periodic `step_*.pt` checkpoint is written
immediately after that step's optimizer update, so the first step to run next
is `step + 1`; a `final.pt` is written after the loop exits, so its recorded
step is already the next stepCount. wittgenstein's step/final distinction is
*more* precise than upstream's — keep it.

The extensions below (E1–E5) harden resume against three defects that are
present in the upstream LlamaGen trainer this stack mirrors. Each extension
exists only because of the specific upstream behavior named here; the pointers
are to upstream, not to wittgenstein:

  * Upstream save block: `autoregressive/train/train_t2i.py` L195–L216 writes a
    four-piece payload `{model, optimizer, steps, args}` on rank 0 behind a
    `dist.barrier()` (the VQ tokenizer variant,
    `tokenizer/tokenizer_image/vq_train.py` L239–L263, adds a six-piece set
    with `discriminator` / `optimizer_disc` and an optional `ema`).
  * Upstream resume block: `train_t2i.py` L118–L127.

  Hidden defect #1 — step inference from the filename. Upstream reads
  `steps = checkpoint["steps"] if "steps" in checkpoint else int(
  args.gpt_ckpt.split('/')[-1].split('.')[0])` and then *snaps* `start_epoch`
  back to an epoch boundary, re-running up to one epoch of already-trained
  steps. E5 refuses the filename guess outright (a missing `step`/`steps` key
  raises `RESUME_STEPS_MISSING`); it never derives the step from the path.

  Hidden defect #2 — RNG state is never saved or restored. Upstream restores
  the model + optimizer but not the RNG generators, so a resumed run silently
  diverges from an uninterrupted one. E3 provides capture/restore hooks and
  emits an explicit warning when an old checkpoint carries no RNG state.

  Hidden defect #3 — no args-drift detection. Upstream blind-loads optimizer
  state and never checks that `args` changed between runs, so an lr/beta/batch
  change mid-run masquerades as training noise. E2 compares a curated set of
  math-relevant fields and raises a typed error listing every drifted key.

E1 is the typed loader that makes the four-piece set explicit (`model`,
`optimizer` + the step, and `args`) and fails closed — naming the path and
every missing key — instead of raising a bare `KeyError` deep in the loop.
E2 adds `assert_args_compatible`; E4 exposes `resume_metadata` so a supervisor
can log the *original* run id (read from the checkpoint payload or its sibling
`*.manifest.json`) instead of minting a fresh one; E6 is this docstring.

The training loop wires to this module through two thin seams so the guarantees
are unit-testable without importing the (torch-heavy) `train.py` entrypoint:
`build_checkpoint_payload` (the D1 writer that adds the `args` snapshot and, for
E3, the `rng` entry) and `load_for_resume` (load + E2 drift check + E4 run id,
called before the loop continues). The loop captures torch/CUDA/numpy/python RNG
state on save and restores it before the first post-resume step. Because only
rank 0 writes checkpoints, the saved state is rank-tagged; a resume on another
rank refuses to adopt it (`RESUME_RNG_RANK_MISMATCH`) rather than de-sync the
per-rank lineages — that is the DDP branch, and bit-identical multi-rank restore
would need a gathered per-rank map (see the E3 notes in the commit).

Design constraints kept deliberately:

  * This module stays torch-free at import time. `load_checkpoint` imports
    torch lazily (only when called) and `load_checkpoint_payload` validates an
    already-deserialized mapping, so schema/drift/RNG logic is testable without
    a torch install. `_shared`/`tokenizer.train` still own serialization.
  * `load_checkpoint_payload` accepts either wittgenstein's `"step"` key
    (`tokenizer/train.py` L682) or upstream's `"steps"` key, normalizing to a
    single `step` field, so receipts stay comparable across both lineages.
  * RNG states are opaque objects (torch `ByteTensor`, numpy tuple, python
    tuple). Callers inject the torch/numpy modules, so this module never has to
    import them; only stdlib `random` is touched, and only inside the hooks.
"""

from __future__ import annotations

import dataclasses
import hashlib
import json
import math
import os
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from research.training._shared.manifest import assert_training_run_manifest_shape

# ---- Upstream-aligned payload keys ----------------------------------------

#: wittgenstein writes the singular key; upstream writes the plural. Both are
#: accepted on load and normalized to `LoadedCheckpoint.step`.
STEP_KEYS: tuple[str, ...] = ("step", "steps")

ARGS_KEY = "args"
MODEL_KEY = "model"
OPTIMIZER_KEY = "optimizer"
DISCRIMINATOR_KEY = "discriminator"
DISC_OPTIMIZER_KEY = "disc_optimizer"
EMA_KEY = "ema"
RNG_KEY = "rng"
RUN_ID_KEY = "run_id"

#: Sibling manifest written next to every checkpoint by `tokenizer/train.py`
#: (`_write_checkpoint`); the honest source of run-id continuity on resume.
MANIFEST_SUFFIX = ".manifest.json"

#: Curated math-relevant `args` fields (dotted paths into the flattened config).
#: Only these are drift-checked: changing any of them mid-run invalidates the
#: optimizer/step state and produces a resume that is not the same experiment.
#: Non-math fields (paths, logging cadence, docker/aim) are intentionally not
#: compared — retargeting an output dir is not training drift.
MATH_RELEVANT_ARGS: tuple[str, ...] = (
    "seed",
    "smoke",
    "train_data_root",
    "dataset_license",
    "lpips_enabled",
    "lpips_net",
    "max_steps",
    "batch_size_per_gpu",
    "image_size",
    "optim.lr",
    "optim.beta1",
    "optim.beta2",
    "optim.weight_decay",
    "optim.warmup_steps",
    "optim.grad_clip_norm",
    "tokenizer.codebook_size",
    "tokenizer.codebook_embed_dim",
    "tokenizer.codebook_l2_norm",
    "tokenizer.image_size",
    "tokenizer.commit_loss_beta",
    "tokenizer.entropy_loss_ratio",
    "gan_enabled",
    "gan_on_step",
    "gan_weight",
    "disc_base_channels",
    "disc_n_layers",
    "disc_lr",
)

ABSENT = "<absent>"


# ---- Typed errors ----------------------------------------------------------
# The repo's Python side raises stdlib exceptions with explicit messages and
# stable string codes (see `_shared/manifest.py`). We do the same, with a small
# hierarchy so callers can branch on `exc.code` rather than parse prose.


class ResumeError(RuntimeError):
    """Base class for every resume failure; carries a stable `code`."""

    code = "RESUME_ERROR"

    def __init__(self, message: str, *, path: str | None = None) -> None:
        super().__init__(message)
        self.path = path


class ResumeIntegrityError(ResumeError):
    """The selected checkpoint/receipt pair cannot be read consistently."""

    code = "RESUME_INTEGRITY_INVALID"


class ResumeStepsMissing(ResumeError):
    """The payload has no `step`/`steps` key; we never guess from the filename."""

    code = "RESUME_STEPS_MISSING"


class ResumeArgsMissing(ResumeError):
    """The payload has no `args` snapshot (pre-D1 checkpoints)."""

    code = "RESUME_ARGS_MISSING"


class ResumeQuartetIncomplete(ResumeError):
    """The four-piece set {model, optimizer, step, args} is incomplete."""

    code = "RESUME_QUARTET_INCOMPLETE"

    def __init__(self, message: str, *, path: str | None = None, missing: Iterable[str] = ()) -> None:
        super().__init__(message, path=path)
        self.missing = tuple(missing)


class ResumeArgsDrift(ResumeError):
    """The stored `args` snapshot differs from the current run on a math field."""

    code = "RESUME_ARGS_DRIFT"

    def __init__(self, message: str, *, drifted: Mapping[str, tuple[Any, Any]]) -> None:
        super().__init__(message, path=None)
        self.drifted = dict(drifted)


class ResumeOptimizerDrift(ResumeError):
    """Saved AdamW groups contradict the currently configured mathematical profile."""

    code = "RESUME_OPTIMIZER_DRIFT"


class ResumeOptimizerStateInvalid(ResumeError):
    """Saved AdamW state cannot represent a valid continuation of this run."""

    code = "RESUME_OPTIMIZER_STATE_INVALID"


class ResumeDatasetDrift(ResumeError):
    """The current corpus no longer matches the selected checkpoint's receipt."""

    code = "RESUME_DATASET_DRIFT"


# ---- Warning codes (warning-level signals, never silent) -------------------

WARN_ARGS_MISSING = "RESUME_ARGS_MISSING"
WARN_OPTIMIZER_MISSING = "RESUME_OPTIMIZER_MISSING"
WARN_RNG_MISSING = "RESUME_RNG_MISSING"
WARN_RNG_MODULE_MISSING = "RESUME_RNG_MODULE_MISSING"
WARN_RNG_RANK_MISMATCH = "RESUME_RNG_RANK_MISMATCH"
WARN_RNG_STATE_UNSUPPORTED = "RESUME_RNG_STATE_UNSUPPORTED"
WARN_RUN_ID_MISSING = "RESUME_RUN_ID_MISSING"


# ---- RNG hooks (E3) --------------------------------------------------------


@dataclass(frozen=True)
class RngState:
    """Opaque RNG states captured at checkpoint time.

    Values are the generators' native state objects (torch `ByteTensor`, its
    CUDA sibling list, numpy tuple, python `tuple`). `torch`/`numpy` are never
    imported here. `rank` records which process produced the state so a resumed
    rank can refuse to adopt a foreign rank's stream.
    """

    python: Any | None = None
    torch: Any | None = None
    cuda: Any | None = None
    numpy: Any | None = None
    rank: int | None = None

    def is_empty(self) -> bool:
        return (
            self.python is None
            and self.torch is None
            and self.cuda is None
            and self.numpy is None
        )


def capture_python_rng_state() -> Any:
    """Return the stdlib `random` generator state (stdlib only)."""
    import random

    return random.getstate()


def restore_python_rng_state(state: Any) -> None:
    """Restore the stdlib `random` generator state captured earlier."""
    import random

    random.setstate(state)


def encode_numpy_rng_state(state: Any) -> dict[str, Any]:
    """Flatten a numpy RNG state to plain types safe for `torch.load(weights_only=True)`.

    `numpy.random.get_state()` returns `(name, keys, pos, has_gauss, cached)` where
    `keys` is a uint32 ndarray; unpickling that array needs `numpy..._reconstruct`,
    which `weights_only=True` refuses (the loader would otherwise reject the whole
    checkpoint). Encoding the 624 keys as plain ints keeps the payload loadable.
    """
    name, keys, pos, has_gauss, cached = state
    return {
        "name": str(name),
        "keys": [int(key) for key in keys],
        "pos": int(pos),
        "hasGauss": int(has_gauss),
        "cachedGaussian": float(cached),
    }


def decode_numpy_rng_state(encoded: Mapping[str, Any], numpy_module: Any) -> tuple:
    """Inverse of `encode_numpy_rng_state`; requires the numpy module."""
    return (
        str(encoded["name"]),
        numpy_module.array(encoded["keys"], dtype=numpy_module.uint32),
        int(encoded["pos"]),
        int(encoded["hasGauss"]),
        float(encoded["cachedGaussian"]),
    )


def build_rng_entry(
    *,
    python_state: Any | None = None,
    torch_state: Any | None = None,
    cuda_state: Any | None = None,
    numpy_state: Any | None = None,
    rank: int | None = None,
) -> dict[str, Any]:
    """Assemble a checkpoint `rng` sub-dict from caller-supplied states.

    The caller owns torch/numpy capture (`torch.get_rng_state()`,
    `torch.cuda.get_rng_state_all()`, `numpy.random.get_state()`), so this module
    stays import-light; omitted generators are simply not recorded. The numpy
    state is encoded to plain types so the payload stays `weights_only`-loadable.
    `rank` tags the process the state belongs to (only rank 0 writes checkpoints),
    so a resume on another rank can detect the mismatch instead of adopting a
    foreign stream.
    """
    entry: dict[str, Any] = {}
    if python_state is not None:
        entry["python"] = python_state
    if torch_state is not None:
        entry["torch"] = torch_state
    if cuda_state is not None:
        entry["cuda"] = cuda_state
    if numpy_state is not None:
        entry["numpy"] = encode_numpy_rng_state(numpy_state)
    if rank is not None:
        entry["rank"] = int(rank)
    return entry


def rng_state_from_checkpoint(payload: Mapping[str, Any]) -> RngState:
    """Extract an `RngState` from a checkpoint payload (empty if absent)."""
    entry = payload.get(RNG_KEY)
    if not isinstance(entry, Mapping):
        return RngState()
    rank = entry.get("rank")
    return RngState(
        python=entry.get("python"),
        torch=entry.get("torch"),
        cuda=entry.get("cuda"),
        numpy=entry.get("numpy"),
        rank=rank if isinstance(rank, int) and not isinstance(rank, bool) else None,
    )


def restore_rng_state(
    rng: RngState,
    *,
    torch_module: Any | None = None,
    numpy_module: Any | None = None,
    rank: int | None = None,
) -> tuple[str, ...]:
    """Restore whichever RNG states are present and whose module was injected.

    Returns warning codes for states that were recorded but could not be
    restored, so a caller can surface them instead of silently continuing with an
    unpinned generator. When the state was captured by a rank other than `rank`,
    restore is refused with `RESUME_RNG_RANK_MISMATCH` — adopting another rank's
    stream would de-sync the per-rank seed lineages.
    """
    if rng.rank is not None and rank is not None and rng.rank != rank:
        return (f"{WARN_RNG_RANK_MISMATCH}:saved={rng.rank} current={rank}",)
    warnings: list[str] = []
    if rng.python is not None:
        restore_python_rng_state(rng.python)
    if rng.torch is not None:
        if torch_module is None:
            warnings.append(f"{WARN_RNG_MODULE_MISSING}:torch")
        else:
            torch_module.set_rng_state(rng.torch)
    if rng.cuda is not None:
        if torch_module is None:
            warnings.append(f"{WARN_RNG_MODULE_MISSING}:cuda")
        else:
            torch_module.cuda.set_rng_state_all(list(rng.cuda))
    if rng.numpy is not None:
        if numpy_module is None:
            warnings.append(f"{WARN_RNG_MODULE_MISSING}:numpy")
        elif not isinstance(rng.numpy, Mapping):
            # a native numpy state (not our plain encoding) cannot be rebuilt safely
            warnings.append(f"{WARN_RNG_STATE_UNSUPPORTED}:numpy")
        else:
            numpy_module.random.set_state(decode_numpy_rng_state(rng.numpy, numpy_module))
    return tuple(warnings)


# ---- args helpers (E2) -----------------------------------------------------


def _args_to_mapping(args: Any, *, label: str = "args") -> dict[str, Any]:
    """Normalize an args snapshot (dict / dataclass / argparse.Namespace)."""
    if isinstance(args, Mapping):
        return dict(args)
    if dataclasses.is_dataclass(args) and not isinstance(args, type):
        return dataclasses.asdict(args)
    if hasattr(args, "__dict__"):
        return dict(vars(args))
    raise ResumeError(
        f"{label} must be a mapping, dataclass, or argparse.Namespace; "
        f"got {type(args).__name__}"
    )


def _flatten(prefix: str, value: Any, out: dict[str, Any]) -> None:
    if isinstance(value, Mapping):
        for key, child in value.items():
            _flatten(f"{prefix}.{key}" if prefix else str(key), child, out)
        return
    out[prefix] = value


def flatten_args(args: Any) -> dict[str, Any]:
    """Flatten a (possibly nested) args snapshot into dotted-path keys."""
    flat: dict[str, Any] = {}
    _flatten("", _args_to_mapping(args), flat)
    return flat


def assert_args_compatible(
    saved_args: Any,
    current_args: Any,
    *,
    source: str | None = None,
) -> None:
    """Reject a resume whose stored `args` drifts on a math-relevant field.

    Raises `ResumeArgsMissing` when `saved_args` is absent (an old, pre-D1
    checkpoint) rather than silently comparing against `None`; raises
    `ResumeArgsDrift` with every differing key when a curated field changed
    between the two snapshots.
    """
    if saved_args is None:
        raise ResumeArgsMissing(
            "checkpoint carries no 'args' snapshot; cannot verify the run "
            "configuration has not drifted — re-save with args or start a new run"
            + (f" (source={source})" if source else "")
        )
    saved = flatten_args(saved_args)
    current = flatten_args(current_args)
    drifted: dict[str, tuple[Any, Any]] = {}
    for key in MATH_RELEVANT_ARGS:
        old = saved.get(key, ABSENT)
        new = current.get(key, ABSENT)
        if old != new:
            drifted[key] = (old, new)
    if drifted:
        detail = ", ".join(f"{k}: {old!r} -> {new!r}" for k, (old, new) in drifted.items())
        raise ResumeArgsDrift(
            f"resume rejected: {len(drifted)} math-relevant config field(s) drifted "
            f"({detail})" + (f" (source={source})" if source else ""),
            drifted=drifted,
        )


# ---- run-id continuity (E4) ------------------------------------------------


def _checked_run_id(value: Any, *, source: str) -> str | None:
    if value is None:
        return None
    if (
        not isinstance(value, str) or not value.strip() or value in {".", ".."}
        or any(char in value for char in "/\\:")
        or any(ord(char) < 32 for char in value)
    ):
        raise ResumeError(f"{source} run-id must be a safe single directory name")
    return value


def run_id_from_checkpoint(payload: Mapping[str, Any]) -> str | None:
    """Reconcile payload and args identity before either can select an output path."""
    direct = _checked_run_id(payload.get(RUN_ID_KEY), source="checkpoint")
    args = payload.get(ARGS_KEY)
    nested = _checked_run_id(args.get(RUN_ID_KEY), source="checkpoint args") if isinstance(args, Mapping) else None
    if direct is not None and nested is not None and direct != nested:
        raise ResumeError(f"checkpoint run-id {direct!r} disagrees with args run-id {nested!r}")
    return direct or nested


def manifest_path_for(checkpoint_path: Path | str) -> Path:
    """Return the sibling manifest path for a checkpoint (`*.manifest.json`)."""
    path = Path(checkpoint_path)
    return path.with_name(path.stem + MANIFEST_SUFFIX)


def _read_sibling_manifest(checkpoint_path: Path | str) -> Mapping[str, Any] | None:
    manifest_path = manifest_path_for(checkpoint_path)
    try:
        document = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return document if isinstance(document, Mapping) else None


def assert_optimizer_profile_compatible(
    saved: Any, expected: Mapping[str, Any], *, label: str,
) -> None:
    """Validate AdamW math settings against the trainer's actual fresh template.

    The caller supplies the LR at the last completed step for the scheduled
    generator. Execution flags (foreach/fused, etc.) are not recipe fields.
    Older AdamW states can omit False-default amsgrad/maximize, as torch's loader
    does. This does not authenticate externally supplied checkpoint contents.
    """
    groups = saved.get("param_groups") if isinstance(saved, Mapping) else None
    templates = expected["param_groups"]
    if not isinstance(groups, (list, tuple)) or len(groups) != len(templates):
        raise ResumeOptimizerDrift(f"{ResumeOptimizerDrift.code}: {label} param-group count differs")
    fields = ("lr", "betas", "weight_decay", "eps", "amsgrad", "maximize")
    for index, (group, template) in enumerate(zip(groups, templates)):
        if not isinstance(group, Mapping):
            raise ResumeOptimizerDrift(f"{ResumeOptimizerDrift.code}: {label} group {index} is not a mapping")
        params = group.get("params")
        if not isinstance(params, (list, tuple)) or len(params) != len(template["params"]):
            raise ResumeOptimizerDrift(f"{ResumeOptimizerDrift.code}: {label} group {index} parameter count differs")
        drifted = []
        for key in fields:
            actual = group.get(key, False if key in ("amsgrad", "maximize") else None)
            wanted = template[key]
            if key == "betas":
                valid = isinstance(actual, (list, tuple)) and len(actual) == 2
                valid = valid and all(
                    type(value) in (int, float) and (type(value) is int or math.isfinite(value))
                    for value in actual
                )
                if valid:
                    actual = tuple(actual)
            elif key in ("amsgrad", "maximize"):
                valid = type(actual) is bool
            else:
                valid = type(actual) in (int, float) and (type(actual) is int or math.isfinite(actual))
            if not valid or actual != wanted:
                drifted.append(key)
        if drifted:
            raise ResumeOptimizerDrift(
                f"{ResumeOptimizerDrift.code}: {label} group {index} differs on {', '.join(drifted)}"
            )


def assert_resume_dataset_compatible(
    checkpoint_path: Path | str, current_dataset: Mapping[str, Any],
    *, document: Mapping[str, Any] | None = None,
) -> None:
    """Compare corpus content/provenance before a resume can replace run evidence.

    Newer index/count fields are compared when the checkpoint recorded them;
    older manifests still have the required content hash and revision. Filenames
    alone cannot establish identity when bytes change at an existing path.
    """
    if document is None:
        document = _read_sibling_manifest(checkpoint_path)
    saved = document.get("dataset") if document is not None else None
    if not isinstance(saved, Mapping) or any(not saved.get(key) for key in ("sha256", "dvcRev")):
        raise ResumeDatasetDrift(
            f"{ResumeDatasetDrift.code}: checkpoint dataset identity is missing or unreadable",
            path=str(checkpoint_path),
        )
    keys = ("sha256", "dvcRev", "sourceInputSha256", "canonicalSelectionSha256", "requestedCount", "writtenCount")
    drifted = [key for key in keys if saved.get(key) is not None and saved[key] != current_dataset.get(key)]
    if drifted:
        raise ResumeDatasetDrift(
            f"{ResumeDatasetDrift.code}: checkpoint dataset differs on {', '.join(drifted)}; "
            "restore the recorded corpus before resuming",
            path=str(checkpoint_path),
        )


def run_id_from_sibling_manifest(checkpoint_path: Path | str) -> str | None:
    """Read a safe identity; absent/malformed legacy siblings remain unavailable."""
    document = _read_sibling_manifest(checkpoint_path)
    if document is None:
        return None
    return _checked_run_id(document.get("runId"), source="sibling manifest")


# ---- Typed loader (E1) -----------------------------------------------------


@dataclass(frozen=True)
class LoadedCheckpoint:
    """Validated four-piece checkpoint plus optional adversarial/EMA/RNG parts."""

    model: Any
    step: int
    optimizer: Any | None = None
    args: dict[str, Any] | None = None
    discriminator: Any | None = None
    disc_optimizer: Any | None = None
    ema: Any | None = None
    rng: RngState = field(default_factory=RngState)
    run_id: str | None = None
    warnings: tuple[str, ...] = ()
    source: str = ""
    snapshot_identity: tuple[str, str] | None = None


def _coerce_step(raw: Any, source: str) -> int:
    if isinstance(raw, bool):
        raise ResumeStepsMissing(f"checkpoint {source} has a boolean step value", path=source)
    if isinstance(raw, int):
        step = raw
    elif isinstance(raw, str):
        try:
            step = int(raw)
        except (TypeError, ValueError) as exc:
            raise ResumeStepsMissing(
                f"checkpoint {source} has a non-integer step value {raw!r}", path=source
            ) from exc
    else:
        raise ResumeStepsMissing(
            f"checkpoint {source} has a non-integer step value {raw!r}", path=source
        )
    if step < 0:
        raise ResumeStepsMissing(f"checkpoint {source} has a negative step {step}", path=source)
    return step


def load_checkpoint_payload(
    payload: Mapping[str, Any],
    *,
    source: str = "<memory>",
    require_args: bool = True,
    require_optimizer: bool = True,
) -> LoadedCheckpoint:
    """Validate an already-deserialized checkpoint mapping (torch-free core).

    Fails closed: a missing step raises `RESUME_STEPS_MISSING` (never parsed
    from the filename), a missing `args` raises `RESUME_ARGS_MISSING` when
    required, and a missing model/optimizer raises `RESUME_QUARTET_INCOMPLETE`
    naming the path and every missing key. Opting out of `args`/`optimizer`
    records a warning instead, so nothing is ever silently dropped.
    """
    if not isinstance(payload, Mapping):
        raise ResumeError(
            f"checkpoint payload must be a mapping; got {type(payload).__name__} (source={source})",
            path=source,
        )

    step_key = next((key for key in STEP_KEYS if key in payload), None)
    if step_key is None:
        raise ResumeStepsMissing(
            f"checkpoint {source} is missing a {'/'.join(STEP_KEYS)!r} key; refusing to "
            "guess the step from the filename (upstream's defect is not ported)",
            path=source,
        )
    step = _coerce_step(payload[step_key], source)

    warnings: list[str] = []

    args: dict[str, Any] | None = None
    if ARGS_KEY not in payload:
        if require_args:
            raise ResumeArgsMissing(
                f"checkpoint {source} carries no 'args' snapshot; refusing to resume "
                "without the four-piece set (upstream four-piece parity)",
                path=source,
            )
        warnings.append(WARN_ARGS_MISSING)
    else:
        args = _args_to_mapping(payload[ARGS_KEY])

    missing: list[str] = []
    if MODEL_KEY not in payload:
        missing.append(MODEL_KEY)
    if require_optimizer and OPTIMIZER_KEY not in payload:
        missing.append(OPTIMIZER_KEY)
    if missing:
        raise ResumeQuartetIncomplete(
            f"checkpoint {source} is missing required four-piece key(s): {sorted(missing)}",
            path=source,
            missing=missing,
        )
    if not require_optimizer and OPTIMIZER_KEY not in payload:
        warnings.append(WARN_OPTIMIZER_MISSING)

    rng = rng_state_from_checkpoint(payload)
    if rng.is_empty():
        warnings.append(WARN_RNG_MISSING)

    return LoadedCheckpoint(
        model=payload[MODEL_KEY],
        step=step,
        optimizer=payload.get(OPTIMIZER_KEY),
        args=args,
        discriminator=payload.get(DISCRIMINATOR_KEY),
        disc_optimizer=payload.get(DISC_OPTIMIZER_KEY),
        ema=payload.get(EMA_KEY),
        rng=rng,
        run_id=run_id_from_checkpoint(payload),
        warnings=tuple(warnings),
        source=source,
    )


def load_checkpoint(
    path: Path | str,
    *,
    require_args: bool = True,
    require_optimizer: bool = True,
    torch_module: Any | None = None,
    verify_receipt: bool = False,
    current_dataset: Mapping[str, Any] | None = None,
) -> LoadedCheckpoint:
    """Deserialize + validate a checkpoint file (torch imported lazily).

    Mirrors upstream's rank-0 `torch.save(checkpoint, path)` (`train_t2i.py`
    L195–L216), loaded with `weights_only=True`. Run-id continuity is filled
    from the sibling manifest when the payload itself carries no run id.
    Training sets verify_receipt=True: one descriptor is hashed before/after
    loading, and the pinned receipt supplies identity and dataset checks.
    Standalone legacy readers keep their receipt-optional default.
    """
    path = Path(path)
    if not path.exists() and not verify_receipt:
        raise FileNotFoundError(f"--resume-from checkpoint not found: {path}")
    if torch_module is None:
        try:
            import torch as torch_module  # type: ignore[no-redef]
        except ImportError as exc:  # pragma: no cover - env-dependent
            raise ResumeError(
                f"cannot load checkpoint {path}: torch is not available "
                "(pass torch_module= to load in a torch-free process)"
            ) from exc
    snapshot_identity = None
    if verify_receipt:
        payload, document, snapshot_identity = _load_verified_payload(path, torch_module, current_dataset)
    else:
        payload = torch_module.load(path, map_location="cpu", weights_only=True)
        document = _read_sibling_manifest(path)
    loaded = load_checkpoint_payload(
        payload,
        source=str(path),
        require_args=require_args,
        require_optimizer=require_optimizer,
    )
    run_id = loaded.run_id
    warnings = list(loaded.warnings)
    if document is not None:
        manifest_run_id = _checked_run_id(document.get("runId"), source="sibling manifest")
        if run_id is not None and manifest_run_id is not None and run_id != manifest_run_id:
            raise ResumeError(
                f"checkpoint run-id {run_id!r} disagrees with sibling run-id {manifest_run_id!r}",
                path=str(path),
            )
        if "stepCount" in document:
            manifest_step = document["stepCount"]
            if type(manifest_step) is not int or manifest_step != loaded.step:
                raise ResumeError(
                    f"checkpoint step {loaded.step} disagrees with sibling stepCount={manifest_step!r}",
                    path=str(path),
                )
        run_id = run_id or manifest_run_id
    if run_id is None:
        warnings.append(WARN_RUN_ID_MISSING)
    return dataclasses.replace(
        loaded, run_id=run_id, warnings=tuple(warnings), snapshot_identity=snapshot_identity,
    )


# ---- Training-loop seams (D1) ----------------------------------------------


def build_checkpoint_payload(
    *,
    model_state: Any,
    step: int,
    optimizer_state: Any,
    args: Any,
    discriminator: Any | None = None,
    disc_optimizer: Any | None = None,
    rng: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble the payload the training loop saves (`tokenizer/train.py`).

    Key spellings live here so writer and loader agree: wittgenstein writes the
    singular `step` (unchanged from before), and `args` is the additive
    four-piece entry (`D1`) that lets a later `assert_args_compatible` compare
    the saved config against the current run. `rng` (E3) is the optional
    generator-state entry the loader can restore; optional parts are only
    included when present, so the payload never gains a spurious key.
    """
    payload: dict[str, Any] = {
        MODEL_KEY: model_state,
        "step": step,
        OPTIMIZER_KEY: optimizer_state,
        ARGS_KEY: args,
    }
    if discriminator is not None:
        payload[DISCRIMINATOR_KEY] = discriminator
    if disc_optimizer is not None:
        payload[DISC_OPTIMIZER_KEY] = disc_optimizer
    if rng is not None:
        payload[RNG_KEY] = dict(rng)
    return payload


@dataclass(frozen=True)
class ResumeDecision:
    """What the training loop needs to continue a run from a checkpoint."""

    checkpoint: LoadedCheckpoint
    start_step: int
    run_id: str | None
    warnings: tuple[str, ...] = ()


def load_for_resume(
    path: Path | str,
    current_args: Any,
    *,
    require_args: bool = True,
    require_optimizer: bool = True,
    torch_module: Any | None = None,
    verify_receipt: bool = False,
    current_dataset: Mapping[str, Any] | None = None,
) -> ResumeDecision:
    """Load a checkpoint for resume, enforcing the E1/E2/E4 guarantees.

    Fails closed *before* the training loop continues: a legacy checkpoint
    without `args` raises `ResumeArgsMissing`, and a math-relevant drift from
    the currently configured run raises `ResumeArgsDrift`. `start_step` follows
    the unchanged `resume_start_step` naming contract; `run_id` carries the
    original run id when the payload or its sibling manifest supplies one.

    `require_args=False` deliberately opts out of the drift guard (an absent
    `args` then surfaces as a warning on `warnings` rather than a raise).
    """
    loaded = load_checkpoint(
        path,
        require_args=require_args,
        require_optimizer=require_optimizer,
        torch_module=torch_module,
        verify_receipt=verify_receipt,
        current_dataset=current_dataset,
    )
    if loaded.args is not None:
        assert_args_compatible(loaded.args, current_args, source=loaded.source)
    return ResumeDecision(
        checkpoint=loaded,
        start_step=resume_start_step(loaded.step, Path(path)),
        run_id=loaded.run_id,
        warnings=loaded.warnings,
    )


# ---- Supervisor-facing metadata (E4) ---------------------------------------


@dataclass(frozen=True)
class ResumeMetadata:
    """Compact, loggable resume summary for a supervisor/closeout tool."""

    run_id: str | None
    step: int
    start_step: int
    args_present: bool
    rng_present: bool
    warnings: tuple[str, ...]
    source: str = ""


def resume_metadata(
    checkpoint: LoadedCheckpoint | Mapping[str, Any],
    *,
    checkpoint_path: Path | str | None = None,
    require_args: bool = True,
) -> ResumeMetadata:
    """Summarize a checkpoint for logging, preserving the original run id.

    Accepts a validated `LoadedCheckpoint` or a raw payload mapping. When
    `checkpoint_path` is given, `start_step` follows `resume_start_step` naming
    semantics and the original run id falls back to the sibling manifest.
    """
    if isinstance(checkpoint, LoadedCheckpoint):
        loaded = checkpoint
    else:
        source = str(checkpoint_path) if checkpoint_path is not None else "<memory>"
        loaded = load_checkpoint_payload(
            checkpoint, source=source, require_args=require_args
        )

    path = Path(checkpoint_path) if checkpoint_path is not None else None
    start_step = resume_start_step(loaded.step, path) if path is not None else loaded.step

    run_id = loaded.run_id
    warnings = list(loaded.warnings)
    if run_id is None and path is not None:
        run_id = run_id_from_sibling_manifest(path)
    if run_id is None:
        warnings.append(WARN_RUN_ID_MISSING)

    return ResumeMetadata(
        run_id=run_id,
        step=loaded.step,
        start_step=start_step,
        args_present=loaded.args is not None,
        rng_present=not loaded.rng.is_empty(),
        warnings=tuple(warnings),
        source=loaded.source,
    )


# ---- Original contract (unchanged) -----------------------------------------


def resume_start_step(checkpoint_step: int, checkpoint_path: Path) -> int:
    """Return the first global step to run after loading a checkpoint.

    Periodic `step_*.pt` checkpoints are written immediately after that step's
    optimizer update, before the loop increments. Final checkpoints are written
    after the loop exits, so their recorded step is already the next stepCount.

    This never infers a step from the path *content* — the caller must pass a
    step already read from the payload (see E5 / `load_checkpoint_payload`);
    the path is consulted only to distinguish periodic from final naming.
    """
    if checkpoint_path.name.startswith("step_"):
        return checkpoint_step + 1
    return checkpoint_step

def _read_resume_receipt(checkpoint: Path) -> tuple[bytes, Mapping[str, Any]]:
    """Read one receipt and validate its shape and checkpoint naming identity."""
    manifest_path = manifest_path_for(checkpoint)
    try:
        raw = manifest_path.read_bytes()
    except FileNotFoundError as exc:
        raise ResumeIntegrityError(f"missing sibling manifest {manifest_path.name}", path=str(checkpoint)) from exc
    except OSError as exc:
        raise ResumeIntegrityError(f"unreadable sibling manifest {manifest_path.name}: {exc}", path=str(checkpoint)) from exc
    try:
        document = json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise ResumeIntegrityError(f"unreadable sibling manifest {manifest_path.name}: {exc}", path=str(checkpoint)) from exc
    try:
        assert_training_run_manifest_shape(document)
    except (TypeError, ValueError) as exc:
        raise ResumeIntegrityError(
            f"sibling manifest {manifest_path.name} failed shape validation: {exc}", path=str(checkpoint),
        ) from exc

    match = re.fullmatch(r"step_(\d+)\.pt", checkpoint.name)
    step = int(match.group(1)) if match else -1
    if step >= 0 and int(document.get("stepCount", -1)) != step:
        raise ResumeIntegrityError(
            f"manifest stepCount={document.get('stepCount')} disagrees with "
            f"checkpoint step {step} ({checkpoint.name})"
        )
    recorded = str((document.get("checkpoint") or {}).get("path", ""))
    if recorded and Path(recorded).name != checkpoint.name:
        raise ResumeIntegrityError(f"manifest checkpoint.path={recorded!r} disagrees with {checkpoint.name}")
    # Run-id continuity: the trainer writes ckpts under <out_root>/<runId>/ckpts/,
    # so the manifest runId must match the run directory. Only checked in that
    # expected layout, so an explicitly rescued out-of-layout checkpoint is not
    # falsely refused.
    try:
        run_id = _checked_run_id(document.get("runId"), source="sibling manifest")
    except ResumeError as exc:
        raise ResumeIntegrityError(str(exc), path=str(checkpoint)) from exc
    if checkpoint.parent.name == "ckpts":
        run_dir_name = checkpoint.parent.parent.name
        if run_id is None:
            raise ResumeIntegrityError(f"sibling manifest {manifest_path.name} carries no runId")
        if run_dir_name and run_id != run_dir_name:
            raise ResumeIntegrityError(f"manifest runId={run_id!r} disagrees with run dir {run_dir_name!r}")
    return raw, document


def _verify_checkpoint_stream(stream, document, checkpoint: Path) -> None:
    """Hash the already-open file with bounded memory, then rewind for torch."""
    if os.fstat(stream.fileno()).st_size != document["checkpoint"]["bytes"]:
        raise ResumeIntegrityError("checkpoint byte size disagrees with sibling manifest", path=str(checkpoint))
    stream.seek(0)
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b""):
        digest.update(chunk)
    stream.seek(0)
    if digest.hexdigest() != document["checkpoint"]["sha256"]:
        raise ResumeIntegrityError("checkpoint SHA-256 disagrees with sibling manifest", path=str(checkpoint))


def _file_signature(stream) -> tuple[int, ...]:
    info = os.fstat(stream.fileno())
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _load_verified_payload(checkpoint: Path, torch_module, current_dataset):
    raw, document = _read_resume_receipt(checkpoint)
    if current_dataset is not None:
        assert_resume_dataset_compatible(checkpoint, current_dataset, document=document)
    try:
        with checkpoint.open("rb") as stream:
            before = _file_signature(stream)
            _verify_checkpoint_stream(stream, document, checkpoint)
            # Atomic pathname replacement cannot redirect this open descriptor.
            try:
                payload = torch_module.load(stream, map_location="cpu", weights_only=True)
            except Exception as exc:
                raise ResumeIntegrityError(f"cannot deserialize verified checkpoint: {exc}", path=str(checkpoint)) from exc
            # Also reject ordinary in-place writes while the deserializer reads.
            _verify_checkpoint_stream(stream, document, checkpoint)
            if _file_signature(stream) != before:
                raise ResumeIntegrityError("checkpoint changed during deserialization", path=str(checkpoint))
        if manifest_path_for(checkpoint).read_bytes() != raw:
            raise ResumeIntegrityError("sibling manifest changed during deserialization", path=str(checkpoint))
    except OSError as exc:
        raise ResumeIntegrityError(f"cannot read checkpoint/receipt snapshot: {exc}", path=str(checkpoint)) from exc
    identity = document["checkpoint"]["sha256"], hashlib.sha256(raw).hexdigest()
    return payload, document, identity


def verify_resume_checkpoint(checkpoint: Path) -> str | None:
    """Stdlib-only preflight; the trainer rechecks the actual load descriptor."""
    try:
        _, document = _read_resume_receipt(checkpoint)
        with checkpoint.open("rb") as stream:
            _verify_checkpoint_stream(stream, document, checkpoint)
    except ResumeIntegrityError as exc:
        return str(exc)
    except OSError as exc:
        return f"cannot read checkpoint for integrity verification: {exc}"
    return None
