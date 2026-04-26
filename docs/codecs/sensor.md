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

| Operator      | Use                                 | Parameters                        |
| ------------- | ----------------------------------- | --------------------------------- |
| `oscillator`  | sine / square / triangle base waves | `freqHz`, `amplitude`, `phase`    |
| `noise`       | white / pink / brown noise overlay  | `kind`, `amplitude`               |
| `drift`       | low-frequency baseline drift        | `slope`, `period`                 |
| `pulse`       | event-rate Poisson or fixed-period  | `rateHz`, `width`, `shape`        |
| `step`        | discrete level changes              | `levels`, `times`                 |
| `ecgTemplate` | clinical-shape ECG cycle (P-QRS-T)  | `bpm`, `morphology`, `noiseFloor` |

The runtime composes operators by addition into a single sample buffer. Composition order is recorded in the manifest for replay.

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

## Benchmark Case

See `sensor-ecg` in `benchmarks/cases.json`. Quality bridges (NeuroKit2 ECG plausibility, rule lists for temperature/gyro range derivatives) land at M5b per `docs/exec-plans/active/codec-v2-port.md`.

## Honest Risk Statement

Sensor's quality risk is small but real:

- The operator library is intentionally narrow; it cannot model arrhythmias, gyroscope sensor drift specific to a real chip, or thermal coupling between sensors. These are out of scope for v0.2.
- Clinical realism (ECG) is structural, not diagnostic. Nobody should make medical decisions from a Wittgenstein-rendered ECG. The manifest's `quality.partial` invariant is the surface that says so.
- Adding new signal types should go through an RFC, not a PR — the operator library's small size is a feature, not an oversight.
