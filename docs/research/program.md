# Research Program

This is the lightest useful top-level map of Wittgenstein's research program.

It exists to gather the repo's research surfaces into one place without creating a
second doctrine layer. The goal is not to replace briefs, RFCs, ADRs, or execution
plans. The goal is to show how they fit together, what the current research scope is,
and which directions belong to the same larger program.

---

## What this program is for

Wittgenstein is no longer just a pile of promising research fragments. It now has:

- a locked thesis
- an active protocol and execution line
- pressure-tested briefs
- engineering RFCs and ADRs
- manifests, artifacts, and benchmark surfaces

That is enough structure that the repo needs a research-level aggregation layer.

This file provides that layer.

Use it to answer:

- what the repo is trying to prove
- which research tracks exist
- where a new finding belongs
- what current scope is
- what later paper- or lab-shaped work might grow out of the repo

---

## Research thesis

Wittgenstein studies whether a **text-first LLM** can remain the planner while
multimodal capability is added outside the base model through a harness layer:

- typed specs
- codec-owned execution
- frozen decoders
- optional adapters
- manifest-backed reproducibility

The repo's engineering is therefore not separate from the research. The engineering is
the instrument through which the research claim is pressure-tested.

---

## The program shape

The research program has three nested levels:

1. **Core thesis work**
   - the claims that define what Wittgenstein is
2. **Execution-serving research**
   - the research that immediately shapes a port, an interface, or a benchmark
3. **Horizon research**
   - the broad scans and future-facing work that may reshape later versions of the
     roadmap, but should not be mistaken for current doctrine

This lets the repo remain simultaneously:

- a product surface
- an engineering system
- a research surface

without flattening those into one thing.

---

## Current research tracks

### R1 — Modality harness architecture

Question:

Can modality capability be carried by the harness / codec / decoder layer, rather than
by retraining the base model into a fused multimodal giant?

Typical materials:

- `docs/THESIS.md`
- `docs/research/briefs/A_vq_vlm_lineage_audit.md`
- `docs/research/briefs/B_compression_vs_world_models.md`
- `docs/research/briefs/H_codec_engineering_prior_art.md`
- `docs/rfcs/0001-codec-protocol-v2.md`

Expected outcomes:

- protocol choices
- decoder / adapter stance
- architecture-level ADRs

### R2 — Modality execution and codec engineering

Question:

How should each modality actually land in code, ownership, warnings, manifests,
fixtures, and packaging?

Typical materials:

- `docs/exec-plans/active/codec-v2-port.md`
- `docs/agent-guides/`
- `docs/codecs/`
- `docs/research/briefs/D_cli_and_sdk_conventions.md`
- `docs/research/briefs/H_codec_engineering_prior_art.md`

Expected outcomes:

- port guides
- execution hypotheses
- engineering issues and small RFCs

### R3 — CLI, agent, and runtime surface

Question:

What is the right human / agent-facing surface for a harness-first multimodal system?

Typical materials:

- `docs/research/briefs/D_cli_and_sdk_conventions.md`
- `docs/rfcs/0002-cli-ergonomics.md`
- `docs/research/current-stage-scope-2026-04.md`
- `docs/research/google-stack-object-study-2026-04.md`

Expected outcomes:

- CLI / auth / doctor decisions
- agent workflow guidance
- future interface watchlist

### R4 — Benchmarks, receipts, and reproducibility

Question:

How much evidence is enough for a modality claim to count as real in this repo?

Typical materials:

- `docs/research/briefs/E_benchmarks_v2.md`
- `docs/benchmark-standards.md`
- `docs/reproducibility.md`
- `artifacts/runs/<run-id>/`

Expected outcomes:

- benchmark doctrine
- fixture policy
- provenance and replay constraints

### R5 — Horizon and future bets

Question:

Which external developments might change the repo's direction over the next 6–18
months, and which should be watched without being adopted yet?

Typical materials:

- `docs/research/briefs/C_unproven_horizon.md`
- `docs/research/current-stage-scope-2026-04.md`
- `docs/research/google-stack-object-study-2026-04.md`
- future working notes and watchlists

Expected outcomes:

- "not now" decisions
- new brief candidates
- future RFC seeds

---

## Research surfaces inside the program

The program uses these surfaces:

- **finding** — a local observation, external precedent, or code fact
- **research note** — a scoped working note or broad scan
- **brief** — a pressure-tested claim with `Steelman / Red team / Kill criteria / Verdict`
- **RFC** — design proposal or migration shape
- **ADR** — ratified decision
- **exec-plan** — staged implementation work
- **code / artifacts / manifests** — the empirical and engineering receipts

The normal flow is:

`finding -> note -> brief / issue -> RFC -> ADR / exec-plan -> code`

Not every item reaches the end of the chain. Some notes remain watchlists by design.

For the concrete note-vs-brief rules, see:

- [`README.md`](README.md)

---

## Current scope

Current scope is intentionally narrower than the total research horizon.

### In scope now

- `M2`-serving audio research
- CLI / auth / config / doctor research relevant to near-term execution
- engineering-borrow research from existing frameworks and media tools
- benchmark / evaluation thinking that can shape active implementation lines

### In scope, but not for immediate code

- Google / Gemini / Genkit / ADK as engineering references and future-watch objects
- audio tokenizer landscape
- interactions / agent-runtime standards
- benchmark evolution beyond structural proxies

### Not in scope right now

- full multimodal retrain lines
- doctrine rewrites without a proper decision chain
- broad platform rewrites that outrun the current execution order
- treating a promising note as if it were already a final decision

---

## Blueprints and expansion

This program is meant to be expandable.

The right way to expand it is not to add more abstract categories first. Expand it by
adding:

- a new working note when a broad scan becomes useful
- a new brief when a claim becomes testable
- a new RFC when an interface question hardens
- a new track only when multiple notes/briefs are already clustering around a distinct
  line of inquiry

This keeps the program alive without turning it into bureaucracy.

---

## Possible long-horizon outputs

This repo may eventually support outputs beyond implementation:

- internal research syntheses
- public technical essays
- benchmark notes
- talks or decks
- paper-shaped narratives

That possibility is real, but it should be treated as an outcome of the program, not as
an excuse to make every research file sound like a paper draft too early.

---

## How to use this file

Use this file when:

- you need the top-level map of the research program
- you are not sure whether a new idea belongs in a note, brief, RFC, or issue
- you want to understand how current scope differs from long-horizon scope
- you want a single internal page that links the repo's research services into one
  coherent system

Do not use this file as doctrine. It is a program map.
