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
- Per-eval-step metric snapshots
- Checkpoint path, SHA-256, byte size, and weights license

Do not put a freeform hyperparameter blob inside the receipt. Training
configuration stays in the training program's own config file; the receipt
may point at that file with a path and SHA-256. The same receipt can be
mirrored to Aim (local) and W&B (when a project key is set via
`WANDB_PROJECT`). Aim is the default because the manifest spine is the
canonical record and Aim stays local + offline-friendly.

The three manifest surfaces are intentionally separate:

- `TrainingRunManifest` is upstream evidence for a checkpoint-producing run.
- `DecoderFamilyManifest` blesses a specific checkpoint as a decoder asset;
  its `assets.trainingProvenance` reference points back to the training-run
  receipt and must match the checkpoint SHA-256.
- `RunManifest` records an inference call that may load that decoder asset.

## Data versioning

Datasets will be pinned with [DVC](https://dvc.org/) so a training receipt
points to an exact data SHA, not a moving HF dataset id.

The DVC remote does not exist yet. It is tracked by
[#400](https://github.com/p-to-q/wittgenstein/issues/400), which owns the
dataset snapshots, remote-storage choice, and sweep-manifest shape for
Phase 1 training. Once #400 lands, configure the remote before running:

```bash
cd research/training
dvc pull
```

Until that remote exists, `dvc pull` is a placeholder command, not an
operational checkout step.

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
