# Model card: Wittgenstein VQGAN-class tokenizer

Status: future template; no trained model claimed  
Last reviewed: 2026-05-28

## Warning

This document is a template. It is not evidence that an own-trained tokenizer exists.

## Model identity

| Field | Value |
|---|---|
| Model name | Wittgenstein VQGAN-class tokenizer |
| Version | TBD |
| Training status | Not trained / not released |
| Intended role | M1B tokenizer / decoder component |
| Checkpoint path | TBD |
| Checkpoint sha256 | TBD |
| Codebook size | TBD |
| Grid shape | TBD |
| Image resolution | TBD |
| License | TBD |
| Runtime tier | TBD |

## Dataset requirements

Before any training claim:

- dataset name/version;
- license;
- split;
- preprocessing;
- sample count;
- known exclusions;
- data manifest sha256.

## Training requirements

Record:

- training script;
- git SHA;
- hardware;
- environment;
- optimizer;
- batch size;
- epochs/steps;
- seed;
- DDP config;
- checkpoint manifest.

## Metrics

Required:

- rFID/FID or accepted reconstruction metric;
- LPIPS;
- SSIM/PSNR;
- codebook usage;
- perplexity;
- dead-code rate;
- collapse rate;
- latency;
- memory.

## Release criteria

This becomes a candidate only when checkpoint, hashes, data manifest, metrics, license review, and ML-owner sign-off exist. It becomes canonical only when adapter and end-to-end artifact receipts pass.

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
