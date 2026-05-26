# Brief E — Per-modality quality benchmarks (v2)

**Date:** 2026-04-23
**Author:** research (@Jah-yee @Moapacha)
**Status:** Draft v0.1
**Summary:** Picks the smallest set of real (non-structural) quality metrics per modality that Wittgenstein can actually run locally and reproducibly without breaking the Latency / Price / Quality contract. For v0.2 the shipping target is a **default tier only**; heavier metrics remain a documented v0.3+ reservation, not a CLI promise.

---

## Context

The current state of the Wittgenstein benchmark harness is honest and narrow. The README at `benchmarks/README.md` admits it outright: "Today's quality numbers are **structural proxies**, not research-grade metrics." The four cases that run in CI (`image-editorial`, `tts-launch`, `audio-music`, `sensor-ecg`) each produce a 0.0–1.0 score that decomposes into three things: does the artifact exist and parse, are the container-level dimensions right (width × height for PNG, duration for WAV, sample count for sensor JSON), and does a trivial signal-level sanity check pass (pixel variance > 100, RMS in a loudness window, signal mean in a physiological range). That is a file-format smoke test wearing a quality badge.

This is not nothing. The 35-artifact showcase that the gallery branch just landed (`docs/showcase-gallery`, commit 7897062) leans hard on those structural checks to prove that every modality at least _renders_ deterministically across SVG, ASCII-PNG, raster PNG, WAV (speech / music / soundscape), JSON+CSV (ECG, gyro, temperature), and eventually MP4. If any of those checks regresses, we know instantly that the codec broke. But none of those checks can distinguish "the adapter produced a plausible 440 Hz A4 sine wave" from "the adapter produced a plausible violin tone", because both decode, both land in the loudness window, and both are within 30% of the expected duration. The quality axis has almost no dynamic range below the ceiling.

The driving question for this brief is: what is the _smallest_ set of real metrics — one per modality — that lifts Quality off the structural floor without (a) requiring a paid API (violates the Price ≈ 0 dry-run contract), (b) requiring a GPU to run every pre-commit hook (violates Latency), or (c) adding so many dependencies that the repo turns into a metric zoo? Every pick below has to clear that bar.

## Steelman

The structural-proxy floor was the right first move, and this brief should not pretend otherwise. Three reasons.

First, reproducibility beats perceptual score when the stack is still settling. A CLIPScore number is only meaningful relative to a specific CLIP checkpoint, a specific prompt-normalization scheme, a specific batch size, and a specific numerical precision. If any of those five drift between the author's laptop and the CI runner, the number drifts with them, and you have a benchmark that no-one outside the author's machine can reproduce. The structural checks have none of that attack surface: a PNG either has dimensions 1024 × 1024 or it does not. That property is the reason the harness's Latency and Cost columns are already trustworthy, and it is the reason the team decided Quality could wait.

Second, the METR 2024 harness-gains result is directly on point. METR's "update on our general capability evaluations" (August 2024) and the follow-up "Measuring AI Ability to Complete Long Tasks" (March 2025) both show that a large fraction of reported capability improvement on agent benchmarks comes from the scaffolding around the model — the harness — rather than the model weights themselves. Philschmid's April 2026 follow-up essay argues the same point: harness is load-bearing in 2026. The Wittgenstein corollary is: if you bolt a flaky perceptual-score harness onto an honest structural-proxy harness, the composite score will move because the harness moved, not because the model moved, and you will spend six months debugging a benchmark rather than shipping a codec. The structural floor was deliberately the cheapest harness that could not lie.

Third, the reproducibility premium compounds. Every artifact Wittgenstein ships lives in a `RunManifest` with a fixed seed and a deterministic route. That manifest is the primary scientific asset of the repo; the artifact is secondary. Any quality metric we add has to be a _function_ of the manifest plus the artifact, runnable offline, with no hidden state. If we cannot meet that bar, we do not add the metric. This brief therefore asks a narrower question than "what is the best metric per modality": it asks "what is the best metric per modality that is also a pure function of (manifest, artifact) and fits in a laptop."

