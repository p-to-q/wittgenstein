# Codec v2 Port — P6 execution plan (stub)

**Date opened:** 2026-04-25
**Feeds from:** ADR-0008 (Codec Protocol v2 adoption), RFC-0001, Brief A (LFQ rename), Brief E (benchmarks v2 targets)
**Status:** 🔴 Not started — stub

## Purpose

This is the execution plan for the code port ratified by ADR-0008. It is deliberately
*outside* the docs-phase sequence P1–P5: the restructuring phases lock decisions; this
plan lands the migration.

Scope: port Wittgenstein's existing 7 modality groups from the v0.1 harness surface to
the Codec v2 protocol (RFC-0001), in the order sensor → audio → image, while retiring
the five confirmed code smells.

## Phase ordering

| Phase | Work | Gate |
|---|---|---|
| M0 | Introduce `Codec<Req, Art>`, `Handoff`, `Route`, `HarnessCtx` types in `packages/schemas` behind a `@experimental` tag. No call-site change. | Types land + `pnpm typecheck` green. |
| M1 | Port `codec-sensor` (ecg, gyro, temperature) — cheapest migration, trivial dispatch already isolated. | Golden fixtures preserve; manifest rows codec-authored. |
| M2 | Port `codec-audio` (speech, soundscape, music) — eliminates the 80-line route copy-paste. | Goldens preserve; `AudioRequest.route` deprecated with warning. |
| M3 | Port `codec-image` (svg, ascii-png, raster) — only modality with existing L4/L5. First codec to inhabit both stations fully. | Goldens preserve; Brief A's "LFQ-family discrete-token decoder" rename lands in ADR-0005 addendum. |
| M4 | Retire `harness.ts:123-172` modality branching + `:139-172` manifest overrides. Remove `AudioRequest.route`, `SvgRequest.source`, `AsciipngRequest.source`, `VideoRequest.inlineSvgs`. | Harness is modality-blind. |
| M5 | Enable 2-round LLM pipeline (RFC-0001 §Interface); introduce round-1 caching. | Quality uplift measurable on compositional prompts via Brief E metrics. |
| M6 | Land benchmarks v2 bridge (Brief E): VQAScore / UTMOS+WER / librosa / LAION-CLAP / NeuroKit2 / rule lists / clip-frame-drift, default tier only. `--quality=heavy` remains opt-in. | Composite Quality score reports; `quality_partial` invariant enforced. |

Kill date for pre-v2 surface: **v0.3.0**. Post v0.3.0 the old interfaces are compile
errors, not deprecation warnings.

## Out of scope (explicit)

- JEPA / `Handoff.Latent` implementation — gated on Brief B kill criterion 1 (JEPA multimodal parity by Q3 2026). Until then `Latent` stays uninhabited.
- Site rewrite (RFC-0004) — tracked as a separate PR against the site repo.
- CLI ergonomics port (RFC-0002 / ADR-0009) — adjacent execution plan, can parallelize with M3–M6.
- New modalities beyond the current 7 — post-M6.
- Path C code (ADR-0007 — rejected).

## Review

Two hats at every phase boundary:

- **Researcher hat:** does this migration preserve the verdicts of Brief A, Brief B, Brief E?
- **Hacker hat:** can the resulting `Codec<Req, Art>` absorb an 8th modality in ≤20 lines, as RFC-0001's round-trip test requires?

## Next step

This file is a stub. The full phase-by-phase plan (per-package diff, golden fixture
strategy, migration tests, rollback criteria) is written as its own planning pass before
M0 starts.
