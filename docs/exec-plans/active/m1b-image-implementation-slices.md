# M1B image implementation slices

Status: #259 closeout ledger  
Last reviewed: 2026-05-31

## Purpose

Close the decomposition task for Visual Seed Code, SeedExpander, receipts,
CLI inspection, eval hooks, and fixtures. This is a slice map, not a claim that
M1B image depth is complete.

The current safe claim is:

> The image implementation lane is decomposed into reviewable slices, with
> landed seams and concrete successor issues for the remaining decoder,
> training, and evaluation work.

Unsafe claims:

- "M1B is complete."
- "The LlamaGen bridge is wired."
- "The placeholder SeedExpander proves image quality."
- "Training produced releaseable tokenizer or adapter weights."

## Current evidence

| Surface            | Current state                                                                                                              | Evidence                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Schema shape       | `seedCode`, optional `semantic`, optional `coarseVq`, and optional `providerLatents` are first-class codec-image fields.   | `packages/codec-image/src/schema.ts`, RFC-0006, ADR-0018                             |
| SeedExpander seam  | The seam exists and has two deterministic placeholder-class implementations.                                               | `packages/codec-image/src/adapters/seed-expander.ts`, `seed-expander-tile-mosaic.ts` |
| Clean repaint      | The SeedExpander ABI accepts known-position / known-token conditioning.                                                    | `packages/codec-image/test/seed-expander-clean-repaint.test.ts`, #536                |
| Intent receipt     | `image.code` records which decoder-facing hint the spec carried.                                                           | `packages/codec-image/src/image-code-receipt.ts`                                     |
| Fired path receipt | `renderPath` records which adapter tier actually produced latents.                                                         | `packages/codec-image/src/types.ts`, `packages/codec-image/src/codec.ts`             |
| Adapter receipt    | `image.adapter` records attempted paths, fallback reasons, and the concrete `seedExpanderId` when VSC expands tokens.      | This closeout PR                                                                     |
| CLI inspection     | `wittgenstein image --show-image-code` exposes the image-code receipt without printing opaque raw token arrays by default. | `packages/cli/src/commands/image.ts`, `packages/cli/test/image.test.ts`              |
| Candidate audit    | VQGAN-class cleared the four-gate audit; candidate clearance is separate from product delivery.                            | #329, #334, #335, #491, #492, #474                                                   |
| Release boundary   | Release wording is constrained to audit delivery, not completed M1B depth.                                                 | `docs/release/m1b-closeout-ledger.md`, #507                                          |

## Slice checklist

