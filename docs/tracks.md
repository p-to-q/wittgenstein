# Tracks

Wittgenstein is dual-use: it is both a **research surface** (for pressure-testing claims about text-first multimodal systems) and a **product** (a harness that ships artifacts with receipts). Two tracks coexist in one repo because they feed each other — research verdicts ratify into ADRs that drive code, and code runs produce receipts that feed new research.

This page is the contract between the two tracks.

## Researcher track

**Claim:** Wittgenstein is a venue for testing hypotheses about the VQ / LFQ / JEPA lineage, the Ilya↔LeCun tension, and harness-as-skill convergence.

**Surface:**

- `docs/research/briefs/` — dated, versioned pressure-tests. Four-station loop: `Steelman / Red team / Kill criteria / Verdict`.
- `docs/THESIS.md` — the single page of locked claims.
- `docs/inheritance-audit.md` — the Keep / Promote / Revise / Retire ledger.
- `docs/rfcs/` — engineering-facing proposals that ratify brief verdicts.
- `docs/adrs/` — one-line permanent records of accepted decisions.

**Contract:**

- A new claim enters as a brief, not as a commit message. If it cannot be written up in ~2k words with a kill criterion, it is not yet a claim.
- A brief becomes load-bearing only after an ADR ratifies it (usually via an RFC in between).
- Briefs cite papers with arXiv IDs. No "folklore" citations.
- A brief has two reviews (Researcher hat, Hacker hat) before its verdict is promoted.

**What researchers should not do:**

- Touch code. File an issue and reference the target RFC.
- Skip the four-station loop. Steelman without red team is marketing; red team without kill criteria is snark.

## Hacker track

**Claim:** Wittgenstein is a working CLI that produces 35+ reproducible artifacts across 7 modality groups, with a `RunManifest` spine and determinism via seed + frozen decoder.

**Surface:**

- `packages/core` — the harness runtime, manifest spine, and CLI entry points.
- `packages/codec-*` — one package per modality; each implements a `Codec<Req, Art>` under RFC-0001.
- `packages/schemas` — zod schemas guarding every boundary.
- `artifacts/runs/<runId>/` — every run's artifact + manifest + seed.
- `docs/exec-plans/` — phase-by-phase execution plans (P6 onward).

**Contract:**

- A new feature enters through an RFC, not a PR title. The PR lands the RFC's migration, not a design decision.
- Every run writes a `RunManifest` (git SHA, seed, LLM I/O, artifact SHA-256). No exceptions.
- No silent fallbacks. Structured errors from `packages/core/src/runtime/errors.ts`.
- TypeScript strict; zod at every edge; tests preserve goldens.

**What hackers should not do:**

- Introduce weights-level multimodal retraining. Path C is rejected (ADR-0007).
- Branch on modality at the harness level. Codecs own their routes (RFC-0001).
- Ship a run without a manifest row the codec authored itself.

## The handshake

```
research brief  -->  RFC  -->  ADR  -->  exec plan  -->  code + artifacts
(Steelman/Red/      (Context/    (Status/    (Phases,       (RunManifest,
 Kill/Verdict)       Proposal/    Decision/   migration     goldens,
                     Interface/   Consequence)  steps)       receipts)
                     Migration/
                     Red team/
                     Kill)
```

Each arrow has a named artifact and a named review. Nothing slips between the cracks by being "obvious."

## Two hats on every PR

- **Researcher hat:** does this survive contact with 2024–2026 literature? Would a brief writer cite the right papers?
- **Hacker hat:** if an agent read this at 2 a.m., would it write the right code?

Both hats sign off before merge. If either dissents, iterate.

## When tracks conflict

Researcher track owns the verdicts. Hacker track owns the interface. If the interface proposed by an RFC cannot satisfy a brief's kill criterion, the RFC loses — not the brief. This is asymmetric on purpose: engineering can be redesigned cheaply; research claims that ship into ADRs and then get silently retired by a commit are how projects rot.

## Status of this contract

This page is load-bearing as of v0.2. It is revisable via a `docs/tracks.md` PR plus a reference in the next synthesis rollup. Silent drift is not allowed.
