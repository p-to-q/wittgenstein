---
date: 2026-05-13
status: audit deliverable
labels: [research-derived, architecture, audit]
tracks: [#288, #257, #309]
---

# AI-shape audit — large modules with mixed responsibilities

> **Status:** audit deliverable (delivers [#288](https://github.com/p-to-q/wittgenstein/issues/288)).
> Inventories 5 candidate large modules in the codec packages, names the concrete responsibility-mixing and duplication smells in each, and proposes one refactor seam per file. Files **three** strong-verdict refactor issues; the **two** mild-verdict candidates are noted for opportunistic later work without their own filed issues yet.
> _Tracker: [#288](https://github.com/p-to-q/wittgenstein/issues/288), with cross-link to [#257](https://github.com/p-to-q/wittgenstein/issues/257) (cross-modality code-layer doctrine inventory) and [#309](https://github.com/p-to-q/wittgenstein/issues/309) (architecture vs prior art)._

## Methodology

For each candidate file, the audit asked:

1. **Concrete responsibility inventory** — what distinct responsibilities live in this file? (≤6 short bullets each.)
2. **Coupling smells** — where are two responsibilities tangled in one function? (Function name + line range.)
3. **Largest functions** — top 2-3 longest functions and their purpose.
4. **Refactor seam candidate** — if exactly one follow-up issue could be filed for this file, what would the slice be? Concrete and bounded.
5. **AI-shape verdict** — `none` / `mild` / `strong`, with a one-sentence reason.

The verdict scale is calibrated to: `strong` = canonical AI smells (mega switch statements, monolithic string builders with parallel branches, procedural-with-magic-constants embedded in dispatch logic) that warrant their own filed issue; `mild` = legitimate concerns that are real but can wait for opportunistic refactor as the surrounding code touches them.

The audit avoids speculative refactors: each refactor seam is one named extraction, not a rewrite. The audit does not propose any doctrine changes; per ADR-0014 governance routing, doctrine moves separately.

## Per-file findings

### 1. `packages/codec-image/src/pipeline/decoder.ts` (602 lines) — verdict: **strong**

**Responsibility inventory:**

- Token normalization + hashing (lines 345-372)
- 2D field operations (blur, sample, average; 374-453)
- Procedural landscape rendering (`renderSky` 125-154, `renderTerrain` 156-224)
- PNG byte assembly + CRC (515-588)
- Scene profile synthesis from token data (226-241, 273-343)

**Coupling smells:**

- `decodeLatentsToRaster()` (24-123) conflates the token→field pipeline, horizon geometry, sky/terrain dispatch, and pixel-by-pixel composition. Each domain (terrain, sky) has 80+ lines of inline parameter tuning (lines 46-105).
- `buildField()` (364-372) mixes hashing salt selection with normalization; magic salt constants (`0x1a2b3c4d`, `0x91c7e35a`, etc.) are hard-wired with no doc string explaining their role.

**Largest functions:**

- `decodeLatentsToRaster()` 24-123 (100 lines) — convert latents to RGBA pixels.
- `renderTerrain()` 156-224 (69 lines) — multi-mode biome generation.
- `renderSky()` 125-154 (30 lines) — horizon + cloud + sun layering.

**Refactor seam:** extract the procedural landscape renderer (`buildSceneProfile`, `renderSky`, `renderTerrain`, palette switching, magic-salt constants) into `packages/codec-image/src/pipeline/landscape-renderer.ts`. The main decoder file then becomes a thin field-→-pixel bridge that imports the landscape renderer.

**Why strong:** procedural rendering with 7+ magic-number constants, zero cohesion between noise-field operations and pixel-render loop, and the placeholder decoder seam is currently doing real rendering work that should not live alongside the proposed frozen-decoder bridge direction (the bridge itself is ratified doctrine via ADR-0005 / ADR-0008 but its implementation is unwired today — `loadLlamagenDecoderBridge` throws `NotImplementedError`; M1B wiring is gated on the per-candidate audits at #283). The extraction is worth doing now precisely so the placeholder/landscape work does not accumulate further coupling with the eventual bridge wiring.

### 2. `packages/codec-sensor/src/render.ts` (447 lines) — verdict: **strong**

**Responsibility inventory:**

- Operator expansion engine (oscillator, noise, drift, pulse, step, ECG template, `patchGrammar`; 178-256)
- Patch-local time semantics + affine normalization (281-333)
- CSV/JSON/HTML output generation (342-397)
- Loupe dashboard Python subprocess bridge (348-398)
- RNG + signal generation (408-433)

**Coupling smells:**

- `expandOperator()` (178-256) is a 79-line switch statement covering 7 operator types; each branch has time-arithmetic or noise-gen inline.
- `expandPatchGrammar()` (281-333) calls `expandOperator()` recursively while managing `timeOriginFrame` offsets, mixing patch scheduling with operator semantics.
- `renderLoupeDashboard()` (348-398) has a 3-level fallback loop (`loupe.py` search → `loupe_cli` → fallback static HTML) with three near-identical try/catch blocks.

**Largest functions:**

- `expandOperator()` 178-256 (79 lines) — multi-branch operator dispatch.
- `expandPatchGrammar()` 281-333 (53 lines) — patch iteration + normalization.
- `renderLoupeDashboard()` 348-398 (51 lines) — fallback subprocess chain.

**Refactor seam:** extract each operator type into a separate `SensorOperator` strategy class (e.g. `OscillatorOperator`, `NoiseOperator`, …) under `packages/codec-sensor/src/operators/`. Move the Loupe subprocess fallback into a dedicated `LoupeRenderer` class with configurable search paths and a single try/fallback boundary.

**Why strong:** `expandOperator()` is a canonical AI-code smell — mega switch statement with per-branch signal arithmetic and time-offset handling. The patch-grammar recursion compounds the coupling. The fallback chain shows lack of abstraction, not lack of features.

### 3. `packages/codec-video/src/hyperframes-wrapper.ts` (409 lines) — verdict: **strong**

**Responsibility inventory:**

- HyperFrames HTML template assembly (203-370)
- SVG-clip vs scene-card branching (214-279 vs 282-369)
- MP4 render subprocess orchestration (73-114)
- FPS normalization + environment config (116-127)
- Artifact path resolution (188-201)

**Coupling smells:**

- `buildHyperFramesHtml()` (203-370) has a 66-line if-block for SVG slides (214-279) and a 77-line else-block for scenes (282-369); both branches independently build `clipTimelineCss`, `totalDurationSec`, `bodyInner`, then call identical `return [ ... ].join("\n")`. Roughly 66% of one branch reads as a near-duplicate of the other.
- `spawnProcess()` (129-186) tangles `child.stdout/stderr` accumulation with timeout + signal handling; stderr is sliced for error messages (line 181) inside the same function that buffers output.
- CSS strings (lines 258-262, 343-352) are duplicated across the SVG / scene branches with no extraction to helpers.

**Largest functions:**

- `buildHyperFramesHtml()` 203-370 (168 lines) — entire composition HTML assembly.
- `spawnProcess()` 129-186 (58 lines) — subprocess + timeout + output collection.
- `runHyperframesRenderToMp4()` 73-114 (42 lines) — `npx hyperframes` CLI wrapper.

**Refactor seam:** extract SVG-slide and scene-card HTML builders into separate `SvgSlideComposition` and `SceneCardComposition` modules. Move subprocess + timeout + output logic into a reusable `ProcessRunner` helper so the timeout boundary is explicit and the output buffering is reusable.

**Why strong:** the HTML builder is a monolithic string concatenator with two nearly-identical branches and inline CSS duplication. The subprocess code mixes process-lifecycle with output capture. Both patterns are classic AI shortcuts that work but resist later modification.

### 4. `packages/codec-image/test/codec.test.ts` (776 lines) — verdict: **mild**

**Responsibility inventory:**

- Schema parse contract lockdown (11-95)
- Codec route dispatching / semantic-vs-decoder-layer receipts (57-365)
- Two-pass compilation acceptance cases (232-364)
- Visual Seed Code mode verification (271-298)
- Adapter outcome observability (636-775)

**Coupling smells:**

- `adaptOutcome()` helper (644-655) replicates logging setup and temp-dir creation inline for each test, bypassing what could be a shared Vitest fixture.
- Cases 8 / 8b / 9 (232-365) repeat identical JSON parse + receipt inspection with only the `mode` field varying; no parametrized test (`test.each`).
- The two-pass acceptance ledger comment (lines 225-231) references research note #207 but lives in test prose; that reference can rot independently of the test.

**Largest functions:**

- Single `describe()` block spanning 776 lines; the largest sub-block is adapter outcome tests (636-776, ~140 lines).
- `adaptOutcome()` (644-655) is 12 lines but shadows logging/fs setup inline.
- Test case bodies 233-269, 271-298, 300-333 each ~30-50 lines of nested `expect` chains.

**Refactor seam (opportunistic, no issue filed):** extract shared logger / temp-dir setup into a Vitest fixture; parametrize the two-pass cases (8 / 8b / 9) with `test.each()`; move the acceptance-ledger comment (#207 cross-reference) into a small constants file so the link can be checked.

**Why mild:** the test responsibility is clear (lock down the codec contract); the smells are duplication and missing parametrization, not muddled responsibilities. Refactor when the test next needs to grow.

### 5. `packages/codec-audio/src/codec.ts` (467 lines) — verdict: **mild**

**Responsibility inventory:**

- LLM prompt injection + schema preamble (60-98)
- `AudioRequest` routing inference (187-205)
- Expand phase: LLM call + plan parse + route enforcement (267-330)
- Decode phase: Kokoro vs procedural route dispatch (336-430)
- WAV header parsing + manifest row authorship (115-158, 439-449)

**Coupling smells:**

- `decode()` (336-430) branches on `kokoroEngaged` (line 360) with near-identical output-path / metadata / hash logic in both arms (lines 354-394).
- `readWavMeta()` (115-158) inspects bytes with embedded chunk-iteration logic; `hashBytes()` / `hashString()` at 100-106 are standalone but only called inside `decode`.
- Route inference (`inferIntentRoute()` 187-205) uses hardcoded regex keywords; the inference is not tied to the `AudioPlan` schema enum, so adding a route requires touching two places.

**Largest functions:**

- `decode()` 336-430 (95 lines) — route selection + artifact read + metadata assembly.
- `expand()` 267-330 (64 lines) — prompt build + LLM call + plan validation.
- `readWavMeta()` 115-158 (44 lines) — WAV header parsing.

**Refactor seam (opportunistic, no issue filed):** extract the Kokoro vs procedural decode-dispatch into an `AudioRenderDispatcher` class; move WAV metadata inspection into a `WavArtifact` facade; tie `inferIntentRoute` to the `AudioPlan` route enum so the two surfaces stay in sync.

**Why mild:** two dominant responsibilities (LLM→plan expansion and render dispatch) coexist with utility code, but they don't fight each other. Route inference feels bolted-on but works. Wait for opportunistic refactor.

## Other large candidates surveyed

Two additional files over 400 lines under `packages/codec-*/src/` and `packages/core/src/`:

| File | Lines | Verdict | One-line reason |
|---|---|---|---|
| `packages/core/src/runtime/harness.ts` | 600 | **mild (separate lane)** | Multi-phase codec orchestration (expand / adapt / decode / package) with clean phase separation; but **17 `request.modality` references** breaking the modality-blind M4 invariant — see [#300](https://github.com/p-to-q/wittgenstein/issues/300). The audit verdict is "mild" for AI-shape (no switch-statement smells, no magic constants); the **modality-blind drift is a separate, more important concern** tracked in #300. |
| `packages/codec-image/src/codec.ts` | 427 | **mild** | LLM service abstraction + codec lifecycle. Two interfaces (`ImageCodecLlmService`, `ImageCodecTelemetryService`) are boilerplate but not AI-shaped; responsibilities are clear. No filed issue. |

## Verdict summary

| File | Lines | Verdict | Filed follow-up |
|---|---|---|---|
| `pipeline/decoder.ts` | 602 | strong | [#325](https://github.com/p-to-q/wittgenstein/issues/325) — extract landscape renderer |
| `codec-sensor/render.ts` | 447 | strong | [#326](https://github.com/p-to-q/wittgenstein/issues/326) — extract operator strategy + LoupeRenderer |
| `codec-video/hyperframes-wrapper.ts` | 409 | strong | [#327](https://github.com/p-to-q/wittgenstein/issues/327) — extract composition + ProcessRunner |
| `codec-image/test/codec.test.ts` | 776 | mild | none (opportunistic later) |
| `codec-audio/src/codec.ts` | 467 | mild | none (opportunistic later) |
| `core/runtime/harness.ts` | 600 | mild (AI-shape) / **separate concern: M4 modality-blind drift** | already at [#300](https://github.com/p-to-q/wittgenstein/issues/300) |
| `codec-image/codec.ts` | 427 | mild | none |

**Three follow-up issues** are filed from this audit ([#325](https://github.com/p-to-q/wittgenstein/issues/325) / [#326](https://github.com/p-to-q/wittgenstein/issues/326) / [#327](https://github.com/p-to-q/wittgenstein/issues/327)). Each one names the refactor seam, names the file, and carries `slice/implementation` + `priority/p2` + `size/m` labels in the spirit of the campaign's "smallest effective change" guardrail.

## What this audit does NOT do

- Does **not** modify any source file (audit only; refactors land via their own issues / PRs).
- Does **not** propose doctrine changes; per ADR-0014, doctrine moves separately.
- Does **not** rewrite the M4 modality-blind harness invariant; that concern is real and important but is tracked at [#300](https://github.com/p-to-q/wittgenstein/issues/300) — this audit cross-references rather than absorbing.
- Does **not** address external prior-art comparison (that's [#309](https://github.com/p-to-q/wittgenstein/issues/309), a deeper companion).
- Does **not** open the cross-modality code-layer doctrine inventory; that lives at [#257](https://github.com/p-to-q/wittgenstein/issues/257).
- Does **not** propose new tests; the test-side refactor for `codec.test.ts` is a `mild` verdict, opportunistic later.

## Cross-references

- [#288](https://github.com/p-to-q/wittgenstein/issues/288) — this audit closes that umbrella as "audit delivered, slices filed."
- [#300](https://github.com/p-to-q/wittgenstein/issues/300) — harness modality-blind M4 invariant (separate concern, cross-linked).
- [#309](https://github.com/p-to-q/wittgenstein/issues/309) — architecture benchmark vs prior art (external comparison; not in this audit's scope).
- [#257](https://github.com/p-to-q/wittgenstein/issues/257) — cross-modality code-layer doctrine inventory.
- [ADR-0014](../adrs/0014-governance-lane-for-meta-process-doctrine.md) — governance lane that this audit operates under.
- [`docs/engineering-discipline.md`](../engineering-discipline.md) — smallest-effective-change rule that each filed follow-up issue inherits.
