# Reserve paths

> Design alternatives that were seriously considered for a specific phase, weighed
> against the canonical plan, and **shelved without rejection**. They are captured
> here so we do not re-litigate them from scratch later, and so the reasoning for
> not picking them is visible. None of these have ADR weight; an ADR is required
> if one is ever activated.

**Status of every entry below: 📦 Sealed — not on any active phase plan. Re-open
only with a written trigger (a "what would flip this" line is mandatory).**

## Index

| ID     | Path                                                            | Considered for   | Why sealed                                                                                |
| ------ | --------------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------- |
| RP-001 | Two-round LLM interaction (prompt-expansion → schema JSON)      | `codec-image` M1 | One-round + schema-in-preamble + `--expand` flag covers the same ground without 2× cost.  |
| RP-002 | Image-with-text composition at L5 (pixel-grid char correctness) | `codec-image` M1 | Out of scope for v0.2 image goals; better solved at the codec/L5 boundary if ever needed. |

---

## RP-001 — Two-round LLM interaction

**One-line shape.** Round 1: the LLM expands the user prompt into a richer
natural-language description (no schema). Round 2: a second LLM call produces the
schema-constrained `ImageSceneSpec` JSON, conditioned on the round-1 expansion.

**Why it was attractive.**

- Mirrors Anthropic "Building Effective Agents" prompt-chaining pattern.
- DALL-E 3's caption-rewriting and Imagen's T5 conditioning both improved fidelity
  by separating "describe" from "constrain".
- Plausibly raises JSON quality on under-specified user prompts.

**Why it is sealed (not selected for M1).**

- The canonical M1 path is **one LLM round, schema-in-preamble**, with an
  opt-in `--expand` flag (see `docs/exec-plans/active/codec-v2-port.md` M1 row).
  That flag already gives us the A/B surface; promoting two-round to default
  doubles token cost and latency without measured win.
- The structured-output literature (Outlines, XGrammar, JSONformer) shows
  schema-in-preamble holds up well at modern model quality. Burden of proof is
  on the two-round side.
- Adds a second failure mode (round-1 drift away from the user's intent) that
  the manifest spine has to reconcile.

**What would flip this.**

- `--expand` A/B on a fixed prompt set shows ≥X% lift on a real quality metric
  (Brief E: VQAScore or CLIPScore), at cost the user accepts. _X is set when the
  benchmark bridge lands at M5a._
- A specific user prompt class (e.g. extremely terse: "tree") consistently
  collapses under one-round but recovers under two-round.

**If ever activated.** Promote `--expand` from flag to default behind an ADR
that documents the cost delta and the metric lift. Keep one-round as
`--no-expand` escape hatch.

---

## RP-002 — Image-with-text composition at L5

**One-line shape.** When the user asks for an image that contains text (a sign,
a label, a caption), the L5 packaging step composes the text glyphs onto a
pixel grid after the L3 decoder has rendered the image, so character-level
correctness does not depend on the decoder generating legible letterforms.

**Why it was attractive.**

- Rendering legible text is the single most visible failure mode of every
  current image model (DALL-E 3, Imagen, SD3, native multimodal models too).
- L5 is deterministic and already owns packaging concerns; a font-rasteriser
  there is small, predictable, and bit-exact reproducible.
- Cleanly separates "what the image looks like" (L3) from "what it must
  contain literally" (L5), which matches Wittgenstein's layer doctrine.

**Why it is sealed (not selected for M1).**

- v0.2 `codec-image` goals do not include text-bearing images. Adding a
  composition path before the base decoder is wired is premature.
- Composition at L5 needs `ImageSceneSpec` to carry text-region metadata
  (position, font, content). That schema change should not happen on
  speculation — wait for a real product need.
- It is _not_ a research bet; it is an engineering feature. Lands later as a
  small L5 extension when justified, not as part of M1.

**What would flip this.**

- A concrete v0.3+ user case where text-in-image is required (UI mockups,
  charts with labels, signage).
- Decoder choice (per Brief G G1: VQGAN-class) is confirmed unable to render
  legible glyphs at the resolution we ship, AND a user case from above exists.

**If ever activated.** Land as an L5 sub-step in `codec-image` packaging,
gated by an `ImageSceneSpec.textRegions?` field. Manifest records the
post-decoder composition step as a distinct artifact-transform row.

---

## Process

- **Adding an entry.** A reserve path enters here when (a) it was considered
  for a specific phase, (b) the phase plan picked something else, (c) it is
  worth not re-deriving later. Each entry has: one-line shape, why attractive,
  why sealed, what-would-flip, if-activated.
- **Removing an entry.** Either it gets activated (becomes an RFC + ADR + code,
  and this row is replaced by a pointer), or it is formally retired (a row is
  added explaining the retirement reason).
- **No silent edits.** This file is part of the doctrine spine; changes go
  through PR review like any other doc.
