# Inheritance Audit — what carries forward, what doesn't

> **Purpose.** As Wittgenstein enters the v0.2 restructuring phase, this document enumerates every claim, bet, stub, and convention currently carried by the repo and explicitly files it under **Keep**, **Promote**, **Revise**, or **Retire**. Nothing is allowed to silently survive; nothing is allowed to silently die.

**Companion to:** [`THESIS.md`](THESIS.md) (what is locked) and the phased v0.2 plan (what we do about everything else).

**Dated:** 2026-04-23 · **Review cadence:** after P2 research briefs land.

---

## How to read this doc

Every row has four fields:

| Field | Meaning |
|---|---|
| **Item** | The claim, convention, or artifact |
| **Source** | Where it's written down today (file path, ADR, or PPT/verbal) |
| **Status** | `Keep` / `Promote` / `Revise` / `Retire` |
| **Action** | Follow-up doc, RFC, or ADR that handles it (or "—" if closed) |

`Keep` = frozen. `Promote` = already believed but not yet written down; needs first-class doc. `Revise` = open question, goes into an RFC. `Retire` = scheduled for deprecation; retiring ADR must cite what replaces it.

---

## §1 — Keep as-is (locked; any change requires ADR)

| # | Item | Source | Action |
|---|---|---|---|
| K-1 | Five-layer foundation L1–L5 (Harness / IR / Renderer / Adapter / Packaging) | `docs/architecture.md`, ADR-0003 | — |
| K-2 | Decoder ≠ generator — frozen decoders in, general generators out of default path | ADR-0005 | — |
| K-3 | No silent fallbacks; all failures return structured errors with a manifest | `docs/hard-constraints.md:300` | — |
| K-4 | No diffusion in the core image path | `docs/hard-constraints.md:299`, ADR-0005 | — |
| K-5 | Schema preamble + JSON contract + zod parse at every LLM boundary | `packages/core/src/schema/preamble.ts`, `packages/core/src/schema/validate.ts` | — |
| K-6 | `RunManifest` spine — git SHA, lockfile hash, seed, LLM I/O, artifact SHA-256, cost, latency, error taxonomy | `packages/schemas/src/manifest.ts`, `docs/reproducibility.md` | — |
| K-7 | Hackathon slide lineage as public narrative: Wittgenstein 1921 → van den Oord 2017 → Brown/Sutskever 2020 → Rombach/Esser 2021–22 → Ge/Zhao/Shan 2023–24 → Wittgenstein 2026 | PPT only today; re-home into `README.md` front-matter during P5 | — |
| K-8 | Anthropic *Building Effective Agents* + HumanLayer *12-Factor Agents* as architectural anchors | `docs/references/03_Research_Reference_Dossier.md` | — |
| K-9 | TypeScript + Node 20 + pnpm workspaces locked as core toolchain | `docs/hard-constraints.md:303` | — |
| K-10 | 35-artifact showcase frozen as v0.1.0-alpha.2 receipt | `SHOWCASE.md`, `artifacts/showcase/workflow-examples/` | — |
| K-11 | Master thesis — "modality harness for text-first models" | `THESIS.md` | — |
| K-12 | Path C (Chameleon / LlamaGen full retrain) is *not* pursued | `THESIS.md` | ADR-0007 (formal) |

---

## §2 — Promote: believed but not yet first-class (write down in P2)

These are things we already act as if we've decided, but the decision lives in slides, chat, or the back of `compression-view-of-llms.md`. P2 turns each into a citable doc.

| # | Item | Where it lives today | Action |
|---|---|---|---|
| P-1 | Ilya / Kolmogorov / Hutter / Jack Rae *Compression for AGI* lineage as the formal ground of "why text LLMs already know about images" | Implicit in `docs/research/compression-view-of-llms.md`; full argument only in PPT/head | Brief R2 |
| P-2 | "<5 % extra inference-token overhead, zero model-side intervention" — the quantitative value proposition | PPT only | Brief R2 appendix; re-home into `README.md` section during P5 |
| P-3 | Anthropic Claude Managed Agents (brain / harness / sandbox split, Mar–Apr 2026) as industry-side validation | Not cited | Brief R4 |
| P-4 | METR 2024 result: harness improvement ≈ major model upgrade | Not cited | Brief R4 |
| P-5 | Formal rejection of Path C (Chameleon-style retrain) — why, and what it tells pitch audiences | Verbal, not written | ADR-0007 |
| P-6 | Our position on the Ilya ↔ LeCun tension | Not written | Brief R2 → ADR-0006 |
| P-7 | "<Any symbolisable modality can be generated autoregressively by a strong-enough text LLM, given the right codec>" as the extension of Wittgenstein's TLP 5.6 | Verbal / slide | `THESIS.md` extension block (done) + Brief R3 |
| P-8 | Adapter universality hypothesis — one light-weight adapter shape works across all L2→L4 projections | Implicit; only image MLP exists | Brief R3 hypothesis #6 |

---

## §3 — Revise: known-open decisions, each owned by a specific RFC

