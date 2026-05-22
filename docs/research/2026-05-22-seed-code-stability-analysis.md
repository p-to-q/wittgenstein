---
date: 2026-05-22
status: research note (concern analysis + mitigation proposals)
labels: [research-derived, m1b-image, adapter, stability, concern]
tracks: [#283, #70, #207, #334]
cross-refs: [ADR-0018, vsc-as-compression-prior.md, 2026-05-22-cola-dlm-implications.md]
severity: high — load-bearing on the VSC thesis
---

# Seed Code Stability: First-Token Sensitivity Analysis

> **Status:** research note addressing a maintainer-raised concern.
> The concern: if the LLM's first 5-15 seed code tokens are unstable or inconsistent across runs, the entire Visual Seed Code architecture may fail to produce reliable images. This note analyzes the failure modes, connects to published research, and proposes concrete mitigations.

## The concern, stated precisely

Wittgenstein's image path asks a frozen text LLM to emit Visual Seed Code — a short sequence of discrete tokens (target: 32-128 tokens for TiTok/VQGAN-class). The seed expander / adapter then maps these to a full decoder-native token grid, and a frozen decoder reconstructs pixels.

**The stability question:** Given the same text prompt and the same system preamble, will the LLM emit the same (or semantically equivalent) seed code tokens?

This decomposes into three sub-questions:

1. **Token-level consistency:** Does the same prompt → same VQ token IDs? (Requires temperature=0 or fixed seed.)
2. **Semantic consistency:** Do different token IDs from the same prompt produce perceptually similar images? (Requires the VQ codebook to have smooth neighborhoods.)
3. **Prefix sensitivity:** If the first k tokens are correct but the rest diverge, does the image degrade gracefully or catastrophically?

### Why this matters

If the answer to all three is "no" — the LLM emits different tokens each time, the tokens don't have smooth neighborhoods, and small prefix errors cascade — then the VSC thesis is broken. The LLM is not a useful "prior over compressed visual programs" (see `vsc-as-compression-prior.md` prediction 1); it's a random number generator dressed in JSON.

---

## Analysis of each sub-question

### Sub-question 1: Token-level consistency

**Current state:** Text LLMs are deterministic at temperature=0 given identical input. Wittgenstein's manifest spine already pins the seed and full LLM I/O. So at temperature=0, the same prompt + same model + same system preamble → identical output tokens.

**But:** Temperature=0 is not always desirable. For creative image generation, users want variation. At temperature > 0, the LLM will emit different token sequences for the same prompt.

**Mitigation already in architecture:** The manifest records the exact LLM output, so any run is reproducible. The question shifts to: are the different outputs from temperature > 0 all "good" outputs?

**Assessment:** Token-level consistency is **solved** at temperature=0 by construction. At temperature > 0, consistency is a property of the LLM's learned distribution over seed codes, which is an empirical question (see prediction 1 in `vsc-as-compression-prior.md`).

### Sub-question 2: Semantic consistency (VQ codebook smoothness)

**The worry:** Two nearby VQ codebook entries might decode to wildly different visual features. If the LLM picks codebook entry 42 instead of 41, does the image change slightly or catastrophically?

**Published evidence:**

- **VQGAN codebooks** are trained with perceptual + adversarial loss, which encourages smooth codebook neighborhoods (nearby entries encode similar visual features). Esser et al. (2021) show this implicitly through interpolation experiments.
- **TiTok** uses a 4096-entry codebook with 16 channels. The proxy-code training (Stage 1) further regularizes the codebook because it trains against an existing VQGAN's distribution, not raw pixels.
- **FSQ (Finite Scalar Quantization)** has the strongest smoothness guarantee: each dimension is independently quantized to integer levels, so adjacent codes differ by exactly 1 on one dimension. This makes the codebook a regular grid with predictable neighborhoods.
- **VQ-VAE commitment loss** (van den Oord 2017) pulls encoder outputs toward codebook entries, implicitly regularizing the codebook to be smooth (unused entries collapse, active entries spread to cover the data manifold).

**Assessment:** Modern VQ codebooks are **moderately smooth** — adjacent entries usually encode similar features. However, the codebook is not a continuous manifold; there can be "gaps" where small index changes cause large visual changes. FSQ has the best smoothness guarantee.

**Implication for tokenizer selection:** FSQ-based decoders (Open-MAGVIT2) or TiTok (proxy-code trained) are preferred over raw VQGAN for seed code stability. This is an additional selection criterion for #283.

### Sub-question 3: Prefix sensitivity (the core concern)

**The worry:** In autoregressive generation, errors in early tokens compound. If token 3 is wrong, tokens 4-32 condition on a wrong context and diverge. By token 32, the image may be completely unrelated to the prompt.

**This is the most serious of the three sub-questions.**

**Published evidence on error compounding:**

1. **LeCun's critique (Brief B, lines 38-43):** "Errors compound exponentially" in autoregressive models. LeCun argues this is a fundamental limitation of left-to-right generation.

2. **Cola-DLM's block-causal solution:** By generating in blocks with bidirectional attention within blocks, Cola-DLM limits error propagation to block boundaries. Errors within one block cannot propagate backwards within the block.

3. **MaskGIT (Chang et al., 2022):** Non-autoregressive iterative decoding. All tokens are predicted simultaneously, then the least-confident tokens are re-masked and re-predicted. This breaks the sequential dependency entirely. TiTok uses MaskGIT as its generation method (8 steps, arccos schedule).

4. **VAR (next-scale prediction):** Errors at coarse scales propagate to fine scales, but fine-scale errors do not propagate to coarse scales. The hierarchy provides natural error containment.

5. **FlexTok elastic prefixes:** Any prefix length produces a valid reconstruction. This means the first k tokens are a self-contained representation, not dependent on tokens k+1...N. Error in token k+1 does not affect the meaning of tokens 1...k.

**Assessment:** Prefix sensitivity is a real risk for **autoregressive** seed code generation but is **mitigable** through architectural choices in the seed expander.

---

## Proposed mitigations (ranked by implementation cost)

### Mitigation 1: MaskGIT-style parallel seed expansion (RECOMMENDED)

**Instead of** expanding seed code autoregressively (token 1 → token 2 → ... → token 32), **use** masked iterative prediction:

1. Start with all positions masked except the seed positions (known from LLM output)
2. Predict all masked positions in parallel (one forward pass)
3. Keep the most-confident predictions, re-mask the rest
4. Repeat for 8 steps (per TiTok's optimal setting)

**Why this solves the concern:** No sequential dependency. Errors in one position do not cascade to others. Each iteration refines all positions simultaneously.

**Cost:** Requires a trained masked prediction model (~86M params for TiTok-B). Fits within L4 adapter scope.

**Compatibility:** Fully compatible with ADR-0005 (the masked predictor is a trained adapter, not a generator; the frozen decoder is still deterministic). Fully compatible with ADR-0018 (seed code positions are the "known" mask).

### Mitigation 2: Clean-repaint conditioning (FROM COLA-DLM)

**When** the LLM emits a partial seed (k < 32 tokens), **pin** those k positions to their known VQ indices throughout all expansion steps. Only predict the remaining 32-k positions.

**Why this helps:** The known seed tokens cannot be corrupted by the expansion process. They act as structural anchors that constrain the predicted tokens.

**Cost:** Minimal — extends the SeedExpander interface with a binary mask parameter. The expansion model must support conditioning on known positions (standard in MaskGIT and diffusion models).

**Compatibility:** Already anticipated by the `SeedExpander` ABI in `adapters/seed-expander.ts`.

### Mitigation 3: Importance-ordered tokenizer selection

**Select** a tokenizer family where early tokens in the sequence carry more structural information than later tokens (VAR, FlexTok, TiTok-1D).

**Why this helps:** Even if later tokens are noisy or wrong, the first tokens already specify the gross structure. The image degrades gracefully rather than catastrophically.

**Cost:** Zero implementation cost — this is a tokenizer selection criterion for #283. Adds a column to the radar audit.

**How to test:** For each candidate tokenizer, measure rFID as a function of prefix length:

- rFID(32 tokens) — full quality
- rFID(16 tokens, rest zero-filled) — half quality
- rFID(8 tokens, rest zero-filled) — quarter quality
- rFID(4 tokens, rest zero-filled) — minimal quality

A "good" tokenizer for Wittgenstein shows smooth rFID degradation. A "bad" one shows a cliff (e.g., rFID jumps from 5 to 50 between 16 and 8 tokens).

### Mitigation 4: Two-pass compile (ALREADY IN ADR-0018)

**Pass 1:** LLM emits Semantic IR only (no VQ tokens). This is a structured text description of the scene — robust to formatting errors, inspectable, debuggable.

**Pass 2:** Given the validated Semantic IR, emit seed code. The LLM now has a clear "spec" to work from, reducing the chance of emitting nonsensical VQ tokens.

**Why this helps on stability:** The first pass produces stable text (LLMs are good at text). The second pass conditions on that stable text, reducing variance in the VQ token output.

**Cost:** 2x LLM inference cost. Already ratified as legal by ADR-0018. Currently not implemented (expand phase is a no-op in `pipeline/expand.ts`).

### Mitigation 5: Adapter robustness training (longer-term)

**Train** the L4 adapter with deliberate input corruption:

- Drop random seed tokens (simulate partial emission)
- Swap random tokens to adjacent codebook entries (simulate LLM errors)
- Truncate the seed to various prefix lengths

The adapter learns to produce reasonable outputs even when the input seed is imperfect.

**Cost:** Requires adapter training infrastructure (tracked in research program). Medium-term.

---

## Empirical validation plan

### Phase 0: Can do now (no trained models needed)

1. **Placeholder expander degradation test:** Feed the placeholder seed expander seeds of length 32, 16, 8, 4, 2. Compare the output latent grids. Do they show structured differences or random noise?
   - If structured: the SeedExpander ABI at least doesn't destroy information.
   - If random: the placeholder is too simplistic to evaluate degradation (expected).

2. **LLM emission consistency test:** Prompt a frontier LLM (GPT-5, Claude) 10 times with the same image prompt + VSC preamble at temperature=0.3. Collect the emitted seed code tokens. Measure:
   - Token-level agreement rate across runs
   - Hamming distance between runs
   - Whether disagreements cluster in early or late positions

### Phase 1: After M1B decoder lands

3. **Prefix truncation rFID curve:** For the chosen tokenizer (likely TiTok or LlamaGen), measure reconstruction quality as seed code is progressively truncated. This is the definitive test of whether partial seed codes produce graceful degradation.

4. **Cross-run perceptual similarity:** Generate images from 10 different seed codes for the same prompt. Measure LPIPS (learned perceptual similarity) between all pairs. If perceptual similarity is high despite token-level differences, the system is semantically stable even without token-level consistency.

---

## Connection to the SVD framing

The SVD note (`2026-05-22-svd-low-rank-and-vq-tokens.md`) frames seed code as a discrete low-rank approximation. The stability concern maps to: **is the "rank-k approximation" (first k seed tokens) a robust representation, or is it fragile to perturbation?**

SVD rank-k approximation is provably optimal and robust (Eckart-Young theorem). VQ tokenization has no such guarantee. The mitigations above are engineering strategies to approximate SVD's robustness properties in the discrete VQ setting.

## Verdict

**The concern is legitimate and load-bearing.** If first-token stability fails empirically, the VSC thesis has a serious problem.

**But:** Multiple mitigation strategies exist, and the most effective ones (MaskGIT-style parallel expansion, importance-ordered tokenizer selection, clean-repaint conditioning) are architecturally compatible with the locked doctrine. The concern motivates specific tokenizer selection criteria and adapter design choices, not a doctrine change.

**Recommended priority:**

1. Add "prefix degradation curve" as a mandatory radar criterion for #283
2. Implement clean-repaint conditioning in the seed expander ABI
3. Select an importance-ordered tokenizer (FlexTok > TiTok > VAR > VQGAN)
4. Design the M1B adapter as MaskGIT-style parallel predictor, not autoregressive

## Cross-references

- `docs/research/2026-05-08-vsc-as-compression-prior.md` — Predictions 1-4 (testable consequences)
- `docs/research/2026-05-22-cola-dlm-implications.md` — Clean-repaint and block-causal sources
- `docs/research/2026-05-22-svd-low-rank-and-vq-tokens.md` — Mathematical framing
- `docs/research/2026-05-07-vsc-acceptance-cases.md` — Acceptance test matrix
- `docs/research/briefs/C_unproven_horizon.md` — H9 (patch-grid / VAR) and H10 (long-code)
- `docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md` — Two-pass compile lane

## Boundaries

- Does NOT modify code or schema.
- Does NOT change the locked doctrine.
- Does NOT pick a tokenizer family — proposes selection criteria.
