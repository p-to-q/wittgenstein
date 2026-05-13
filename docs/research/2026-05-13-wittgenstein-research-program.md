---
date: 2026-05-13
status: canonical research-program note (decision-oriented, compute-rich)
labels: [research-derived, m1b-image, training, dataset, adapter, eval, research-program, governance]
tracks: [#283, #259, #292]
supersedes-recommendation-in: docs/research/2026-05-13-m1b-prep-research.md
---

# Wittgenstein Research Program — Three-Track Plan

> **Canonical research direction for Wittgenstein, written 2026-05-13.** This note replaces the hackathon-grade recommendations in [`2026-05-13-m1b-prep-research.md`](2026-05-13-m1b-prep-research.md) after the maintainer reframed the project as **top-tier engineering / research / hacker work with significant GPU compute available.** The literature survey in that earlier note remains valid; this note re-derives the choices.

---

## Why this note exists

Earlier the same day, a maintainer-sweep research pass landed an M1B prep
note. That note operated under hackathon-grade constraints — ONNX-CPU
runtime, no adapter training, ship-floor quality bar — because no
explicit compute budget had been confirmed.

The maintainer then said, paraphrased:

> "We're not doing hackathon work anymore. We have substantial GPU
> compute. Think bigger — larger models, learned middle layers (adapter,
> tokenizer), wherever high compute actually moves the needle. Take this
> seriously as top-tier engineering, top-tier research, and top-tier
> hacker work."

This note is the answer to that reframe.

## Doctrine — what stays, what shifts

### What stays (load-bearing, do not weaken)

- **[ADR-0005](../adrs/0005-decoder-not-generator.md) decoder ≠ generator.** We
  TRAIN decoders, then FREEZE them at ship time. No diffusion sampling on
  the canonical path. Reproducibility is structural, not policy.
- **[ADR-0018](../adrs/0018-hybrid-image-code-and-visual-seed-token.md) Visual Seed Code as primary image research surface.**
- **Manifest spine.** Every run is reproducible from `git SHA + lockfile
  hash + seed + LLM I/O + artifact SHA-256`. **Extends to training:**
  every training run gets a manifest with dataset hash, training step
  count, optimizer state hash, eval-metric snapshot.
- **[ADR-0020](../adrs/0020-code-weights-license-divergence-policy.md) license posture.** Permissive code+weights canonical. Own-trained models
  make this *easier* to satisfy — we own the weights end-to-end.
- **Codec Protocol v2 modality boundaries.** One codec per modality, one
  shipping path per modality.
- **No second image path.** Even with rich research surface, only ONE
  configuration becomes canonical at ship time. The research surface
  produces ablation data; canonical = chosen winner.
- **No silent fallbacks.** Errors surface as typed receipts.

### What shifts under compute-rich framing

| Was (hackathon floor) | Is (canonical) |
| --- | --- |
| ONNX-CPU runtime preferred → cheapest tokenizer | GPU-rich → **best-quality** or **own-trained** |
| Adapter deterministic (PixelShuffle replicate), zero training | Adapter is **the highest-leverage research surface** — must be learned (MaskGIT-style or multi-scale) |
| Eval FID-30K deferred / 5K subsampled | Full 30K + CLIP + human eval, as CI gates |
| "Hackathon-grade good enough" ship bar | SOTA-adjacent ship bar |
| Skip Open-MAGVIT2 due to bit-factorization engineering cost | Adopt OR train-our-own at the quality frontier |
| Frozen GPT-5 emits Visual Seed Code via prompt engineering | **Train native LLM head** distilled from teacher — otherwise the thesis isn't actually tested |
| Determinism: byte-parity per platform | Determinism: **`structural-parity`** is canonical (per M2 audio precedent + [#374](https://github.com/p-to-q/wittgenstein/issues/374)) |

The byte-parity downgrade is worth one sentence: trained models running
on GPU produce platform-dependent floating-point outputs. We adopt the
[ADR-0015](../adrs/0015-audio-decoder-family.md) precedent — `structural-parity` (same image-code receipt, same
PNG dimensions, same dominant palette, pixel-level epsilon allowed) — for
all learned-model code paths. Byte-parity is preserved for any path that
doesn't run a learned model (sensor, svg-local, asciipng).

---

## Three-track project framing

Wittgenstein simultaneously is — and should optimize for being — three
things. Each has its own program.

### Track 1: Top-tier engineering project

What it means: production-shaped harness, reproducible receipts,
contract-locked codec protocol, CI-backed quality gates, multi-modality
coverage. Wittgenstein largely IS this today.

What we invest in next:

- **Distributed training infrastructure.** FSDP (PyTorch 2.x) for
  multi-GPU adapter / tokenizer / LLM-head training. Skeleton lives
  under `research/training/` (new). The harness itself stays inference-
  shaped; training is a separate scaffold that emits Wittgenstein-shaped
  manifests on each checkpoint.
- **Experiment tracking integrated with the manifest spine.** Use
  `aim` (open-source, self-hostable, Apache-2.0) as the primary tracker;
  W&B as the secondary if a contributor prefers. Each training run's
  `manifest.json` carries an `experiment.uri` field pointing at the
  tracker entry.
- **Data versioning.** DVC for ImageNet / CC12M / COCO eval sets;
  dataset SHA-256 + URL + revision pinned in every training manifest.
- **GPU CI lane.** Initially a manual sweep harness (`bench/gpu/`) that
  a maintainer runs nightly on a Lambda Labs / RunPod instance; later
  promoted to a managed CI runner if budget supports.
- **Public model hub.** HuggingFace org for trained weights, with the
  Wittgenstein training manifest committed alongside each release.
- **Reproducible release pipeline.** A `wittgenstein release-trained`
  CLI flow that ties manifest → checkpoint → HF push → tag bump.

### Track 2: Top-tier research project

What it means: Visual Seed Code as a new primitive in the multimodal
generation literature; learned adapters as the research surface;
published papers / open benchmarks / open weights.

What we invest in next:

- **Train our own VQGAN-class tokenizer** on ImageNet + CC12M, targeting
  rFID < 2.0. Higher embedding dim than LlamaGen's 8 (we want richer
  per-site latents because our adapter is *learned* and can use them).
- **Train a learned MaskGIT-style L4 adapter** as the canonical seed
  expander. ~10-50M params, bidirectional transformer.
- **Train a native image-emitting LLM head** distilled from a teacher
  (LlamaGen-3B). This is the load-bearing research bet — see Phase 1.
- **Full eval matrix.** Ablations across seed length × adapter depth ×
  tokenizer dim × decoder family. Published as a benchmark table.
- **Publication target.** At least one tech report describing the
  Visual Seed Code framing; an arxiv preprint when Phase 1 results
  are ready; a workshop paper as the eventual academic stake.

### Track 3: Top-tier hacker project

What it means: Visual Seed Code becomes a NEW PROGRAMMING LANGUAGE for
multimodal AI. Hackable, composable, distillable, *human-authorable*.

What we bet on:

- **VSC as human-authorable.** Tooling that lets a human read / write /
  edit / compose VSC by hand. This is the reverse direction of normal
  AI tooling and the strongest signal that VSC is "a language" rather
  than "an opaque internal representation."
- **VSC distillation from any teacher.** Given an arbitrary image
  generator (LlamaGen, SDXL, Flux, future Veo), extract the
  corresponding VSC for any image. If VSC is a universal multimodal
  interlingua, distillation should converge across teachers; if it
  doesn't, that's also a meaningful result.
- **Cross-modal VSC.** Image VSC + audio VSC + sensor VSC composable in
  one prompt. Wittgenstein's existing modality structure makes this
  doable; the bet is that "one VSC, many modalities" is a usable
  primitive, not a leaky abstraction.
- **Open primitive.** Anyone can build tools on top of VSC. The way
  `llama.cpp` / `ggml` became platforms others build on, VSC should
  become the kind of primitive other people PICK UP because it makes
  their tooling easier — not because Wittgenstein markets it.

---

## Phase 1 — M1B with own-trained models (1–3 months)

Concrete Phase 1 deliverables. All assume the confirmed GPU compute.

### 1.1 Train Wittgenstein-native VQGAN-class tokenizer

| Field | Choice |
| --- | --- |
| Architecture | VQGAN-class (Conv enc / vector quantize / Conv dec); codebook K=16384 with embedding dim D=32, downsample factor p=16 (16×16 token grid for 256×256). Optionally D=64 ablation for adapter-richer latents. |
| Data | ImageNet train (1.28M) + CC12M filtered (~6–9M usable URLs at 2026 dead-link rate) + COCO train. Hash-pinned via DVC. |
| Losses | L2 + LPIPS + PatchGAN adversarial (after 20k iters) + commitment β=0.25, mirroring LlamaGen's recipe. |
| Optimizer | AdamW, β1=0.9 β2=0.95 wd=0.05 lr=1e-4, batch 128 → effective 1024 via 8 GPUs. |
| Compute budget | ~1–2 GPU-weeks on 8× A100 (LlamaGen's recipe scaled to our codebook size). |
| Target | rFID ≤ 2.0 on ImageNet val 50k (matching Open-MAGVIT2's rFID 1.17 to LlamaGen's rFID 2.19 corridor). |
| Output | Wittgenstein-native tokenizer checkpoint + training script + weights published to HuggingFace (Apache-2.0). |

**Why not just consume LlamaGen's checkpoint?** Three reasons: (a) we
own the weight-license story (ADR-0020 clean by construction); (b) we
control codebook size + embedding dim to MATCH the adapter's needs
(LlamaGen's D=8 is intentionally low because their AR head carries
semantic load — but our adapter is BERT-shaped and benefits from richer
per-site latents); (c) training our own forces us to build the training
infrastructure (Track 1) which downstream training depends on anyway.

### 1.2 Train learned MaskGIT-style L4 adapter

| Field | Choice |
| --- | --- |
| Architecture | Bidirectional transformer (BERT-shaped), 12 layers, hidden 512, 8 heads (~50M params). Token-level cross-entropy over the 16384-codebook. |
| Training pairs | (Visual Seed Code, full token grid). Bootstrap: VSC = full grid block-averaged to k×k coarse tokens (k ∈ {2, 4, 8} ablated); target = full grid. |
| Inference schedule | 8-step parallel decoding (MaskGIT schedule), temperature 0 (deterministic) at ship time. Stochastic schedule available for sampling but not on the canonical path. |
| Data | Token pairs extracted from ImageNet train + CC12M via the tokenizer (1.1). |
| Compute budget | ~1–3 GPU-weeks on 4× A100. |
| Output | Adapter checkpoint + recipe. |

**Why MaskGIT and not deterministic replicate?** The Phase 0 floor uses
deterministic replicate because no compute. With compute, the question
becomes: is there a meaningful *learned* translation between
LLM-emitted abstract Visual Seed Code and decoder-native latent codes?
Deterministic replicate is the null hypothesis (the VSC == coarse
tokens, no semantic translation needed). The learned adapter is the
test. If the adapter doesn't beat deterministic on Rung-2 LPIPS, we've
learned something important about the limits of the framing.

### 1.3 Distill native image-emitting LLM head

**This is the load-bearing bet.**

| Field | Choice |
| --- | --- |
| Architecture | Small AR transformer (250M–1B params). Llama-shaped (RMSNorm, RoPE, SwiGLU) for compatibility. |
| Distill from | LlamaGen-3B (Apache-2.0) text-conditional checkpoint. |
| Training data | LAION-COCO subset (per LlamaGen's t2i recipe) + CC12M, ~50M pairs. |
| Distillation target | Student emits Visual Seed Code (compact); teacher emits full token grid. Joint loss: KL on student's VSC distribution vs teacher's coarse-grid distribution + reconstruction loss through adapter+decoder. |
| Compute budget | ~4–8 GPU-weeks on 8× A100. |
| Output | Wittgenstein-native image-emitting LLM head + recipe. |

**Why this is load-bearing.** Wittgenstein's central wager:

> "How much multimodal capability can we recover, structure, and
> operationalize from text-first models if we move intelligence into
> the harness, the codec boundary, and the decoder-facing code layer?"

If we test this wager only by prompting GPT-5 / Claude / Gemini to emit
Visual Seed Code, **we're testing prompt engineering, not the thesis.**
The thesis demands a model trained for the interface. A 250M–1B-param
head distilled from a teacher is the minimum viable test: small enough
to be honest about parameter count, large enough to express VSC well.

### 1.4 Eval program (Phase 1)

| Rung | Metric set | Eval set |
| --- | --- | --- |
| 1: Reconstruction (tokenizer round-trip) | PSNR / SSIM / LPIPS / rFID | ImageNet val 50k, 256×256 center-crop |
| 2: Adapter round-trip | PSNR / SSIM / LPIPS / rFID, swept over seed length S ∈ {16, 64, 256} | Same |
| 3: End-to-end generative | FID-30K / CLIP-score (ViT-L/14) / human eval (200 paired vs LlamaGen-3B teacher) | COCO val captions → 30k generations |

**Ablation matrix to publish:**

| Axis | Levels |
| --- | --- |
| Seed length S | 16, 64, 256 (full) |
| Adapter depth | 6, 12 layers |
| Tokenizer embed dim | 8, 16, 32 |
| LLM head size | 250M, 1B |

That's 3 × 2 × 3 × 2 = 36 configurations. With overlap and pruning,
realistically 12–16 distinct training runs. Tractable in 2–3 months of
GPU time.

Every eval run writes a Wittgenstein manifest carrying:
- The training run's checkpoint hash
- The eval set's DVC hash
- The metric values (PSNR / SSIM / LPIPS / rFID / FID-30K / CLIP /
  human-score)
- The experiment URI (aim / W&B link)

---

## Phase 2 — Visual Seed Code as primary research surface (3–6 months)

After Phase 1 ships with own-trained models and an ablation-validated
canonical configuration:

- **Multi-scale tokenizer.** Train a VAR-style multi-scale VQVAE
  ([arXiv 2404.02905](https://arxiv.org/abs/2404.02905), NeurIPS 2024
  Best Paper). The multi-scale tokenizer is the natural mathematical
  realization of "Visual Seed Code as coarse-scale tokens" — the
  adapter literally unfolds scale-by-scale. Compare against Phase 1's
  single-scale tokenizer on the same eval matrix.
- **Co-train LLM head + adapter.** Phase 1 trains them separately
  (distill the head, then train the adapter); Phase 2 trains them
  jointly with the seed code as a learned bottleneck. Tests whether
  the seed code's information density is bounded by the bottleneck
  optimization or by the data.
- **Distillation across teachers.** Extract VSC from LlamaGen + SDXL +
  Flux on the same image. Compare VSC representations. Is there
  convergence (universal interlingua) or divergence (each model has
  its own VSC dialect)?
- **Hand-authored VSC.** UX experiments: can a human write VSC by hand
  that produces meaningful images? What does an "alphabet" of
  human-authorable VSC components look like?
- **Output.** Visual Seed Code paper (arxiv), open benchmark table,
  authoring CLI + web tool, public corpus of (image, VSC) pairs.

## Phase 3 — Cross-modality (6–12 months)

Extend the VSC framing across modalities:

- **Audio VSC.** Spectrogram seed codes; pair with our existing
  procedural / Kokoro audio routes. Decoder-side: replace one of the
  procedural runtimes with a learned VSC → mel-spectrogram → audio
  pipeline.
- **Sensor VSC.** Signal seed codes for the existing
  ECG/temperature/gyro routes; pair with the operator-program
  framing in [`docs/research/2026-05-08-sensor-algorithmic-research.md`](2026-05-08-sensor-algorithmic-research.md).
- **Video VSC.** Per-frame seeds with cross-frame coherence; pair
  with the HyperFrames-shaped renderer (M4 work, #282).

Train cross-modal adapters: a single VSC → audio decoder, VSC → sensor
decoder, VSC → video decoder. Test whether the *same* LLM head can emit
each modality's VSC via task conditioning.

Output: unified multimodal VSC spec; one paper per modality OR one
unified multimodal paper.

## Phase 4 — VSC as a programming language

The hacker bet, fully realized:

- VSC becomes the SHIPPING FORMAT for AI artifacts. Replaces "prompt"
  as the human-AI multimodal interface in tools that adopt it.
- Editor support, syntax highlighting, compositional primitives, an
  ecosystem.
- A small but real community of people who *write VSC by hand* for
  specific use cases the way some people write x86 assembly.

This is aspirational and not contractually committed; included for
direction-setting.

---

## What this implies for the queue right now

### Phase 1 trackers (file as new issues this PR)

1. **Train own VQGAN-class tokenizer on ImageNet + CC12M.** (size/xl,
   priority/p1, milestone/m1b-training)
2. **Train learned MaskGIT-style L4 adapter.** (size/l, priority/p1,
   milestone/m1b-training)
3. **Distill native image-emitting LLM head from LlamaGen-3B teacher.**
   (size/xl, priority/p1, milestone/m1b-training)
4. **Set up `aim` (open-source) experiment tracking + integrate with
   manifest spine.** (size/m, priority/p1, milestone/m1b-training)
5. **Set up DVC data versioning + GPU CI sweep harness.** (size/m,
   priority/p1, milestone/m1b-training)

### Existing follow-ups (reframe in-place)

- [#392](https://github.com/p-to-q/wittgenstein/issues/392) (ONNX-CPU
  latency) → reframed as "ONNX-CPU is the optional inference target
  for embedded deploy, not the canonical runtime. Measurement still
  useful for that lane."
- [#393](https://github.com/p-to-q/wittgenstein/issues/393)
  (deterministic adapter sweep) → reframed as "baseline row in the
  Phase 1 ablation table, not the ship configuration."
- [#394](https://github.com/p-to-q/wittgenstein/issues/394) (quality
  ladder eval harness) → upgraded scope: this is now CI infrastructure,
  not a one-off eval.

### Doctrine changes that may need their own ADR slots

- **`structural-parity` as canonical determinism for learned-model
  paths.** Already implied by ADR-0015 (audio) and #374 (image), but
  worth lifting to a cross-modality doctrine ADR now that learned models
  are the canonical path for image too.
- **Training manifest schema.** The current `RunManifestSchema` is
  inference-shaped. Training runs need a sibling schema with
  `dataset.sha256`, `optimizer.state_hash`, `train.step`, `eval.metric_snapshot`.
  This wants an RFC.
- **The `experiment.uri` field on manifests.** Tying every receipt to a
  remote tracker entry. Small ADR.

---

## Headline decisions (canonical, supersedes the Phase 0 floor)

1. **Tokenizer:** Train our own VQGAN-class on ImageNet+CC12M.
   Open-MAGVIT2 as immediate alternative if we want to ship before
   training finishes.
2. **Adapter:** Learned MaskGIT-style bidirectional transformer.
   Deterministic schedule at ship time, stochastic available for
   research.
3. **LLM head:** Train native from LlamaGen-3B distillation. This is
   what actually tests the project's central thesis.
4. **Eval:** Full ImageNet val 50k (Rungs 1+2) + COCO FID-30K + CLIP +
   human eval (Rung 3). All ablations published.
5. **Infra:** `aim` for tracking, DVC for data, FSDP for training,
   HuggingFace for releases.
6. **Determinism:** `structural-parity` canonical for learned paths.
7. **Architectural option for Phase 2:** VAR multi-scale tokenizer.

## Refs

- Phase 0 floor note (literature survey survives): [`2026-05-13-m1b-prep-research.md`](2026-05-13-m1b-prep-research.md)
- Doctrine: [ADR-0005](../adrs/0005-decoder-not-generator.md),
  [ADR-0018](../adrs/0018-hybrid-image-code-and-visual-seed-token.md),
  [ADR-0015](../adrs/0015-audio-decoder-family.md),
  [ADR-0020](../adrs/0020-code-weights-license-divergence-policy.md)
- Bridge contract: [`packages/codec-image/src/decoders/types.ts`](../../packages/codec-image/src/decoders/types.ts)
- Existing umbrellas: [#283](https://github.com/p-to-q/wittgenstein/issues/283) (M1B), [#259](https://github.com/p-to-q/wittgenstein/issues/259) (VSC slices), [#292](https://github.com/p-to-q/wittgenstein/issues/292) (v0.3 trust closeout)
- Cross-platform parity precedent: [#374](https://github.com/p-to-q/wittgenstein/issues/374) (image PNG bytes)
- Verification spine: [`2026-05-13-verification-ladder.md`](2026-05-13-verification-ladder.md), [#384](https://github.com/p-to-q/wittgenstein/issues/384) (replay)

## Open questions for the maintainer

These are choices I'd defer to a maintainer call rather than make
unilaterally. None block this PR; they get answered as the Phase 1
trackers move forward.

1. **`aim` vs W&B vs MLFlow?** I picked `aim` (open-source, self-hostable, Apache-2.0). W&B is the most common; MLFlow is the most enterprise. Reasonable to swap if you have a preference.
2. **HuggingFace org name for releases?** Need a stable org for the published weights. `wittgenstein-harness`?
3. **Train tokenizer at 256×256 only, or also 384×384?** LlamaGen got rFID 0.94 at 384 but it's 2.25× the compute.
4. **LLM head distill target: LlamaGen-3B or smaller?** 3B is the largest available open Apache-2.0 image AR. Smaller teachers exist but their quality bar is lower.
5. **Publication venue/timing for the Phase 2 paper.** ICLR, NeurIPS, CVPR, or workshop? Affects the polish budget.