| # | Item | Current state | Open question | Decision venue |
|---|---|---|---|---|
| V-1 | Pipeline shape — one LLM call vs two | `codec-image/src/pipeline/expand.ts` does one (schema in preamble) | Is two-round (expand → schema) empirically better? What's the cost? | RFC-0001 §pipeline, E2 |
| V-2 | Naming of the middleware layer (informal "Parasoid") | Not named consistently in code or docs | Keep, rename, or drop? What do we call Adapter/Decoder at the concept level? | RFC-0003 |
| V-3 | `wittgenstein.wtf` content | Unknown staleness vs repo | Which claims on site contradict v0.1.0-alpha.2? | RFC-0004 (driven by R6) |
| V-4 | Per-modality quality metrics | Structural proxies only (`benchmarks/README.md`) | Smallest set of *real* metrics runnable locally per modality? | Brief R5 |
| V-5 | CLI ergonomics vs industry baseline | 10 subcommands, custom flag shape | How do `openai` / `kimi` / `gh` do it; what do we match vs keep? | Brief R4 → RFC-0002 |
| V-6 | L4/L5 generalisation beyond image | Only `codec-image/src/pipeline/{adapter,decoder}.ts` instantiates the split; and both are stubs | Can the same split carry audio / sensor / video cleanly? | RFC-0001 §L4-L5 generalisation |
| V-7 | Hackathon slide lineage location | PPT only | Re-home into which repo files, in what sequence? | P5 doc: `SYNTHESIS_v0.2.md` |

---

## §4 — Retire: scheduled for deprecation (ADR required to ship)

Every retirement row must cite **what replaces it** before the retirement lands. No vacuums.

| # | Item | File:line today | Replaced by | Retiring ADR |
|---|---|---|---|---|
| R-1 | Request-level strategy field `AudioRequest.route` | `packages/schemas/src/modality.ts:30–45` | Codec-owned strategy selection via `codec.route(spec, ctx)` | ADR-0008 |
| R-2 | Request-level strategy field `SvgRequest.source` | `packages/schemas/src/modality.ts` | Codec capability declaration | ADR-0008 |
| R-3 | Request-level strategy field `AsciipngRequest.source` + `minimaxModel` | `packages/schemas/src/modality.ts` | Codec capability declaration | ADR-0008 |
| R-4 | Request-level escape hatch `VideoRequest.inlineSvgs` | `packages/schemas/src/modality.ts` | Proper video IR + optional raw-frames adapter | ADR-0008 |
| R-5 | Harness-level modality branching | `packages/core/src/runtime/harness.ts:123–137` | Unified `codec.generate(request, ctx)` call; harness inspects only `kind` | ADR-0008 |
| R-6 | Manifest `llmProvider` / `llmModel` post-hoc override blocks | `packages/core/src/runtime/harness.ts:139–172` | Codec-authored `RenderResult.metadata`; core merges only | ADR-0008 |
| R-7 | Audio-route copy-paste (`finalizeAudioArtifact` boilerplate across 3 files) | `packages/codec-audio/src/routes/{speech,soundscape,music}/index.ts` | Shared `Route<Spec, Result>` builder | ADR-0008 |
| R-8 | Trivial three-file sensor-signal dispatch | `packages/codec-sensor/src/signals/{ecg,gyro,temperature}.ts` | Shared `Route` primitive; three rows in a registry, not three files | ADR-0008 |
| R-9 | "`Parasoid`" as informal placeholder for the middleware layer | Verbal | Named replacement TBD | ADR-0010 (naming pass) |
| R-10 | Any assumption that "decoder ≠ generator" is image-only | ADR-0005 prose | Amended ADR-0005 + generalised RFC-0001 interface | ADR-0008 |

---

## §5 — Not-in-scope-this-phase (parked, documented for honesty)

These items show up in conversation but are explicitly **not** decided in P1–P5. They are parked so nobody re-litigates them inside the current phase.

| # | Question | Why parked | What would un-park it |
|---|---|---|---|
| N-1 | Shipping a real LlamaGen / Emu3 / SEED decoder bridge | Belongs to P6 execution + a separate research spike | RFC-0001 landed; decoder choice follows |
| N-2 | Shipping a real JEPA-style planner inside L1+ | Conditional on R2 verdict | Brief R2 verdict is *Layered* (position iii) |
| N-3 | Rewriting `wittgenstein.wtf` | Needs R6 diff first | RFC-0004 merged |
| N-4 | New modality (e.g. 3D, embodied action, tabular, tactile) | RFC-0001 must land before new surfaces are added | ADR-0008 merged |
| N-5 | Real perceptual benchmarks (CLIPScore, WER, UTMOS) | Needs R5 survey first | Brief R5 merged |
| N-6 | Fine-tuning *any* base LLM | Violates delay-training principle; only adapters are trained | Would require superseding `THESIS.md` + ADR-0004 |

---

## Change policy

- Rows can move *toward* the locked columns (Revise → Keep, Promote → Keep) without an ADR, if a merged brief or RFC provides the evidence.
- Rows cannot move *out of* Keep without an ADR that supersedes the relevant prior ADR.
- A new row can be added at any time by PR; it starts in Revise by default.

---

## Verification

- Every `Promote` row names a specific brief or ADR that will carry it.
- Every `Revise` row names a specific RFC or brief as its decision venue.
- Every `Retire` row names its replacement.
- Every `Parked` row names its un-park condition.

If any row breaks one of these four invariants, this doc has a bug and must be patched before it merges.
