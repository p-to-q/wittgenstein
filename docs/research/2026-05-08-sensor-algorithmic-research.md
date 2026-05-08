---
date: 2026-05-08
status: research note
labels: [research-derived, m3-sensor]
tracks: [#262, #153, #154, #155, #255]
---

# Sensor algorithmic code path — TimesFM lessons, chaos, shapelets, operators

> **Status:** research note (not doctrine, not active execution guidance).
> Surveys whether the current operator / patchGrammar direction is sufficient for sensor, and what TimesFM / chaos-system / shapelet ideas teach without becoming runtime dependencies. Pins nothing as doctrine; commits no implementation.
> _Tracker: [#262](https://github.com/p-to-q/wittgenstein/issues/262) under [#255](https://github.com/p-to-q/wittgenstein/issues/255). Sensor M3 implementation surface is closed; this is design-forward research._

## Why this note exists

Sensor is the cleanest expression of Wittgenstein's layered-IR thesis: the LLM emits a structured `SensorSignalSpec`, the runtime expands it deterministically via operator composition, no learned bridge needed. patchGrammar (PRs #244 / #249) added the higher-order "split duration into patches, recurse per-patch ops" operator with patch-local time semantics.

Three open questions remain:

1. **Does patchGrammar materially improve expressiveness vs. flat operators?** The codec ships both today; we have no measurement comparing them.
2. **What chaos / shapelet / reservoir ideas could enrich the operator library without adding runtime dependencies?** #153 (chaotic operators) and #154 (TimesFM tracker) are parked; this note revisits whether they should stay parked.
3. **What measurement gate would justify post-M3 sensor work?** #155 (downstream-task measurement) is parked pending a dataset + metric pick.

This note answers all three: surveys the relevant prior art, names the measurement gate, and recommends what should change vs stay parked.

## Question 1 — patchGrammar expressiveness

### Why patchGrammar exists

The flat operator catalog (`oscillator | noise | drift | pulse | step | ecgTemplate`) is good at *stationary* signals — the parameters don't change over time. patchGrammar adds a higher-order operator that lets parameters change per-patch (different `bpm` per patch in an ECG ramp; different `affineNormalize` ranges per temperature segment). Per the research note (`docs/research/2026-05-07-sensor-patch-grammar.md`), the framing is TimesFM-inspired *"patching + local affine normalization + chunked expansion"* — adopted as deterministic operator semantics, no model dependency.

### What we don't yet know

Whether patchGrammar's expressiveness gain over the flat catalog is worth its complexity is **unmeasured**. The implementation contract is correct (#247 / #249 ratified patch-local semantics, recursion cap, affineNormalize bounds). What's missing is a comparative metric: "given a target signal X, can the flat catalog reproduce X to within ε? can patchGrammar?"

A useful answer requires a corpus of *target* signals. The honest question is what corpus.

### Recommendation

Open a small measurement note (NOT this note, follow-up) that:

1. Names a small public dataset of physiological / time-series signals (PhysioNet ECG, UEA archive subsets) with permissive licenses.
2. Defines a reconstruction-distance metric on a held-out segment (e.g. windowed correlation; spectral distance; shape-based DTW).
3. Compares flat-catalog fits vs patchGrammar fits over the same target windows.

This is a one-page research issue with an explicit pass/fail gate; it does NOT require modifying the codec. If patchGrammar wins by a reasonable margin on at least 2 of 3 signal families, it earns its place as a long-term operator. If it doesn't, it stays a permitted-but-not-promoted operator (which is the current `docs/codecs/sensor.md` framing).

## Question 2 — what to borrow from chaos / shapelets / TimesFM / reservoir computing

### TimesFM (Google, 2024)

**Citation.** Das et al., *"A decoder-only foundation model for time-series forecasting,"* 2024 — arXiv:2310.10688. Trained on a 100B-timepoint corpus across diverse domains; decoder-only transformer over patched time-series tokens; achieves strong zero-shot forecasting.

**What's borrowable without the runtime dependency:**
- **Patching** (chunk the timeline into fixed-size pieces, treat each chunk as a "token"). Already ported as patchGrammar's patch concept.
- **Output patch length distinct from input patch length** — TimesFM trains with a longer output patch than input. For Wittgenstein this would mean: a patchGrammar's output patch could be longer than its input "context" patch, allowing zero-shot extrapolation. **Not currently in our patchGrammar shape**; potentially useful for forecasting-style sensor scenarios.
- **Channel-independent processing** — TimesFM treats each channel as a separate sequence. Wittgenstein already does this implicitly (each call is one signal); harmless.
- **Quantile output heads** — TimesFM emits both a point estimate and quantile bands. Already discussed as Option B in the original patch-grammar research note (#239); intentionally parked because the receipt channel doesn't admit quantile metadata yet.

**What's NOT borrowable:**
- The transformer itself (heavyweight model dep, out-of-scope per ADR-0005).
- The 100B-timepoint pre-training (no dataset, no compute, no goal).

### Chaos systems (Lorenz / Rössler / Chua / Hopfield-osc / intermittency)

**Citations.**
- Lorenz attractor: Lorenz, *"Deterministic Nonperiodic Flow,"* J. Atmos. Sci. 1963. Foundational chaotic system; `dx/dt = σ(y-x); dy/dt = x(ρ-z) - y; dz/dt = xy - βz`.
- Rössler attractor: Rössler, *"An equation for continuous chaos,"* Phys. Lett. A 1976.
- Chua's circuit: Chua, IEEE 1983; piecewise-linear chaotic oscillator.
- Hopfield oscillator: Hopfield, PNAS 1984; neural-network-style continuous dynamics.
- Intermittency: Pomeau & Manneville, Comm. Math. Phys. 1980.

**What's borrowable:**
- These are **closed-form ODE systems** that produce deterministic-but-rich-looking signals. They could ship as new operators (`lorenz { sigma, rho, beta, x0, y0, z0 }` etc.). Each operator is ~20 lines of Euler integration; no dependency.
- Useful for: synthesizing physiological-looking sensor data without a real recording (`physiologically-plausible-looking` is the test in #155).

**What to be careful about:**
- These are *deterministic* chaotic systems — small parameter changes → very different signals. The receipt-honesty story (`docs/codecs/sensor.md`) requires byte-stable output at fixed seed; chaos systems can amplify floating-point noise. Solution: use fixed-step integration (Euler, RK4) with explicit step size in the operator parameters, never variable-step.
- Adding 5+ new operators expands the operator library; per `docs/codecs/sensor.md` *"Adding an operator requires an RFC."* If they ship, they ship via RFC, one operator at a time, gated on the patchGrammar measurement (Question 1).

### Shapelets (Ye & Keogh)

**Citation.** Ye & Keogh, *"Time series shapelets: a new primitive for data mining,"* KDD 2009. Shapelets are short, characteristic time-series sub-sequences that distinguish classes (the "characteristic motif" framing). The original paper is about classification; the *operator* framing is to use shapelets as a small library of named sub-sequences that operators can splice into the output.

**What's borrowable:**
- A `shapelet` operator that takes `{ name, startSec, scaleFactor, amplitude }` and splices a known motif (e.g. ECG QRS complex, physiological tremor burst) into the output.
- The shapelet library would be JSON-defined data, not code — easy to extend without operator-library RFC churn.

**What's NOT borrowable:**
- The shapelet *learning* (mining shapelets from data) — out of scope; shapelets ship as hand-curated primitives.

### Reservoir computing / echo state networks (Jaeger 2001)

**Citation.** Jaeger, *"The 'echo state' approach to analysing and training recurrent neural networks,"* GMD report 148, 2001. Reservoir computing uses a fixed random recurrent network as a non-linear feature extractor; only the output weights are trained.

**What's borrowable:**
- The *idea* that a fixed deterministic recurrence (e.g. coupled oscillators with random connection matrix) can produce rich-looking sensor signals.
- An `echoState` operator with `{ size, spectralRadius, inputCoupling, seed }` would be a deterministic random-network signal generator.

**What's NOT borrowable:**
- The training half (we don't train the output layer; we use the reservoir state directly as the signal).

## Question 3 — what measurement gate justifies post-M3 sensor work

The brief in #262 names *"downstream-task metrics for generated sensor signals"* as the open research variable. This note proposes the gate as concrete:

**Proposed gate for any post-M3 sensor work (operator additions, patchGrammar promotion, anything in #153/#154/#155):**

1. **Pass:** does the candidate signal generation method, when used as data augmentation for a downstream physiological classifier (e.g. ECG arrhythmia classification, gait phase detection from gyro), improve test-set performance over the no-augmentation baseline by ≥1 percentage point on a public benchmark?
2. **OR Pass:** does the method reduce the *spectral distance* between generated signals and real held-out signals on a public physiological corpus by ≥10% vs the baseline operator catalog?

Both pass conditions are testable on public datasets without runtime model dependencies. Failing both means the method should stay parked.

**Datasets that would qualify** (license-clean, well-known):

- PhysioNet/CinC Challenge ECG datasets (e.g. 2017 atrial fibrillation, 2020 arrhythmia)
- UEA & UCR Time Series Archive (various)
- HumanActivityRecognition gyro/accel datasets (Daphnet, UCI HAR)

The brief explicitly does NOT require building this measurement infrastructure now — it's parked at #155. The contribution of *this* note is to make the gate explicit so future sensor proposals can be measured against a named bar.

## Concrete recommendations

1. **patchGrammar measurement issue (small, post-M3)** — open a research issue scoping the comparative measurement (Question 1 above). Closes the "does patchGrammar earn its keep" question.
2. **Shapelet library research issue (small)** — propose a JSON-defined shapelet library as a small, RFC-bounded extension. Less invasive than chaos operators.
3. **Chaos operators stay parked** — #153 stays open; the operator-library RFC bar is correct. Wait for the patchGrammar measurement (item 1) to land first; if patchGrammar fails its measurement, the question shifts entirely.
4. **TimesFM stays parked** — #154 tracker; specifically watch for an open-source frozen-decoder version (TimesFM-2 may be released by Google), which would change the conversation.
5. **Echo-state operator stays parked** — interesting future operator but no measurement-justified use case yet.

## What this note does NOT do

- Does NOT add an operator. Per `docs/codecs/sensor.md`, *"Adding an operator requires an RFC."*
- Does NOT modify `docs/codecs/sensor.md`. That doc is the exemplar after #247 / #249; nothing here changes its content.
- Does NOT promote patchGrammar to doctrine. Patch-local time semantics are pinned in `docs/codecs/sensor.md` lineage receipt; doctrine promotion waits for measurement.
- Does NOT add TimesFM, NumPy, SciPy, or any neural forecasting dep. The "borrowable concepts" above are concept imports, not dependency imports.
- Does NOT pre-empt M3 closure (already done).
- Does NOT close #153 / #154 / #155 — they stay parked with this note as their parent research framing.

## Cross-references

- `docs/codecs/sensor.md` — current sensor doc (post-#247/#249).
- `docs/research/2026-05-07-sensor-patch-grammar.md` — patchGrammar design note (#239).
- ADR-0005 — decoder ≠ generator (the line this note honors).
- #153 — sensor chaotic operator extension (parked; this note keeps it parked).
- #154 — TimesFM tracker (parked; this note keeps it parked).
- #155 — downstream-task measurement (parked; this note proposes its gate).
- #221 — original sensor patch-operator research issue (closed).
- #244 / #249 — patchGrammar implementation + contract honesty.
- `docs/exec-plans/active/codec-v2-port.md` — M3 closeout.

## Suggested follow-ups (deferred until ratified)

1. Open a small measurement issue under #155 implementing the patchGrammar comparison (Question 1).
2. Open a small RFC under #153 scoping the shapelet library (concept-only borrow from Ye & Keogh).
3. Update #154 with the *"watch for open-source TimesFM-2 frozen decoder"* gate explicitly named.
4. Open a new tracker issue specifically for the measurement-gate-criteria framing — so future sensor proposals can cite a single source for the bar.

These are deferred; this note is the parent. If any of them lands as code, expect the same Citation Discipline (`docs/research/2026-05-08-vsc-eval-matrix-cells.md` r2) — every external claim either has a paper / repo / dataset link or is marked `unknown`.