## Per-modality picks

One subsection per modality the 35-artifact showcase covers. Each pick names one default-tier metric (must run in CI on a laptop with no GPU, under ~5 s per artifact) and, where relevant, one heavy-tier metric (gated behind `--quality=heavy`). Candidates are discussed; the pick is in bold.

### Image (SVG + ASCII-PNG + raster)

Candidates: CLIPScore (Hessel et al., 2021, arXiv:2104.08718), VQAScore (Lin et al., 2024, arXiv:2404.01291), ImageReward (Xu et al., 2023, arXiv:2304.05977), HPSv2 (Wu et al., 2023, arXiv:2306.09341).

CLIPScore is the obvious default — reference-free, widely cited, cheap to run against an OpenCLIP ViT-B/32 checkpoint (~150 MB). But the 2023–2024 literature has documented, in detail, that CLIPScore rewards prompt-rephrasing and treats text encoders as bags of words (Hessel et al. acknowledge this themselves; the 2023 robustness paper arXiv:2305.14998 quantifies it; VQAScore's opening argument is essentially "CLIPScore conflates 'the horse is eating the grass' with 'the grass is eating the horse'"). For a showcase that explicitly includes compositional prompts (editorial product shots, multi-object scenes), CLIPScore as the default metric would be a trap.

ImageReward and HPSv2 are better correlated with human preference than CLIPScore, but both are human-preference reward models trained specifically on diffusion outputs at typical web-art styles. They will misbehave on Wittgenstein's SVG and ASCII-PNG artifacts, neither of which looks like Midjourney training data, and both ship as ~1–2 GB checkpoints.

**Pick: VQAScore (default tier), CLIPScore as the cheap fallback when VQAScore is unavailable.** VQAScore (arXiv:2404.01291, ECCV 2024) reframes image-text alignment as a VQA probability — "Does this figure show '{text}'?" P(yes) — using an off-the-shelf VLM. The reference implementation (`t2v_metrics` on GitHub, `linzhiqiu/t2v_metrics`) runs with CLIP-FlanT5-XL (~3 GB) and reports state-of-the-art correlation with human judgement on eight image-text alignment benchmarks. Crucially, it beats CLIPScore on compositional prompts, which is exactly what Wittgenstein's editorial cases are. Rationale for default tier: the authors publish a smaller variant that fits in the GPU-less budget for a single-shot evaluation (~10 s per artifact on CPU with int8), and the score is bounded in [0, 1] by construction, which the composite wants. Rationale for CLIPScore fallback: if the VQAScore model download fails in CI, CLIPScore still runs in < 1 s and produces a score that is wrong-but-present, which matters for the composite's "no silent drops" rule.

For SVG specifically, we rasterize at 512² before scoring. For ASCII-PNG, we score both the text form (VQAScore between the caption and the rendered raster) and we keep the structural check (does the glyph grid parse) as a gating pre-condition.

### Speech / voice

Candidates: Whisper WER via ASR round-trip (Radford et al., 2022, arXiv:2212.04356), UTMOS (Saeki et al., 2022, arXiv:2204.02152), DNSMOS P.835 (Reddy et al., 2021, arXiv:2110.01763).

Whisper WER is tempting because Whisper-base is 140 MB and runs on CPU, and "does the generated speech say the words we asked it to say" is a real property. But WER is only meaningful when the reference transcript is known exactly, and it measures _intelligibility_, not _naturalness_ — a robotic monotone that happens to hit every phoneme scores perfectly. For Wittgenstein's speech route, intelligibility is already close to saturated because the underlying TTS is not experimental; the variance we care about is naturalness and prosody.

DNSMOS P.835 (arXiv:2110.01763) predicts three ITU-T P.835 scores — speech quality (SIG), background noise (BAK), overall (OVRL) — and the reported correlation with human ratings is very high (PCC 0.94 / 0.98 / 0.98). But DNSMOS was specifically built to evaluate _noise suppressors_; its signal of interest is "did the denoiser remove noise without hurting the speech", not "is this synthetic voice convincing." Wrong target for our use case.

**Pick: UTMOS (default tier), Whisper-WER as a gating pre-condition, DNSMOS as a heavy-tier diagnostic.** UTMOS (arXiv:2204.02152, the winner of VoiceMOS 2022) is an SSL-feature ensemble that predicts MOS for synthetic speech specifically. The `speechmos` and `utmos` Python packages wrap it into a single `predict(wav)` call; the underlying wav2vec2 feature extractor is ~360 MB and runs on CPU at about 2× realtime. Output is a single [1, 5] MOS score, trivially normalizable to [0, 1]. This is the right default because (a) MOS is what speech synthesis papers report, (b) the model was trained on the right distribution (Blizzard Challenge / VCC outputs, not denoised clean speech), and (c) it is small enough for CI.

Whisper-WER sits _before_ UTMOS as a gate: if the ASR round-trip has WER > 0.5, we report "unintelligible" and do not trust the UTMOS number. This prevents the harness from praising a beautiful-sounding but content-free noise. DNSMOS ships behind `--quality=heavy` because its SIG / BAK / OVRL breakdown is genuinely useful when debugging a route regression, but running three models instead of one is not the default.

### Music

Candidates: BPM estimation accuracy (librosa / essentia), key estimation accuracy (librosa / essentia), CLAP similarity (LAION-CLAP, arXiv:2211.06687).

Music is the modality where structural proxies bite hardest: "WAV decodes, duration in window, RMS in loudness band" is true of literally any signal we produce. The Wittgenstein music route currently claims 1.00 quality, which is correct under the structural definition and false under any musical definition.

**Pick: librosa BPM accuracy + key estimation accuracy (default tier), CLAP similarity (heavy tier).** The default metric is a pair of deterministic DSP routines: `librosa.beat.beat_track` returns a tempo estimate, and the route manifest already names the target BPM (every music case is generated from a prompt that fixes tempo either explicitly or implicitly through a genre tag). The quality score is `1 − min(|BPM_estimated − BPM_target| / BPM_target, 1)`, clipped to [0, 1]. Key estimation follows the same pattern using the Krumhansl-Schmuckler profile available in `librosa.feature.chroma_cqt` + `librosa.key`. Rationale: both routines run in < 1 s on CPU, both are deterministic, and both measure something a listener actually cares about. They are lossy — neither catches "this track is tonally correct but musically boring" — but they remove the ceiling effect at the structural floor and they cost effectively zero.

CLAP (LAION-CLAP, arXiv:2211.06687) is the heavy-tier upgrade. The `laion/clap-htsat-unfused` checkpoint (~600 MB) embeds audio and text into a shared space; cosine similarity between the prompt and the artifact is a reasonable proxy for "does this sound like what was asked for." Behind `--quality=heavy` because the checkpoint is six times larger than everything else in the default tier combined.

### Soundscape

Candidates: spectral centroid match to a reference bank, PANNs tag retrieval (Kong et al., 2020, arXiv:1912.10211), CLAP similarity.

Soundscape is the trickiest modality because there is usually no reference recording to compare against — the prompt says "rain on a tin roof at night" and the artifact is one of infinitely many plausible realizations. Spectral centroid match is cheap but too blunt (rain and static white noise both have high centroids). PANNs tagging produces 527 AudioSet tag probabilities; you can compute "does the top-k tag list overlap the prompt tags" as a score. This works but requires a prompt → AudioSet-tag mapping step, which is an adapter we do not have.

**Pick: CLAP similarity (default tier), PANNs tag retrieval (heavy tier).** CLAP wins here as the default because it takes the prompt string natively — no tag mapping — and produces a scalar cosine that normalizes cleanly to [0, 1]. The same `laion/clap-htsat-unfused` checkpoint covers both music (heavy) and soundscape (default), so we pay the 600 MB download once. This is the one place in the brief where a heavier model is the right default: spectral centroid is too noisy to be useful, and PANNs without a tag-mapping adapter is not actionable. Running CLAP on a single 6-second soundscape is ~3 s on CPU, inside the budget.

PANNs retrieval stays available under `--quality=heavy` as a diagnostic. The 527-tag breakdown is useful for "why did this score so low" investigations in a way CLAP's single cosine is not.

### Sensor / ECG

Candidates: clinical plausibility rule sets (QRS width, PR interval, heart rate range), open ECG quality indices.

**Pick: NeuroKit2 rule set (default tier).** NeuroKit2 (neuropsychology/NeuroKit on GitHub) is an open-source Python toolbox for neurophysiological signal processing with a mature ECG module. The relevant functions are `ecg_peaks`, `ecg_delineate`, and `ecg_quality`. The plausibility check we run is an explicit, reviewed rule list rather than a single opaque score:

1. Heart rate in [40, 180] BPM. (Covers resting bradycardia through exercise; below 40 or above 180 in a "stable ECG" prompt is a route bug.)
2. QRS width in [60, 120] ms. Anything wider on a "normal" prompt signals reconstruction failure.
3. PR interval in [120, 220] ms. Outside this window is either a prompt-specified arrhythmia (allowed if the prompt asked for it) or a route bug.
4. R-R interval coefficient of variation consistent with the prompt's `stability` tag.
5. Signal quality index (`ecg_quality`, Zhao 2018 method) above a floor of 0.5.

Score = fraction of rules passed, in [0, 1]. Rationale: ECG is the one modality where "plausibility" has a textbook answer, and an opaque learned metric would be strictly worse than an explicit rule list that a clinician could review. Open ECG plausibility checkers with a published 2024–2026 paper (e.g., the Ho et al. 2025 telehealth RR-interval extraction work at medRxiv 2025.03.10.25323655) exist but are narrower in scope than the NeuroKit2 module and do not supersede it as a default. NeuroKit2 runs entirely on CPU in milliseconds per 30-second trace.

### Sensor / gyro + temperature

No pretrained model makes sense here — these are physical signals with strong prior structure, and a learned metric would be over-engineered.

**Pick: physical-plausibility rule set (default tier).** Explicit rules per sensor type:

- **Gyroscope (rad/s or deg/s):** magnitude bounded by the declared range (default ±2000 deg/s for consumer IMUs); first derivative bounded by `ω̇_max ≈ 10⁴ deg/s²` for hand motion; no NaN / Inf; unit declared in manifest matches unit of data column; sample count matches `floor(sample_rate × duration)` (already in the structural tier, retained).
- **Temperature (°C):** values in the prompt-declared envelope (e.g., "ambient room" → [15, 30]; "ice bath" → [-5, 10]); first derivative bounded by declared thermal time constant (default 1 °C/s for ambient sensors, stricter for thermocouples in well-mixed environments); no monotonic drift inconsistent with the declared scenario (stable-room data that ramps 10 °C over a minute is a route bug).

Score = fraction of rules passed, in [0, 1]. Both rule sets are ~15 lines of NumPy. Zero extra dependencies. This is deliberately the same shape as the ECG rule set for consistency — the composite treats them identically.

### Video

Candidates: structural pass (does the MP4 demux, are the frames the right resolution, is duration within tolerance) + CLIP-based temporal coherence via VideoCLIP / InternVideo2.

Video is the least mature modality in the repo — the MP4 renderer is still pending per `benchmarks/README.md` — so the v2 metric here is a target, not a measurement we can run today.

**Pick: structural pass gate + per-frame CLIP similarity mean/std (default tier), InternVideo2 similarity (heavy tier).** The default is: demux, sample N=8 frames uniformly, compute CLIPScore of each frame against the prompt, report `mean − std` as the score. The `mean` rewards prompt alignment; the `− std` term penalizes frame-to-frame drift, which is the cheapest available proxy for temporal coherence without loading a video model. Runs in ~5 s on CPU for an 8-frame, 512² video.

Heavy tier is InternVideo2 (arXiv:2403.15377) similarity between the prompt and the clip. InternVideo2 is the current public best on text-to-video retrieval, with strong video-language semantic alignment; it is also ~1 GB and wants a GPU for sensible latency, so it stays behind `--quality=heavy`. VideoCLIP-XL is a reasonable alternative at a similar size. Between these two, default is InternVideo2 because its zero-shot retrieval numbers are better and its API is simpler.

Note: "CLIP-temporal" is not a published metric; it is a construction. We should name it `clip-frame-drift` in the codebase to avoid implying a citation that does not exist.

## Composite Quality score

One normalization rule, one hard invariant.

Rule: each per-modality metric is normalized to [0, 1] by a documented transform (UTMOS `(x − 1) / 4`, VQAScore already in [0, 1], librosa-BPM accuracy clipped to [0, 1], NeuroKit2 rule fraction already in [0, 1], etc.). The composite for a run is the unweighted arithmetic mean of the per-modality [0, 1] scores, computed only over modalities the run actually produced. The `RunManifest` records which modalities contributed and each modality's raw + normalized score.

Invariant: **no modality can silently drop because its API broke.** If a metric fails to compute — model download failed, import error, OOM, whatever — the harness emits an explicit `null` score for that modality, marks the run as `quality_partial`, and the composite is _not_ computed. A run with missing quality data does not get a quality number. The CLI surface is:

```
pnpm benchmark --quality=off   # structural only (today's behavior, default for CI pre-commit)
pnpm benchmark --quality       # default-tier metrics from this brief
```

The default-tier models together are under ~1.5 GB (UTMOS wav2vec2 ~360 MB + VQAScore small ~500 MB + CLAP ~600 MB + librosa/NeuroKit2 zero). The heavy tier adds ~3 GB. Both sit under an explicit `benchmarks/tools/` directory with pinned checksums.

## Red team

Three pushbacks, answered inline.

**"The proxies already work, don't overfit to BLEU-style metrics."** The structural proxies work as regression guards, not as quality measurements. The 35-artifact showcase needs a quality axis that can distinguish "the image adapter shipped" from "the image adapter produces coherent compositions", and structural checks cannot do that. This brief is not proposing BLEU-per-modality; it is proposing one metric per modality that at least has a published correlation with human judgement (VQAScore, UTMOS, CLAP) or with a clinical reference (NeuroKit2 rule list). Crucially, the structural proxies stay — they become gating pre-conditions. A run that fails the structural check does not compute the perceptual metric, because "beautiful but malformed" is not a state we want to reward. This is the opposite of overfitting: the composite is explicitly multi-tier.

**"CLIPScore is a trap — it rewards prompt-rephrasing."** Correct, which is why CLIPScore is the fallback, not the default. The default image metric is VQAScore, precisely because the VQAScore paper spends its first three pages documenting CLIPScore's bag-of-words failure mode on compositional prompts. For video, `clip-frame-drift` uses CLIPScore across frames, which inherits the same weakness; that is acceptable because the load-bearing quantity there is the _drift_ (frame-to-frame std), not the absolute similarity. If the adapter learns to rephrase prompts in its latent to game the CLIP score, the drift term will not change and the absolute mean will move uniformly across the default set. We should still track the VQAScore-video variant (the `t2v_metrics` repo supports it) as the eventual replacement.

**"Perceptual metrics are expensive / require GPUs — breaks the local-first bet."** This is the strongest pushback and the brief is designed around it. The default tier is calibrated to run on CPU under ~5 s per artifact, total ~1.5 GB of model weights, no paid APIs. That is achievable today: UTMOS wav2vec2 is 360 MB and runs at 2× realtime on CPU; NeuroKit2 is pure NumPy; librosa BPM is DSP; VQAScore has a small-model path; CLAP on CPU is the slowest piece and still fits. The _heavy_ tier is explicitly GPU-preferred and explicitly behind a flag. If the default tier cannot hit the per-artifact budget on a 2024-class laptop in CI, we drop to the cheap fallback per modality (CLIPScore for image, Whisper-WER for speech, spectral-centroid for soundscape) before we drop the quality axis entirely. The local-first bet survives; the ceiling on Quality moves up without the floor on Latency moving.

## Kill criteria

Three concrete triggers.

1. **If, on the 35-artifact showcase, any two default-tier metrics for the _same_ modality disagree by more than 0.3 on normalized [0, 1] scale,** the composite is noise and we stop reporting a composite until the disagreement is diagnosed. Example: VQAScore says 0.8 on an editorial image, CLIPScore-fallback says 0.4 — that is either a genuine compositional-prompt failure VQAScore is catching and CLIPScore is missing (keep VQAScore as primary) or a VQAScore model-load bug (mark run as `quality_partial`). We cannot know without investigation; we will not publish a mean.

2. **If any default-tier metric requires a paid API,** the metric fails the Price ≈ 0 constraint and is rejected. This applies retroactively: if LAION-CLAP's weights move behind a license wall, we fall back to PANNs (Apache 2.0) or drop soundscape to the cheap tier. No metric in the default set should have a billing dependency.

3. **If any default-tier metric requires more than 4 GB of model download,** it is not default-tier; it moves to `--quality=heavy`. The 4 GB ceiling is the point where a clean `pnpm install && pnpm benchmark --quality` on a GitHub-Actions-sized runner starts timing out. The current default set totals ~1.5 GB, leaving headroom, but this is the ceiling.

A softer kill: **if the composite never moves** across a month of adapter iteration on the same showcase, either the metrics are saturated or the adapter is not improving. Either way we re-examine; metrics that never move are a waste of Latency budget.

## Verdict

| Modality                         | Current proxy                           | v2 metric                                              | Library / source                                          | Model size                               | Upgrade tier     |
| -------------------------------- | --------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------------- | ---------------- |
| Image (SVG / ASCII-PNG / raster) | PNG valid + dims + pixel variance > 100 | VQAScore (P(yes) on "Does this figure show '{text}'?") | `linzhiqiu/t2v_metrics` (arXiv:2404.01291)                | ~500 MB (small) / ~3 GB (CLIP-FlanT5-XL) | default / heavy  |
| Image cheap fallback             | —                                       | CLIPScore                                              | `jmhessel/clipscore` (arXiv:2104.08718)                   | ~150 MB (OpenCLIP ViT-B/32)              | default fallback |
| Speech / voice                   | WAV valid + duration + RMS              | UTMOS                                                  | `speechmos` / `sarulab-speech/UTMOSv2` (arXiv:2204.02152) | ~360 MB                                  | default          |
| Speech gate                      | —                                       | Whisper-WER round-trip                                 | `openai-whisper` (arXiv:2212.04356)                       | ~140 MB (base)                           | default gate     |
| Speech diagnostic                | —                                       | DNSMOS P.835 (SIG / BAK / OVRL)                        | `microsoft/DNS-Challenge` (arXiv:2110.01763)              | ~80 MB                                   | heavy            |
| Music                            | WAV valid + duration + RMS              | librosa BPM accuracy + key accuracy                    | `librosa` (DSP, no model)                                 | 0                                        | default          |
| Music heavy                      | —                                       | CLAP text-audio cosine                                 | `laion/clap-htsat-unfused` (arXiv:2211.06687)             | ~600 MB                                  | heavy            |
| Soundscape                       | WAV valid + duration + RMS              | CLAP text-audio cosine                                 | `laion/clap-htsat-unfused`                                | ~600 MB                                  | default          |
| Soundscape diagnostic            | —                                       | PANNs top-k tag retrieval                              | `qiuqiangkong/audioset_tagging_cnn` (arXiv:1912.10211)    | ~320 MB (CNN14)                          | heavy            |
| Sensor / ECG                     | JSON+CSV + sample count + mean-in-range | HR / QRS / PR / SQI rule set                           | `NeuroKit2` ecg module                                    | 0                                        | default          |
| Sensor / gyro                    | JSON+CSV + sample count                 | range + derivative + unit rules                        | NumPy                                                     | 0                                        | default          |
| Sensor / temperature             | JSON+CSV + sample count                 | envelope + derivative rules                            | NumPy                                                     | 0                                        | default          |
| Video                            | (pending MP4) structural only           | `clip-frame-drift` (frame-wise CLIPScore mean − std)   | `open_clip_torch`                                         | ~150 MB                                  | default          |
| Video heavy                      | —                                       | InternVideo2 text-video similarity                     | `InternVideo2` (arXiv:2403.15377)                         | ~1 GB                                    | heavy            |

Upgrade order, cheapest-to-land first. Ship the NumPy-only metrics first: NeuroKit2 for ECG, gyro rules, temperature rules, librosa BPM + key for music. These are four PRs totalling maybe 200 lines of code, zero new model downloads, and they immediately lift four modalities off the structural floor. Second, add CLAP for soundscape; it is the one place where the heavier model pays its weight as a default. Third, add UTMOS + Whisper-WER for speech; this is where the speech route quality number becomes meaningful for the first time. Fourth, add VQAScore for image with CLIPScore as the documented fallback; this is the highest-stakes metric in the set because image is the highest-variance modality in the showcase. Fifth, wire `clip-frame-drift` for video once the MP4 renderer lands. Heavy-tier additions (DNSMOS, PANNs, CLAP-music, VQAScore-XL, InternVideo2) stay documented as a **v0.3+ reservation**, not a v0.2 requirement. Everything that ships in v0.2 must fit under the default tier only. — research, 2026-04-23.

## References

- CLIPScore: Hessel, Holtzman, Forbes, Le Bras, Choi (2021). "CLIPScore: A Reference-free Evaluation Metric for Image Captioning." arXiv:2104.08718. https://arxiv.org/abs/2104.08718
- VQAScore: Lin, Pathak, et al. (2024). "Evaluating Text-to-Visual Generation with Image-to-Text Generation." arXiv:2404.01291. https://arxiv.org/abs/2404.01291
- ImageReward: Xu et al. (2023). "ImageReward: Learning and Evaluating Human Preferences for Text-to-Image Generation." arXiv:2304.05977. https://arxiv.org/abs/2304.05977
- HPSv2: Wu et al. (2023). "Human Preference Score v2: A Solid Benchmark for Evaluating Human Preferences of Text-to-Image Synthesis." arXiv:2306.09341. https://arxiv.org/abs/2306.09341
- Whisper: Radford et al. (2022). "Robust Speech Recognition via Large-Scale Weak Supervision." arXiv:2212.04356. https://arxiv.org/abs/2212.04356
- UTMOS: Saeki, Xin, et al. (2022). "UTMOS: UTokyo-SaruLab System for VoiceMOS Challenge 2022." arXiv:2204.02152. https://arxiv.org/abs/2204.02152
- DNSMOS P.835: Reddy, Gopal, Cutler (2021). "DNSMOS P.835: A Non-Intrusive Perceptual Objective Speech Quality Metric to Evaluate Noise Suppressors." arXiv:2110.01763. https://arxiv.org/abs/2110.01763
- CLAP (LAION): Wu et al. (2022). "Large-scale Contrastive Language-Audio Pretraining with Feature Fusion and Keyword-to-Caption Augmentation." arXiv:2211.06687. https://arxiv.org/abs/2211.06687
- PANNs: Kong, Cao, Iqbal, Wang, Wang, Plumbley (2020). "PANNs: Large-Scale Pretrained Audio Neural Networks for Audio Pattern Recognition." arXiv:1912.10211. https://arxiv.org/abs/1912.10211
- NeuroKit2: Makowski et al. (2021). "NeuroKit2: A Python toolbox for neurophysiological signal processing." Behavior Research Methods. https://github.com/neuropsychology/NeuroKit
- InternVideo2: Wang et al. (2024). "InternVideo2: Scaling Foundation Models for Multimodal Video Understanding." arXiv:2403.15377. https://arxiv.org/abs/2403.15377
- METR (2024). "An update on our general capability evaluations." https://metr.org/blog/2024-08-06-update-on-evaluations/
- METR (2025). "Measuring AI Ability to Complete Long Tasks." https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/
- Wittgenstein benchmarks README: `benchmarks/README.md` at commit 7897062.
