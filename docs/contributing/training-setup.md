# Training stack setup

This guide covers the implemented tokenizer trainer in
[`research/training/`](../../research/training/README.md). The learned MaskGIT
adapter and LLM head remain placeholders. It is separate from installing the
TypeScript harness; see [quickstart](../quickstart.md) for that path.

## Current readiness

| Surface                                    | Repository state                                      | Still needed                                                           |
| ------------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| CPU receipt / input tests                  | Executable without torch or a GPU                     | Run on each change                                                     |
| Tokenizer loop, optional GAN, resume, eval | Implemented; historical synthetic GPU smoke           | Requalify current environment on the target host                       |
| Real-data training                         | Explicit input paths; no automatic synthetic fallback | Licensed snapshot, provenance, storage, measured capacity (#396, #400) |
| Shared experiment tracking                 | Local JSONL receipts implemented                      | Shared service deployment (#399)                                       |
| Learned adapter / LLM head                 | Planned directories                                   | Implementation and acceptance evidence (#397, #398)                    |

For the complete sequence, stopping conditions, and the implementation queue,
see the [compute-readiness roadmap](../research/2026-11-27-compute-readiness-roadmap.md).
No current GPU reservation is implied by the historical research plan.

## CPU checks (no training)

From the repository root:

```bash
python3 -m unittest research.training.tokenizer.test_preflight -v
python3 -m unittest research.training.test_resume_closeout_tools -v
python3 bench/gpu/sweep.py --spec bench/gpu/smoke-sweep.yaml
```

With a CPU PyTorch environment, also run the two-rank wiring regression:

```bash
python -m unittest research.training.tokenizer.test_distributed_forward -v
```

This uses a one-parameter test model and asserts actual parameter agreement
with and without GAN; it does not train a research model. The CI CPU lane
installs an explicit CPU torch version so this test cannot disappear behind
an absent optional dependency. It still needs its first Linux Actions result.

The sweep command validates synthetic sweep receipts. It is not a GPU benchmark
or evidence of learned image quality.

## Environment qualification

Create a separate training environment; run module commands from the repository
root so `research.training` imports resolve:

```bash
python3 -m venv .venv-training
source .venv-training/bin/activate
python -m pip install -r research/training/requirements.txt
python -m pip check
mkdir -p artifacts/runs/training-environment
python -m pip freeze > artifacts/runs/training-environment/requirements.resolved.txt
python -c 'import torch; print(torch.__version__, torch.version.cuda, torch.cuda.is_available())'
```

`requirements.txt` has open ranges; the Dockerfile is an unqualified template,
not a locked environment. Installing its requirements may replace the base
image's vendor PyTorch/CUDA stack. Retain the actual image digest (if used),
resolved dependencies, source SHA, and GPU/driver details with qualification
receipts. This guide does not claim that a fresh Docker build or any particular
GPU count has passed. Start on one device, measure peak memory and step time,
then validate two ranks and resume before scaling to a full node.

## Explicit launch sequence (operator-run)

The commands below start training only when an operator executes them. They
are examples, not completed experiments or permission to spend GPU resources.

First qualify loop / receipt integrity using synthetic data:

```bash
python -m research.training.tokenizer.train --smoke --out-root artifacts/runs/tokenizer-smoke
```

Then use a small, licensed ImageFolder subset and a batch that fits its size:

```bash
python -m research.training.tokenizer.train --train-data-root /data/licensed-small/train --max-steps 20 --batch-size-per-gpu 2 --image-size 64 --num-workers 0 --checkpoint-every 10 --no-lpips --out-root artifacts/runs/tokenizer-small
```

`--no-lpips` deliberately selects an L2-only objective for this plumbing check;
it is not a comparable full-recipe result. For the intended LPIPS objective,
install LPIPS and its required weights on the host and omit that flag. Missing
LPIPS now fails instead of silently changing the loss. Missing real data fails
instead of generating synthetic training evidence. A dataset too small for a
complete per-rank batch also fails before model allocation.

Once one-device qualification passes, test distributed startup and checkpoint
resume on the selected host:

```bash
torchrun --standalone --nproc-per-node 2 -m research.training.tokenizer.train --smoke --out-root artifacts/runs/tokenizer-ddp-smoke
python -m research.training.tokenizer.train --train-data-root /data/licensed-small/train --resume-from /absolute/path/to/step_00000010.pt --max-steps 20 --batch-size-per-gpu 2 --image-size 64 --num-workers 0 --no-lpips --out-root artifacts/runs/tokenizer-resume
```

Resume checks the checkpoint's SHA-256, byte size, sibling manifest, and
math-relevant configuration (including the original total step budget). Old checkpoints without the required configuration
snapshot are refused. RNG capture is rank-tagged; the loader cursor and every
rank's state are not a complete restart snapshot, so bit-identical distributed
continuation is not claimed. Keep the resumed run's model, objective, and dataset
configuration consistent with its checkpoint. Inspect the closeout report and per-step receipts before
raising the step budget. Real corpus/storage (#400), measured evaluation
(#394), and checkpoint release rights remain separate gates. No current
synthetic smoke proves semantic alignment or establishes a publishable model.

## Training-run manifest + experiment tracking

The implemented tokenizer writes a
`witt.training.run-manifest/v0.1` receipt validated by
`TrainingRunManifestSchema` from `@wittgenstein/schemas`. The receipt lives
next to the checkpoint in the run artifact directory, for example
`<out-root>/<run-id>/ckpts/final.manifest.json`, or in the run's lab
artifact bundle. It records:

- Dataset digest and declared revision (DVC-pinned only for an actual DVC snapshot)
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
through [#400](https://github.com/p-to-q/wittgenstein/issues/400) (#435 is a closed routing record, not an outstanding approval). Once
the lab remote exists, configure it before running real training:

```bash
# Run from the repository root after configuring the real remote.
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

The Python trainer emits JSON matching the shared TypeScript schema. Cross-language
schema tests validate the training receipt; Python training does not import the
TypeScript harness or use the inference manifest writer. Training and inference
keep their distinct receipt types.
