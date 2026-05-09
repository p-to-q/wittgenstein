# Sensor Codec

Sensor is the **confirmation case** in the codec-v2 port. It has no L4 adapter, a fully deterministic L3, and a small operator library. Its job in the v0.2 system is to prove that the `Codec<Req, Art>` shape absorbs a trivial case without bloat — if the protocol cannot hold sensor in ≤20 lines, the protocol is wrong.

`LLM -> structured signal-spec JSON -> operator expansion -> sample buffer -> JSON + CSV + HTML dashboard`

## Position

Sensor is the cleanest expression of the layered-IR thesis:

- the LLM emits a structured _algorithm spec_, not raw sample arrays;
- the runtime _deterministically_ expands the spec into samples (operator composition);
- there is no learned bridge, no frozen decoder weights, no inference-time noise.

This is the L3-only path. It exists in the codec catalog to keep the harness honest: any protocol shape that requires every codec to carry an L4 adapter is over-fitted to image. Sensor stays the counter-example.

## What the LLM Emits — Signal Spec

The model emits a `SensorSignalSpec`. Core fields:

- `signal` — `"ecg" | "gyro" | "temperature"` (codec-internal route post-M3)
- `sampleRateHz` — target sample rate; bounded by signal type
- `durationSec` — bounded duration; refused above the per-signal cap
- `algorithm` — operator-composition tree (oscillator + drift + pulse, etc.)
- `operators` — typed operator instances with parameter ranges
- `notes` — free-form provenance string for replay context

The LLM does not emit raw samples, NumPy arrays, or waveform binaries. It emits the algorithm.

## Operator Families

The library is deliberately small. Adding an operator requires an RFC.

| Operator       | Use                                                              | Parameters                                                        |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `oscillator`   | sine / square / triangle base waves                              | `freqHz`, `amplitude`, `phase`                                    |
| `noise`        | white / pink / brown noise overlay                               | `kind`, `amplitude`                                               |
| `drift`        | low-frequency baseline drift                                     | `slope`, `period`                                                 |
| `pulse`        | event-rate Poisson or fixed-period                               | `rateHz`, `width`, `shape`                                        |
| `step`         | discrete level changes                                           | `levels`, `times`                                                 |
| `ecgTemplate`  | clinical-shape ECG cycle (P-QRS-T)                               | `bpm`, `morphology`, `noiseFloor`                                 |
| `patchGrammar` | higher-order: split duration into patches, recurse per-patch ops | `patchLengthSec`, `patches[]: { operators[], affineNormalize? }`  |

The runtime composes operators by addition into a single sample buffer. Composition order is recorded in the manifest for replay.

### Higher-order operator: `patchGrammar`

`patchGrammar` is the only operator that composes other operators. It exists so the spec can express **local context that flat composition cannot** — e.g. a heart-rate ramp (different `bpm` per segment), or a per-segment range constraint. The design tracks `docs/research/2026-05-07-sensor-patch-grammar.md` Option A and is intentionally _not_ a learned model: patches are deterministic concatenations of regular operators.

**Lineage receipt.** The research note ratified in #239 closed #221 as research-only. Implementation landed in #244; contract follow-up #247 corrected patch-local time semantics, capped recursion, and validated `affineNormalize` bounds. The operator is **not yet doctrine** — it stays a sensor-codec-internal extension until measurement (#155) earns it an ADR. Treat patchGrammar as a **post-M3 sensor operator that landed early**: M3 ports the existing flat-operator surface to Codec Protocol v2; patchGrammar runs alongside that surface and is permitted but not promoted in agent guides. Post-M3 follow-up lineage: PR #276 (sensor algorithmic research; closes #262) discusses TimesFM / chaos / shapelets / reservoir concept-only borrows and proposes the concrete measurement gate; PR #295 (the measurement plan) names the dataset / metric / protocol that #284 needs to run before patchGrammar's promotion question can be settled.

**Patch slicing and time origin.**

