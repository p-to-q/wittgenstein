---
date: 2026-05-13
status: research note (decision-oriented) — Phase 0 floor; superseded by Phase 1+ research program
labels: [research-derived, m1b-image, training, dataset, adapter, eval]
tracks: [#283, #259, #334, #335]
feeds-into: M1B implementation slices
superseded-by: docs/research/2026-05-13-wittgenstein-research-program.md
---

# M1B Prep Research: Tokenizer, Dataset, Adapter, Eval (Phase 0 floor)

> **🔁 Status update (2026-05-13, same day):** This note was drafted under
> hackathon-grade constraints (ONNX-CPU runtime, no training compute,
> ship-floor quality bar). **Those constraints were lifted later the same
> day** when the maintainer confirmed GPU-rich compute and reframed the
> project as top-tier engineering / research / hacker work.
>
> The canonical research direction is now
> [`docs/research/2026-05-13-wittgenstein-research-program.md`](2026-05-13-wittgenstein-research-program.md),
> which supersedes the recommendations below.
>
> This note STAYS in the tree because (a) the **Phase 0 floor** it
> recommends is still the right shipping path if compute or budget
> evaporates, and (b) the literature survey (§1–§5) remains accurate
> regardless of compute posture. Read this note for the landscape; read
> the research-program note for the chosen path.

> **Status (original):** decision-oriented research note. Surveys the empirical landscape ahead of M1B wiring so the implementation slice is a contract-fill, not a design-from-scratch. Pairs with the locked bridge contract in [`packages/codec-image/src/decoders/types.ts`](../../packages/codec-image/src/decoders/types.ts).
> _Tracker: [#283](https://github.com/p-to-q/wittgenstein/issues/283); per-candidate audits [#329–#333](https://github.com/p-to-q/wittgenstein/issues/329); Gates C/D [#334](https://github.com/p-to-q/wittgenstein/issues/334) + [#335](https://github.com/p-to-q/wittgenstein/issues/335)._

**Scope:** Targeted prep for landing M1B (image route via frozen VQ decoder bridge) in Wittgenstein. Architecture under evaluation: LLM emits Visual Seed Code (short discrete sequence) → L4 adapter expands seed to tokenizer latent grid → frozen VQ decoder produces pixels. **Original constraints (Phase 0 floor):** Node.js / ONNX-CPU runtime, permissive code+weights, deterministic per-platform, hackathon-grade. **Reframed Phase 1+ constraints:** see the [research-program note](2026-05-13-wittgenstein-research-program.md).

---

## 1. Tokenizer landscape (beyond LlamaGen)

Numbers below are reconstruction FID (rFID) on ImageNet-1k 256×256 unless noted. Lower is better. All listed candidates have permissively licensed code; weight licenses are flagged separately.

### LlamaGen VQ ([FoundationVision/LlamaGen](https://github.com/FoundationVision/LlamaGen), [arXiv 2406.06525](https://arxiv.org/abs/2406.06525))

- **Tokenizer:** VQGAN-class, codebook K=16384, embedding dim C=8, downsample p=16 (so 256×256 → 16×16 = 256 tokens) or p=8 (32×32 = 1024 tokens). 72M / 70M params.
- **Quality:** rFID = 2.19 at 256×256 (p=16), PSNR 20.79, SSIM 0.675, **codebook usage 97.0%**. Higher-res 384×384 training reports rFID 0.94.
- **Wins:** Apache-2.0 code + checkpoints, small tokenizer (72M, ConvNet enc/dec — cheap on CPU), training recipe public, codebook is a single index lookup (clean for ONNX export).
- **Loses:** Embedding dim 8 means latents are very low-rank per spatial site — the AR head carries semantic load. rFID 2.19 is not SOTA in 2026.
- **Checkpoints:** `vq_ds16_c2i.pt` (ImageNet), `vq_ds8_c2i.pt`, `vq_ds16_t2i.pt` (LAION-COCO + internal) on [huggingface.co/FoundationVision/LlamaGen](https://huggingface.co/FoundationVision/LlamaGen) and [huggingface.co/peizesun/llamagen_t2i](https://huggingface.co/peizesun/llamagen_t2i).

### Open-MAGVIT2 ([arXiv 2409.04410](https://arxiv.org/abs/2409.04410), [TencentARC/Open-MAGVIT2](https://github.com/TencentARC/Open-MAGVIT2))

- **Tokenizer:** Lookup-Free Quantization (LFQ), codebook 2^18 = 262144 codes via factorized bit decomposition. Achieves **rFID 1.17 on ImageNet 256×256** (zero-shot 1.93 at original resolution).
- **Wins:** SOTA-class reconstruction among open weights; explicitly designed to be reproducible.
- **Loses:** Codebook is bit-factorized (asymmetric token factorization + next-sub-token-prediction). The token grid is NOT a simple integer index per site — any adapter has to either model the sub-token correlations or operate in bit space. Weights are Apache-2.0 but the bit-decomposition scheme adds engineering surface for an ONNX-CPU port.

### TiTok ([arXiv 2406.07550](https://arxiv.org/abs/2406.07550), [bytedance/1d-tokenizer](https://github.com/bytedance/1d-tokenizer))

- **Tokenizer:** 1D tokenizer (not a 2D grid). TiTok-L-32 represents a 256×256 image in **just 32 tokens**; rFID 2.21. TiTok-B-64: rFID 1.70. TiTok-S-128: rFID 1.71. Generation: 1.97 gFID at ImageNet-256.
- **Wins:** Extremely short sequences — the natural fit for "Visual Seed Code" if the seed and the tokenizer share a representation. If Wittgenstein can adopt a 32-token target, the seed expander can vanish entirely (deterministic identity).
- **Loses:** Apache-2.0 license verified for code; weight license needs re-verification. The 1D tokenizer interleaves a ViT-encoder pass, so it is heavier than LlamaGen's conv tokenizer on CPU. Smaller community / fewer reference downstream stacks. RFC-0007 (1D shape discriminator) is the schema-side prerequisite.

### MaskBit ([arXiv 2409.16211](https://arxiv.org/abs/2409.16211), [markweberdev/maskbit](https://github.com/markweberdev/maskbit))

- **Tokenizer:** Modernized VQGAN with Lookup-Free Quantization producing "bit tokens" (binary representation). Implicit codebook 64× smaller than MAGVIT-v2 yet generation reaches gFID 1.65 (12 bits) / 1.52 (best, 256 steps).
- **Wins:** Embedding-free design; the bits ARE the tokens. Generation quality is strong.
- **Loses:** Apache-2.0 code but research-only weights (ADR-0020 classifies this as research-track, not canonical). The embedding-free design means decoder input is bit vectors, not codebook embeddings — we lose the standard "look up an embedding by ID" path.

### FSQ (Finite Scalar Quantization, [arXiv 2309.15505](https://arxiv.org/abs/2309.15505))

- **Tokenizer:** Per-channel scalar quantization with fixed levels; implicit codebook is the Cartesian product of per-dim level sets. Codebook usage is 100% by construction; no collapse, no commitment loss, no codebook re-init.
- **Wins:** Mechanically the simplest quantizer. Per-channel quant → trivial to implement, trivial to export to ONNX, deterministic with no codebook gather op.
- **Loses:** No off-the-shelf large pre-trained image FSQ tokenizer with Apache-2.0 weights at the LlamaGen quality bar. We would have to either train one or wrap an FSQ-quantized VAE. Higher integration cost than just downloading LlamaGen's checkpoint.

### A 6th candidate to surface: **VAR multi-scale VQVAE** ([arXiv 2404.02905](https://arxiv.org/abs/2404.02905), [FoundationVision/VAR](https://github.com/FoundationVision/VAR))

- **Tokenizer:** Multi-scale VQ where the same image is tokenized at successive resolutions (1×1, 2×2, ..., 16×16). The AR model predicts "next scale" rather than "next token". NeurIPS 2024 Best Paper.
- **Why it matters for M1B:** This is the natural mathematical realization of "seed expansion." A short seed = the coarse-scale tokens; the adapter would simply unfold scale-by-scale, exactly mirroring VAR's inference loop. **Strong candidate for the bridge architecture even if we keep LlamaGen as the actual tokenizer.**
- **License:** Code Apache-2.0; weights distributed publicly on the same FoundationVision org.
- **Caveat:** The multi-scale tokenizer is more complex than LlamaGen's single-scale ds16 VQ; checkpoint sizes and the rFID/scale tradeoff need a second-pass evaluation before adopting wholesale.

### Inference latency at 256×256 (CPU, ONNX-class)

Published latency numbers for these tokenizers on CPU are sparse; most papers report GPU-only figures. Practical expectations for ONNX-CPU dequantized models:

- LlamaGen ds16 (~72M conv): ~150–400 ms/image single-thread on a modern x86 core (educated estimate; needs measurement).
- MAGVIT2 / Open-MAGVIT2 decoder: ~2–3× LlamaGen due to wider hidden dims and LFQ unpacking — needs measurement.
- TiTok-L decoder (ViT): potentially heavier due to attention; needs measurement.
- FSQ-only quantizer step: negligible (<1ms); the cost is in the conv encoder/decoder shell, not the quantizer.

**Recommendation:** Stick with **LlamaGen `vq_ds16_c2i.pt`**. Reasons: code+weights Apache-2.0 already cleared; conv-based tokenizer is the cheapest CPU candidate; rFID 2.19 is "hackathon-grade good enough"; the latent is the cleanest possible 16×16 integer grid which makes the adapter math trivial. **Open-MAGVIT2 is the strong upgrade path once M1B is shipped**; **VAR is the M1C architectural option** if learned adapter becomes necessary.

---

## 2. Image dataset landscape (May 2026 status)

| Dataset                               | License (data + redistribution)                                                                                                             | Size                            | Tokenizer eval bench                                         | Adapter training           | End-to-end FT                                | Notes                                                                                                                                                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ------------------------------------------------------------ | -------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ImageNet-1k**                       | Custom non-commercial research license; image URLs from Flickr/etc. with original copyrights. Annotations CC.                               | 1.28M train / 50k val           | **YES (canonical rFID/PSNR/SSIM)**                           | Possible but narrow        | Class-conditional only                       | The single most defensible eval bench. Used by every paper in this note.                                                                                                                                                                                      |
| **LAION-400M / LAION-5B (original)**  | **Withdrawn** Dec 2023 after CSAM finding. Do not use the original.                                                                         | n/a                             | No                                                           | No                         | No                                           | Original 400M/5B are gone.                                                                                                                                                                                                                                    |
| **Re-LAION-5B** (Aug 2024 re-release) | URL list under Apache-2.0; image content under each source site's license. CSAM hashes removed. Two flavors: research, research-safe.       | ~5B URLs                        | Possible                                                     | Possible                   | Yes (text-conditional)                       | URL-only dataset, you still scrape. Many URLs dead-link by 2026. **Recommend NOT M1B** unless an img2dataset pipeline already exists.                                                                                                                         |
| **CC12M (Conceptual 12M)**            | Google's dataset under permissive "free for any purpose" license; URL+caption list distributed; images still hosted by original publishers. | ~12M                            | Useful (diverse stress)                                      | Adequate for small adapter | Adequate for small text-conditional FT       | Still hosted on [google-research-datasets/conceptual-12m](https://github.com/google-research-datasets/conceptual-12m) and [pixparse/cc12m-wds](https://huggingface.co/datasets/pixparse/cc12m-wds). URL rot exists but a sizable fraction still downloadable. |
| **OpenImages V7**                     | Annotations CC BY 4.0; images CC BY 2.0 per source (verify per-image). Full download ~561 GB.                                               | ~9M train / 41k val / 125k test | Useful for "in-the-wild" eval split                          | Suitable                   | Suitable for class- or detection-conditional | Hosted on Google Cloud Storage; reliable. Heavier than needed for M1B.                                                                                                                                                                                        |
| **DataComp-1B**                       | URL list CC-BY-4.0; images under their copyrights.                                                                                          | ~1.4B URLs (8.86 TB realized)   | Overkill                                                     | Overkill                   | Overkill                                     | Far past hackathon budget.                                                                                                                                                                                                                                    |
| **COCO 2017**                         | Annotations CC BY 4.0; images under per-image Flickr terms (most non-commercial; full commercial use NOT guaranteed).                       | ~118k train / 5k val            | **YES (MS-COCO FID-30K is the standard text-to-image eval)** | Small                      | Yes for prompt-style FT                      | Standard text-to-image eval bench. License is acceptable for research/eval but commercial redistribution of images is restricted.                                                                                                                             |
| **Flickr30K**                         | Images from Flickr under their per-image licenses (non-commercial in practice); annotations academic-use.                                   | ~31k images / 158k captions     | OK for small text-eval                                       | OK                         | OK                                           | Smaller cousin of COCO captions; same Flickr license caveats.                                                                                                                                                                                                 |
| **FFHQ**                              | Dataset wrapper CC BY-NC-SA 4.0 (NVIDIA), images CC BY / CC0 / public-domain per-image. **Non-commercial only**.                            | 70k images 1024×1024            | OK (face-only stress)                                        | OK if face-only            | OK if face-only                              | Useful as a "high-quality narrow distribution" sanity bench but license blocks commercial.                                                                                                                                                                    |
| **ShareGPT4V**                        | CC BY-NC 4.0; research only.                                                                                                                | 1.2M image-caption pairs        | Limited                                                      | Caption-quality FT only    | LLaVA-style only                             | Mostly LLM-caption-quality dataset, not a tokenizer benchmark. Non-commercial.                                                                                                                                                                                |

**Eval-bench recommendation:** **ImageNet-1k validation (50k images)** for reconstruction metrics (rFID, PSNR, SSIM, LPIPS) and **MS-COCO 2017 val (5k images, 25k captions)** for FID-30K / CLIP-score generation evaluation. Both are de-facto standards and exactly match LlamaGen's published numbers, which keeps our results comparable to the paper.

**Adapter-training recommendation:** If the L4 adapter ends up learned, train on **CC12M filtered to ImageNet aspect ratios** plus the ImageNet train split. License is friendly and the volume is comfortable for a small bridge network. **Do NOT touch Re-LAION-5B for M1B** — URL scraping and dead links blow the hackathon budget.

---

## 3. LlamaGen training recipe deep-dive

Source: [arXiv 2406.06525](https://arxiv.org/abs/2406.06525) and [FoundationVision/LlamaGen](https://github.com/FoundationVision/LlamaGen).

### Tokenizer training

- **Architecture:** VQGAN encoder-quantizer-decoder. Codebook K=16384, embedding dim C=8 (intentionally low — L2-normalized lookups). Downsample factor p=16 → 16×16 token grid for 256×256 input.
- **Data:** ImageNet-1k train split, 256×256 resolution (also a 384×384 high-res run for rFID 0.94).
- **Optimizer:** AdamW, β₁=0.9, β₂=0.95, weight decay=0.05, constant LR 1e-4.
- **Batch size:** 128.
- **Epochs:** 40.
- **Losses:** L2 reconstruction + LPIPS perceptual + PatchGAN adversarial (turned on after 20k iterations) + commitment loss with β=0.25. λ_G = 0.5.
- **Hardware:** 80GB A100 GPUs (count unspecified but the recipe is small enough to fit a few A100s).

### Class-conditional AR head (c2i)

- **Data:** ImageNet, 256×256 or 384×384.
- **Optimizer:** AdamW (same betas, wd), LR scaled at 1e-4 per 256 batch size.
- **Regularization:** Dropout 0.1 on embeddings and attention; 10-crop augmentation with random selection per step.
- **Distributed:** DDP / PyTorch FSDP on A100-80GB.
- **Epochs:** ~300 (visible images by epoch 10 per author comments).
- **Best result:** LlamaGen-3B reaches FID 2.18 at 256×256.

### Text-conditional (t2i)

- Two-stage: Stage I on **50M LAION-COCO subset** at 256×256, Stage II on a 10M internal aesthetics-filtered set at 512×512.
- Text encoder: FLAN-T5 XL, max 120 text tokens.
- LR 1e-4 per 256 batch size, same optimizer.

### Checkpoint hosting and updates

- **Tokenizer + class-conditional:** [huggingface.co/FoundationVision/LlamaGen](https://huggingface.co/FoundationVision/LlamaGen) (`vq_ds16_c2i.pt`, `vq_ds8_c2i.pt`, `c2i_B_256.pt`, `c2i_L_256.pt`, `c2i_XL_384L.pt`, `c2i_XXL_384.pt`, `c2i_3B_384.pt`).
- **Text-conditional:** [huggingface.co/peizesun/llamagen_t2i](https://huggingface.co/peizesun/llamagen_t2i).
- **Last release activity:** 2024-06-28 (t2i drop) and 2024-06-15 (vLLM support). Repo has been quiet since; no breaking checkpoint format changes were observed as of 2026-05-13, but re-validate before pinning weights because there is also no upstream maintenance to free-ride on.

### Inference cost (reported)

- vLLM-integrated AR inference yields 326–414% speedup vs the naive PyTorch baseline.
- **Tokenizer-only forward** is conv-net, cheap; no specific CPU/ONNX latency published. **This is the empirical gap to close before M1B ships** (see Open Questions).

---

## 4. Adapter / Seed-Expander training approaches

The L4 adapter sits between the LLM's Visual Seed Code (short discrete sequence, length S << 256) and the tokenizer latent grid (16×16=256 sites). Four families surveyed.

### (A) Deterministic positional unfolding

Treat the seed code as the coarse-scale tokens. Tile / repeat / interleave deterministically to fill the 16×16 grid, then feed straight into the decoder. **No training.** The Visual Seed Code IS the latent grid at low resolution; the adapter is a fixed upsampling op (nearest-neighbor or learned-fixed PixelShuffle weights).

- Closest published instantiation: **VAR** ([arXiv 2404.02905](https://arxiv.org/abs/2404.02905)) — the multi-scale VQVAE tokenizer is literally a learned deterministic-unfolding stack. Won NeurIPS 2024 Best Paper.
- **Pros:** zero training compute; deterministic by construction; trivially exports to ONNX; the LLM "owns" the entire image semantics. Hackathon-perfect.
- **Cons:** image quality is bounded by what 16 or 64 coarse tokens can encode through a nearest-upsampled latent. If the seed is too short the decoder will produce blocky/low-frequency outputs.

### (B) MaskGIT-style iterative unmasking

([arXiv 2202.04200](https://arxiv.org/abs/2202.04200)) Adapter is a small bidirectional transformer that fills in the masked tokens conditioned on the seed. Iterative parallel decoding (typically 8–16 steps) over the 256-token grid.

- **Pros:** empirically strong — this is the spine of Muse ([arXiv 2301.00704](https://arxiv.org/abs/2301.00704), FID 7.88 on COCO zero-shot at 3B params). Bounded inference cost.
- **Cons:** requires training a small transformer adapter on (seed, full-token-grid) pairs. Stochastic decoding works against the determinism constraint unless we fix the schedule and sampling temperature = 0.

### (C) LlamaGen-style AR head

A small causal transformer fills the 256 tokens left-to-right conditioned on the seed.

- **Pros:** direct match to LlamaGen's published recipe; reuses code.
- **Cons:** 256 sequential decode steps per image is expensive on CPU; less compatible with "small bridge network" framing. The whole point of having a separate seed is to AVOID making the LLM emit 256 tokens.

### (D) Diffusion bridge (VQ-Diffusion / discrete diffusion)

([arXiv 2111.14822](https://arxiv.org/abs/2111.14822), [arXiv 2202.04895](https://arxiv.org/abs/2202.04895)) Diffusion in discrete token space, conditioned on seed.

- **Pros:** high quality at large generation budgets.
- **Cons:** 50–100+ denoising steps; non-deterministic without aggressive schedule fixing; mismatched with the ONNX-CPU/hackathon target.

### Recommendation: **start deterministic (A), keep MaskGIT (B) as the upgrade**

For M1B's first cut:

1. Define the Visual Seed Code as the LlamaGen 16×16 token grid downsampled by k=2 (so 8×8=64 seed tokens) or k=4 (4×4=16 seed tokens).
2. The L4 adapter is a fixed PixelShuffle-style replicate to 16×16 (no learnable weights). The decoder smooths spatial discontinuities.
3. Measure rFID, PSNR, LPIPS against the ground-truth-tokenized latent. If quality is unacceptable at k=4, fall back to k=2; if still unacceptable, promote to MaskGIT-style fill-in (path B).
4. The learned MaskGIT adapter, when needed, trains on (seed, full-grid) pairs extracted from ImageNet via the LlamaGen tokenizer. Training set is finite (1.28M ImageNet images → 1.28M (seed, grid) pairs), bridge net is small (e.g., 6-layer transformer, 256-dim), and training is estimated to fit on a single GPU-day pending measurement in the adapter sweep.

The "start deterministic" call is load-bearing because (i) it ships M1B with zero training; (ii) it makes the per-platform determinism trivial (no sampling); (iii) it produces a hard empirical baseline against which any learned adapter must justify itself.

---

## 5. Quality metric ladder for shipping M1B

Three rungs, each with a clear definition of "ship-ready" and the compute cost.

### Rung 1: Reconstruction fidelity (tokenizer round-trip alone)

Image → encode → quantize → decode → image. Measures how much information the frozen decoder discards.

- **Metrics:** PSNR, SSIM, LPIPS (AlexNet backbone), rFID.
- **Eval set:** ImageNet-1k val, 50k images, 256×256 center-cropped.
- **Targets to ship:** PSNR ≥ 20, SSIM ≥ 0.65, LPIPS ≤ 0.20, rFID ≤ 3.0. These match LlamaGen's published baseline (PSNR 20.79 / SSIM 0.675 / rFID 2.19).
- **Compute:** rFID requires Inception-V3 features on 50k real + 50k recon. About 5–15 minutes single-A10G; an order of magnitude longer on CPU. Budget a couple of hours per eval run on CPU, single hour on a small GPU.

### Rung 2: Seed-expanded reconstruction (adapter round-trip)

Image → encode → downsample to seed → L4 adapter → decoder → image. Measures the seed expander's information loss on top of the tokenizer's.

- **Metrics:** Same four as Rung 1.
- **Eval set:** Same ImageNet-1k val 50k. Optional secondary: COCO 2017 val 5k for distribution-shift signal.
- **Targets to ship:** A reasonable bar is "no worse than 2× degradation of Rung 1 LPIPS" — e.g., LPIPS ≤ 0.40, SSIM ≥ 0.55. This is intentionally lenient because the seed is information-bottlenecked by construction.

### Rung 3: Generative quality (end-to-end with the LLM speaking)

LLM emits seed → adapter → decoder → image.

- **Metrics:** FID-30K against MS-COCO val captions (field-standard); CLIP-score (ViT-L/14) for prompt alignment; human eyeball for sanity.
- **Eval set:** 30,000 captions drawn from COCO val captions (the FID-30K convention) producing 30k images.
- **Targets to ship:** Pre-register "ship if FID-30K < 50 AND CLIP-score > 0.22". This is intentionally permissive; M1B is a structural milestone, not a quality milestone.
- **Compute:** 30k generations is the dominant cost. At ~5 sec per image on CPU, 30k images ≈ 42 hours on a single CPU. **Realistic options: (i) ship Rung 3 on a 5k FID-5K subsample, (ii) run on a one-off GPU rental, (iii) defer Rung 3 to M1C and ship M1B on Rungs 1+2 only.**

### Hardware-on-a-budget plan

- Local CPU box: all of Rung 1 and Rung 2 (slow but feasible overnight).
- Single Colab A10G or a low-cost cloud spot: estimated Rung 3 at 30k in approximately under an hour, pending the measured throughput from #394.
- Reference impls: [cleanfid](https://github.com/GaParmar/clean-fid), [lpips pip](https://github.com/richzhang/PerceptualSimilarity), [open_clip](https://github.com/mlfoundations/open_clip).

---

## Open empirical questions (whose answer changes the M1B path)

1. **What is the LlamaGen ds16 tokenizer's actual CPU latency in ONNX?** No published number; must be measured. If decode > 1 second/image single-thread, the "ONNX-CPU preferred" framing needs revisiting.
2. **Does the ONNX export of LlamaGen's tokenizer preserve bit-identical outputs vs PyTorch?** Determinism constraint requires this. Conv + a single argmin gather should be fine but the GAN-trained decoder may have ops (e.g., GroupNorm with rare reductions) that differ across ONNX runtimes.
3. **At what seed length S does deterministic positional unfolding break perceptual quality?** Empirical sweep: S = 4, 16, 64, 256 (= full). Determines whether path (A) ships M1B or we must promote to MaskGIT.
4. **Is the LlamaGen ds16 c2i tokenizer (trained on ImageNet) good enough for non-ImageNet distributions** (COCO, CC12M, drawings)? Zero-shot rFID on COCO val is the test.
5. **Codebook utilization on Wittgenstein's actual emitted seeds.** If the LLM-emitted seed touches only a small subset of the 16384-codebook in practice, we have a free quantization opportunity (collapse to a sub-codebook), reduce embedding-table memory.
6. **Does Open-MAGVIT2 with its 2^18 codebook beat LlamaGen on perceived quality enough to justify the bit-factorization engineering overhead?**
7. **Is the VAR multi-scale tokenizer a better fit than LlamaGen ds16 + deterministic unfolding?** Side-by-side would settle the architecture question for M1C, not just M1B.

---

## Recommended minimum first-cut (Phase 0 floor only)

> **⚠️ Superseded:** this section is the **floor** recommendation that
> applies only if the compute / budget / staffing situation reverts to
> hackathon-grade. The actual chosen direction is in
> [`2026-05-13-wittgenstein-research-program.md`](2026-05-13-wittgenstein-research-program.md) Phase 1:
> own-trained tokenizer + learned MaskGIT-style adapter + native LLM head,
> targeting SOTA-adjacent quality with full eval matrix.

**Phase 0 floor (for archival completeness):** Use the **LlamaGen `vq_ds16_c2i.pt` tokenizer** (Apache-2.0, 72M params, conv enc/dec, codebook K=16384 / dim 8 / downsample 16 → 16×16 token grid). Export the decoder-only path to ONNX-CPU. Define the Visual Seed Code as the 16×16 LlamaGen token grid downsampled by an integer factor (start k=2 → 8×8=64 seed tokens; iterate if quality demands). Implement the **L4 adapter as deterministic PixelShuffle-style replicate** with no learnable weights for the first cut — no adapter training, no extra GPU budget, fully deterministic by construction. Validate on **ImageNet-1k validation 50k for reconstruction (PSNR/SSIM/LPIPS/rFID)** and defer generative FID-30K to a one-off GPU rental or to M1C.

**Why this and not the SOTA path (Phase 0 reasoning):** Open-MAGVIT2 has better rFID and TiTok has shorter sequences but both add engineering surface (bit-factorization, ViT decoder, less-mature ONNX support) at a stage where Wittgenstein's project risk is in the bridge architecture, not in tokenizer fidelity. LlamaGen's tokenizer is unambiguously good enough at rFID ~2 and is the path of least resistance to a green-light M1B. **If** the first-cut quality is insufficient on the ImageNet-val Rung-1 eval, the cheap upgrade is to retrain a slightly-larger LlamaGen tokenizer on ImageNet+CC12M; the more expensive upgrade is the Open-MAGVIT2 swap, deferred to M1C. **If** the adapter quality is insufficient on the Rung-2 eval, the cheap upgrade is to extend k from 4 to 2 (more seed tokens), and the more expensive upgrade is a learned MaskGIT-style fill-in adapter trained on ImageNet (seed, grid) pairs.

> Under the **reframed (compute-rich) constraints**, the answer flips on
> nearly every line: own-trained tokenizer beats LlamaGen consumption;
> learned adapter beats deterministic replicate; full FID-30K beats 5K
> subsample; SOTA-adjacent ship bar beats hackathon-grade. The §1 / §2 /
> §4 / §5 survey content stays useful; the recommendations don't.

---

## Headline decisions (Phase 0 floor)

> Replaced by [research-program §"Phase 1 — M1B with own-trained models"](2026-05-13-wittgenstein-research-program.md). Kept here for archival comparison.

1. **Tokenizer:** LlamaGen `vq_ds16_c2i.pt`. Defer Open-MAGVIT2 swap to M1C.
2. **Adapter:** Deterministic PixelShuffle-replicate, no training. Promote to MaskGIT-style fill-in only if Rung-2 LPIPS/SSIM fails.
3. **Eval bench:** ImageNet-1k val 50k (Rungs 1+2) plus COCO-val for Rung-3 generative scoring (FID-30K subsampled to 5k if budget-constrained).
4. **Adapter training data, if needed later:** CC12M filtered + ImageNet. Avoid Re-LAION-5B for M1B.
5. **Architectural option to surface for M1C:** VAR multi-scale tokenizer is the principled "seed expansion" baseline.

---

## Refs

**Tokenizers and generation backbones:**

- LlamaGen: [arXiv:2406.06525](https://arxiv.org/abs/2406.06525) · [github](https://github.com/FoundationVision/LlamaGen) · [HF weights](https://huggingface.co/FoundationVision/LlamaGen)
- Open-MAGVIT2: [arXiv:2409.04410](https://arxiv.org/abs/2409.04410) · [github](https://github.com/TencentARC/Open-MAGVIT2)
- MAGVIT-v2 (original): [arXiv:2310.05737](https://arxiv.org/abs/2310.05737)
- TiTok: [arXiv:2406.07550](https://arxiv.org/abs/2406.07550) · [bytedance/1d-tokenizer](https://github.com/bytedance/1d-tokenizer)
- MaskBit: [arXiv:2409.16211](https://arxiv.org/abs/2409.16211) · [markweberdev/maskbit](https://github.com/markweberdev/maskbit)
- FSQ: [arXiv:2309.15505](https://arxiv.org/abs/2309.15505)
- VAR (next-scale prediction): [arXiv:2404.02905](https://arxiv.org/abs/2404.02905) · [FoundationVision/VAR](https://github.com/FoundationVision/VAR)

**Adapter / generation paradigms:**

- MaskGIT: [arXiv:2202.04200](https://arxiv.org/abs/2202.04200)
- Muse: [arXiv:2301.00704](https://arxiv.org/abs/2301.00704)
- VQ-Diffusion (text-to-image): [arXiv:2111.14822](https://arxiv.org/abs/2111.14822)
- Diffusion bridges VQ-VAE: [arXiv:2202.04895](https://arxiv.org/abs/2202.04895)

**Datasets:**

- ImageNet (ILSVRC): [image-net.org](https://www.image-net.org/)
- Re-LAION-5B: [blog](https://laion.ai/blog/relaion-5b/)
- CC12M: [arXiv:2102.08981](https://arxiv.org/abs/2102.08981) · [github](https://github.com/google-research-datasets/conceptual-12m) · [pixparse/cc12m-wds](https://huggingface.co/datasets/pixparse/cc12m-wds)
- DataComp-1B: [arXiv:2304.14108](https://arxiv.org/abs/2304.14108) · [HF](https://huggingface.co/datasets/mlfoundations/datacomp_1b)
- COCO 2017: [cocodataset.org](https://cocodataset.org/) · [HF mirror](https://huggingface.co/datasets/rafaelpadilla/coco2017)
- Flickr30K: [hosted](https://shannon.cs.illinois.edu/DenotationGraph/)
- OpenImages V7: [Google CS](https://storage.googleapis.com/openimages/web/factsfigures_v7.html)
- FFHQ: [github](https://github.com/NVlabs/ffhq-dataset)
- ShareGPT4V: [arXiv:2311.12793](https://arxiv.org/abs/2311.12793)

**Evaluation infrastructure:**

- Rethinking FID (CMMD): [arXiv:2401.09603](https://arxiv.org/abs/2401.09603)
- LPIPS: [reference impl](https://github.com/richzhang/PerceptualSimilarity)
- cleanfid: [github](https://github.com/GaParmar/clean-fid)
- open_clip: [github](https://github.com/mlfoundations/open_clip)
