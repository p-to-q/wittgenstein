# Training stack setup

This is the contributor guide for the planned GPU training environment
that lives in [`research/training/`](../../research/training/README.md).
The current repository contains only the Phase-1 skeleton and boundary
guards. If you are running the harness to **generate** artifacts, you do
not need any of this — `pnpm install` + the Tier 1 path is enough.

## When to read this

You will need this guide when you are:

- Training a tokenizer / adapter / LLM head against the Phase-1 program.
- Reproducing a published checkpoint locally from its training manifest.
- Adding a new evaluation rung to the Phase-1 eval matrix.

If you are reviewing a PR, fixing a typed bug, or shipping a CLI feature,
skip this file — the Node tooling is unrelated.

## Hardware floor

- **GPU**: Tokenizer training assumes 8×A100 / H100 class. The adapter
  subprogram is workable on 4×A100. CPU-only runs will start but are
  unusably slow.
- **Disk**: ImageNet (~155 GB), CC12M (filtered ~3–5 TB raw URLs), and
  COCO eval (~25 GB) live on local NVMe; staging from S3 via DVC is
  fine.
- **RAM**: 256 GB+ recommended for parallel dataset prep.

## Environment

The reproducible base is `research/training/Dockerfile` (NGC PyTorch
24.08). Local venv setup is also supported:

```bash
cd research/training
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For planned operational training runs, the Docker path is preferred for
any receipt you intend to publish. Once implemented, the image SHA will go
into the training manifest alongside the git SHA of the harness.

## Training-run manifest + experiment tracking

Each future publishable training run writes a
`witt.training.run-manifest/v0.1` receipt validated by
`TrainingRunManifestSchema` from `@wittgenstein/schemas`. The receipt lives
next to the checkpoint in the run artifact directory, for example
`research/training/_shared/runs/<run-id>/manifest.json`, or in the run's lab
artifact bundle. It records:

- Dataset hash (DVC-pinned)
- Git SHA of the harness at training time
- Git SHA of the training code at training time
- Docker image SHA and lockfile SHA (when applicable)
- Seed, step count, wall-clock duration, and hardware
- Optimizer state SHA-256
- Per-eval-step metric snapshots
- Checkpoint path, SHA-256, byte size, and weights license

Do not put a freeform hyperparameter blob or tracker block inside the receipt.
Training configuration stays in the training program's own config file; the
receipt may point at that file with a path and SHA-256. Experiment tracker
linkage is a sibling `witt.training.experiment/v0.1` receipt, with a local JSONL
implementation used by CPU smoke tests. See
[training experiment tracking](../training/experiment-tracking.md) for the
contract and the #399 boundary between repo-side receipts and the still-external
shared Aim deployment.

The three manifest surfaces are intentionally separate:

- `TrainingRunManifest` is upstream evidence for a checkpoint-producing run.
- `DecoderFamilyManifest` blesses a specific checkpoint as a decoder asset;
  its `assets.trainingProvenance` reference points back to the training-run
  receipt and must match the checkpoint SHA-256.
- `RunManifest` records an inference call that may load that decoder asset.

## Data versioning

Datasets will be pinned with [DVC](https://dvc.org/) so a training receipt
points to an exact data SHA, not a moving HF dataset id.

The repo includes the #400 executable smoke floor:

- `.dvc/config` with a local-smoke remote only
- `research/training/data/snapshots/synthetic-smoke.dvc`
- `docs/training/data.md` for the dataset-snapshot and refresh policy
- `bench/gpu/sweep.py` for maintainer-run sweep receipts

The smoke file itself is checked in; no DVC pull is required for the stdlib
smoke sweep. The real lab remote does not exist yet. ImageNet / CC12M / COCO
pointers, remote-storage choice, and credentials still need model-owner review
through [#400](https://github.com/p-to-q/wittgenstein/issues/400) and #435. Once
the lab remote exists, configure it before running real training:

```bash
cd research/training
dvc pull
```

Until that remote exists, `dvc pull` is not an operational ImageNet / CC12M /
COCO setup step.

Run the smoke sweep without GPU or DVC installed:

```bash
python3 bench/gpu/sweep.py --spec bench/gpu/smoke-sweep.yaml
```

## CI guards

Two npm scripts at the repo root protect the publish surface from
accidentally pulling the training stack in:

- `node scripts/check-no-research-imports.mjs` — verifies no file under
  `packages/<pkg>/src/` imports from `research/`.
- `node scripts/check-npm-publish-tarball.mjs` — runs `npm pack --dry-run`
  per publishable package and verifies the tarball contains no `research/`,
  `bench/`, `examples/`, or large binaries.

Both run in CI on every PR. If you add a new package or move code into
`research/`, run them locally:

```bash
node scripts/check-no-research-imports.mjs
node scripts/check-npm-publish-tarball.mjs
```

## Why training lives outside `packages/`

Per the [delivery and componentization doctrine](../research/2026-05-13-delivery-and-componentization.md),
a user running `npm install @wittgenstein/cli` must never download
training-tier dependencies (PyTorch, DeepSpeed, CUDA toolchain) or
checkpoint binaries. The training stack is **Tier 3**; the published
npm surface is **Tier 0/1/2**. Keeping the directories separate +
guarding the boundary in CI keeps that promise honest.

The reverse direction is allowed and expected: training scripts import
from `packages/<pkg>` (the harness inside training jobs), so the
manifest emitted by a training run goes through the same code path the
CLI uses at generation time.
