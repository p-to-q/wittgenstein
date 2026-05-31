---
date: 2026-05-31
status: issue #302 research closeout
labels: [research-derived, cross-modality, architecture]
tracks: [#302, #153, #155, #263, #350, #453]
---

# Fixed-Point Semantics for Recursive Code Layers

This note closes #302. The short verdict: fixed-point semantics are useful as a
review lens for bounded recursive code layers, but Wittgenstein should not add a
literal Y-combinator, Z-combinator, or shared `fix` helper to production
TypeScript now.

The repo already has the right local shape where recursion matters: explicit
named recursion, schema caps, deterministic replay tests, and manifest/golden
receipts. If a future surface needs repeated normalization until stable, it
should start as a local bounded helper with receipts, not as a cross-repo
abstraction.

## External Anchors

Inspected on 2026-05-31:

- GHC `Data.Function.fix` docs:
  <https://ghc.gitlab.haskell.org/ghc/doc/libraries/ghc-internal-9.1500.0-inplace/src/GHC.Internal.Data.Function.html>
- Fixed-point combinator overview:
  <https://en.wikipedia.org/wiki/Fixed-point_combinator>

The useful imported idea is not the syntax of anonymous recursion. It is the
equation:

```text
x = f(x)
```

For this repo, that translates into a product question:

```text
after bounded expansion / normalization, does another pass change the artifact?
```

In Haskell, `fix` is documented as the least fixed point of a function, with a
sharing implementation shaped like `let x = f x in x`. That makes sense in a
lazy language. The same sources also make the TypeScript warning clear:
strict/eager languages do not get useful production behavior from a naive
Y-combinator; they need explicit delay, a counter, named recursion, or ordinary
loops.

## Repo Survey

### Sensor `patchGrammar`

This is the only current runtime surface that is genuinely recursive-shaped.

Evidence:

- `docs/codecs/sensor.md` names `patchGrammar` as the higher-order operator
  that composes other operators.
- `packages/codec-sensor/src/operators/patch-grammar.ts` dispatches inner
  operators inside each patch.
- `packages/codec-sensor/src/schema.ts` rejects nested `patchGrammar` by typing
  patch-local operators as base operators only.
- `packages/codec-sensor/test/codec.test.ts` pins the recursion seam:
  single-patch full-duration `patchGrammar` must match the equivalent flat
  operator list byte-for-byte.

Verdict: keep explicit named recursion. Do not introduce `fix` here.

The current shape is better than a generic combinator because it names the
domain facts reviewers need: patch length, patch-local time, parent RNG
consumption, affine normalization, and the recursion-depth cap.

Future lift condition: if #155 proves patchGrammar value and #263 needs nested
patches, the next design should define a domain-specific recursion cap and
receipt fields. It should not import a general anonymous-recursion helper.

### Soundscape Operator Graph

The soundscape route is the nearest future sibling. The audio code-layer note
recommends a sensor-style operator graph for soundscape, and #350 tracks a
post-v0.3 sub-RFC placeholder.

Verdict: use the sensor operator-dispatch pattern, not a fixed-point abstraction.

Soundscape operators will likely need graph validation, deterministic expansion,
and receipt rows for selected nodes. They do not need unbounded convergence
semantics. If a graph pass must normalize aliases or defaults, make it a named
normalizer in the soundscape RFC with a maximum pass count and a failure mode.

### Image Seed Expansion and Clean Repaint

Image seed expansion has fixed-point flavor only in the loose sense of
"preserve known positions while filling unknown positions."

Evidence:

- `packages/codec-image/src/adapters/seed-expander.ts` preserves
  `knownPositions` / `knownTokens` during clean-repaint conditioning.
- `packages/codec-image/src/adapters/seed-expander-tile-mosaic.ts` implements a
  second deterministic seed-expander algorithm under the same ABI.
- #453 owns the block-causal / clean-repaint adapter design line.

Verdict: not a fixed-point candidate today.

Clean repaint is a constraint-preserving expansion, not a loop until stable. If
future learned adapters add iterative refinement, the receipt should record
iteration count, preserved-token count, convergence / stop reason, and whether
the result was deterministic under the declared runtime class. That belongs in
the image adapter issue line, not a shared `fix` helper.

### Video Composition Normalization

Video has normalization-like code around timing buckets and inline SVG
composition:

- `packages/codec-video/src/schema.ts` validates full inline SVG documents.
- `packages/codec-video/src/compositions/shared.ts` builds deterministic frame
  time CSS buckets for MP4 frame capture.

Verdict: not fixed-point work.

These are one-pass validations and deterministic projections. Introducing
fixed-point terminology here would make review harder, not easier.

## Decision

Do not add any of these now:

- a literal Y-combinator implementation;
- a strict-language Z-combinator implementation;
- a shared `fix`, `untilStable`, or graph solver utility;
- a doctrine/RFC/ADR change.

Do keep this review rule:

> If a code layer claims recursive or iterative expansion, reviewers should ask
> what measure decreases, what cap prevents non-termination, what equality or
> stability check is used, and what receipt proves the stop condition.

## Future Helper Bar

A bounded helper may be justified later, but only after two production surfaces
need the same shape. The minimum API should look more like a reviewer-facing
loop than a mathematical combinator:

```ts
type UntilStableResult<T> = {
  value: T;
  passes: number;
  stable: boolean;
  stopReason: "stable" | "max-passes" | "invalid-state";
};
```

Required contract:

- pure step function for the checked state;
- explicit `maxPasses`;
- explicit equality or digest function;
- no hidden async side effects;
- structured failure when stability is not reached;
- receipt fields that include pass count and stop reason;
- package-local ownership first.

Do not promote that helper into `packages/schemas` or a shared runtime package
until a second modality needs exactly the same receipt and failure semantics.

## Routing

- #302 can close with this note.
- #153 remains open as the opt-in chaotic-operator implementation seed; it
  should keep its own integrator and determinism contract.
- #155 / #263 remain the sensor measurement and implementation-gate lanes.
- #350 remains the soundscape operator-graph RFC placeholder.
- #453 remains the image clean-repaint / block-causal adapter design lane.

No model training, lab execution, doctrine rewrite, or runtime refactor is
required for this closeout.
