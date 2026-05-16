---
date: 2026-05-16
status: maintainer re-audit note
labels: [research-derived, m1b-image, training, python, reproducibility, maintainer-audit]
tracks: [#439, #440, #441, #435, #396, #397, #398, #399, #400]
---

# Phase 1 Training Stack Re-audit

This note is the first pass for
[#441](https://github.com/p-to-q/wittgenstein/issues/441). It does not
approve expensive GPU training. It records what is safe to build now, what
needs model-owner review, and what should change if the current skeleton
turns out to be too bespoke.

## Current local state

`research/training/` is a boundary skeleton, not an implementation:

- `Dockerfile` and `requirements.txt` establish a PyTorch-shaped training
  environment.
- `tokenizer/`, `adapter/`, and `llm-head/` are empty placeholders.
- `_shared/` has no dataset, manifest, eval, or sweep helpers yet.
- `docs/contributing/training-setup.md` now states that the DVC remote is
  not operational and is tracked by
  [#400](https://github.com/p-to-q/wittgenstein/issues/400).

That shape is acceptable only if the next PRs keep the skeleton honest. It
would be dangerous to start adding training scripts before deciding the
framework, receipt contract, data snapshot contract, and evaluation
ownership.

## Recommendation

Use **plain PyTorch as the base contract**, with adapter layers rather than
an early framework lock-in:

- Start with PyTorch-native training loops and explicit checkpoint /
  manifest writes.
- Use `torchrun` + DDP for the first tokenizer and adapter smoke tests.
- Add PyTorch FSDP2 only when memory pressure or model size requires
  sharding.
- Treat DeepSpeed as an escalation path for the LLM-head distillation
  slice, not as the default for every training program.
- Do not adopt Lightning Trainer as the primary abstraction yet. Lightning
  Fabric may remain a candidate for launcher/device ergonomics if it does
  not hide manifest writes, dataset hashes, or checkpoint semantics.
- Use Hugging Face Accelerate only where it materially reduces boilerplate
  for multi-device launch or checkpoint loading. Do not let it become the
  source of truth for receipts.

The reason is simple: Wittgenstein's hard requirement is not "train fast";
it is "every trained checkpoint has a receipt that the harness can trust."
Frameworks are useful only if they leave that receipt spine explicit.

## External prior art checked

| Source                          | Relevant fact                                                                                                                    | Local implication                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| PyTorch FSDP2 docs              | `fully_shard` is now the PyTorch-native sharded-training direction and targets eager-mode usability with per-parameter sharding. | Keep FSDP2 as the preferred sharding path once DDP is insufficient.                                           |
| DeepSpeed ZeRO docs             | ZeRO shards optimizer states, gradients, and parameters to reduce memory redundancy across GPUs.                                 | Useful for the LLM-head slice if FSDP2 is not enough; too much surface area for the first tokenizer skeleton. |
| Lightning Fabric docs           | Fabric wraps device and distributed strategy setup while preserving a mostly user-owned PyTorch loop.                            | Candidate launcher abstraction, but only after checking that manifest writes stay explicit.                   |
| Hugging Face Accelerate docs    | Accelerate helps device placement, multi-device launch, and large-model loading/dispatch.                                        | Useful as optional launcher/checkpoint glue, not as the canonical training receipt owner.                     |
| DVC remote-storage docs         | DVC remotes centralize large files and dataset/model artifacts outside Git.                                                      | #400 must decide remote provider and dataset snapshot policy before real training receipts can be trusted.    |
| Hugging Face model-card docs    | Model cards are expected to document model purpose, limitations, training parameters, datasets, and eval results.                | Weight publication must include Wittgenstein manifests and model cards, not only binary checkpoints.          |
| clean-fid repo / CVPR 2022 work | FID is sensitive to resizing and quantization details; clean-fid exists to make those choices explicit.                          | #394 should pin exact metric implementation and preprocessing, not just metric names.                         |

Sources:

- PyTorch FSDP2 `fully_shard`: <https://docs.pytorch.org/docs/main/distributed.fsdp.fully_shard.html>
- DeepSpeed ZeRO: <https://deepspeed.readthedocs.io/en/stable/zero3.html>
- Lightning Fabric launch docs: <https://lightning.ai/docs/pytorch/LTS/fabric/fundamentals/launch.html>
- Hugging Face Accelerate big-model docs: <https://huggingface.co/docs/accelerate/usage_guides/big_modeling>
- DVC remote storage: <https://dvc.org/doc/user-guide/data-management/remote-storage>
- Hugging Face model cards: <https://huggingface.co/docs/hub/en/model-cards>
- clean-fid: <https://github.com/GaParmar/clean-fid>

## What is safe to implement before GPU work

These are low-risk and should happen before any expensive training:

- A `research/training/_shared/manifest.py` helper that writes a
  training-manifest draft with `run_id`, `git_sha`, `seed`, dependency
  versions, dataset identifiers, checkpoint SHA-256, and metric snapshots.
- A CPU-only smoke template that creates a tiny synthetic dataset, runs one
  forward/backward step, writes a checkpoint, hashes it, and emits a
  manifest.
- A sweep-manifest schema under `packages/schemas` or a Python-side draft
  that is later promoted to shared schemas through #400.
- A model-card template for future Hugging Face checkpoint publication.
- A metric wrapper plan for #394 that pins exact preprocessing behavior.

These do not require real ImageNet / CC12M / COCO access and do not commit
the project to a GPU framework.

## What must wait for owner review

These choices should not land as "obvious implementation" PRs:

- Final framework choice for distributed training.
- Whether to use FSDP2, DeepSpeed, Lightning Fabric, Accelerate, or a
  combination.
- Whether to reuse existing VQGAN / MaskGIT / LlamaGen / Open-MAGVIT2 /
  TiTok code, and under what license boundaries.
- Dataset remote provider, credential model, and refresh policy.
- Hugging Face org / repo layout for weights and model cards.
- Any claim that the training stack is operational beyond synthetic smoke
  tests.

## Immediate issue changes recommended

- [#399](https://github.com/p-to-q/wittgenstein/issues/399) should land a
  manifest-first experiment template before standing up a shared tracker.
- [#400](https://github.com/p-to-q/wittgenstein/issues/400) should define
  the dataset snapshot contract before any DVC remote is configured.
- [#396](https://github.com/p-to-q/wittgenstein/issues/396) should not
  start with full ImageNet+CC12M training; it should first depend on the
  CPU-only manifest smoke template.
- [#397](https://github.com/p-to-q/wittgenstein/issues/397) should treat
  deterministic replicate (#393) as the null baseline and require the same
  manifest/eval path as the learned adapter.
- [#398](https://github.com/p-to-q/wittgenstein/issues/398) should remain
  behind tokenizer, adapter, data, eval, and owner sign-off. It is too
  expensive and thesis-sensitive to start from the current skeleton.

## Verdict

The current skeleton is acceptable as a boundary marker, but it is not yet
a training platform. The next correct move is not "write the tokenizer
trainer"; it is "make the first training receipt impossible to fake." That
means manifest helper, synthetic smoke run, dataset snapshot contract, and
metric wrapper decisions before GPU-scale implementation.
