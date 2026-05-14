# Benchmark Standards

This document defines two things separately: the **standard metrics** Wittgenstein aligns
with from the research literature, and the **local measurement protocol** that runs today.
The goal is to avoid inventing evaluation language when established practice already exists,
and to give honest numbers about what the current harness can actually measure.

---

## Reporting Dimensions

Every benchmark result is reported in three buckets regardless of modality:

| Dimension   | Definition                                          | Source                                   |
| ----------- | --------------------------------------------------- | ---------------------------------------- |
| **Cost**    | API spend (USD) + token counts                      | `manifest.costUsd`, `manifest.llmTokens` |
| **Latency** | Wall-clock time from CLI invoke to artifact written | `manifest.durationMs`                    |
| **Quality** | Modality-specific; see sections below               | Depends on modality                      |

Cost and latency are always measurable from the manifest. Quality proxies vary by whether a
real codec is running or a stub.

---

## Image

### Standard metrics

**FID — Fréchet Inception Distance** (Heusel et al., 2017)
Measures distributional distance between generated and reference image sets in Inception v3
feature space. Lower is better. Requires a reference set (typically 50K ImageNet validation
images) and at least 10K generated samples for stable estimates. Not computable with a
placeholder adapter; this is the primary quality target once a real decoder ships.

**CLIPScore** (Hessel et al., 2021)
Cosine similarity between CLIP ViT-B/32 embeddings of the input prompt and the generated
image. Higher is better; 0.25–0.35 is typical for aligned text-image pairs. Can be computed
on individual images without a reference set. Computable as soon as the decoder produces
real raster output.

**VQScore** (Lin et al., 2024)
Combines visual quality and text-image alignment into a single scalar. Designed to correlate
better with human preference than FID alone. Planned once image path ships real output.

### Current local proxy

While the image adapter uses placeholder latents or the MLP fallback, the local quality
proxy is structural:

- artifact exists and is a valid PNG: +0.50
- pixel dimensions match requested width × height: +0.25
- pixel variance > 100 (non-trivial content, not a flat fill): +0.25

Score range: 0.0 – 1.0. This is a smoke test, not a visual quality measure.

### Visual Seed Code receipt matrix

Until a real frozen decoder and trained SeedExpander ship, image evals must first report
which decoder-facing path actually fired. The minimum receipt matrix is:

| Path                | Manifest evidence                                         | What it proves today                                    |
| ------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `provider-latents`  | `image.code.path`, `providerLatentGrid`                   | Direct decoder-native tokens were supplied and accepted |
| `coarse-vq`         | `image.code.path`, `coarseVqGrid`                         | A partial VQ structure was accepted and expanded        |
| `visual-seed-code`  | `image.code.path`, `seedFamily`, `seedMode`, `seedLength` | Compact seed code was accepted and expanded             |
| `semantic-fallback` | `image.code.path`, `semanticSource`                       | The run fell back to semantic-only / baseline behavior  |

This matrix is not a quality score. It is the first gate for comparing one-shot VSC,
two-pass compile, semantic fallback, and direct/coarse-token experiments without hiding
which path the runtime actually used.

### Adapter baseline (measured 2026-04)

The image style MLP was trained and evaluated on real COCO captions:

| Metric              | Value                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Training examples   | 781 (COCO captions → extracted palette + layout stats)                                      |
| Training time       | ~9 s on CPU                                                                                 |
| Epochs              | 600                                                                                         |
| Best validation BCE | 0.7698                                                                                      |
| Architecture        | 3-layer MLP — 512 → 256 → 128 → 21 outputs                                                  |
| Embedding           | Hashed BoW, dim 512, double-hash + bigrams, L2-normalised                                   |
| Output dimensions   | 5 palette RGB triplets (15 dims), noise_scale, grain, composition one-hot (3), accent_count |

---

## TTS / Audio

### Standard metrics

**MOS — Mean Opinion Score** (ITU-T P.800)
Human listener ratings of naturalness and intelligibility on a 1–5 scale. Gold standard
for TTS quality. Requires human evaluation panels; not automatable in the local harness.

**WER — Word Error Rate**
Transcribe the generated audio with a reference ASR model (Whisper-large or equivalent),
compute edit distance against the input script.
`WER = (S + D + I) / N` where S = substitutions, D = deletions, I = insertions,
N = reference word count. Lower is better; 0–5% is typical for high-quality TTS.

**UTMOS** (Saeki et al., 2022)
Automated MOS predictor (Spearman ρ ≈ 0.87 with human MOS on standard benchmarks).
Provides a scalable MOS proxy that runs locally without human panels.

### Current local proxy

- artifact exists and is a valid WAV/M4A: +0.50
- file duration within ±30% of `len(script.split()) / 3` seconds: +0.25
- RMS energy in [−40 dB, −6 dB] (audible, not clipped): +0.25

Score range: 0.0 – 1.0.

### Audio ambient classifier baseline (measured 2026-04)

