# LLM head training subprogram

Phase-1 deliverable: a Wittgenstein-native image-emitting LLM head
distilled from a teacher (initially LlamaGen-3B).

This directory is the dedicated workspace for the LLM-head training
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

- [#398](https://github.com/p-to-q/wittgenstein/issues/398) — Distill
  Wittgenstein-native image-emitting LLM head from LlamaGen-3B teacher.
- [#451](https://github.com/p-to-q/wittgenstein/issues/451) — Seed code
  first-token stability empirical validation plan.
- [#452](https://github.com/p-to-q/wittgenstein/issues/452) — IR
  information-carrying capacity empirical validation plan.

## Receipt contract

Every LLM-head training run emits a Wittgenstein manifest receipt under
`research/training/_shared/manifests/<run-id>/` per the contract in
[`docs/contributing/training-setup.md`](../../../docs/contributing/training-setup.md).
