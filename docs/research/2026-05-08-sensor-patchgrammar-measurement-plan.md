---
date: 2026-05-08
status: research note (measurement plan)
labels: [research-derived, m3-sensor, measurement]
tracks: [#284, #155, #276]
---

# patchGrammar vs flat operators — measurement plan

> **Status:** research note (measurement plan, not measurement results).
> Defines the concrete dataset / metric / protocol that #284 needs to answer "does patchGrammar materially improve sensor expressiveness or downstream usefulness compared with the flat operator catalog?" Pins nothing as doctrine; commits no implementation.
> _Tracker: [#284](https://github.com/p-to-q/wittgenstein/issues/284), gates [#153](https://github.com/p-to-q/wittgenstein/issues/153) (chaos operators) and [#155](https://github.com/p-to-q/wittgenstein/issues/155) (downstream measurement)._

## Why a plan rather than the measurement itself

[PR #276](https://github.com/p-to-q/wittgenstein/pull/276) named the measurement gate as the prerequisite for promoting patchGrammar from "permitted-but-not-promoted operator" to "doctrine-eligible." The bar is concrete:

- ≥1pp downstream-classifier improvement on a license-clean public benchmark under a data-augmentation protocol, **OR**
- ≥10% spectral-distance reduction versus the flat operator catalog on a public physiological corpus.

Either is sufficient. Both fail → chaos / shapelet operators stay parked.

What's missing today is the *protocol*: which dataset, which classifier, which spectral-distance metric, which baseline configuration. This note pins those choices so the measurement is reproducible and so its result is interpretable as a verdict, not a Rorschach.

This document is the plan, not the measurement. The measurement run is a separate slice that requires:

- Local Python environment with PhysioNet / NOAA / UCI HAR archive datasets downloaded.
- A small classifier training stack (sklearn / PyTorch).
- Spectral analysis tooling (scipy.signal).
- A few hours of compute.

The plan stays in the repo as a durable protocol. Whoever runs the measurement opens the results as its own slice PR, referencing this note for the pre-registered criteria.

## The measurement question, sharpened

**Null hypothesis (H0):** patchGrammar produces sensor signals indistinguishable from flat operator compositions — both in spectral structure and in downstream-classifier utility.

**Alternative hypothesis (H1):** patchGrammar's local-context expressiveness produces signals that are either:
- More similar to real physiological signals (lower spectral distance to held-out human data), OR
- More useful as data augmentation for downstream classifiers (higher F1 on a held-out test set when augmented).

**Pre-commitment.** If H0 is not rejected by EITHER pass criterion above, patchGrammar stays permitted-but-not-promoted. The protocol does NOT keep adding operators or running variants until something passes. The bar is a one-shot test against pre-registered criteria.

## Dataset selection

Three candidate datasets, one per signal family the codec ships:

### ECG — PhysioNet/CinC Challenge 2017

**Citation.** Clifford et al., *"AF Classification from a Short Single Lead ECG Recording: The PhysioNet/Computing in Cardiology Challenge 2017,"* CinC 2017. Dataset DOI: `10.13026/C2VW2J`. Public + license-clean (Open Database License + CC-BY).

**Why this dataset.**
- Single-lead ECG, ~9000 short recordings, balanced labels (Normal / AF / Other / Noisy).
- License is permissive; no clinical-use barrier.
- Established benchmark with published baselines (F1 ~0.83 for the winning Challenge entry; widely re-used).

**For the measurement.** Use the Normal class as the "real signal" baseline for spectral distance. Use all four classes for the data-augmentation downstream-classifier task.

### Temperature — NOAA Local Climatological Data (hourly stations)

**Citation.** NOAA National Centers for Environmental Information, *Local Climatological Data (LCD)* — hourly station observations including dry-bulb temperature. License: U.S. Government work / public-domain (CC0-equivalent under NCEI distribution policy). Archive: `https://www.ncei.noaa.gov/data/local-climatological-data/`.

**Why this dataset.**
- Hourly temperature traces are abundant, station-tagged, and date-range-pinnable — reproducibility is straightforward.
- License is unambiguous (U.S. Government work → public-domain in the U.S.; NCEI redistribution under no-rights-reserved terms).
- Single-variable signal (dry-bulb temperature) maps cleanly onto the sensor codec's temperature route output.

**For the measurement.** Pick a single well-documented airport ASOS station from the LCD archive; final station + date-range pick is deferred to the results-slice PR so the file SHA is pinnable in that PR's manifest. Slice hourly temperature into 24-hour windows; use those as the "real signal" baseline for spectral distance and as labels for a small "cold-snap vs steady-day" augmentation classifier (cold-snap = ≥5 °C drop within a 12-hour window).

**Note on UCI HAR.** An earlier draft of this plan listed UCI HAR as a possible temperature source. That was incorrect: UCI HAR (Anguita et al., ESANN 2013) is a 3-axis-accelerometer + 3-axis-gyroscope smartphone dataset and contains no thermal recordings. UCI HAR remains the gyro lane's dataset (below) but is not used for temperature.

### Gyro — UCI HAR (gyroscope subset)

**Citation.** Anguita et al., *"A Public Domain Dataset for Human Activity Recognition Using Smartphones,"* ESANN 2013. UCI Machine Learning Repository archive: `https://archive.ics.uci.edu/ml/datasets/Human+Activity+Recognition+Using+Smartphones`. License: distributed by UCI under a permissive non-commercial-friendly attribution release (typically cited as CC-BY-4.0 in derivative work; verify the archive's `README` at fetch time and pin the version).

**Why this dataset.**
- 3-axis gyroscope traces during 6 labeled human activities (walking, walking-upstairs, walking-downstairs, sitting, standing, laying).
- Established benchmark with published baselines.
- Archive is small (≈60 MB) and pinnable.

**For the measurement.** Per-axis spectral distance against held-out HAR gyro traces; activity-classification F1 with augmented training data.

## Metric definitions

### Metric 1 — Welch spectral distance (per-signal-family)

**Definition.** Compute Welch's power spectral density (PSD) for each generated signal and each held-out real signal of the same family. Compute pairwise log-PSD L2 distance, averaged over all generated×real pairs. Compare:

- `flat_dist` — average distance using flat-operator-catalog generations.
- `patch_dist` — average distance using patchGrammar generations.

**Pass criterion.** `patch_dist < 0.9 * flat_dist` (≥10% reduction).

**Tooling.** `scipy.signal.welch` (BSD license, Python standard); `numpy.linalg.norm` for L2.

### Metric 2 — Augmentation-induced F1 lift (per-signal-family)

**Definition.** Train a baseline classifier (logistic regression on rolling-window features, or a small 1D-CNN; pick simplest viable). Train two variants:

- `baseline_classifier` — trained on real data only.
- `flat_augmented` — real data + N synthetic samples from flat operators.
- `patch_augmented` — real data + N synthetic samples from patchGrammar.

Evaluate F1 on the same held-out test set for all three.

**Pass criterion.** `F1(patch_augmented) - F1(baseline_classifier) ≥ 0.01` AND `F1(patch_augmented) > F1(flat_augmented)`. Both must hold.

**Tooling.** `scikit-learn` (BSD-3); optionally a small PyTorch classifier.

## Generation protocol

For each (signal_family, operator_set) combination, generate **300 synthetic samples** (small but enough for stable mean estimation). Random seeds drawn from a fixed list (`[1, 2, ..., 300]`). All generated samples written through the existing `wittgenstein sensor` codec so the manifest spine records the generation lineage.

### Configuration A — flat operator baseline

Use the existing default operator catalog per signal:
- ECG: `ecgTemplate(bpm=72, amplitude=1) + noise(white, amplitude=0.02) + drift(slope=0.005)`
- Temperature: `drift(slope=0.004) + noise(white, amplitude=0.04) + step(atSec=durationSec*0.55, amplitude=0.7)`
- Gyro: `oscillator(freq=1.7, amplitude=0.42) + oscillator(freq=3.4, amplitude=0.12, phase=1.1) + noise(white, amplitude=0.06)`

Vary one parameter per sample (e.g. `bpm` for ECG over 60-100, `slope` for temperature) to produce within-class variation. Specific parameter ranges in `appendix-flat-config.json` (next slice).

### Configuration B — patchGrammar variant

Use patchGrammar with **comparable parameter budget** to Configuration A:
- ECG: 3-patch heart-rate ramp (different `bpm` per patch).
- Temperature: 4-patch with `affineNormalize` per patch (forcing distinct sub-ranges).
- Gyro: 2-patch with quiescent + active sections.

Same per-sample parameter variation as A. Same RNG seed list. Specific config in `appendix-patch-config.json` (next slice).

### Why "comparable parameter budget"

The measurement must compare like-with-like. patchGrammar with 50 patches vs flat with 3 operators is unfair. Both configurations should have approximately the same number of *user-controllable parameters* — that's the fair comparison axis. Document the budget count in the appendix.

## Experimental protocol

```text
1. Download datasets. Verify SHA-256 of each archive.
2. Run wittgenstein sensor 300× per (family × config) combination,
   recording manifests for each run.
3. Pool generated samples per (family × config) into matrices.
4. Compute Metric 1 (Welch spectral distance to held-out real samples).
5. Train baseline / flat-augmented / patch-augmented classifiers.
6. Compute Metric 2 (F1 on held-out test set).
7. Apply pass criteria.
8. Write a short results note, regardless of pass/fail.
```

The manifest spine already records seed + parameters per generation, so re-running step 2 against the same codec version on the same platform produces bitwise-identical synthetic samples. Cross-platform parity is structural — same sample count, same channels, same parameter manifest — not byte-equal, matching the parity contract used by the existing sensor goldens. The results-slice PR must pin the codec git SHA + Node/Python versions so the bitwise claim is reproducible.

## What "pass" / "fail" looks like

**Pass (per family).** EITHER pass criterion holds. Update the patchGrammar status in `docs/codecs/sensor.md` from "permitted-but-not-promoted" to "ratified post-M3 operator," open an ADR draft formalizing the patchGrammar primitive, un-park #153 (chaos operators) for the next measurement question.

**Fail (per family).** Both criteria fail. patchGrammar stays permitted-but-not-promoted. #153 chaos operators stay parked. Write a short results note explaining the failure and what (if anything) would change the verdict in a later measurement.

**Mixed (some families pass, others fail).** Document the asymmetry. The honest interpretation is "patchGrammar earns its keep for ECG ramps but not for temperature/gyro" or similar — promotion is per-family, not global.

## Reproducibility expectations

- **Dataset SHAs pinned** in the results note (the LCD station file, the CinC archive, the UCI HAR archive — each at a specific version).
- **All generation seeds enumerated** (`[1, 2, ..., 300]`).
- **Classifier training seeds pinned** for the augmentation experiment.
- **Tool versions recorded** (Python, sklearn, scipy, PyTorch).
- **Manifest spine intact** for every generated sample (the codec already does this).

A re-run by a third party should produce the same numbers within statistical noise (±1pp on F1, ±5% on spectral distance). Any larger drift is a real reproducibility problem and should be flagged.

## What the measurement does NOT do

- Does NOT add operators to the codec.
- Does NOT modify `docs/codecs/sensor.md` or any doctrine surface.
- Does NOT promote patchGrammar to doctrine *unless* the pass criteria hold.
- Does NOT introduce TimesFM, NumPy/SciPy as runtime deps (the measurement uses scipy *for analysis* only; it doesn't enter the codec runtime).
- Does NOT measure aesthetic / clinical quality. Pass criteria are pre-committed; "the augmented signals look more realistic" is not a pass criterion.
- Does NOT run before #284 ratifies. Implementation begins after the plan is reviewed.

## Open methodology questions (to resolve before running)

1. **Sample size.** Pre-registered: **n = 300 per config for the primary run.** Pre-registered escalation rule: if the observed per-config standard deviation of *either* primary metric (Welch spectral distance or augmentation F1) exceeds 15% of its sample mean after the primary run, automatically re-run all configs at **n = 1000** and use the n = 1000 result as the verdict. Any escalation beyond n = 1000 is post-registered and must be documented as such in the results note (with the reason and the prior value preserved). The pass criterion uses absolute thresholds, not significance tests, so this sample-size rule is operational pre-commitment rather than statistical power analysis.
2. **Classifier complexity.** Logistic regression on rolling features is the simplest baseline; a 1D-CNN is the natural step up. Pick simplest viable; document the choice.
3. **Held-out fraction.** Standard 70/10/20 train/val/test split, stratified per class.
4. **Real-vs-synthetic mix in `*_augmented` configs.** Default 1:1 (real:synthetic). Document the mix in the results note.

These are pre-commitments to make before running, not iterations to do after seeing results.

## Cross-references

- **PR #276** — sensor algorithmic research; named this measurement as the gate.
- **PR #285 reconciliation** ([PR #293](https://github.com/p-to-q/wittgenstein/pull/293)) — exec plan annotation listing this measurement under M3 follow-ups.
- **PR #295** — prior draft of this plan; superseded by this revision (UCI HAR thermal claim removed; tone made repository-neutral; NOAA LCD pinned as the temperature source).
- **#284** — this plan's commission.
- **#155** — downstream-task measurement parent issue; this plan is its concrete instantiation.
- **#153** — chaos operators; un-parked only on patchGrammar pass.
- **`docs/codecs/sensor.md`** — current sensor doc; updated only on patchGrammar pass.
- **`docs/research/2026-05-07-sensor-patch-grammar.md`** — original patchGrammar design note.
- **PRs #244 / #249** — patchGrammar implementation + contract honesty.
