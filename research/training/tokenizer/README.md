# Tokenizer training subprogram

Phase-1 deliverable: a Wittgenstein-native VQGAN-class image tokenizer
trained on ImageNet + CC12M.

This directory is the dedicated workspace for the tokenizer training
program. It will host the training entrypoint, configs, eval scripts, and
any local helpers that are not shared across subprograms. Shared
infrastructure (dataset loaders, manifest-spine adapters, eval harness)
lives in `../_shared/`.

## Status

This directory is currently a Phase-1 placeholder. Actual training code
lands as part of the M1B specialist track. The skeleton is intentionally
empty so contributor-machine `pnpm install` and the boundary guards
(`scripts/check-no-research-imports.mjs`,
`scripts/check-npm-publish-tarball.mjs`) work against the documented
shape from day one.

## Owning issues

- [#396](https://github.com/p-to-q/wittgenstein/issues/396) — Train
  Wittgenstein-native VQGAN-class image tokenizer on ImageNet + CC12M.
- [#329](https://github.com/p-to-q/wittgenstein/issues/329)–[#335](https://github.com/p-to-q/wittgenstein/issues/335) — per-candidate four-gate audits that
  inform tokenizer family selection.
- [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335) — Gate C / D empirical thresholds.
- [#473](https://github.com/p-to-q/wittgenstein/issues/473) — Gate C/D
  threshold policy.

## Receipt contract

Every tokenizer training run emits a Wittgenstein manifest receipt under
`research/training/_shared/manifests/<run-id>/` per the contract in
[`docs/contributing/training-setup.md`](../../../docs/contributing/training-setup.md).