| Metric            | Value                                                                     |
| ----------------- | ------------------------------------------------------------------------- |
| Training examples | 369 (41 seed phrases × 9 suffix augmentations)                            |
| Training time     | < 5 s on CPU                                                              |
| Epochs            | 300                                                                       |
| Architecture      | 2-layer MLP — 256 → 96 → 8 outputs (7 category logits + 1 volume sigmoid) |
| Categories        | silence · rain · wind · city · forest · electronic · white_noise          |
| Keyword override  | fires when MLP confidence < 0.75; overriding confidence set to 0.85       |

Spot-check predictions (all correct):

| Prompt                         | Predicted category | Source           | Confidence |
| ------------------------------ | ------------------ | ---------------- | ---------- |
| "cozy rainy afternoon"         | rain               | keyword_override | 0.85       |
| "forest birds chirping"        | forest             | mlp              | 0.99       |
| "electrical hum server room"   | electronic         | keyword_override | 0.85       |
| "silent meditation empty room" | silence            | mlp              | 0.94       |
| "busy city intersection"       | city               | mlp              | 0.88       |

---

## Sensor / Time Series

### Standard metrics

Time-series synthesis lacks a universally accepted benchmark. Wittgenstein aligns with the
following families (following Liao et al., 2024 survey):

**Discriminative score** — train a binary classifier to distinguish real from synthetic traces.
Score → 0.5 means the classifier cannot tell them apart (ideal). Higher scores indicate the
synthetic distribution is easily separable.

**Predictive score** — train a forecasting model on synthetic data, evaluate on real.
Measures whether synthetic traces preserve temporal dynamics useful for downstream tasks.

**Domain-specific checks** — ECG: R-peak detection accuracy, HRV metrics;
accelerometer: step count, frequency spectrum integrity;
temperature: drift rate, noise floor.

### Current local proxy

Since the sensor codec generates deterministic algorithmic signals (not samples from a learned
distribution), distributional fidelity metrics are less relevant than structural checks:

- artifact exists as valid JSON + CSV pair: +0.50
- sample count matches `floor(sampleRateHz × durationSec)` ± 1: +0.25
- signal mean within expected physiological/physical range for the declared modality: +0.25

Score range: 0.0 – 1.0.

### Sensor expand baseline (measured 2026-04)

ECG dry-run · 250 Hz · 10 s:

| Metric             | Value                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Signal expand time | < 2 ms (pure numpy, no I/O)                                                                        |
| Sample count       | 2,500                                                                                              |
| Loupe HTML size    | ~40 KB for current dry-run ECG; varies with row count (self-contained, zero external dependencies) |
| Loupe render time  | ~0.8 s (Python subprocess, one-time startup cost)                                                  |

---

## Video

### Standard metrics

**FVD — Fréchet Video Distance** (Unterthiner et al., 2019)
Video analogue of FID, computed in I3D feature space. Lower is better. Requires reference
clips and ≥1K generated clips for stable estimates.

**Video-Bench** (Niu et al., 2024)
Multi-dimensional MLLM-based evaluation covering prompt adherence, visual quality, temporal
consistency, and motion fidelity. More interpretable than FVD alone.

### Current status

Video codec is a typed stub. No local proxy is defined until the MP4 renderer lands.
This section will be the first place upgraded once that branch merges.

---

## Running the Local Harness

```bash
# All cases (dry-run by default, no API key required)
pnpm benchmark

# With a real LLM provider
MOONSHOT_API_KEY=sk-... pnpm benchmark --live
```

Results write to `artifacts/benchmarks/latest.json`. Each result embeds the run ID so
the full `RunManifest` in `artifacts/runs/<id>/manifest.json` can be inspected.

---

## Benchmark Cadence

| When                    | Action                                                           |
| ----------------------- | ---------------------------------------------------------------- |
| Per PR touching a codec | CI runs smoke proxy checks automatically                         |
| Per release tag         | Full local harness run; commit `artifacts/benchmarks/<tag>.json` |
| Post real-codec landing | Add CLIPScore / WER / discriminative score to result schema      |
| Post human eval panel   | Add MOS column to audio results                                  |

---

## References

- Heusel, M. et al. (2017). "GANs Trained by a Two Time-Scale Update Rule." _NeurIPS 2017._ (FID)
- Hessel, J. et al. (2021). "CLIPScore: A Reference-free Evaluation Metric for Image Captioning." _EMNLP 2021._
- Lin, Z. et al. (2024). "Evaluating Text-to-Visual Generation with Image-to-Text Generation." (VQScore)
- Saeki, T. et al. (2022). "UTMOS: UTokyo-SaruLab System for VoiceMOS Challenge 2022." _Interspeech 2022._
- Unterthiner, T. et al. (2019). "FVD: A new Metric for Video Generation." _ICLR 2019 Workshop._
- Niu, M. et al. (2024). "Video-Bench: A Comprehensive Benchmark and Toolkit for Evaluating Video-based LLMs."
- Liao, W. et al. (2024). "A Survey on Time Series Synthesis." (discriminative/predictive score framing)
