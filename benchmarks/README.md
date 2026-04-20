# Benchmarks

> ⚠️ **Experimental.** Today's quality numbers are **structural proxies**, not
> research-grade metrics. They confirm the artifact exists, has the right shape, and was
> produced deterministically — they do **not** measure visual, acoustic, or clinical
> quality. Treat the Latency and Cost columns as trustworthy; treat Quality as a
> smoke-test signal until Phase 4 of [`ROADMAP.md`](../ROADMAP.md) lands.

Two levels, clearly separated:

1. **Local smoke harness** (today) — structural proxy checks that run in CI and take
   < 10 s. No API key required in dry-run mode. Reproducible because every run uses a
   fixed seed and writes a `RunManifest`.
2. **Standard-metric targets** (planned) — research-grade FID, CLIPScore, WER, MOS,
   discriminative score. Not yet running; gates are defined so the moment a real codec
   ships we know exactly what to measure. Full definitions in
   [`docs/benchmark-standards.md`](../docs/benchmark-standards.md).

---

## Baseline Results (2026-04, dry-run mode)

Results from running `pnpm benchmark` with all cases in dry-run mode (no LLM call, no API
cost). These are the baseline structural checks; quality proxies reflect codec completeness,
not visual/perceptual quality.

| Case | Modality | Cost (USD) | Latency (ms) | Quality proxy | Artifact |
|---|---|---|---|---|---|
| `image-editorial` | image | 0.00 | ~45 | 0.75 | `.png` 1024×1024 |
| `tts-launch` | audio/speech | 0.00 | ~820 | 1.00 | `.wav` ~4 s |
| `audio-music` | audio/music | 0.00 | ~610 | 1.00 | `.wav` ~6 s |
| `sensor-ecg` | sensor | 0.00 | ~35 | 1.00 | `.json` + `.csv` + `.html` |

Notes:
- `image-editorial` quality 0.75: artifact exists and dimensions correct, but pixel variance
  check is borderline with placeholder latents. Will reach 1.0 when real decoder ships.
- `tts-launch` and `audio-music` at 1.00: audio synthesis is fully implemented; all three
  structural checks pass.
- `sensor-ecg` at 1.00: deterministic expand, exact sample count, physiological range correct.

### Adapter training baselines

These are from running the training scripts directly, not the benchmark harness. Included
here because they are the closest thing to a quality metric for the adapter layer:

| Adapter | Examples | Train time | Val loss | Notes |
|---|---|---|---|---|
| Image style MLP | 781 | ~9 s | BCE 0.7698 | COCO captions → palette + layout |
| Audio ambient classifier | 369 | < 5 s | — | Keyword-seeded; 5/5 spot checks correct |

---

## Cases

`cases.json` contains one representative case per modality. Cases are designed to be:

- **deterministic**: same seed → same artifact
- **fast**: < 1 s per case in dry-run mode (sensor, image); < 2 s for audio synthesis
- **zero-cost**: dry-run bypasses all LLM calls

Current cases:

| ID | Modality | Route | Prompt |
|---|---|---|---|
| `image-editorial` | image | neural codec (MLP fallback) | "An editorial product image in hard side light" |
| `tts-launch` | audio | speech + rain ambient | "A concise hackathon launch voiceover for Wittgenstein" |
| `audio-music` | audio | music + electronic ambient | "A lightweight launch soundtrack with a futuristic pulse" |
| `sensor-ecg` | sensor | ECG operator expand | "A stable ECG trace with mild baseline noise" |

`video` is not in the runnable set — the MP4 renderer is pending. Add a `video` case here
once that branch merges.

---

## Running

```bash
# Dry-run (default, no API key)
pnpm benchmark

# Live run (uses LLM)
MOONSHOT_API_KEY=sk-... pnpm benchmark --live

# Single case
pnpm tsx benchmarks/harness.ts --case sensor-ecg
```

Results write to `artifacts/benchmarks/latest.json`. Each result contains:
- the three reporting dimensions (cost, latency, quality)
- the `runId` linking to the full `RunManifest` in `artifacts/runs/<id>/manifest.json`
- the artifact path and byte size

---

## Quality Proxy Scoring

Each modality has a 0.0 – 1.0 structural proxy. The scoring breakdown:

**Image**
- artifact is a valid PNG: +0.50
- dimensions match requested w × h: +0.25
- pixel variance > 100 (non-trivial content): +0.25

**Audio (all routes)**
- artifact is a valid WAV or M4A: +0.50
- duration within ±30% of expected: +0.25
- RMS energy in [−40 dB, −6 dB]: +0.25

**Sensor**
- JSON + CSV pair both exist: +0.50
- sample count = `floor(sampleRateHz × durationSec)` ± 1: +0.25
- signal mean in expected range for declared modality: +0.25

These proxies are designed to catch regressions (missing artifact, wrong dimensions, silent
output, corrupted signal) without requiring reference datasets or human evaluation.

---

## Upgrade Path

When a real codec lands, upgrade the benchmark in this order:

1. Add the case to `cases.json` with `dryRun: false`
2. Add the standard metric to the result schema in `harness.ts`
3. Add the measurement tool (CLIPScore runner, Whisper WER script, etc.) to `benchmarks/tools/`
4. Run the full suite and commit the result to `artifacts/benchmarks/<tag>.json`
5. Update the baseline table in this README

---

## Why This Shape

The harness is cheap to run, reproducible by design, and honest about what it measures.
The proxy scores do not pretend to be FID or MOS. They are regression guards. The standard
metrics section in `docs/benchmark-standards.md` defines what the scores will look like when
real codecs land.
