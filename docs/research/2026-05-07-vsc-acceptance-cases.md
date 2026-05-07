---
date: 2026-05-07
status: research note
labels: [research-derived, m1-image]
tracks: [#207]
---

# Visual Seed Code — one-shot vs two-pass acceptance cases

> **Status:** research note (not doctrine, not active execution guidance).
> Defines the model-output shapes the VSC contract should accept, the failure modes for each lane, and the acceptance criteria a later CLI / prompt slice can use without guessing. Hierarchy preserved per ADR-0018: `VSC primary`, `Semantic IR optional`, `coarseVq experimental bridge`, `providerLatents direct-code path`.
> _Tracker: #207._

## Purpose

The doctrine now says Visual Seed Code is the primary decoder-facing image output (RFC-0006 + ADR-0018). PR #210 landed the `one-shot-vsc` and `two-pass-compile` mode literals, plus the `seedCode` / `coarseVq` schemas. PR #218 landed the receipt evidence. PR #226 landed the SKILL.md surface.

What is still missing is a concrete acceptance-case ledger: for each lane, **what should the model emit, what should the codec accept, what should the codec reject?** This note answers that — small, mechanical, JSON-shaped. It is the input a future prompt slice or a CLI `--mode` slice can read without re-deriving from doctrine.

## Lane A — one-shot VSC

### Default shape

The model emits a single structured response containing `mode: "one-shot-vsc"`, a `seedCode` block, and an optional `semantic` block in the same object.

```jsonc
{
  "mode": "one-shot-vsc",
  "semantic": {
    "intent": "Calm forest path at golden hour",
    "subject": "forest path with ferns and distant light",
    "composition": {
      "framing": "wide shot",
      "camera": "natural",
      "depthPlan": ["foreground ferns", "midground path", "distant trees"]
    },
    "lighting": { "mood": "warm", "key": "low golden side light" },
    "style": { "references": ["landscape photography"], "palette": ["amber", "moss", "umber"] },
    "constraints": { "mustHave": ["natural light"], "negative": ["text"] }
  },
  "seedCode": {
    "schemaVersion": "witt.image.seed/v0.1",
    "family": "vqvae",
    "mode": "prefix",
    "tokens": [12, 7, 41, 88, 3, 17, 9, 220, 145]
  },
  "decoder": {
    "family": "llamagen",
    "codebook": "stub-codebook",
    "codebookVersion": "v0",
    "latentResolution": [32, 32]
  }
}
```

### Acceptance criteria

A one-shot output is **parse-valid** when:

- top-level `mode` ∈ `{"one-shot-vsc", "semantic-only", "two-pass-compile", "provider-latents"}` (or omitted; codec defaults via `normalizeImageSceneSpec`)
- `seedCode.tokens.length >= 1`
- `seedCode.length` (when present) equals `seedCode.tokens.length`
- `seedCode.mode` ∈ `{"prefix", "coarse-scale", "residual", "lexical"}`
- `seedCode.family` non-empty string
- `decoder.codebook` non-empty
- `coarseVq` and `providerLatents`, when present, satisfy their `tokenGrid` area equation

A one-shot output is **adapter-valid** (i.e. fires the seed-code path at runtime) when:

- `seedCode` is present AND `ImageVisualSeedCodeSchema.safeParse` succeeds
- AND no stronger layer fires first: `providerLatents` and `coarseVq` are either absent or invalid

If a stronger layer fires first, the one-shot's `seedCode` is dropped silently in favor of the stronger evidence (priority order from ADR-0018 §6). This is **expected** behavior, not a failure.

### Failure modes

| Failure | What goes wrong | Manifest evidence |
| --- | --- | --- |
| `seedCode.tokens` is `[]` | Schema rejects (`min(1)`) | `manifest.error.code: VALIDATION_ERROR`; no artifact |
| `seedCode.length` set but ≠ `tokens.length` | Schema rejects (superRefine) | Same |
| Unknown `seedCode.mode` | Enum rejects | Same |
| Bogus `providerLatents` (e.g. tokenGrid `[4,4]`, tokens length `3`) | Schema rejects, but adapter falls through to next layer | warning `image/provider-latents-invalid`; receipt path NOT `provider-latents` |
| `seedCode` valid but model emits something the SeedExpander cannot resolve | Adapter runs but produces meaningless latents | Receipt path = `visual-seed-code`; quality.partial may flag low-confidence (post-#218) |
| User-prompt requests SVG / HTML / Canvas | Codec rejects at parse boundary | hard-error per hard-constraints.md |

## Lane B — two-pass compile

The high-quality lane. Two LLM round-trips: pass 1 generates Semantic IR, pass 2 consumes that IR and produces VSC / VQ hints.

### Pass 1 — Semantic IR only

```jsonc
{
  "mode": "two-pass-compile",
  "semantic": {
    "intent": "Calm forest path at golden hour",
    "subject": "forest path with ferns and distant light",
    "composition": { ... },
    "lighting": { ... },
    "style": { ... },
    "constraints": { ... }
  }
}
```

Pass 1 may omit `seedCode` entirely. The codec accepts this as an **intermediate** when `mode: "two-pass-compile"` is declared. The runtime does NOT route to the adapter; it stages the semantic IR for pass 2.

### Pass 2 — Seed code + optional coarseVq

```jsonc
{
  "mode": "two-pass-compile",
  "semantic": { /* echoed from pass 1, OR omitted */ },
  "seedCode": {
    "schemaVersion": "witt.image.seed/v0.1",
    "family": "titok",
    "mode": "lexical",
    "tokens": [/* up to 32 tokens for TiTok-style 1D encoder */]
  },
  "coarseVq": {
    "schemaVersion": "witt.image.coarse-vq/v0.1",
    "family": "llamagen",
    "codebook": "...",
    "codebookVersion": "v0",
    "tokenGrid": [8, 8],
    "tokens": [/* 64 coarse tokens, expanded to 32×32 by adapter */]
  },
  "decoder": { ... }
}
```

### When to use two-pass

- Seed quality from one-shot is too weak (model conflates the planning + coding stages)
- The SeedExpander is sensitive to the semantic conditioning (LoRA-style)
- The user requested `--quality high` (future CLI; not in this slice)

### Acceptance criteria

A two-pass pair is **acceptable** when:

- pass 1 alone parses valid (semantic-only) AND `mode: "two-pass-compile"` is declared
- pass 2's `seedCode` (or `coarseVq` / `providerLatents`) parses valid
- pass 2 references the same `decoder.family` / `codebook` as pass 1 (consistency check; future implementation)

### Failure modes

| Failure | What goes wrong |
| --- | --- |
| Pass 1 emits `seedCode` (jumped lane) | Accept anyway — degrades to `one-shot-vsc` semantics; emit warning `image/two-pass-collapsed-to-one-shot` |
| Pass 2 emits no `seedCode` and no `coarseVq` | Reject — two-pass output must produce at least one decoder-facing layer |
| Pass 2 changes decoder family from pass 1 | Reject — model is hallucinating a different decoder mid-compile |
| Pass 2's `seedCode.tokens.length` exceeds `decoder.latentResolution` area × N (where N is some seed-family-specific multiplier) | Reject — over-emission risk; future tightening per #205 verdict |

## Compatibility fallback policy

Legacy semantic-only inputs (no nested `semantic`, no `seedCode`, no `coarseVq`, no `providerLatents`) MUST continue to parse and route to the MLP semantic-only adapter. This is the v0.3 backwards-compat contract.

### When to accept semantic-only fallback

- Caller is a pre-VSC client that never knew about seed code (likely v0.2.0-alpha era harness or external integrator)
- Test fixtures that target the MLP adapter path specifically (e.g. `test/adapter-resolve.test.ts`, `test/mlp-runtime.test.ts`, `scripts/render-image-adapter-demo.ts`)
- The model emitted `mode: "one-shot-vsc"` but its `seedCode` failed schema validation; adapter falls through to MLP fallback (warning fired, not a hard error)

### When to reject

- The caller declares `mode: "one-shot-vsc"` AND emits `seedCode: null` or `seedCode: undefined` AND there is no upstream stronger layer. This is now declarable-intent without follow-through; reject as schema violation if a future tightening lands.
- The caller declares `mode: "two-pass-compile"` but emits only one pass without staging the second.
- The caller emits an unknown `mode` literal.

## Acceptance-case test matrix (for a future test slice)

The following table is the minimum coverage for a `test/vsc-acceptance.test.ts` file the next slice would land:

| # | Lane | Input shape | Expected `imageCode.path` | Expected manifest.ok |
| --- | --- | --- | --- | --- |
| 1 | one-shot-vsc | seedCode valid, no semantic | `visual-seed-code` | true |
| 2 | one-shot-vsc | seedCode valid + semantic emitted | `visual-seed-code` | true |
| 3 | one-shot-vsc | providerLatents valid + seedCode valid | `provider-latents` (priority) | true |
| 4 | one-shot-vsc | coarseVq valid + seedCode valid | `coarse-vq` (priority) | true |
| 5 | one-shot-vsc | seedCode bogus (length mismatch) | parse-rejected | false |
| 6 | semantic-only | legacy top-level fields, no nested | `semantic-fallback` | true |
| 7 | semantic-only | nested semantic, no seedCode | `semantic-fallback` | true |
| 8 | two-pass-compile | pass 1 only (semantic-only with mode tag) | (intermediate; no adapter dispatch) | future |
| 9 | two-pass-compile | pass 2 with seedCode | `visual-seed-code` | true |
| 10 | invalid | mode = "weird-mode" | parse-rejected | false |

Cases 1–7 + 10 already exist or are covered in `packages/codec-image/test/codec.test.ts` (post-#224). Cases 8–9 require two-pass orchestration support (future CLI slice).

## Boundaries this note does NOT cross

- **Tokenizer family selection** — that is #205. This note assumes a tokenizer family is a parameter, not a verdict.
- **CLI flag implementation** (`--mode`, `--quality`, two-pass orchestration) — partial inspection lands via #234 / `--show-image-code` etc.; mode controls remain future work.
- **Doctrine wording** — RFC-0006 / ADR-0018 already define the architecture.
- **Seed-expansion adapter training** — that is post-M1B (#70 reframed) territory.

## What a downstream slice can read from this

A future prompt-stack work or CLI `--mode` slice can use this note as the source-of-truth ledger for which inputs to test against, which failure modes to expose at the CLI boundary, and which fallback path is honest. No re-derivation from doctrine required.
