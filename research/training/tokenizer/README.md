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

## Numerical failure evidence

The loop checks generator and active discriminator losses before backward, then
gradient norms before their respective optimizer updates. With DDP, every rank
joins the same finite-status collective; one nonfinite rank stops the attempt
on all ranks. This covers finite forward losses with nonfinite backward gradients
as well as NaN/Inf loss values.

A detected failure raises `FloatingPointError` with `NONFINITE_TRAINING` and the
zero-based attempted step/stage. Rank 0 records a `training_failed` JSONL event
and a failed `acceptance.json` (`failure_code`, `failure_stage`, `failure_step`),
then finalizes the experiment log hash without a success-manifest reference.
Final evaluation/checkpoint writing is skipped; previous valid checkpoint pairs
remain available. A discriminator failure may follow a generator update in the
same attempted step; that partial in-memory step is never checkpointed as final.
The guard does not prove convergence, detect every possible optimizer-state
failure, or establish exact restart equivalence.

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