- The parent range `[startFrame, endFrame)` is split into consecutive patches of `floor(patchLengthSec * sampleRateHz)` frames, starting from `startFrame`. The last patch is truncated if it would extend past `endFrame`; patches whose start is past `endFrame` are skipped.
- Operators inside a patch are interpreted **patch-local**: `step.atSec`, `pulse.centerSec`, `oscillator.phaseRad`, `drift.slopePerSec`, and `ecgTemplate` phase are all measured relative to the patch boundary. So `step.atSec: 0.3` inside a patch starting at global second 6 means "step starts at global 6.3s", not "step starts at global 0.3s clipped to the patch range" (the broken semantics shipped in #244 before #247 corrected them).
- `noise` has no time dependence and continues to consume the **parent RNG sequentially** across patches. This is the recursion-seam invariant: a single-patch `patchGrammar` whose patch covers the full duration produces byte-identical output to the equivalent flat operator list. The `gyro-patch-grammar.csv` golden enforces this: its SHA-256 equals `gyro.csv`'s SHA-256.

**`affineNormalize`.** When set on a patch, the patch's _contribution_ (post-pre snapshot delta) is min-max normalized to `[minOutput, maxOutput]` before being added back to the pre-patch values. The schema rejects `minOutput >= maxOutput` (#247): degenerate ranges are user error, not a feature. When the contribution is constant inside a valid `[minOutput, maxOutput]` window (post-pre delta range = 0), the value collapses to the midpoint of the target range.

**Recursion cap.** Patches admit only flat (non-`patchGrammar`) operators. Nested `patchGrammar` is rejected at parse time per #247. Lifting the cap is a future-PR conversation gated on a use case the flat-per-patch shape can't express.

## Renderer Families

Three signal types ship at v0.2:

- **ECG** — rendered against the `ecgTemplate` operator with realism gated by `NeuroKit2`-style morphology checks at benchmark time.
- **Temperature** — rendered as `drift + noise + step` composition; physically-plausible ranges enforced.
- **Gyro** — rendered as `oscillator + noise` per-axis (3 axes); rate ranges enforced.

Each renderer is a thin wrapper around the operator-expansion runtime; they exist as named files to keep per-signal validation localized.

## Decoder Choices and Why

Sensor's "decoder" is the operator-expansion runtime. The choices that matter are _which operators ship_ and _which validation library backs them_:

| Component            | v0.2 default                        | Why this and not X                                                                                                                                |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Operator runtime     | in-repo deterministic expansion     | A NumPy/SciPy dependency would push the codec out of the Node-only runtime. The operators are simple enough to ship as TS.                        |
| ECG morphology check | NeuroKit2 (Python, M5b only)        | The check is a quality bridge, not a render dependency. Render stays Node; benchmark calls into Python via the same bridge pattern Brief E names. |
| Sample export format | JSON + CSV sidecar + HTML dashboard | JSON for programmatic consumers, CSV for spreadsheet replay, HTML "loupe" dashboard for visual inspection. No `.wav` / `.edf` at v0.2.            |

## Adapter Role

Sensor does **not** have a trained L4 adapter and is not expected to grow one. The signal-spec is already in the renderer's input language; no learned bridge is needed. This is structurally identical to audio at v0.2 and is the canonical "L4-as-pass-through" case the codec-v2 port absorbs.

If a future signal type genuinely needs a learned bridge (e.g. an EEG signal whose spec is too high-level for the operator library), an L4 slot is reserved by the base codec contract.

## Pipeline Stages (post-M3 shape)

- `expand` — LLM call producing the SensorSignalSpec; one round by default.
- `adapt` — pass-through (`BaseCodec.passthrough`).
- `decode` — operator-expansion runtime per signal type.
- `package` — codec authors its own manifest rows; emits JSON + CSV + HTML in one transaction.

## Failure Modes

- The spec specifies a sample rate or duration outside the per-signal cap — refused at parse time with a structured error citing the cap.
- An operator parameter is out of physical range (e.g. `bpm: 1000` for ECG) — refused with a per-operator validation error.
- The operator-expansion runtime produces a NaN or infinity — surfaced as a structured render error; no silent zero-fill.
- The HTML dashboard cannot load (missing template) — JSON + CSV still emit; a manifest row notes the dashboard miss with `quality.partial: { reason: "dashboard_unavailable" }`.

## Artifact

The fast path emits three files per run:

- `signal.json` — full sample bundle with metadata.
- `signal.csv` — flat sidecar for spreadsheet tools.
- `loupe.html` — single-page dashboard for visual inspection.

All three are recorded in the manifest with their SHA-256 hashes.

## Goldens

Sensor synthesis is **fully deterministic**. `artifacts/showcase/workflow-examples/sensor/`
is the preserved `v0.1.0-alpha.1` hackathon receipt pack and, for now, the regression
corpus — any drift is a real regression. Sensor does not have an LLM-stage drift excuse.

`fixtures/golden/sensor/` holds the byte-pinned CSVs verified by `packages/codec-sensor/test/golden.test.ts`. Each signal family has a flat-operator golden plus a `*-patch-grammar.csv` companion exercising the higher-order operator: multi-patch ECG bpm ramp (`ecg-patch-grammar.csv`), per-patch `affineNormalize` (`temperature-patch-grammar.csv`), and single-patch full-duration recursion (`gyro-patch-grammar.csv`). The `gyro-patch-grammar.csv` SHA-256 equals `gyro.csv` SHA-256 — the recursion-seam invariant. The `ecg-` and `temperature-` patch-grammar SHAs reflect the patch-local-time semantics ratified in #247; SHAs from the original #244 implementation no longer match.

## Benchmark Case

See `sensor-ecg` in `benchmarks/cases.json`. Quality bridges (NeuroKit2 ECG plausibility, rule lists for temperature/gyro range derivatives) land at M5b per `docs/exec-plans/active/codec-v2-port.md`.

## Honest Risk Statement

Sensor's quality risk is small but real:

- The operator library is intentionally narrow; it cannot model arrhythmias, gyroscope sensor drift specific to a real chip, or thermal coupling between sensors. These are out of scope for v0.2.
- Clinical realism (ECG) is structural, not diagnostic. Nobody should make medical decisions from a Wittgenstein-rendered ECG. The manifest's `quality.partial` invariant is the surface that says so.
- Adding new signal types should go through an RFC, not a PR — the operator library's small size is a feature, not an oversight.

## Lineage receipt

For agents reading this doc cold, the full sensor lineage from M3 closure to today's main HEAD:

| Step | Surface | Note |
|---|---|---|
| Codec-sensor M3 port | `docs/exec-plans/active/codec-v2-port.md` §M3 | The "confirmation case": no L4 adapter, deterministic L3, three signal types (ecg / gyro / temperature) |
| Three sensor goldens | `fixtures/golden/sensor/{ecg,temperature,gyro}.csv` + `manifest.json` | Byte-pinned per signal family; CI-gated via `pnpm test:golden` |
| patchGrammar research | PR #239 (closes #221) | TimesFM-inspired patching / local-affine-normalization / chunked expansion; concept-only borrow, no model dep |
| patchGrammar implementation | PR #244 | Higher-order operator added; recursion via `z.lazy + z.union`; existing 3 sensor goldens unchanged |
| patchGrammar contract honesty | PR #249 (closes #247) | Patch-local time semantics; recursion-depth cap; `affineNormalize` bound validation; lineage receipt structure documented in this doc's patchGrammar section |
| patchGrammar goldens | `fixtures/golden/sensor/{ecg,temperature,gyro}-patch-grammar.csv` | New byte-pinned fixtures; `gyro-patch-grammar.csv` SHA equals `gyro.csv` SHA (single-patch full-duration recursion-seam invariant) |
| Route enum tightening | PR #245 | `RunManifest.route` enforces `ecg` / `temperature` / `gyro` per #190 partial closeout |
| Sensor algorithmic research | PR #276 (closes #262) | TimesFM concept-borrow without model dep; chaos / shapelets / reservoir surveyed; concrete measurement gate proposed for #155 |
| patchGrammar measurement plan | PR #295 | Dataset / metric / protocol for the #284 measurement gate; PhysioNet/CinC ECG, UCI HAR gyro, NOAA temperature; Welch spectral distance + augmentation F1 lift criteria |
| Implementation slices (gated) | #263 | Awaits #284 measurement results; #153 (chaos) un-parked only on patchGrammar pass per family |

The lineage is intentionally additive: each step is reversible (no commit erased the prior framing) and citation-backed (every claim above resolves to a PR or doc path). New work that touches the sensor surface should extend this table, not silently rewrite earlier rows.
