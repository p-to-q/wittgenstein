# Image troubleshooting reference

Common rejection patterns at the codec boundary and how to fix them.

## Schema rejection — `tokens length must match tokenGrid area`

You emitted `coarseVq` or `providerLatents` with `tokenGrid: [W, H]` but `tokens.length !== W * H`.

**Fix.** Make the grid exactly square the array. Example: `tokenGrid: [4, 4]` requires 16 tokens.

## Schema rejection — `length must match tokens length when provided`

You emitted `seedCode` with both `length` and `tokens` set, but they disagree.

**Fix.** Either omit `length` (the schema accepts it as derivable) or make it equal `tokens.length`.

## Schema rejection — `tokens array empty`

You emitted `seedCode.tokens: []` or `coarseVq.tokens: []`.

**Fix.** Visual code arrays are `min(1)`. Even a single non-negative integer is valid.

## Mode rejection — unknown enum value

You emitted `mode: "creative"` or `seedCode.mode: "fancy"`.

**Fix.** Top-level `mode` is `"semantic-only" | "one-shot-vsc" | "two-pass-compile" | "provider-latents"`. `seedCode.mode` is `"prefix" | "coarse-scale" | "residual" | "lexical"`.

## Decoder hint rejection — empty codebook

You emitted `decoder: { codebook: "" }` or omitted `codebook` entirely.

**Fix.** `codebook` is `string.min(1)`. Use `"stub-codebook"` if no real codebook is wired.

## Manifest receipt says `path: "semantic-fallback"` but you emitted `seedCode`

The schema rejected your `seedCode` (validation failure → silent fall-through to MLP fallback). The codec logs a warning at this boundary.

**Fix.** Re-validate locally:

```ts
import { ImageVisualSeedCodeSchema } from "@wittgenstein/codec-image/schema";
const result = ImageVisualSeedCodeSchema.safeParse(yourSeedCode);
if (!result.success) console.error(result.error.issues);
```

## Manifest receipt says `path: "provider-latents"` when you didn't intend it

Your `providerLatents` slot was populated and validated. The codec uses the strongest layer present.

**Fix.** If you wanted seed expansion specifically, omit `providerLatents` so `seedCode` becomes the active layer.

## Adapter warning: `Using placeholder seed-expansion adapter`

No MLP weights resolved at runtime, and your scene didn't include `seedCode` / `coarseVq` / `providerLatents`. The codec is using deterministic-stub latents.

**Fix.** Either set `WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH` / `WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH` to point at trained weights, or emit at least a `seedCode` layer.

## Output contains forbidden surfaces (SVG, HTML, Canvas, raw pixels)

The codec rejects these at the parse boundary because the image route is single-shipping (`hard-constraints.md`). There is no fallback to vector or canvas.

**Fix.** If the user explicitly wants vector output, route through the SVG codec instead of the image codec. SVG is a separate modality, not an image escape hatch.
