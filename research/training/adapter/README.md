# Adapter training subprogram

Phase-1 deliverable: a learned MaskGIT-style L4 seed-code adapter that
expands compact Visual Seed Code emissions from the LLM into
decoder-native latent tokens.

This directory is the dedicated workspace for the adapter training
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

- [#397](https://github.com/p-to-q/wittgenstein/issues/397) — Train
  learned MaskGIT-style L4 adapter (seed expander).
- [#393](https://github.com/p-to-q/wittgenstein/issues/393) —
  Deterministic-unfolding adapter empirical sweep.
- [#453](https://github.com/p-to-q/wittgenstein/issues/453) — Block-causal
  + clean-repaint adapter design (Cola-DLM-inspired).
- [#454](https://github.com/p-to-q/wittgenstein/issues/454) — CoT-inspired
  visual reasoning block in the VSC preamble.

## Receipt contract

Every adapter training run emits a Wittgenstein manifest receipt under
`research/training/_shared/manifests/<run-id>/` per the contract in
[`docs/contributing/training-setup.md`](../../../docs/contributing/training-setup.md).
