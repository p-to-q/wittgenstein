---
date: 2026-05-22
status: research note (literature survey + architectural implications)
labels: [research-derived, m1b-image, adapter, continuous-latent, block-causal]
tracks: [#283, #70, #67]
cross-refs: [Brief B (Ilya-LeCun), Brief C H9 (patch-grid), ADR-0005, ADR-0018]
---

# Cola-DLM: Implications for Wittgenstein

> **Status:** research note. Not doctrine, not active execution guidance.
> Surveys ByteDance Seed's Cola-DLM (Continuous Latent Diffusion Language Model, arXiv:2605.06548, May 2026) and extracts specific architectural ideas portable to Wittgenstein's Visual Seed Code + frozen VQ decoder pipeline.

## Why this note exists

A maintainer identified Cola-DLM as relevant to two open questions:

1. Whether its intermediate representation is superior to Wittgenstein's current IR design
2. Whether its continuous-latent + block-causal approach offers techniques borrowable within the frozen-decoder doctrine

This note answers both questions with specific architectural details and numbers from the paper and released code.

---

## Cola-DLM: Architecture Summary

Cola-DLM replaces autoregressive next-token prediction with a three-stage hierarchy:

```
Text VAE encoder (q_phi)
  → continuous latent sequence (z_0 in R^(L x d), d=16)
    → Block-causal DiT prior (p_psi) via Flow Matching
      → VAE decoder (p_theta) → discrete tokens
```

**Joint factorization:** `p(x, z_0) = p_theta(x | z_0) * p_psi(z_0)`

### Key Components

| Component        | Architecture                                                        | Params    | Details                                     |
| ---------------- | ------------------------------------------------------------------- | --------- | ------------------------------------------- |
| Text VAE encoder | 4 transformer blocks, causal, dim=1536, 12 heads, GQA, SwiGLU, RoPE | ~250M     | Diagonal Gaussian posterior (mean + logvar) |
| Text VAE decoder | 4 transformer blocks, block-causal, same dims                       | ~250M     | Autoregressive within blocks                |
| DiT prior        | 24 layers, 16 heads, dim=2048, SwiGLU, RoPE                         | ~1.8B     | Flow Matching, not diffusion                |
| **Total**        |                                                                     | **~2.3B** |                                             |

### Block-Causal Mechanism

- **Block size:** 4 latent positions per block (released checkpoint; paper ablates {1, 16, 64, 128}, finds 16 optimal)
- **Attention pattern:** Bidirectional within each block, causal across blocks
- **Visible set for block b:** `V_b = {sg(z_0^(<b)), z_t^(b)}` where `sg()` = stop-gradient on historical clean blocks
- **Token generation:** After DiT denoises one block of continuous latents, VAE decoder produces logits over vocabulary for `block_size` token positions at once

### Flow Matching (not classical diffusion)

- **Loss:** `L_FM = sum_b E_{t,z_0,z_1} [||v_psi(z_t^(b), t; z_0^(<b)) - u_t^(b)||^2]`
- **Noise schedule:** Logit-normal with loc=1.0 (optimal per ablation)
- **ODE integration:** Euler-style, T=1000.0
- **Inference steps:** 16 default (8-10 recover most quality)
- **CFG scale:** 7.0 default (best range 3-7)

### Training Recipe

- Two-stage: Stage 1 = VAE only; Stage 2 = joint VAE + DiT
- **Critical finding:** Joint DiT with full LR on VAE is best. Fixed VAE saturates early. "All scratch" collapses latent geometry.
- VAE masking loss (BERT-style) prevents encoder semantic collapse
- Sequence length: 512 tokens
- Scaling curves evaluated up to ~2000 EFLOPs

### Key Ablation Findings

1. **VAE co-training:** Joint with LR x1.0 >> Fixed VAE >> All-scratch (collapses)
2. **Block size:** 16 > 1 (fully causal) > 64/128 on benchmarks
3. **First-block conditioning:** "Clean repaint" dominates (24.6 avg) vs partial/padding (8.4-16.7)
4. **Latent compression p=2:** Competitive on aligned boundaries, **fails on misaligned prompts** due to "semantic shifted latents at patch boundary"
5. **Reconstruction under perturbation:** Stays near-perfect at t=0 (~0.96 at t=100, ~0.92 at t=250)

---

## Implications for Wittgenstein

### What is directly portable (no doctrine conflict)

#### 1. Block-causal adapter design

**Idea:** Wittgenstein's L4 adapter (seed expander) could use block-causal attention over VQ token blocks instead of fully autoregressive or fully independent generation.

**Concrete proposal:** If using TiTok-32 (32 VQ tokens for 256x256), generate in blocks of 4-8 tokens. Within each block, bidirectional attention allows tokens to co-inform. Across blocks, causal attention maintains left-to-right coherence.

**Why this helps:** The LLM's seed code provides the "prompt" for the first block. Each subsequent block conditions on all previous blocks' resolved VQ indices. This is structurally identical to Cola-DLM's block-causal DiT but operates in discrete VQ space, preserving determinism.

**Compatibility:** Does not violate ADR-0005 (decoder ≠ generator) because the adapter is a learned bridge, not a generator. The frozen decoder still receives discrete VQ indices and reconstructs deterministically.

#### 2. Clean-repaint conditioning for seed expansion

**Idea:** When the LLM provides a partial seed code (e.g., 8 tokens out of 32 needed), treat those as "clean" positions pinned to their known VQ indices. Predict/denoise only the unknown positions.

**Source:** Cola-DLM's "clean repaint" strategy for first-block conditioning (ablation shows massive advantage: 24.6 avg vs 8.4-16.7 for alternatives).

**Concrete proposal:** In the seed expander, known seed positions retain their values throughout all expansion steps. Unknown positions are predicted conditioned on the known ones. This is equivalent to masked token prediction (MaskGIT-style) with a fixed mask.

**Why this helps directly on concern (a):** The user's stability concern about first 5-15 tokens is exactly this — if those tokens are good, this mechanism guarantees they're preserved and the rest is filled in coherently around them.

#### 3. Block-wise quality: U-shaped pattern awareness

**Finding from DLCM (arXiv:2512.24617):** Token prediction quality is best at concept boundaries (first and last tokens of a block) and slightly worse at mid-block positions.

**Implication for seed code:** If the LLM emits 8 "seed" tokens, they should correspond to block boundaries (first token of each block of 4), not arbitrary positions. This maximizes the signal-to-noise ratio of the seed.

### What requires adaptation (partially compatible)

#### 4. Continuous-latent planning with discrete quantization boundary

**Idea:** Use a continuous latent space for high-level visual planning (layout, composition, palette), then discretize to VQ indices at the adapter boundary.

**Why it's tempting:** Cola-DLM shows continuous latents are better for global semantic organization. Wittgenstein's Semantic IR already serves this role but is currently unstructured text.

**Adaptation needed:** Train a small "semantic encoder" that maps Semantic IR fields to a continuous embedding, then a "quantization head" that projects from continuous embedding to VQ codebook logits. This keeps the upstream planning in continuous space (better for interpolation, composition) while the downstream decoder receives discrete indices (deterministic).

**Compatibility:** Fits within L4 adapter scope. Does not violate ADR-0005 because the decoder still receives discrete codes. The continuous space is internal to the adapter, not exposed to the decoder.

**Risk:** Training complexity increases. Cola-DLM found that joint VAE training requires careful co-training strategy (LR scheduling, masking loss). A simpler MLP adapter may suffice for v0.3.

### What is incompatible (do not adopt)

#### 5. Full continuous-latent generation path

**Why not:** Cola-DLM's core path generates in continuous R^16 space and only discretizes to tokens at the final step. This requires a continuous decoder (the VAE decoder), not a frozen VQ decoder. Adopting this would:

- Violate ADR-0005 (decoder ≠ generator — the VAE decoder is generative)
- Break manifest spine bit-exact / structural-parity reproducibility (Flow Matching ODE introduces floating-point sensitivity)
- Require full model retraining (~2.3B params), violating ADR-0007 (Path C rejected)

#### 6. Latent sequence compression (patch_size > 1)

**Why not:** Cola-DLM's ablation showed patch_size=2 (2x sequence compression) fails on misaligned prompt boundaries. Their released checkpoint uses patch_size=1 (no compression). For Wittgenstein, this means: do NOT try to compress the VQ token sequence further via latent pooling. Keep 1:1 mapping between adapter output positions and decoder input positions.

---

## Comparison to Wittgenstein's Current Architecture

| Dimension             | Wittgenstein (current)                        | Cola-DLM                            | Borrowable?                      |
| --------------------- | --------------------------------------------- | ----------------------------------- | -------------------------------- |
| Intermediate repr     | Discrete VQ tokens                            | Continuous latent R^16              | No (violates ADR-0005)           |
| Generation            | LLM autoregressive → adapter → VQ             | DiT Flow Matching in latent space   | Partially (block-causal pattern) |
| Determinism           | Structural guarantee (same seed → same bytes) | Not guaranteed (ODE floating-point) | No                               |
| Multi-modal alignment | Per-modality codec isolation                  | Continuous space natural alignment  | See §4 adaptation                |
| Token granularity     | Per-token                                     | Per-block (block_size=4-16)         | Yes (block-causal adapter)       |
| Conditioning          | Full seed code or semantic IR                 | Clean-repaint pinning               | Yes (seed expansion)             |

---

## Recommended Next Steps

1. **[Actionable]** Design block-causal attention mask for the L4 adapter's seed expander (MaskGIT-style, 8 steps, block_size=4 for TiTok-32). File as sub-issue of #70.
2. **[Actionable]** Implement clean-repaint conditioning in the seed expander interface: known seed positions pinned, unknown positions predicted. Extends `SeedExpander` ABI.
3. **[Research]** Prototype continuous-to-discrete adapter head: Semantic IR embedding → continuous plan → VQ logits. Evaluate whether the extra complexity buys measurable quality over direct MLP.
4. **[Watch]** Cola-DLM weights are Apache-2.0 on HuggingFace. If they release a vision-language variant, reassess compatibility.

---

## Citations

- Guo, H. et al. (2026). "Cola-DLM: Continuous Latent Diffusion Language Model." arXiv:2605.06548. Code: github.com/ByteDance-Seed/Cola-DLM. License: Apache-2.0.
- DLCM / Dynamic Large Concept Models: Qu, X. et al. (2025). arXiv:2512.24617. (Variable-length concept compression; block boundary quality pattern.)
- Yu, Q. et al. (2024). "An Image is Worth 32 Tokens for Reconstruction and Generation." ICLR 2024. arXiv:2406.07550. (TiTok 32-token baseline for seed code target length.)
- Sun, P. et al. (2024). "Autoregressive Model Beats Diffusion: Llama for Scalable Image Generation." arXiv:2406.06525. (LlamaGen; M1B canonical decoder candidate.)

## Boundaries

- Does NOT modify code or schema.
- Does NOT alter doctrine surfaces (ADR-0005, ADR-0018, README, architecture.md).
- Does NOT pick a tokenizer family — defers to #283 radar.
- Does NOT propose new operating-doc text.
