---
name: image-hybrid-code
description: Plan a Wittgenstein image render by emitting a Visual Seed Code-bearing image contract — seedCode primary, semantic IR optional, providerLatents preferred when available. Use when the user asks for an image artifact through `wittgenstein image` or its programmatic equivalents. Do not use for SVG, video, sensor, or audio.
---

# image-hybrid-code

You plan Wittgenstein's image route. The repo's adapter / decoder turn the structured object you emit into a PNG. You do not emit pixels, SVG, HTML, or Canvas commands.

## When to use

Activate this skill when a user asks Wittgenstein to render an image — including `wittgenstein image "<prompt>"`, the programmatic `imageCodec.parse()` boundary, or any agent driver that targets the image modality.

Do **not** activate for SVG (separate codec), video, sensor, or audio.

## Your role

You are an **image-code planner**, not an artist, not a prompt rewriter, not a decoder. You emit the container the codec parses; the codec, adapter, and frozen decoder do the rest.

## Input assumptions

The caller hands you:

- a user prompt,
- optional output size,
- optional seed,
- optional explicit `mode` hint (`"semantic-only" | "one-shot-vsc" | "two-pass-compile" | "provider-latents"`).

You may not see provider-issued latents directly; only emit `providerLatents` when you can produce decoder-native VQ token indices yourself.

## Output contract

JSON only. Match `ImageSceneSpecSchema` in `packages/codec-image/src/schema.ts`. Default to `mode: "one-shot-vsc"` and emit:

```jsonc
{
  "mode": "one-shot-vsc",
  "semantic": {
    "intent": "...",
    "subject": "...",
    "composition": { "framing": "...", "camera": "...", "depthPlan": ["...", "..."] },
    "lighting": { "mood": "...", "key": "..." },
    "style": { "references": ["..."], "palette": ["...", "..."] },
    "constraints": { "mustHave": [], "negative": [] }
  },
  "seedCode": {
    "schemaVersion": "witt.image.seed/v0.1",
    "family": "vqvae",            // or another seed family you can speak
    "mode": "prefix",             // or "coarse-scale" | "residual" | "lexical"
    "tokens": [/* >=1 non-negative integers */]
  },
  "decoder": {
    "family": "llamagen",         // or "seed" | "dvae"
    "codebook": "...",
    "codebookVersion": "v0",
    "latentResolution": [32, 32]
  }
}
```

`coarseVq` and `providerLatents` are optional. If you can emit decoder-native latents, prefer `providerLatents`. If you can speak a coarse scale, add `coarseVq`. Otherwise `seedCode` alone is correct.

## Path hierarchy (priority order at runtime)

The codec adapter tries paths in this order and uses the first that validates:

1. `providerLatents` — strongest direct-code path; codec skips the learned adapter entirely.
2. `coarseVq` — partial VQ structure, expanded to full grid by nearest-neighbor.
3. `seedCode` — Visual Seed Code; expanded to decoder-native latents.
4. `semantic` (legacy / nested) — semantic-only fallback through the MLP.
5. `placeholder` — deterministic stub when no MLP weights are present.

Emit the strongest layer you can.

## One-shot vs two-pass

- **One-shot VSC (`mode: "one-shot-vsc"`)** — default. Emit seed + optional semantic in a single response.
- **Two-pass compile (`mode: "two-pass-compile"`)** — high-quality lane. Pass 1 emits semantic IR; pass 2 consumes that IR and emits seedCode (and optional coarseVq). Use when you need stronger seed conditioning or when the user explicitly asks for higher fidelity.

## Hard constraints

- No SVG, HTML, Canvas commands, or pixel arrays in the output.
- No second image path. Wittgenstein image has exactly one shipping path: `LLM → Visual Seed Code-bearing contract → seed expander / adapter → frozen decoder → PNG`.
- Decoder ≠ generator. Diffusion-style generators are out of scope (ADR-0005, ADR-0007).
- `tokens` arrays must be non-empty (`min(1)`); `seedCode.length` (when set) must equal `seedCode.tokens.length`; `coarseVq.tokenGrid` area must equal `coarseVq.tokens.length`; same for `providerLatents`.
- `decoder.codebook` and `decoder.codebookVersion` are non-empty strings.

## Validation rules at the boundary

The codec runs zod validation with `superRefine` enforcement. If you emit a malformed code layer, the codec fails loudly and the manifest records the structured error — there is no silent fallback to the next layer at parse time.

## Where to look for depth

- `references/schema.md` — full `ImageSceneSpecSchema` + sibling layers, with annotated examples
- `references/troubleshooting.md` — common rejection patterns and their fixes
- `references/evals.md` — what counts as success at the receipt level

Doctrine source-of-truth:

- `docs/rfcs/0006-hybrid-image-code.md` — the architectural correction
- `docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md` — the ratification
- `docs/codecs/image.md` — runtime contract
- `docs/research/hybrid-image-code-skill-playbook.md` — design rationale for this skill surface
