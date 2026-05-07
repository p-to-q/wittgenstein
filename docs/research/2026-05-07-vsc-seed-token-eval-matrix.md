---
date: 2026-05-07
status: research note
labels: [research-derived, m1-image]
tracks: [#205, #67, #109]
---

# Visual Seed Code — seed-token family comparison + first eval matrix

> **Status:** research note (not doctrine, not active execution guidance).
> Compares the realistic seed-token family candidates for Wittgenstein image and proposes the first locked eval matrix. Keeps **facts** (what each family is, papers, license, weights) separate from **repo commitments** (what we'd actually wire) per ADR-0018 §"Not locked." Pins nothing as doctrine; that's a future RFC's job.
> _Tracker: #205._

## Why this matters

ADR-0018 deliberately did **not** pick a tokenizer family — it ratified the architectural role (`Visual Seed Token` first-class, adapter is seed expander) and listed candidates: `TiTok`, `FlexTok`, `VAR`, `RQ-VAE`, `SPAE`. The choice is a downstream engineering question gated on:

1. open-weights availability under usable license (Apache-2.0 / MIT)
2. Node-friendly inference path (transformers.js / onnxruntime / WASM)
3. decoder-side codebook compatibility (current ImageDecoderHint enum: `llamagen | seed | dvae`)
4. token-grid shape compatibility (current default `latentResolution: [32, 32]` = 1024 tokens)

This note surveys the candidates against those four dimensions, separates **observable facts** from **what Wittgenstein would commit to**, and proposes the first eval matrix the next implementation slice can pin.

## Candidate survey

### 1. VQ-VAE / VQGAN — the foundational bet

**Facts.**
- VQ-VAE: van den Oord et al., NeurIPS 2017. The original discrete codebook quantizer. Codebook size K (typically 512–8192), spatial grid (typically 16×16 or 32×32 for 256² images).
- VQGAN: Esser/Rombach/Ommer, CVPR 2021. Adds patch-GAN discriminator + perceptual loss for sharper reconstruction; standard 16×16 grid → 256 tokens for 256².
- License: VQGAN reference implementation is MIT (Heidelberg + CompVis).
- Weights: many checkpoints publicly available (Heidelberg, CompVis, Stability AI forks). HuggingFace Hub has multiple finetuned variants.
- Inference: PyTorch reference; ONNX exports exist for some forks but not standard.

**For Wittgenstein.**
- Maps cleanly to existing `ImageDecoderHint.family: "llamagen"` which is itself a VQGAN-derived stack.
- 1024-token grid (32×32) matches our default `latentResolution`.
- Risk: not language-aligned; token IDs are arbitrary codebook indices the LLM has no prior over. SeedExpander has to learn the projection.
- Status: this is the obvious first-implementation candidate. Brief A's "LFQ-family discrete-token decoder" addendum names this branch.

### 2. TiTok / TA-TiTok — token-budget efficiency

**Facts.**
- Yu et al., "An Image is Worth 32 Tokens for Reconstruction and Generation," ICLR 2024 (arXiv:2406.07550).
- 1D token sequence (NOT a 2D grid). Encoder is a transformer that compresses the image to as few as 32 tokens with rFID < 2.0 on ImageNet 256².
- Token-aware variant TA-TiTok (2025) further optimizes downstream LLM compatibility.
- License: official implementation MIT (TheLastDarkLord, Bytedance Research).
- Weights: code released; checkpoints on HuggingFace via Bytedance org (`bytedance-research/TiTok-*`).
- Inference: PyTorch reference; no native ONNX export at time of survey.

**For Wittgenstein.**
- Compelling for `seedCode.mode: "lexical"` — 32 tokens is short enough to fit in a single LLM JSON response without burning context.
- Mismatch with our current `tokenGrid: [w, h]` schema — TiTok is a 1D sequence, not a 2D grid. Would need either:
  - schema extension: `seedCode.shape: "1D" | "2D"`; OR
  - express 1D as `tokenGrid: [N, 1]`
- Decoder-side compatibility: TiTok ships its own paired decoder; we'd treat the (encoder, decoder) as a unit.
- Status: high horizon value. Brief C H10's "long-code clarity" verdict argues for compact codes; TiTok is the published high-rank option.

### 3. FlexTok — variable-length 1D tokens

**Facts.**
- Bachmann et al., "Flexible Length Tokenization for Diverse Image Generation," ICML 2025 (arXiv:2502.13967).
- 1D token sequences with **flexible length** (1 to 256 tokens) via nested-dropout training. FID < 2 across 8–128 tokens.
- License: Apple ML Research; license unclear at time of survey (some Apple ML repos are research-only / non-commercial).
- Weights: limited public availability; main release is Apple-affiliated.
- Inference: PyTorch.

**For Wittgenstein.**
- Same 1D shape consideration as TiTok.
- Variable-length adds complexity to the schema (length is a runtime parameter, not a fixed value).
- License risk: unverified Apache-2.0 / MIT compatibility; needs explicit check before committing.
- Status: research-only watch. Useful as "what if seed length were variable?" thought experiment, but premature to commit until license clears.

### 4. VAR — next-scale prediction

**Facts.**
- Tian et al., "Visual Autoregressive Modeling: Scalable Image Generation via Next-Scale Prediction," NeurIPS 2024 Best Paper (arXiv:2404.02905).
- NOT a tokenizer per se — it's an AR prediction strategy that replaces "next-token over a 2D raster" with "next-scale" coarse-to-fine.
- Code is open (MIT-licensed reference implementation, Bytedance/Foundation Model Research).
- Weights: ImageNet-class checkpoints released on HuggingFace; class-conditional, not text-conditional.
- Inference: PyTorch.

**For Wittgenstein.**
- VAR is a decoder strategy, not a seed family on its own. Pairs naturally with our `coarseVq` field — VAR's coarse scales ARE the coarse-VQ tokens.
- The `seedCode.mode: "coarse-scale"` literal in `ImageVisualSeedCodeSchema` was added with this in mind.
- Risk: text-conditional VAR is an open research question. The released VAR is class-conditional only.
- Status: long-term "if H9 trips" candidate per Brief C. Watching for a text-conditional release.

### 5. RQ-VAE / RQ-Transformer — residual quantization

**Facts.**
- Lee et al., "Autoregressive Image Generation using Residual Quantization," CVPR 2022 (arXiv:2203.01941).
- Hierarchical: each spatial position has D codebook indices stacked as residuals. Trades grid spatial resolution for codebook depth.
- License: official implementation MIT (kakaobrain).
- Weights: ImageNet checkpoints released.
- Inference: PyTorch.

**For Wittgenstein.**
- The residual-stack shape doesn't map naturally to our current `tokens: number[]` schema (it'd need a 2D / 3D shape with depth).
- Schema extension: `seedCode.mode: "residual"` literal exists in `ImageVisualSeedCodeSchema` but no schema for the depth dimension; future tightening would need `tokens: number[][]` or similar.
- Status: schema mismatch makes this expensive to integrate compared to alternatives.

### 6. SPAE — frozen-LLM-as-image-tokenizer

**Facts.**
- Yu et al., "SPAE: Semantic Pyramid AutoEncoder for Multimodal Generation with Frozen LLMs," NeurIPS 2023 (arXiv:2306.17842).
- Encodes images into a sequence of *natural language vocabulary tokens* (the LLM's own tokenizer). Decoder reconstructs from those tokens.
- License: original Google Research; specific code license at time of survey unclear (Google ML repos vary).
- Weights: limited public; some unofficial reproductions.
- Inference: PyTorch.

**For Wittgenstein.**
- Most aligned with the thesis: the LLM emits *real natural language tokens* that double as image code; no separate codebook to learn.
- `seedCode.mode: "lexical"` literal was added with this in mind.
- License risk: Google Research repos often non-commercial; needs explicit check.
- Status: thesis-aligned but weights / license uncertain. Watch but don't commit.

## Comparison dimensions

| Family | License | Open weights | Node-friendly path today | Schema fit (current) | Decoder coupling |
| --- | --- | --- | --- | --- | --- |
| VQ-VAE / VQGAN | MIT (reference) | ✅ HuggingFace | ⚠️ Via transformers.js if ONNX-exported; else PyTorch only | ✅ 2D grid `[32, 32]` | Tightly coupled to its own decoder |
| TiTok / TA-TiTok | MIT | ✅ Bytedance HF | ❌ No native ONNX | ⚠️ 1D shape not yet representable in schema | Tight (paired encoder + decoder) |
| FlexTok | ❓ Apple ML (unclear) | ⚠️ Limited | ❌ PyTorch only | ⚠️ Variable-length 1D | Tight |
| VAR | MIT | ✅ HF (class-conditional only) | ❌ PyTorch only | ✅ via `coarseVq.mode: "coarse-scale"` | Decoder strategy, not separate tokenizer |
| RQ-VAE / RQ-Transformer | MIT | ✅ HF | ❌ PyTorch only | ❌ residual depth not in schema | Tight |
| SPAE | ❓ Google Research (unclear) | ⚠️ Limited | ❌ PyTorch only | ⚠️ "lexical" but no canonical token vocabulary | Decoupled (LLM tokenizer is the codebook) |

**Today's verdict** (no commitments, just observable readiness):

1. **VQGAN-class is the only family with a pragmatic Node-runtime path** via existing transformers.js + onnx-community ONNX exports. Everything else either lacks license clarity or lacks an ONNX export.
2. **TiTok is the most thesis-aligned compact-code candidate** but requires schema extension (1D shape) AND ONNX export work.
3. **VAR pairs naturally with our `coarseVq` field** if a text-conditional VAR ever lands; meanwhile it's class-conditional research.

## Repo commitments vs facts

**Facts (observable):**
- 6 candidate families surveyed; only VQGAN-class has a Node-friendly inference path today.
- ADR-0018 lists 4 of these (TiTok / FlexTok / VAR / RQ-VAE) as "candidates" without commitment.
- The current `ImageVisualSeedCodeSchema.mode` enum (`"prefix" | "coarse-scale" | "residual" | "lexical"`) was already shaped to admit TiTok / VAR / RQ-VAE / SPAE notations.

**Commitments this note proposes:**

| Item | Commitment | Lane |
| --- | --- | --- |
| Add `seedCode.shape: "1D" \| "2D"` schema discriminator to admit TiTok / FlexTok | NO commitment yet — open this when first 1D family is wired | Future schema RFC |
| Pin `family` literal enum on `seedCode.family` (currently free-form string) | NO commitment yet — keep free-form until at least 2 families are wired | Future schema RFC |
| Make VQGAN-class the first wired tokenizer | YES commitment as **starting point**, not as terminal default | Implementation issue once #109 (decoder bridge readiness) trips |
| Treat TiTok as the first horizon spike for compact 1D code | YES commitment as **research focus**, not implementation | New `horizon-spike` issue gated on TiTok ONNX export availability |
| Treat VAR as the first horizon spike for `coarseVq.mode: "coarse-scale"` | YES commitment as **research focus** | Existing #67 H9 patch-grid tracker covers this |

## First eval matrix

Per #205's "first locked eval matrix" requirement, the next implementation slice should evaluate runs across this matrix:

| Axis | Values | Notes |
| --- | --- | --- |
| **Lane** | `one-shot-vsc`, `two-pass-compile`, `semantic-only` (baseline) | Per #207 acceptance cases. |
| **Path actually fired** | `provider-latents`, `coarse-vq`, `visual-seed-code`, `semantic-fallback` | Recorded in `manifest.image.code.path` per #218. |
| **Tokenizer family** | `vqgan` (initial), `titok` (horizon), `var` (horizon — coarse only) | Free-form `seedCode.family` literal until at least 2 wired. |
| **Seed length** | `8`, `32`, `256`, `1024` (matches typical TiTok / VQGAN budgets) | Variable for 1D families; fixed at 1024 for 32×32 grid. |
| **Coarse grid** | `[4,4]`, `[8,8]`, `[16,16]` | When `coarseVq` path fires. |
| **Decoder family** | `llamagen` (default), `seed`, `dvae` | Existing enum unchanged. |

### Per-cell metrics

For each (lane, path, family, seedLength, coarseGrid, decoder) cell that has at least one valid run:

| Metric | Source | Receipt or quality? |
| --- | --- | --- |
| **parse-valid rate** | `manifest.ok` for runs that reach decode | Receipt |
| **adapter-valid rate** | `manifest.image.code.path === intended path` | Receipt |
| **decoder-compat rate** | run completes without `image/decoder-fallback` warning | Receipt |
| **deterministic replay** | three back-to-back same-seed runs produce identical `manifest.artifactSha256` | Receipt |
| **CLIPScore** (when M5a lands) | external eval harness | Quality |
| **VQAScore** (when M5a lands) | external eval harness | Quality |
| **manifest size** | `wc -c artifacts/runs/<id>/manifest.json` | Operational |
| **end-to-end latency** | `manifest.durationMs` | Operational |

The matrix is **multiplicative-too-large** (3 lanes × 4 paths × 3 families × 4 seedLengths × 3 coarseGrids × 3 decoders = 1296 cells). The first locked subset is:

- **Receipt-track only** (no quality scores yet): all 4 paths × `one-shot-vsc` lane × 1 family (`vqgan`) × default seedLength=1024 × default coarseGrid=[8,8] × default decoder=`llamagen`. **4 cells.**
- This is the minimum acceptance receipt set per `docs/benchmark-standards.md` §"Visual Seed Code receipt matrix" (added in PR #234).

## What stays an open research variable

These are **facts**, not commitments:

- Tokenizer family choice — gated on open-weights + Node-friendly inference + license.
- Optimal seed length for one-shot VSC — gated on actual model emissions.
- One-shot vs two-pass default — gated on quality differential, requires CLIPScore / VQAScore (M5a).
- Decoder family default — gated on bridge readiness per #109 / #67.
- Whether `seedCode.shape` schema discriminator is needed — gated on first 1D family wiring.
- Coarse-scale vs flat-grid emission — gated on H9 patch-grid trip per #67.

## Next-step gate

This note proposes a starting eval matrix. **Pinning a tokenizer family requires:**

1. ONE of the 6 surveyed families gains a Node-friendly inference path (ONNX export OR transformers.js native support OR equivalent), AND
2. Its license clears Apache-2.0 / MIT bar, AND
3. Its weights are publicly downloadable + verifiable by SHA-256, AND
4. A SeedExpander training recipe exists (per #70 reframed M1B umbrella) for projecting our LLM's semantic output to that family's token space.

Until all four conditions trip, the first eval matrix runs **only** the `vqgan` family with its existing scaffolded decoder, against the receipt-track metrics. Quality scores wait for M5a.

## Boundaries this note does NOT cross

- Does NOT pick a tokenizer family — leaves all 6 candidates as observable facts.
- Does NOT propose schema changes — flags where they'd be needed if a 1D / residual family is wired.
- Does NOT implement an eval runner — that's downstream once #109 trips.
- Does NOT reopen ADR-0018 — the architecture is locked; only the tokenizer-pick question stays open.
- Does NOT change `docs/codecs/image.md` or other doctrine surfaces.

## Cross-references

- ADR-0018 §"Not locked" — the explicit deferral this note honors
- RFC-0006 §3 — visual seed token role
- Brief A v0.2 — VQ/VLM lineage including VAR + FlexTok placement
- Brief C H9 — patch-grid IR variant tracker (Issue #67)
- Brief C H10 — long-code clarity hypothesis (Issue #66)
- #67 — H9 watch (gated on open-weights LFQ-family decoder release)
- #109 — VQ decoder bridge readiness tracker
- #70 — M1B image L4 adapter handoff (umbrella for SeedExpander training, post-VSC)
- #207 / `docs/research/2026-05-07-vsc-acceptance-cases.md` — per-lane acceptance criteria
- `docs/benchmark-standards.md` §"Visual Seed Code receipt matrix" — the receipt subset this matrix extends
