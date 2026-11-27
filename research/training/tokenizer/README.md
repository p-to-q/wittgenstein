# Tokenizer training subprogram

Phase 1.1 deliverable: a Wittgenstein-native VQGAN-class image tokenizer
trained on ImageNet + CC12M, per
[`docs/research/2026-05-13-wittgenstein-research-program.md`](../../../docs/research/2026-05-13-wittgenstein-research-program.md) §1.1.

## Status

The tokenizer loop, optional PatchGAN, evaluation helpers, checkpoint resume,
supervisor, and closeout tooling are implemented. Historical GPU smoke evidence
is described in the [training receipt closeout](../../../docs/research/2026-05-31-training-stack-re-audit-closeout.md);
it does not qualify the current dependency resolution or establish image quality.
The #441 receipt-boundary review is closed. Real corpus snapshots and storage
remain open in [#400](https://github.com/p-to-q/wittgenstein/issues/400); no
publishable trained tokenizer is established by these engineering checks.

Run all module commands from the repository root. See the
[training setup guide](../../../docs/contributing/training-setup.md) for the
CPU checks, explicit small-data command, and multi-GPU qualification sequence.

## Layout

```
tokenizer/
├── README.md         # this file
├── config.py         # TrainConfig, TokenizerConfig, smoke_config()
├── model.py          # build_tokenizer() factory; uses _shared/_third_party/llamagen_vq_model
├── losses.py         # TokenizerLoss: L2 + LPIPS + GAN-when-on + commit pass-through
├── train.py          # DDP-native training loop (torchrun)
├── smoke_test.py     # synthetic loop / receipt check; host-dependent duration
└── __init__.py
```

Shared infrastructure (`research/training/_shared/`):

```
_shared/
├── manifest.py        # TrainingRunManifest emitter (Wittgenstein receipt spine)
├── dataset.py         # ImageFolderDataset, SyntheticImageDataset, LlamaGen-canonical preproc
└── _third_party/
    ├── README.md
    ├── LICENSE.llamagen
    └── llamagen_vq_model.py   # vendored from FoundationVision/LlamaGen@ce98ec41 (MIT)
```

## Quick smoke (validates the loop)

```bash
# Single GPU
python -m research.training.tokenizer.smoke_test

# Multi-GPU DDP (uses CUDA_VISIBLE_DEVICES if set)
torchrun --nproc-per-node 2 -m research.training.tokenizer.smoke_test
```

Expected: 5 synthetic train steps (runtime depends on the host), `[smoke] PASS` printed, a
`final.manifest.json` written under `_shared/runs/smoke/tokenizer-*/`.

## Minimum acceptance bar

This scaffold is intentionally **receipt-first and claim-light**. Before
any reviewer treats a tokenizer run as minimally acceptable, the following
must be true:

1. **Smoke run passes end-to-end** — `python -m research.training.tokenizer.smoke_test`
   exits 0, writes `final.pt` + `final.manifest.json`, and reports a clean
   acceptance summary.
2. **Manifest spine is present** — every checkpoint being cited has a sibling
   `*.manifest.json` with source provenance, dataset, hardware, optimizer,
   checkpoint, and config-reference fields populated.
3. **Dataset mode is explicit** — receipts clearly indicate whether the run
   used synthetic smoke data or a real dataset fingerprint; no ambiguous
   “training succeeded” wording across those two cases.
4. **Metric degradation is observable** — if PSNR/SSIM, LPIPS, or rFID could
   not be computed because optional dependencies or runtime prerequisites were
   missing, the run summary and eval receipt must say so explicitly; silent
   metric omission is not acceptable.
5. **No research blessing from smoke alone** — smoke proves loop integrity,
   manifest emission, and checkpoint I/O only. It does **not** count as model
   quality validation, tokenizer architecture approval, or dataset-license sign-off.

## Current fallback / robustness story

- **No real dataset available** → fail before distributed/model initialization.
  Synthetic data is used only with explicit `--smoke` and is labeled in the
  acceptance summary + manifest dataset notes.
- **Corrupt image file during real-data training** → loader falls back
  deterministically to the previous sample (or zeros at index 0) and increments
  `corrupt_count`; this is a run-survival measure, not a quality claim.
- **LPIPS missing at train time** → fail if enabled. `--no-lpips` is an explicit
  L2-only plumbing objective, not a comparable full-recipe result.
- **Eval dependencies missing (`torchmetrics`, `lpips`, `clean-fid`)** → eval
  may run in degraded mode, but the missing metrics must be surfaced in the
  receipt rather than silently dropped.

## Resume identity checks

Before continuing, the loader reconciles any run ID in the checkpoint, its saved
args, and its sibling manifest. Conflicting IDs or decoded step/sibling
`stepCount` disagreement raise `ResumeError`; direct and args IDs cannot silently
override one another. A resumed run ID must be one safe directory name, so it
cannot select an absolute path or traverse outside `out_root`.

Legacy callers without a usable sibling retain explicit missing-identity warnings.
The trainer still requires the separate pre-device manifest/byte-integrity check
and compatible math arguments. These checks preserve provenance; they do not
establish bit-identical dataloader/RNG continuation. Run the stdlib regressions
with `python -m unittest research.training.tokenizer.test_resume_identity -v`;
install CPU torch to also exercise the real serializer roundtrip.

The trainer also recomputes the rank-0 corpus fingerprint before model loading
or output writes. Resume requires the content hash and dataset revision to match
the checkpoint's sibling manifest; newer index/count fields are checked when
recorded. Replacing, adding, removing or renaming an image at the same root
raises `ResumeDatasetDrift` (`RESUME_DATASET_DRIFT`), including a final-checkpoint
resume with zero updates remaining. Changing `WITT_DVC_REV` also requires restoring
the recorded revision. The original run files are left untouched on refusal;
there is no new success receipt. DDP peers receive the refusal before entering
model collectives. Restore the original corpus to resume that experiment.

```sh
OMP_NUM_THREADS=1 python -m unittest \
  research.training.tokenizer.test_resume_identity \
  research.training.tokenizer.test_resume_dataset -v
```

These generated-pixel/scalar CPU/gloo checks do not establish immutable storage,
rights, identical rank-local mounts, continuous mutation detection during a run,
or exact loader/RNG restart. The existing startup content scan is moved earlier,
not repeated; multi-rank startup adds a status broadcast. Dataset qualification
and remote-restore evidence remain tracked in #400.

### Optimizer profile on resume

Compatible saved/current args are checked alongside the actual AdamW group
profile before model or optimizer state is loaded. A mismatch in learning rate,
betas, weight decay, epsilon, AMSGrad or maximize raises `ResumeOptimizerDrift`
(`RESUME_OPTIMIZER_DRIFT`); any rank's mismatch stops all ranks before model
collectives or run-output replacement. Restore a checkpoint consistent with the
recorded recipe rather than editing its receipt to suppress the error.

The expected generator LR is calculated for the **last completed** warmup step
using the existing periodic/final checkpoint convention. The discriminator uses
its actual constructed template, including AdamW's current default decay of
`0.01` (not the generator's configured decay). This does not change the recipe.
Older AdamW states can still omit the false-default `amsgrad`/`maximize` flags;
execution choices such as `foreach`/`fused` are not compared as recipe fields.
The checks do not authenticate externally supplied checkpoint contents or prove
exact numerical continuation across implementations/devices.

```sh
python -m unittest research.training.tokenizer.test_resume_optimizer_profile -v
OMP_NUM_THREADS=1 python -m unittest \
  research.training.tokenizer.test_resume_optimizer -v
```

## Numerical failure evidence

Preflight rejects nonfinite optimizer learning rate, decay, betas and clipping
threshold before distributed/device setup. Learning rate and decay retain AdamW's
nonnegative range (including zero); betas must be in `[0, 1)`. Warmup steps must
be integers. Existing nonpositive warmup/clipping disable values remain legal.

The loop checks generator and active discriminator losses before backward, then
gradient norms before their respective optimizer updates. With DDP, every rank
joins the same finite-status collective; one nonfinite rank stops the attempt
on all ranks. This covers finite forward losses with nonfinite backward gradients
as well as NaN/Inf loss values. After each optimizer update it also checks the
model's parameters/buffers and AdamW tensor state (including moments), before
continuing or writing a checkpoint. Finite inputs alone do not prevent update or
moment overflow. A resumed state is checked even if `max_steps` is already reached
and no new update will run; matching checkpoint hashes do not establish numerical
validity.

A detected failure raises `FloatingPointError` with `NONFINITE_TRAINING` and the
stage and zero-based attempted step (or the next step while checking restored
state). Rank 0 records a `training_failed` JSONL event and a failed `acceptance.json` (`failure_code`, `failure_stage`, `failure_step`),
then finalizes the experiment log hash without a success-manifest reference.
Final evaluation/checkpoint writing is skipped; previous valid checkpoint pairs
remain available. A discriminator failure may follow a generator update in the
same attempted step; that partial in-memory step is never checkpointed as final.
A `generator_state` or `discriminator_state` failure is detected **after** an
update (or while checking restored state), so it does not roll back in-memory
parameters. Earlier valid checkpoint pairs remain the recovery point. These
checks scan model state and AdamW tensor state on every update and add one
rank-coordination collective per active optimizer; target-host memory/throughput
must be measured with the checks enabled. The guard does not prove convergence,
detect finite-but-incorrect updates or every possible optimizer failure, or
establish exact restart equivalence.

Run the bounded scalar-model regressions without a GPU or pretrained downloads:

```sh
OMP_NUM_THREADS=1 python -m unittest research.training.tokenizer.test_numerical_safety -v
```

## Real-data qualification before a full launch

Use the [staged launch guide](../../../docs/contributing/training-setup.md)
and [compute-readiness roadmap](../../../docs/research/2026-11-27-compute-readiness-roadmap.md).
The earlier eight-card / batch-128 / 200k-step recipe is a historical hypothesis,
not a capacity measurement or an authorized launch. No current GPU reservation,
resolved CUDA environment, or real-corpus qualification is established here.

The historical rFID ≤ 2.0 ambition is not an observed result or a portable pass
threshold. Compare matched data, preprocessing, metric implementation, sample
count, and checkpoint rights before interpreting a score. D=32 is an ablation
hypothesis; it is not evidence of an advantage over D=8.

## Architecture choices vs LlamaGen baseline

| Knob              | LlamaGen `vq_ds16_c2i.pt` (audited) | Wittgenstein-native (this scaffold) | Why                                                                                                     |
| ----------------- | ----------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Codebook K        | 16384                               | 16384                               | Match audited baseline shape                                                                            |
| Embed dim D       | 8                                   | **32**                              | Hypothesis to compare at matched budget; no measured adapter or reconstruction advantage is established |
| Downsample p      | 16                                  | 16                                  | Match audited baseline; 256² → 16×16 = 256 tokens                                                       |
| Encoder ch_mult   | [1,1,2,2,4]                         | [1,1,2,2,4]                         | Match                                                                                                   |
| Losses            | L2 + LPIPS + PatchGAN + commit      | L2 + LPIPS + commit; GAN opt-in     | `--gan` and an active GAN start step are required                                                       |
| Determinism class | structural-parity (Gate C)          | structural-parity (planned)         | Matches ADR-0015 precedent                                                                              |

## Receipt-first design (per #441)

Every checkpoint emits a `TrainingRunManifest` validated by
`@wittgenstein/schemas`:

- **run identity**: `runId`, `subprogram`, `startedAt`, `finishedAt`
- **source provenance**: `harnessGitSha`, `trainingCodeGitSha`, optional
  `dockerImageSha`, `lockfileSha256`
- **dataset**: `dvcRev`, `name`, `sha256`
- **hardware**: `gpuModel`, `gpuCount`, `nodeCount`
- **optimizer**: `stateSha256`, `learningRate`, `weightDecay`, `betas`
- **checkpoint**: `path`, `sha256`, `bytes`, `weightsLicense`
- **eval**: `evalSnapshots` filled by the eval pass; empty for smoke/no-eval
  checkpoints
- **config**: `trainingConfig` path + SHA-256, not a freeform top-level
  hyperparameter blob

This keeps the Python training side aligned with the TypeScript schema that
downstream decoder-family manifests consume. No silent fallbacks; the harness
can verify any checkpoint back to the exact configuration and data slice that
produced it.

## Owning issues

- [#396](https://github.com/p-to-q/wittgenstein/issues/396) — Train
  Wittgenstein-native VQGAN-class image tokenizer on ImageNet + CC12M
- [#400](https://github.com/p-to-q/wittgenstein/issues/400) — DVC remote
  for dataset hash pinning
- [#441](https://github.com/p-to-q/wittgenstein/issues/441) — Closed receipt-boundary review (not a training or release approval)
- [#329](https://github.com/p-to-q/wittgenstein/issues/329) / [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335) —
  VQGAN-class audit (baseline reference, all PASS as of `docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`)

## Implemented and remaining work

- Implemented: optional PatchGAN (`--gan`), evaluation helpers, and
  `--resume-from` (model, optimizer, step, and discriminator state when present).
- Implemented: local JSONL experiment receipts and synthetic DVC/sweep fixtures.
- Pending: real licensed dataset snapshots / remote storage (#400), shared
  tracker deployment (#399), measured model quality (#394), and release review.
- Pending: learned MaskGIT adapter (#397) and LLM head (#398); their directories
  are placeholders, not launchable training programs.
- GPU capacity and distributed scaling must be measured on the selected
  machine. The defaults are a recipe, not a qualified capacity claim.

## Minimal pass list for reviewers

For this PR / scaffold line specifically, the minimum “pass” list is:

- `smoke_test.py` passes on the claimed environment.
- `final.manifest.json` exists and is parseable JSON.
- `summary.acceptance` reports manifest + checkpoint present.
- Any degraded eval coverage is explicit in receipt fields, not only in logs.
- Any claim beyond loop integrity / receipt integrity gets deferred to ML specialist review.
