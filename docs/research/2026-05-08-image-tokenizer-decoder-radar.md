---
date: 2026-05-08
status: research note
labels: [research-derived, m1-image, radar]
tracks: [#258, #205, #109, #67, #255]
supersedes: docs/research/2026-05-08-vsc-eval-matrix-cells.md
---

# Image tokenizer / decoder radar

> **Status:** research note. This is the radar #258 commissioned. It supersedes the cell matrix in `2026-05-08-vsc-eval-matrix-cells.md` (#254) once both land — that note's cells become rows in the table below.
> _Tracker: [#258](https://github.com/p-to-q/wittgenstein/issues/258), gating [#70](https://github.com/p-to-q/wittgenstein/issues/70) / [#109](https://github.com/p-to-q/wittgenstein/issues/109) / [#67](https://github.com/p-to-q/wittgenstein/issues/67)._

## Citation discipline

Same rules as `2026-05-08-vsc-eval-matrix-cells.md` r2:

1. Every external claim either has an arXiv link / paper title / GitHub repo name, or is marked `unknown` / `verify-locally`.
2. License claims that are not directly verified at the repo's `LICENSE` file are marked `per [source]` with the source named.
3. Receipt-fidelity claims that are Wittgenstein inference (not published fact) are tagged `inferred`.
4. Node / ONNX / CPU feasibility verdicts that haven't been tested empirically are marked `untested`.

This note is **interim** in one specific sense: the verdict column ("implementation recommendation") names the candidate I currently rank highest. That ranking is *not* a doctrine choice. The actual wire-it decision is a downstream implementation issue (#258 successor) gated on (a) maintainer ratification of this radar, (b) the four-step pre-wire audit named in `2026-05-08-vsc-eval-matrix-cells.md` r2 §"Current working prior" (re-verify license, verify weights, test deterministic round-trip empirically, confirm Node/ONNX by attempting export).

## Evaluation criteria

The radar scores each candidate against criteria flowing from the theoretical anchor (`2026-05-08-vsc-as-compression-prior.md`). Not all criteria are weighted equally — the bottom-line recommendation reflects which criteria are *binding* (license, decoder availability) vs *informative* (compactness, schema fit).

| Criterion | Source | What "good" looks like |
|---|---|---|
| **License** | Repo `LICENSE` file | Apache-2.0 or MIT. CC-BY also acceptable for paper-only. Research-only / non-commercial fails. |
| **Weights availability** | HuggingFace / GitHub releases / paper artifact | Public, downloadable, SHA-pinnable |
| **Token shape** | Paper / repo | One of: 2D grid, 1D sequence, residual stack, bit-token, lexical, coarse-scale. Must map to Wittgenstein's `seedCode`/`coarseVq`/`providerLatents` schema or admit a clear extension |
| **Decoder availability** | Paper / repo | Frozen decoder weights public; matches the codebook the encoder was trained on |
| **Node / ONNX / CPU feasibility** | Repo / community ports | Native ONNX export OR transformers.js support OR small CPU-runnable inference path |
| **Deterministic replay risk** | Inference path | Encoder + decoder are deterministic given fixed weights; no sampling or stochastic ops at inference |
| **Manifest receipt implications** | This radar | What new schema fields would be needed; what receipt would be produced |
| **Implementation cost** | This radar | Small / medium / large. Reflects schema change scope, weight size, runtime dependencies |
| **Affects Wittgenstein** | This radar's verdict | `now` (wire in next slice) / `later` (wait for trigger) / `not at all` (kill from radar) |

## Candidates surveyed

11 families. The first 6 are from #258's named list; the remaining 5 are additions surfaced during this audit.

### 1. VQ-VAE / VQGAN

| Field | Value |
|---|---|
| Paper | van den Oord et al., *"Neural Discrete Representation Learning,"* NeurIPS 2017 — arXiv:1711.00937 |
| VQGAN paper | Esser et al., *"Taming Transformers for High-Resolution Image Synthesis,"* CVPR 2021 — arXiv:2012.09841 |
| Reference repo | `CompVis/taming-transformers` (GitHub) |
| License | `MIT (per #238 §1)` — *needs local re-verify at the LICENSE file* |
| Open weights | Multiple checkpoints on HuggingFace via CompVis / Stability AI; widely forked |
| Token shape | **2D grid**, typically 16×16 = 256 tokens at 256² or 32×32 = 1024 at 256² depending on f-factor; codebook size 1024–16384 |
| Decoder availability | Yes; paired with each encoder checkpoint |
| Node / ONNX | `untested`; PyTorch reference. ONNX exports exist for some forks but not standard |
| Deterministic replay | `byte-pinnable (inferred)` — deterministic encoder + integer codebook lookup; no published nondeterminism reports |
| Manifest receipt | Maps cleanly to existing `tokenGrid: [w, h]`, `tokens: number[]`. No schema change. |
| Implementation cost | **Small** — schema already admits this shape; `decoder.family: "llamagen"` (a VQGAN-derivative) is the existing default |
| Affects Wittgenstein | **`now`** if the decoder bridge (#109) reaches readiness. Otherwise `later`. |

**Notes.** This is the foundational candidate and the de facto default in the codec. LlamaGen (existing `decoder.family: "llamagen"` literal) is itself a VQGAN-class stack. Risk: not language-aligned — token IDs are arbitrary codebook indices the LLM has no prior over; the SeedExpander has to learn the projection (#70). The `placeholderSeedExpander` and `tileMosaicSeedExpander` exist precisely because we have no trained projector yet.

**Verify gate before wiring:** local LICENSE check, weights SHA-pinned, an ONNX export attempt OR a small CPU-runnable PyTorch path tested.

### 2. XQ-GAN — unified VQ / RQ / MSVQ / PQ / LFQ / BSQ tokenizer

| Field | Value |
|---|---|
| Paper | (per #258 starting reference) — arXiv:2412.01762 |
| Reference repo | `untested` — the paper is recent (Dec 2024); I have not directly inspected the repo |
| License | `unknown` — flag for local audit |
| Open weights | `unknown` |
| Token shape | **Multiple shapes admitted**: 2D grid (VQ, RQ, MSVQ, PQ), bit-token (LFQ, BSQ). The framework is the radar; specific configurations must be picked. |
| Decoder availability | `unknown` |
| Node / ONNX | `untested` |
| Deterministic replay | `unknown` |
| Manifest receipt | Depends on which sub-configuration. If LFQ-family sub-configurations are exercised, `seedCode.tokens` would carry bit-token integers; if VQ sub-configurations, integer codebook indices. |
| Implementation cost | **Medium** — the unification is potentially valuable but requires picking which configuration to wire; that picks merges multiple prior options into one |
| Affects Wittgenstein | **`later`** — promising as a *unification* tracker; not actionable until the configurations are individually evaluated |

**Notes.** XQ-GAN is potentially the most interesting candidate from a "single repo, multiple tokenizer families" perspective. It would let us evaluate VQ/RQ/MSVQ/PQ/LFQ/BSQ side-by-side under the same training recipe. But the local audit hasn't happened — license, weights, runtime feasibility all `unknown`. **Concrete next step:** open a small research issue specifically to local-audit XQ-GAN.

### 3. MAGVIT / OpenMAGVIT-style tokenizers

| Field | Value |
|---|---|
| Paper | MAGVIT: Yu et al., *"MAGVIT: Masked Generative Video Transformer,"* CVPR 2023 — arXiv:2212.05199 |
| MAGVIT-v2 paper | Yu et al., *"Language Model Beats Diffusion: Tokenizer is Key to Visual Generation,"* ICLR 2024 — arXiv:2310.05737 |
| Reference repo | OpenMAGVIT2: `untested` — community reproduction; I have not inspected the repo |
| License | `unknown` for original (Google); OpenMAGVIT2 likely Apache/MIT but `verify-locally` |
| Open weights | OpenMAGVIT2: `unknown` per local audit; original MAGVIT not publicly released to my knowledge |
| Token shape | **2D grid** + LFQ (lookup-free quantization in MAGVIT-v2) |
| Decoder availability | OpenMAGVIT2: `unknown` |
| Node / ONNX | `untested`; PyTorch reference |
| Deterministic replay | `byte-pinnable (inferred)` per LFQ structure (no learned codebook lookup, integer-bit tokens) |
| Manifest receipt | LFQ tokens fit `tokens: number[]` if encoded as integers |
| Implementation cost | **Medium** — LFQ is structurally distinct from VQ codebook indices; receipt schema may need tightening |
| Affects Wittgenstein | **`later`** — LFQ direction is interesting (Brief A's "LFQ-family discrete-token decoder" addendum names this branch). Wait for a community-reproducible OpenMAGVIT2 weights release with verified license. |

**Notes.** MAGVIT-v2's claim *"Language Model Beats Diffusion"* is the most VSC-aligned thesis statement in the published literature — it explicitly argues that the tokenizer is the bottleneck for LM-based image/video generation. Watching OpenMAGVIT2 reproduction effort is worthwhile.

### 4. LFQ / FSQ / BSQ — lookup-free / finite-scalar / binary-spherical quantization

| Family | Paper | License | Weights |
|---|---|---|---|
| **LFQ** (Lookup-Free) | Yu et al., MAGVIT-v2 paper §3.3 — arXiv:2310.05737 | per MAGVIT-v2 | per MAGVIT-v2 |
| **FSQ** (Finite Scalar) | Mentzer et al., *"Finite Scalar Quantization: VQ-VAE Made Simple,"* ICLR 2024 — arXiv:2309.15505 | `unknown` (Google Research) | `unknown` |
| **BSQ** (Binary Spherical) | Zhao et al., *"Binary Spherical Quantization,"* 2024 — arXiv:2406.07548 (verify-locally) | `unknown` | `unknown` |

| Field | Common values |
|---|---|
| Token shape | **Bit-token** (integer with low-cardinality bit fields) or **scalar quantized** (small integer per channel). Compactly representable in `tokens: number[]` with appropriate range constraints. |
| Decoder availability | Per family: typically paired with a specific generator stack |
| Node / ONNX | `untested` for all three |
| Deterministic replay | `byte-pinnable (inferred)` — these quantization schemes have no learned codebook lookup, so determinism is structural |
| Implementation cost | **Small if FSQ; medium if LFQ/BSQ** — FSQ is famously simple (the paper title is literally *"VQ-VAE Made Simple"*); LFQ/BSQ require more care on bit-packing |
| Affects Wittgenstein | **FSQ: `later` candidate for evaluation** — possibly the lowest-cost-to-try option; LFQ/BSQ: `later` pending MAGVIT-v2 evidence |

**Notes.** FSQ is interesting because it removes the codebook entirely — each spatial position carries a small set of scalar quantized values, no codebook collapse problems, no commitment loss. If FSQ-paired decoders exist with public weights, this is plausibly the simplest seed-token family to wire. **Concrete next step:** local-audit the FSQ paper's reference repo for license + weights.

### 5. TiTok / TA-TiTok — 32-token compact 1D

| Field | Value |
|---|---|
| Paper | Yu et al., *"An Image is Worth 32 Tokens for Reconstruction and Generation,"* ICLR 2024 — arXiv:2406.07550 |
| TA-TiTok | 2025 follow-up; same authors (verify-locally) |
| Reference repo | Bytedance Research org; `bytedance-research/TiTok-*` checkpoints (per #238 §2) |
| License | `MIT (per #238 §2)` — *needs local re-verify* |
| Open weights | Public on HuggingFace (per #238 §2) |
| Token shape | **1D sequence**, as few as 32 tokens for 256² images (rFID < 2.0 on ImageNet 256² per paper) |
| Decoder availability | Paired (encoder + decoder shipped together) |
| Node / ONNX | `untested`; *"no native ONNX export at time of survey"* per #238 §2 |
| Deterministic replay | `byte-pinnable (inferred)` |
| Manifest receipt | **Schema mismatch** — current `tokenGrid: [w, h]` is 2D. Would need either `seedCode.shape: "1D" \| "2D"` discriminator or `tokenGrid: [N, 1]` convention |
| Implementation cost | **Medium** — schema extension + ONNX-export work + validating that frozen LLMs can emit 32-token sequences reliably |
| Affects Wittgenstein | **`later`** — high horizon value (most VSC-aligned compactness story) but binding gate is the schema discriminator decision. If we wire TiTok, that's a doctrine-adjacent change |

**Notes.** TiTok is the strongest candidate for the *compact-code* hypothesis (prediction 3 in the theoretical anchor). 32 tokens fits trivially in a JSON response; whether a frozen LLM can emit valid TiTok sequences (prediction 1) is the testable question. **Concrete next step:** the schema-discriminator question is its own RFC if we commit to TiTok.

### 6. FlexTok — variable-length 1D

| Field | Value |
|---|---|
| Paper | Bachmann et al., *"Flexible Length Tokenization for Diverse Image Generation,"* ICML 2025 — arXiv:2502.13967 |
| Reference repo | Apple ML Research (per #238 §3) |
| License | **`unclear`** (per #238 §3 *"License: Apple ML Research; license unclear at time of survey"*) — *binding constraint, not technical question* |
| Open weights | Limited public availability (per #238 §3) |
| Token shape | **1D sequence, variable length** (1 to 256 tokens via nested-dropout training) |
| Decoder availability | Paired (encoder + decoder) |
| Node / ONNX | `untested`; PyTorch reference |
| Deterministic replay | **`unknown`** — variable-length tokens introduce a length parameter whose determinism is not characterized in #238 or the paper to my knowledge |
| Manifest receipt | Schema mismatch (1D, same as TiTok) plus a runtime length parameter the current `seedCode.length` does not model precisely |
| Implementation cost | **Large** — schema change + license clearance + receipt-honesty for variable-length |
| Affects Wittgenstein | **`not at all`** until license clears. Even if it clears, the determinism question is binding. |

**Notes.** FlexTok is theoretically interesting but practically blocked by license uncertainty. Don't allocate engineering effort here; watch for a license verdict.

### 7. VAR — next-scale prediction

| Field | Value |
|---|---|
| Paper | Tian et al., *"Visual Autoregressive Modeling: Scalable Image Generation via Next-Scale Prediction,"* NeurIPS 2024 best paper — arXiv:2404.02905 |
| Reference repo | Bytedance / Foundation Model Research, MIT-licensed (per #238 §4) |
| License | `MIT (per #238 §4)` — *needs local re-verify* |
| Open weights | ImageNet-class checkpoints on HuggingFace; **class-conditional only** (per #238 §4) |
| Token shape | **Coarse-scale hierarchy** — not a flat token sequence; AR prediction is over scales, not over a 2D raster |
| Decoder availability | Paired (decoder is the AR transformer + tokenizer pair) |
| Node / ONNX | `untested`; PyTorch reference |
| Deterministic replay | `byte-pinnable (inferred)` for the deterministic-decode path; AR sampling is a separate concern |
| Manifest receipt | Pairs naturally with `coarseVq.mode: "coarse-scale"` literal (already in schema). One-shot-vsc cell is `n/a` — see #254 r2 §4 |
| Implementation cost | **Large** until a text-conditional VAR ships; class-conditional is not reachable from a text-only LLM |
| Affects Wittgenstein | **`later`** — gated on text-conditional VAR release. Watch via #67 H9 horizon spike. |

**Notes.** VAR's theoretical contribution (next-scale > next-token-2D-raster) is independent of whether VAR-class models are reachable from frozen LLMs. The next-scale insight may apply to other tokenizer families if we adopt a `coarseVq → seedCode` two-pass workflow.

### 8. RQ-VAE / RQ-Transformer — residual quantization

| Field | Value |
|---|---|
| Paper | Lee et al., *"Autoregressive Image Generation using Residual Quantization,"* CVPR 2022 — arXiv:2203.01941 |
| Reference repo | kakaobrain (per #238 §5) |
| License | `MIT (per #238 §5)` — *needs local re-verify* |
| Open weights | ImageNet checkpoints released (per #238 §5) |
| Token shape | **Residual stack**: each spatial position has D codebook indices stacked as residuals |
| Decoder availability | Paired |
| Node / ONNX | `untested`; PyTorch reference |
| Deterministic replay | `byte-pinnable (inferred)` |
| Manifest receipt | **Schema mismatch** — residual depth doesn't map to current `tokens: number[]`; would need `tokens: number[][]` or a `depth` field |
| Implementation cost | **Medium-large** — schema change has blast radius |
| Affects Wittgenstein | **`later`** — wait until residual depth becomes the binding quality differentiator |

**Notes.** RQ-VAE trades spatial resolution for codebook depth. The schema-extension cost is the main blocker; the family itself is well-established.

### 9. SPAE — frozen-LLM-vocabulary visual tokens

| Field | Value |
|---|---|
| Paper | Yu et al., *"SPAE: Semantic Pyramid AutoEncoder for Multimodal Generation with Frozen LLMs,"* NeurIPS 2023 — arXiv:2306.17842 |
| Reference repo | Google Research (per #238 §6) |
| License | **`unclear`** (per #238 §6) |
| Open weights | Limited public; some unofficial reproductions |
| Token shape | **Lexical** — uses the LLM's own tokenizer vocabulary as the codebook. No separate quantizer at emission. |
| Decoder availability | Paired |
| Node / ONNX | `untested`; PyTorch reference |
| Deterministic replay | **`unknown`** (per #254 r2 §6 — paper reports reconstruction loss, not byte-deterministic round-trip) |
| Manifest receipt | Most thesis-aligned candidate — LLM emits real natural-language tokens that double as image code |
| Implementation cost | `unknown` — depends on whether weights become available with clear license |
| Affects Wittgenstein | **`not at all` today** — license + receipt-determinism gates. Watch but do not commit. |

**Notes.** SPAE is the most architecturally aligned candidate with the compression-prior framing. It's also the one with the most binding `unknown`s. If the license clears and weights become reproducible, SPAE jumps to `now` immediately.

### 10. MaskBit — embedding-free / bit-token generation

| Field | Value |
|---|---|
| Paper | Weber et al., *"MaskBit: Embedding-Free Image Generation via Bit Tokens,"* 2024 — arXiv:2409.16211 (verify-locally) |
| Reference repo | `markweberdev/maskbit` (per #258 starting reference) |
| License | `unknown` — flag for local audit |
| Open weights | `unknown` |
| Token shape | **Bit-token** — each "token" is a small bit-vector rather than an integer codebook index |
| Decoder availability | Paired |
| Node / ONNX | `untested` |
| Deterministic replay | `byte-pinnable (inferred)` per bit-token structure |
| Manifest receipt | `tokens: number[]` with bit-vector reinterpretation OR new schema `tokens: number[][]` (bits per position) |
| Implementation cost | **Medium** — schema tightening + bit-token receipts |
| Affects Wittgenstein | **`later`** — interesting embedding-free direction; pending local audit. The same family as LFQ in some sense. |

**Notes.** MaskBit and LFQ are conceptually adjacent. If we evaluate one, evaluate the other under the same harness. **Concrete next step:** local-audit `markweberdev/maskbit` for license + weights.

### 11. MUSE — masked image generation over VQ tokens

| Field | Value |
|---|---|
| Paper | Chang et al., *"Muse: Text-To-Image Generation via Masked Generative Transformers,"* ICML 2023 — arXiv:2301.00704 |
| Reference repo | Google Research; community reproductions exist (verify-locally) |
| License | `unknown` (Google Research) |
| Open weights | Google original: not publicly released to my knowledge; community reproductions: `unknown` |
| Token shape | **2D grid** (uses VQGAN-class tokenizer) |
| Decoder availability | Paired with the VQGAN-class tokenizer |
| Node / ONNX | `untested` |
| Deterministic replay | `byte-pinnable (inferred)` for the decoder path; the masked-generation transformer is sampled |
| Manifest receipt | Same as VQGAN-class; no schema extension |
| Implementation cost | `unknown` until weights availability clarifies |
| Affects Wittgenstein | **`not at all` today** — class-conditional / text-conditional with no public weights. Watch only if a clean reproduction lands. |

**Notes.** MUSE is included for completeness because its masked-generation framing is interesting (parallel decoding vs autoregressive); but with no clear weights path and no architectural advantage over VQGAN for VSC purposes, it doesn't earn implementation effort.

## Summary radar table

| Family | License | Token shape | Schema fit | Receipt | Node/ONNX | Cost | Verdict |
|---|---|---|---|---|---|---|---|
| VQ-VAE / VQGAN | MIT (per #238, verify) | 2D grid | ✅ direct | byte-pinnable (inferred) | untested | small | **`now`** if #109 trips |
| XQ-GAN | unknown | multi-shape | depends on config | depends | untested | medium | `later` — local-audit |
| MAGVIT / OpenMAGVIT2 | unknown | 2D + LFQ | ✅ if integer-encoded | byte-pinnable (inferred) | untested | medium | `later` — watch reproduction |
| LFQ / FSQ / BSQ | per family | bit-token / scalar | ✅ direct | byte-pinnable (inferred) | untested | small (FSQ) / medium (LFQ/BSQ) | `later` — FSQ first |
| TiTok / TA-TiTok | MIT (per #238, verify) | 1D | ⚠️ schema discriminator | byte-pinnable (inferred) | untested | medium | `later` — gated on schema RFC |
| FlexTok | unclear | 1D variable | ⚠️ + length runtime | unknown | untested | large | `not at all` until license clears |
| VAR | MIT (per #238, verify) | coarse-scale | ✅ via coarseVq | byte-pinnable (inferred) | untested | large | `later` — text-conditional gate |
| RQ-VAE | MIT (per #238, verify) | residual stack | ❌ depth dimension | byte-pinnable (inferred) | untested | medium-large | `later` — schema cost |
| SPAE | unclear | lexical | needs schema | unknown | untested | unknown | `not at all` — license + receipt gates |
| MaskBit | unknown | bit-token | ✅ if integer-encoded | byte-pinnable (inferred) | untested | medium | `later` — local-audit |
| MUSE | unknown | 2D grid | ✅ direct | byte-pinnable (inferred) | untested | unknown | `not at all` — no weights |

## Recommended ranking

The radar is honest about what we don't know. The bottom-line ordering reflects which candidates have the cleanest combination of (a) license clarity, (b) schema fit, (c) feasible Node/ONNX path, (d) decoder availability:

1. **VQGAN-class (existing default).** The only candidate with verified license claim (pending re-verify), schema fit, and an existing decoder bridge slot in the codec. Wire first if/when #109 trips.
2. **FSQ.** Theoretically simpler than VQ-VAE; "VQ-VAE Made Simple" is the paper title. Lowest implementation cost if license + weights audit clears.
3. **OpenMAGVIT2 (LFQ).** Best VSC-aligned thesis (*"Language Model Beats Diffusion: Tokenizer is Key"*). Wait for community reproduction maturity.
4. **TiTok.** Best compactness story (32 tokens). Gated on schema discriminator decision; that's its own RFC.
5. **MaskBit.** Embedding-free direction; same family as LFQ. Local-audit needed.

Everything else (XQ-GAN, FlexTok, VAR, RQ-VAE, SPAE, MUSE) is `later` or `not at all` for binding reasons named per row above.

## What this radar does NOT do

- Does NOT pick a tokenizer family. Names a recommended ranking, but the wire-it decision is a follow-on implementation issue gated on the four-step pre-wire audit (re-verify license, weights, deterministic round-trip, Node/ONNX).
- Does NOT propose schema changes. TiTok / RQ-VAE schema extensions would each be their own RFC.
- Does NOT supersede ADR-0018. The architectural commitment (LLM emits seed code → SeedExpander → frozen decoder) is family-agnostic; this radar narrows the family choice within that architecture.
- Does NOT rank candidates on quality benchmarks. rFID / FID / CLIPScore comparisons require empirical runs that are downstream of M5a per `docs/benchmark-standards.md`.
- Does NOT close any of the candidates as "dead." `not at all` means "not a candidate for next-slice wiring"; future evidence can flip the verdict.
- Does NOT replace #254 yet. This radar supersedes #254's cell matrix once both land; #254 r2 should close with a pointer here when this PR merges.

## Next-step issues (to open if this radar is ratified)

1. **Local audit XQ-GAN** — license + weights + reference inference path. Small research issue.
2. **Local audit FSQ** — same questions as XQ-GAN. Small research issue.
3. **Local audit MaskBit** — same questions. Small research issue.
4. **VQGAN ONNX-export attempt** — empirical Node/ONNX feasibility test. Small implementation issue (no schema impact).
5. **TiTok schema-discriminator RFC** — only if TiTok jumps in the ranking after the audits. Doctrine-bearing; needs ratification before code.

## Cross-references

- `2026-05-08-vsc-as-compression-prior.md` — theoretical anchor (defines the four predictions this radar's criteria flow from).
- `2026-05-07-vsc-seed-token-eval-matrix.md` (#238) — primary citation source for license + shape claims in this radar.
- `2026-05-08-vsc-eval-matrix-cells.md` r2 (#254) — cell matrix; this radar supersedes its cell verdicts once both land.
- ADR-0018 — Visual Seed Token first-class, adapter as seed expander.
- RFC-0006 — hybrid image code shape.
- #258 — radar commission.
- #205 — first locked eval matrix.
- #207 — one-shot vs two-pass acceptance cases.
- #70 — M1B trained-projector umbrella; the radar's downstream consumer.
- #109 — VQ decoder bridge readiness tracker.
- #67 — H9 patch-grid IR variant tracker (VAR-relevant).
