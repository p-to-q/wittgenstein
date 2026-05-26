# RFC-0005 — Naming lock v2 (supersedes RFC-0003)

**Date:** 2026-04-24
**Author:** engineering (@Jah-yee @Moapacha)
**Status:** 🟢 Locked
**Feeds from:** `docs/v02-alignment-review.md` §2.2, RFC-0001 (Codec Protocol v2), Brief B (agnostic IR), `AGENTS.md` §Architectural vocabulary, original PPT (`docs/references/01_Build_Book.md`)
**Supersedes:** RFC-0003 (Loom / Transducer / Score / Handoff — rejected as over-engineered)
**Ratified by:** ADR-0011

**Summary:** The architecture already has names. They are in the PPT, in `AGENTS.md`, and in every package directory. Lock them as-is. Retire the RFC-0003 rename.

---

## Context

RFC-0003 invented four replacement names (Loom, Transducer, Score, Handoff) for slots the codebase had been referring to as _harness_, _codec_, _spec_, and _IR_. The alignment review on 2026-04-24 (`docs/v02-alignment-review.md` §2.2) compared the RFC-0003 vocabulary against:

- the original hackathon PPT (`docs/references/01_Build_Book.md` slides 8–14) — uses _harness_, _codec_, _adapter_, _decoder_, _Scene Spec JSON_, _Modality IR_
- `AGENTS.md` §Architectural vocabulary — uses _Harness / Codec / IR / Decoder / Adapter / Packaging_
- every package directory — `packages/core/runtime` (harness), `packages/codec-*` (codec)

The RFC-0003 names did not exist anywhere in the codebase or the original pitch. They were an unforced rename. A senior reader coming into the repo would correctly ask _"why did you invent four new words for four things that already had names?"_

The answer is we should not have. Lock the existing vocabulary.

## Proposal

The v0.2 architecture vocabulary, locked:

| Slot                                                                     | Locked name                                                 | Source                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------- | ----------------------------------------------- |
| L1 runtime — routing, retry, seed, budget, telemetry                     | **Harness**                                                 | AGENTS.md, PPT slide 9                          |
| L2 middleware — the per-modality module that owns the produce primitive  | **Codec**                                                   | AGENTS.md, PPT slide 10, all `packages/codec-*` |
| L2 typed input — the structured description the LLM writes               | **Spec** (concrete: `SceneSpec`, `AudioSpec`, `SensorSpec`) | PPT slide 11 ("Scene Spec JSON")                |
| L2 intermediate — the sum type `Text \| Latent \| Hybrid` out of Brief B | **IR**                                                      | AGENTS.md, Brief B verdict                      |
| L3 renderer — IR-to-bytes, frozen-decoder preferred                      | **Decoder**                                                 | ADR-0005, AGENTS.md                             |
| L4 optional bridge — small learned translator shipped beside a codec     | **Adapter**                                                 | AGENTS.md                                       |
| L5 distribution — CLI, install, schemas, agent primers                   | **Packaging**                                               | AGENTS.md                                       |

Rejected RFC-0003 renames and why:

- **Loom → Harness**: "Loom" is a weaving metaphor; "Harness" is what Anthropic and METR 2024 already call the concept. We explicitly inherit this vocabulary in ADR-0003 and in `README.md`. Renaming costs readability for agents that have seen "harness" in 10× more prior art.
- **Transducer → Codec**: "Transducer" is a signal-processing term with a different existing meaning (input-to-output streaming). "Codec" is what the directories are named, what the ADR-0004 image path calls it, and what the PPT calls it. Rename cost with zero semantic gain.
- **Score → Spec**: "Score" leaks a music metaphor that breaks for sensor/ECG and video modalities. "Spec" is already used by every LLM structured-output library (Outlines `Schema`, OpenAI `response_format`, Anthropic `tool_use`). Better grep surface.
- **Handoff → IR**: "Handoff" implies agent-to-agent (Anthropic Managed Agents uses it this way). Our sum type is a data type, not a control-flow boundary. "IR" is the term Brief B adopted and is stable compiler-world vocabulary.

## Interface

No code-surface change from this RFC alone — the vocabulary lock is documentation-layer. Agents reading the repo should find:

- `AGENTS.md` §Architectural vocabulary as the primary reference (unchanged)
- `docs/architecture.md` using only the locked names (verify in alignment PR)
- `packages/*` directory names already matching (`codec-image`, `codec-audio`, etc.)
- no package or file named `loom-*`, `transducer-*`, `score-*`, or `handoff-*`

The one doc-layer change: `THESIS.md §Open` currently lists "Naming of the middleware layer (informal 'Parasoid' is not binding)" as open — this can now move to _resolved: the middleware layer is `Codec`_.

## Migration

- **M1 (this RFC's merge):** alignment PR edits the five docs that still reference the RFC-0003 names — RFC-0003 (superseded banner, done), ADR-0010 (superseded banner, this PR), SYNTHESIS_v0.2.md §12, `docs/adrs/README.md` line 16, and the tracks.md mention if any.
- **M2 (follow-up, small PR):** `THESIS.md §Open` strike the naming bullet. `docs/inheritance-audit.md` move N-3 from _revise_ to _resolved_.
- **M3 (no code PR needed):** no rename work in `packages/*` because we never renamed anything — we reverted a rename that had not yet shipped in code.

## Red team

- **"You just admitted the naming pass produced nothing. That's a process failure."** Partially. The naming pass _did_ produce a finding — that the existing names survived pressure-testing. That is a legitimate verdict, but it should have been reached in one paragraph of the alignment review, not a full RFC + ADR pair. The process failure is that RFC-0003 shipped without checking AGENTS.md and the PPT first. RFC-0005 corrects that.
- **"`Codec` is overloaded — MP3, H.264, etc."** Yes, and that overload is useful. A reader who sees `codec-image` understands the shape — structured-input-to-bytes — without reading docs. The overload cost is less than the "what is a Transducer?" cost.
- **"What about future modalities that don't fit the Codec metaphor?"** If that happens, add a sibling slot (e.g., `Sensor`, `Synth`) rather than renaming Codec. Metaphor-fit is per-slot, not global.

## Kill criteria

- If a senior contributor can produce a package-level API that is genuinely more readable under Loom/Transducer than under Harness/Codec, reopen. Standing offer.
- If any of Harness / Codec / Spec / IR / Decoder / Adapter / Packaging develops a collision with inherited Anthropic / OpenAI / METR vocabulary such that agent-facing prose becomes ambiguous, rename the colliding slot individually — not the whole set.

## Decision record

- **Accepted by:** ADR-0011 (locks the vocabulary, supersedes ADR-0010).
- **Supersedes:** RFC-0003.
- **Superseded by:** —
