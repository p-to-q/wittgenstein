# Image evals reference

What "success" looks like for an image-hybrid-code emission, at three levels.

## Level 1 — Receipt-level (what the codec checks at parse time)

The codec parses your output via `imageCodec.parse(text)`. Success requires:

- valid JSON shape per `ImageSceneSpecSchema`
- if `seedCode` is present: `length === tokens.length`, `tokens.length >= 1`
- if `coarseVq` is present: `tokens.length === tokenGrid[0] * tokenGrid[1]`
- if `providerLatents` is present: same area constraint
- `decoder.codebook` non-empty
- `mode` is one of the four valid enum values

Receipt evidence in `manifest.json`:

- `imageCode.path` ∈ `{"provider-latents", "coarse-vq", "visual-seed-code", "semantic-fallback"}` — which layer the runtime actually used
- `imageCode.semanticSource` ∈ `{"emitted", "legacy-top-level", "absent"}` — how semantic content was provided
- `imageCode.seedFamily` / `seedMode` / `seedLength` — when seed code fired
- `imageCode.coarseVqGrid` / `providerLatentGrid` — when coarse / provider paths fired

## Level 2 — Run-level (the artifact actually rendered)

After parse, the runtime expands your code through the adapter and frozen decoder. A successful run produces:

- a real PNG at `art.outPath`
- `manifest.artifactSha256` matches the on-disk file
- `manifest.ok === true`
- determinism: same `seed` + same `seedCode` + same decoder = same artifact bytes (under the frozen-decoder doctrine; the v0.3 placeholder path is deterministic per-machine)

Three back-to-back invocations with the same seed should produce identical `artifactSha256`.

## Level 3 — Quality (proxy until M5a benchmark bridge lands)

Today the receipts table claims structural integrity, not aesthetic frontier quality. Quality bridges land at M5a (Brief E):

- CLIPScore — text-image alignment
- VQAScore — fidelity to prompt
- aesthetics scoring (post-M5a candidate)

Until those land, "good seed code" is judged by:

- the receipt path you wanted is the path that fired
- the artifact bytes are stable per seed
- the semantic layer (when emitted) reads coherent to a human reviewer
- no warning fires for "providerLatents failed validation" or "Using placeholder seed-expansion adapter" (if you emitted a stronger layer)

## Anti-patterns (you wanted to win but didn't)

- Emitted `providerLatents` with bogus tokens just to "force" the strongest path — adapter rejects, falls through, manifest records `path: "semantic-fallback"`. Hopeful overclaim.
- Emitted only `mode: "one-shot-vsc"` without an actual `seedCode` — manifest records `path: "semantic-fallback"`. Mode declares intent, not output.
- Emitted both `seedCode` and `providerLatents` thinking it's "safer" — fine, but the runtime uses `providerLatents` and your seedCode is dropped. Choose one strongest layer per intent.

## How to read your own receipt

After a render:

```bash
cat artifacts/runs/<run-id>/manifest.json | jq '.imageCode'
```

This object tells you which layer fired and what shape it had. If `path !== "visual-seed-code"` when you intended VSC, your seed validation failed silently — re-emit with valid bounds.
