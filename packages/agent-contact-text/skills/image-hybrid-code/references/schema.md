# Image schema reference

Full surface for `ImageSceneSpec` — the container the image codec parses. Source of truth: [`packages/codec-image/src/schema.ts`](../../../../codec-image/src/schema.ts).

## Top-level shape

```ts
{
  schemaVersion: "witt.image.spec/v0.1",          // optional, defaults
  mode: "semantic-only" | "one-shot-vsc" | "two-pass-compile" | "provider-latents",
  semantic: ImageSemanticLayer,                   // optional nested
  // Legacy top-level semantic fields (compat). Prefer nested `semantic`.
  intent: string,
  subject: string,
  composition: { framing, camera, depthPlan: string[] },
  lighting: { mood, key },
  style: { references: string[], palette: string[] },
  constraints: { mustHave: string[], negative: string[] },
  decoder: ImageDecoderHint,
  renderHints: { detailLevel, aspect, seed },
  seedCode: ImageVisualSeedCode,                  // optional
  coarseVq: ImageCoarseVq,                        // optional
  providerLatents: ImageLatentCodes               // optional
}
```

## `ImageVisualSeedCode` (the primary VSC layer)

```ts
{
  schemaVersion: "witt.image.seed/v0.1",
  family: string,                                  // e.g. "vqvae", "titok", "flextok"
  mode: "prefix" | "coarse-scale" | "residual" | "lexical",
  tokenizer: string?,                              // optional vendor tag
  length: number?,                                 // when set, must equal tokens.length
  tokens: number[]                                 // non-empty, non-negative
}
```

- `tokens.length` must be `>= 1` (`z.array().min(1)`).
- `length`, when present, must match `tokens.length` exactly (superRefine).

## `ImageCoarseVq` (optional partial-VQ bridge)

```ts
{
  schemaVersion: "witt.image.coarse-vq/v0.1",
  family: "llamagen" | "seed" | "dvae",
  codebook: string,
  codebookVersion: string,
  tokenGrid: [width, height],
  tokens: number[]                                 // length === width * height
}
```

The runtime nearest-neighbor-upsamples this grid to `decoder.latentResolution`.

## `ImageLatentCodes` (providerLatents — strongest path)

```ts
{
  schemaVersion: "witt.image.latents/v0.1",
  family: "llamagen" | "seed" | "dvae",
  codebook: string,
  codebookVersion: string,
  tokenGrid: [width, height],
  tokens: number[]                                 // length === width * height
}
```

When valid, the codec skips the learned adapter entirely.

## `ImageDecoderHint`

```ts
{
  family: "llamagen" | "seed" | "dvae",
  codebook: string,                                // non-empty
  codebookVersion: string,                         // non-empty (defaults "v0")
  latentResolution: [width, height]                // defaults [32, 32]
}
```

## Annotated good example (one-shot VSC)

```jsonc
{
  "mode": "one-shot-vsc",
  "semantic": {
    "intent": "Calm forest path at golden hour",
    "subject": "forest path, ferns, distant light",
    "composition": {
      "framing": "wide shot",
      "camera": "natural",
      "depthPlan": ["foreground ferns", "midground path", "distant trees"]
    },
    "lighting": { "mood": "warm", "key": "low golden side light" },
    "style": {
      "references": ["landscape photography"],
      "palette": ["amber", "moss", "umber"]
    },
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

## Compatibility note

Legacy clients that emit only top-level semantic fields (no nested `semantic`, no `seedCode`, no `coarseVq`) still parse. The codec sets `mode: "semantic-only"` and routes through the MLP fallback. This is the baseline path; emit at least `seedCode` if you can.
