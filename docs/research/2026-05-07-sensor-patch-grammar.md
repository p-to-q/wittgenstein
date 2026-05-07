---
date: 2026-05-07
status: research note
labels: [research-derived, m3-sensor]
tracks: [#221, #154]
---

# Sensor — Lightweight patch/operator route inspired by TimesFM

> **Status:** research note (not doctrine, not active execution guidance).
> Extracts the **principle** from TimesFM-class time-series models and proposes a deterministic patch operator that fits into the existing `SensorOperatorSchema` discriminated union. **Adopts no model dependency.** Sensor stays an algorithmic / operator-expansion modality per ADR-0005 and the existing codec contract.
> _Tracker: #221._
>
> **Implementation lineage:** Option A landed in PR #244 after #221 was closed; contract follow-up #247 corrected patch-local time semantics, capped recursion at depth 1, and tightened `affineNormalize` bounds. The current code in `packages/codec-sensor` is the post-#247 corrected shape. This note remains the design source-of-truth for *intent*; the canonical operator-by-operator semantics live in `docs/codecs/sensor.md`.

## Why this exists

#154 keeps TimesFM itself as a tracker (external open-weights gating event). But the **conceptual ingredients** TimesFM uses — patching, local normalization, chunked expansion, optional uncertainty envelopes — are useful regardless of whether we ever wire a neural decoder. This note extracts those ingredients into a **deterministic operator** the existing codec can ship without dragging PyTorch / JAX / model weights into `packages/codec-sensor`.

Per partner #236 ask: "Keep research small but sharp: extract principle, not a model dependency."

## What this note does NOT do

- Does NOT add TimesFM, PyTorch, JAX, ONNX, or any neural forecasting dep
- Does NOT turn sensor into a learned decoder route (ADR-0005 still holds)
- Does NOT promote this to doctrine — it's a research-and-design note for a future M3+ slice
- Does NOT pre-empt M3 Codec Protocol v2 sensor port (M3 keeps the existing surface)

## Principle extracted

TimesFM-style models share four ingredients that work even without learned weights:

1. **Patching** — chop the timeline into fixed-size chunks (`patchLengthSamples`)
2. **Local affine normalization** — within each patch, normalize to a canonical range so cross-patch shape comparisons are scale-invariant
3. **Chunk-wise expansion** — emit each patch by referencing prior patches plus a deterministic transformation (e.g. shift, scale, gentle drift)
4. **Optional uncertainty envelope** — narrow / wide quantile bands attached to each patch as side-channel metadata

Wittgenstein's existing operator union (`oscillator | noise | drift | pulse | step | ecgTemplate`) is a **flat** generator catalog. The patch principle adds a **higher-order** operator that composes lower-order ones over named patch boundaries.

## Candidate design space

Three options, in order of complexity:

### Option A — `patchGrammar` operator (preferred; smallest)

A deterministic operator that emits a sequence of small patches. Each patch references one or more existing operators with **patch-local parameters** — `step.atSec`, `pulse.centerSec`, `oscillator.phaseRad`, `drift` origin, and `ecgTemplate` phase are all measured relative to the patch boundary, not absolute time. (Pinned in #247 after the initial #244 implementation kept absolute time; see `docs/codecs/sensor.md` for the canonical semantics table.)

```ts
{
  type: "patchGrammar",
  patchLengthSec: 1.5,           // patches are 1.5s long
  patches: [
    {
      operators: [
        { type: "oscillator", frequencyHz: 1.7, amplitude: 0.42 }
      ],
      affineNormalize: { minOutput: -1, maxOutput: 1 }   // optional local norm
    },
    {
      operators: [
        { type: "oscillator", frequencyHz: 1.9, amplitude: 0.45 },
        { type: "noise", color: "white", amplitude: 0.06 }
      ],
      affineNormalize: { minOutput: -1, maxOutput: 1 }
    },
    // ... N patches; total covers durationSec
  ]
}
```

**Why this is small:**
- Reuses existing `SensorOperatorSchema` recursively inside each patch
- `affineNormalize` is the local-affine ingredient (no learned anything)
- Patches concatenate at runtime, no overlap-add or interpolation magic
- Schema extension is one new union variant + one new optional field

**Done-when (future implementation):**
- New `patchGrammar` literal in the discriminated union
- `expandPatchGrammar(spec, sampleRate)` deterministically renders the patch sequence
- Existing 3 sensor goldens continue to byte-match
- One new golden fixture per signal family that uses `patchGrammar` exclusively

### Option B — `chunkExpand` operator with quantile envelope

Adds explicit uncertainty metadata to each patch. Deterministic for the central trace; quantile bands are side-channel only (not used by the existing render).

```ts
{
  type: "chunkExpand",
  patchLengthSec: 1.5,
  patches: [
    {
      central: [...operators...],
      quantileLowOffset: -0.15,    // sidecar metadata, not affecting central trace
      quantileHighOffset: 0.15
    }
  ]
}
```

**Pro:** more faithful to TimesFM's quantile head idea; produces honest uncertainty receipts.
**Con:** quantile metadata has nowhere to go in the current `RenderResult.metadata` shape. Adding a `signalEnvelope` channel is a sensor-codec schema change with bigger blast radius. **Defer until Option A is wired and motivates the second receipt channel.**

### Option C — full neural patch decoder

Would require importing a PyTorch / ONNX inference path, paired weights, and a license check.

**Per the issue body and ADR-0005:** OUT OF SCOPE. Stays a tracker (#154).

## Acceptance criteria for the future implementation slice

If a contributor (post-M3) implements Option A:

| Criterion | Source |
| --- | --- |
| Adds `patchGrammar` to `SensorOperatorSchema` discriminated union | `packages/codec-sensor/src/schema.ts` |
| Implements `expandPatchGrammar(spec, sampleRate, seed): Float64Array` deterministically | `packages/codec-sensor/src/render.ts` |
| Recursive nested operators within patches respect existing operator semantics | unit tests assert `oscillator+noise` inside a patch produces identical output to a top-level `oscillator+noise` over the same time window |
| Existing 3 sensor goldens (PR #125) byte-match | `pnpm test:golden` — already CI-gated |
| One new golden per signal family (ecg / temperature / gyro) using only `patchGrammar` operators | new fixtures under `fixtures/golden/sensor/patch-grammar/` |
| Reproducibility: same `seed` + same `patches` array → byte-identical output | three back-to-back same-seed runs assert identical SHA-256 |

## What stays an open research variable

- Whether `patchGrammar` materially improves expressiveness vs the flat operator catalog. Today's signals (ecg / temperature / gyro) all render fine with 3-operator combinations; the patch primitive is for **richer non-stationary** signals that the flat catalog struggles to compose.
- Whether quantile bands (Option B) earn their slot in the receipt channel.
- Whether other TimesFM ingredients (covariate / side-channel conditioning, look-ahead masking) translate into useful deterministic operators. Today: probably not, but worth re-checking once the patch grammar is in tree.

## Boundaries

- **No model dependency.** Patches are deterministic transformations of existing operators.
- **No M3 disruption.** M3 ports the existing surface to Codec Protocol v2 and preserves goldens; `patchGrammar` is an additive operator that comes AFTER M3.
- **No doctrine change.** This note doesn't propose a new ADR; if Option A is wired and earns its keep over a release cycle, a follow-up ADR can ratify the patch primitive.
- **No silent fallbacks.** Patch-grammar operators that fail to expand surface as structured errors per existing sensor codec discipline.

## Cross-references

- ADR-0005 — decoder ≠ generator (the line this note honors)
- #154 — TimesFM tracker (parent)
- #153 — sensor chaotic operator extension (sibling; patch-grammar may compose with chaotic operators inside patches)
- #155 — downstream-task measurement (sensor route; patch-grammar's output should be evaluable by the same metrics)
- `packages/codec-sensor/src/schema.ts` — current `SensorOperatorSchema` union
- `packages/codec-sensor/src/render.ts` — current operator expansion code
- `docs/codecs/sensor.md` — current canonical sensor doc