| Slice                                 | Status                                                                                   | PR-sized scope                                                                                                                    | Likely files                                                                                        | Validation                                                                                                               | Rollback criteria                                                                                          |
| ------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| S1. Schema tightening                 | Landed for the current family-agnostic shape; future 1D/residual tightening stays gated. | Keep VSC fields accepted while avoiding premature tokenizer-family lock-in.                                                       | `packages/codec-image/src/schema.ts`, `packages/codec-image/test/codec.test.ts`                     | parse-valid / negative parse tests; RFC-0007 only activates if a 1D candidate clears gates.                              | Roll back if schema starts implying a family choice before #402/#473 settle blessing rules.                |
| S2. SeedExpander seam                 | Landed as a seam; real trained expander remains future work.                             | Preserve deterministic placeholder implementations as ABI tests, not quality claims.                                              | `packages/codec-image/src/adapters/*`, `packages/codec-image/test/seed-expander*.test.ts`           | deterministic output tests, clean-repaint tests, distinct implementation tests.                                          | Roll back any implementation that silently changes golden images without updating receipts and docs.       |
| S3. Manifest receipts                 | Landed and tightened in this PR.                                                         | Record intent (`image.code`), fired tier (`renderPath`), adapter details (`image.adapter`), and no silent fallback.               | `packages/codec-image/src/types.ts`, `codec.ts`, `pipeline/adapter.ts`, `docs/codecs/image.md`      | round-trip/golden manifest-row tests plus adapter receipt unit tests.                                                    | Roll back if manifests cannot explain why a fallback path fired.                                           |
| S4. CLI inspection                    | Landed.                                                                                  | Keep human-facing summaries compact: semantic source and seed summary by default, raw image-code only behind `--show-image-code`. | `packages/cli/src/commands/image.ts`, `packages/cli/test/image.test.ts`                             | CLI JSON tests for `imageCode`, `semanticSummary`, and `seedSummary`.                                                    | Roll back if CLI starts dumping raw opaque token arrays by default.                                        |
| S5. Eval hooks                        | Partially landed; active successor lanes remain.                                         | Treat parse-valid, adapter-valid, decoder-compat, deterministic replay, quality metrics, and Gate E as separate receipts.         | `research/validation/phase0a_emission_entropy.py`, `docs/acceptance/m1b-image.md`, future eval code | current probes plus future #393/#394 metrics.                                                                            | Roll back any metric that mixes candidate-decoder evidence with own-trained tokenizer evidence.            |
| S6. Fixture / golden strategy         | Landed for lightweight receipts; heavy binary fixtures remain excluded.                  | Prefer JSON manifests and small audit fixtures; avoid committing model weights or large generated images.                         | `packages/codec-image/test/*`, `research/validation/fixtures/m1b-audit/*`, `.gitignore`             | `pnpm test`, artifact-check validators, tarball exclusion checks.                                                        | Roll back if fixtures make npm packages or CI dependent on private weights.                                |
| S7. Decoder delivery                  | Open.                                                                                    | Wire lazy fetch/cache and the selected decoder-family bridge only after policy decisions.                                         | `packages/codec-image/src/decoders/*`, `packages/cli/src/commands/install.ts`, `doctor.ts`          | #402 acceptance: cache hit/miss, SHA mismatch, license refusal, runtime unavailable, corrupted cache, tarball exclusion. | Roll back if decoder loading falls back silently or fetches unverified bytes.                              |
| S8. Training / adapter implementation | Open.                                                                                    | Train only narrow tokenizer/adapter/head slices after the receipt floor is in place.                                              | `research/training/*`, `python/image_adapter/*`, future package glue                                | #441/#399/#400 before expensive training; #393/#394/#396/#397/#398 for actual experiments.                               | Roll back if smoke runs are described as trained weights or if receipts omit dataset/runtime fingerprints. |

## Successor issue map

No new issue is needed for this decomposition. The ready work already has
owners:

- #402 owns decoder bridge delivery, lazy fetch/cache, SHA verification,
  license refusal, runtime errors, and no silent fallback.
- #403 owns install/doctor tier readiness after #402.
- #473 owns Gate C/D threshold and manifest-declared blessing policy.
- #441 owns Phase 1 training-stack architecture and reuse review.
- #399/#400 own experiment tracking plus DVC/GPU sweep receipts.
- #393/#394/#396/#397/#398 own the actual seed-length, eval, tokenizer,
  adapter, and image-emitting-head work.

## Research / engineer / hacker review

Research verdict: the decomposition preserves the radar result without
turning candidate audit clearance into product delivery. VQGAN-class evidence
unblocks a candidate lane, but #402 and #473 still decide what gets blessed
and fetched.

Engineer verdict: the implementation is now split around stable contracts:
schema, adapter ABI, manifest receipts, CLI inspection, validators, and
follow-up delivery gates. The added `image.adapter` row closes the remaining
receipt gap between "path intended" and "path fired."

Hacker verdict: the main failure mode is silent fallback. The current manifest
rows now expose intent, outcome, attempted paths, fallback reasons, and the
placeholder seed-expander id, which makes accidental path swaps reviewable.

## Closeout verdict

#259 can close. Its job was to decompose the image implementation lane into
small, reviewable slices after the radar. The remaining work is intentionally
not parked in this umbrella; it is routed to the concrete successor issues
above.

Do not reopen #259 for decoder wiring, training, or eval execution. Use the
successor issue map.
