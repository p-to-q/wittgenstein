---
date: 2026-05-22
status: research note (concern analysis + validation plan)
labels: [research-derived, m1b-image, ir-design, validation, concern]
tracks: [#283, #70, #207, #258]
cross-refs: [ADR-0018, ADR-0006, vsc-as-compression-prior.md, hybrid-image-code.md]
severity: high — existential for the harness thesis
---

# IR Reliability: Can the Intermediate Representation Carry Real Visual Information?

> **Status:** research note addressing a maintainer-raised concern.
> The concern: Wittgenstein's IR (Semantic IR + Visual Seed Code) is a _harness-level_ construct, not a _model-level_ representation. It may not be able to carry enough real visual information for the frozen decoder to produce meaningful images. This note assesses the risk, identifies what "enough information" means for each IR layer, and proposes a concrete validation plan.

## The concern, stated precisely

Wittgenstein defines two IR layers for image (per ADR-0018):

1. **Semantic IR** — structured JSON describing intent, subject, composition, lighting, style, constraints. Emitted by the LLM. Human-readable, inspectable.
2. **Visual Seed Code** — a short sequence of discrete tokens (target: 32-128). Emitted by the LLM. Decoder-facing, opaque to humans.

The concern has two parts:

**(a) Semantic IR may be "empty calories":** The LLM can produce beautifully structured JSON describing a scene, but the adapter may not be able to extract actionable visual information from text fields like `"mood": "warm golden"` or `"depthPlan": "foreground subject, blurred background"`. These are human-readable descriptions, not machine-actionable features.

**(b) Visual Seed Code may not carry real decoder information:** The LLM emits VQ token IDs, but those IDs may not correspond to what the decoder actually needs. The LLM has never seen the VQ codebook; it's guessing token IDs based on text-domain priors.

If both (a) and (b) fail, the IR is a conduit for format compliance, not information.

---

## Analysis

### Part (a): Semantic IR information capacity

**Current state:** The `ImageSceneSpec` schema defines rich semantic fields, but they are **largely unused** in the pipeline. The adapter's MLP feature engineering hashes the entire spec to a 128-dim float vector (SHA256 → byte-to-float mapping). This is a **lossy, semantically meaningless** encoding — it treats the spec as an opaque blob, not as structured semantic input.

**What would make Semantic IR reliable:**

1. **Structured embeddings:** Instead of hashing, use a pretrained text encoder (CLIP, SigLIP) to embed semantic fields into a vector space where "warm golden lighting" is meaningfully close to "sunset" and far from "fluorescent office." This is standard in text-to-image pipelines.

2. **Field-level conditioning:** Route specific fields to specific adapter components. Composition fields → spatial layout predictor. Style fields → palette predictor. Subject fields → object presence predictor. This is what Stable Diffusion's CLIP conditioning does (text embedding conditions the U-Net at multiple scales).

3. **Validation metric:** Semantic IR is reliable if and only if: changing a semantic field (e.g., "lighting.mood" from "warm" to "cold") produces a measurable change in the output image that aligns with the semantic change. If changing "warm" to "cold" produces no visible difference, the field is not carrying information.

**Assessment:** Semantic IR is currently **format-compliant but information-empty** in the pipeline. The fix is well-understood (use pretrained embeddings, not hashing) and is standard practice in the text-to-image literature. This is an adapter engineering problem, not a fundamental limitation.

### Part (b): Visual Seed Code information capacity

This is the harder question. Three scenarios:

#### Scenario B1: LLM emits valid VQ token IDs (encoder-matching distribution)

**If** the LLM can be trained or prompted to emit token IDs whose distribution matches what a published VQ encoder would produce for similar images, then the seed code carries real decoder information.

**Evidence for:** DALL-E 1 (Ramesh et al., 2021) demonstrated that a 12B autoregressive transformer can learn to predict VQ tokens from text conditioning. LlamaGen (Sun et al., 2024) showed this with a standard LLaMA architecture at 2.18 FID. SEED tokenizer (Ge et al., 2023) trained codebooks to be semantically aligned with language.

**Evidence against:** These models were **trained** on paired (text, image-token) data. Wittgenstein's thesis is that a **frozen** text LLM can emit valid tokens via prompting alone (or with a small adapter), without paired training data.

**Testable prediction (from `vsc-as-compression-prior.md` prediction 1):** Compare the distribution of tokens emitted by a frozen LLM (prompted with VSC preamble) against the distribution produced by a published encoder on similar images. If the distributions are unrelated, the frozen-LLM-as-prior bet is broken.

#### Scenario B2: LLM emits semantically meaningful but decoder-misaligned tokens

**If** the LLM's token choices carry semantic structure (e.g., similar prompts → similar token sequences) but don't align with any published decoder's codebook, then a **trained adapter** can bridge the gap.

This is the **most likely scenario** and is what Wittgenstein's L4 adapter is designed for. The adapter learns the projection from "LLM's semantic token space" to "decoder's VQ codebook space." This is a low-dimensional problem (per `vq-tokens-as-interface.md` §4).

**What makes this reliable:** The adapter's training data must include paired (LLM-emitted-tokens, encoder-derived-ground-truth-tokens) samples. The adapter learns the mapping; the decoder handles reconstruction.

**Risk:** If the LLM's token distribution has no structure (effectively random), the adapter has nothing to learn from. The mapping becomes a lookup table, not a generalizable function.

#### Scenario B3: LLM emits essentially random token IDs

**If** the frozen LLM has no useful prior over visual token distributions — the IDs are arbitrary numbers unrelated to visual content — then the Visual Seed Code is informationless.

**In this scenario:** The VSC-as-compression-prior thesis fails. The recovery path is:

- Fall back to Semantic IR as the sole information carrier
- Use a strong adapter (not just MLP, but a full text-to-token model like the SEED tokenizer's projection head) to convert semantic text → VQ tokens
- The LLM's "seed code" becomes a random seed for the adapter, not meaningful input

**This is not catastrophic** — it means the LLM contributes through semantic planning, not through direct visual coding. The architecture still works; the thesis is just weaker.

---

## What makes the IR "solid" — concrete criteria

### Criterion 1: Semantic IR must change the output

**Test:** Generate images with identical seed codes but different Semantic IR fields. Measure LPIPS (perceptual distance) between outputs.

- If LPIPS ≈ 0 (same image regardless of Semantic IR): IR is not carrying information.
- If LPIPS > 0.1 and changes align with semantic field changes: IR is carrying information.

**Requires:** A trained adapter that actually uses Semantic IR (not the current SHA256-hash feature engineering).

### Criterion 2: Seed code must correlate with image content

**Test:** For a fixed prompt, collect N seed codes from different LLM runs (temperature > 0). For each seed code, run through encoder → decoder to get the "ground truth" image. Measure:

- Mutual information between seed code token distribution and image content features (CLIP embedding)
- If MI ≈ 0: seed code is noise
- If MI > 0: seed code carries image information

**Requires:** A published encoder for the chosen tokenizer family + the LLM emission corpus.

### Criterion 3: Adapter must generalize

**Test:** Train adapter on 80% of (prompt, seed-code, ground-truth-VQ) triples. Evaluate on held-out 20%.

- If held-out rFID is within 2x of training rFID: adapter generalizes, IR pipeline is reliable.
- If held-out rFID is >>2x: adapter is memorizing, not learning a generalizable mapping.

**Requires:** Adapter training infrastructure (research program Track 1).

### Criterion 4: End-to-end prompt fidelity

**Test:** Generate 1000 images from diverse text prompts. Measure CLIPScore (text-image alignment) and compare against:

- Baseline 1: Random VQ tokens → decoder (lower bound)
- Baseline 2: Published encoder → decoder (upper bound, oracle)
- Wittgenstein pipeline: LLM → seed code → adapter → decoder

- If Wittgenstein CLIPScore ≈ random baseline: IR is not carrying information end-to-end.
- If Wittgenstein CLIPScore is between baselines and closer to oracle: IR is working.

**Requires:** Full pipeline with trained adapter + frozen decoder (M1B).

---

## Validation timeline

| Phase              | What                                                                                                                             | When                                   | Blocks on                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------- |
| **Phase 0** (now)  | LLM emission distribution analysis: prompt LLM 100x, collect seed codes, measure entropy and structure                           | Immediate                              | Nothing — uses current preamble + any frontier LLM |
| **Phase 0b** (now) | Semantic IR field sensitivity: with current Visual Seed Code seed-expander path, vary one field at a time, measure output change | Immediate                              | Nothing — uses current code                        |
| **Phase 1** (M1B)  | Criterion 2: Seed code ↔ image content mutual information                                                                        | After tokenizer family selected (#283) | Tokenizer selection                                |
| **Phase 2** (M1B)  | Criteria 1, 3, 4: Full adapter training + held-out eval + CLIPScore                                                              | After adapter training infrastructure  | Research program Track 1                           |

### Phase 0 actions (can execute now)

**Action 0a: LLM emission entropy test**

Prompt a frontier LLM with the VSC preamble for 10 different image prompts, 10 runs each at temperature=0.3. For each prompt:

1. Collect the `seedCode.tokens` arrays (10 arrays per prompt)
2. Compute per-position token entropy across runs (H = -sum p log p)
3. Compute inter-run Hamming distance

**Expected results and what they mean:**

- High entropy at all positions → LLM is guessing randomly → Scenario B3 (bad)
- Low entropy at early positions, high at late → LLM has structure in early tokens → Scenario B2 (workable)
- Low entropy everywhere → LLM has strong prior → Scenario B1 (ideal)

**Action 0b: Semantic IR field sensitivity**

Using the current Visual Seed Code seed-expander path:

1. Fix all fields except one (e.g., `lighting.mood`)
2. Generate images with `mood = "warm golden"` vs `mood = "cold fluorescent"`
3. Compare output PNGs pixel-by-pixel

**Expected result:** With the current per-spec hash seed, the outputs WILL differ (different hashed scene fields → different seed-expander input → different image). But the difference will be random, not semantically meaningful. This establishes the **baseline** against which a trained adapter can be measured.

**Implementation status (2026-05-31):** `research/validation/phase0b_semantic_ir_sensitivity.ts`
turns this into a repeatable receipt. It records token and PNG-byte deltas
across varied Semantic IR fields and labels the result explicitly as a
Visual Seed Code seed-expander hash baseline. This is intentionally weaker
than the later CLIP/SigLIP criterion: it proves the current output changes when
fields change, while also preserving the finding that the changes are
hash-driven rather than semantically aligned. Separately, the v0.1 learned MLP
runtime now declares the SHA feature schema
(`witt.image.adapter.features/sha256-canonical-json-v0`) so future CLIP/SigLIP
adapters cannot silently reuse the baseline contract.

---

## The deeper question: is a harness-level IR fundamentally limited?

The maintainer's concern touches a deeper issue: Wittgenstein defines IR as a **harness construct** (L2 layer), not a **model construct** (inside the LLM). This means:

- The IR schema is designed by humans, not learned from data
- The IR's information capacity is bounded by the schema fields and the LLM's ability to fill them meaningfully
- The IR cannot represent visual information that the schema doesn't have fields for

**Contrast with end-to-end models:** In DALL-E 3 or Stable Diffusion 3, the "IR" is a continuous embedding vector learned end-to-end. It can represent arbitrary visual information because it's not constrained by a human-designed schema.

**Defense of the harness approach:**

1. The schema is not the bottleneck — the **VQ codebook** is. A 4096-entry codebook with 32 tokens gives 4096^32 ≈ 10^115 possible images. The schema adds structured conditioning on top of this already-vast space.

2. The adapter can learn to extract information from schema fields that humans didn't explicitly design for. A CLIP embedding of `"stormy ocean at midnight with lightning"` carries visual information even though no schema field says "lightning position" or "wave height."

3. The harness approach is **inspectable** — you can read the IR and understand what the LLM planned. End-to-end embeddings are opaque. This inspectability is a product feature (per THESIS.md), not a compromise.

**Honest limitation:** If the desired visual output requires information that is not expressible in text (e.g., the exact spatial frequency content of a texture), the harness IR cannot carry it. The adapter must hallucinate this from its training distribution. This is also true of text-to-image models — they hallucinate texture details from training data, not from the prompt.

---

## Verdict

**The concern is legitimate but not fatal.**

- **Semantic IR** is currently format-compliant but information-empty in the pipeline. The fix (pretrained text embeddings) is well-understood and standard. Estimated effort: adapter architecture change, not doctrine change.

- **Visual Seed Code** reliability is an empirical question with three possible outcomes (B1/B2/B3). The most likely outcome (B2: semantically structured but decoder-misaligned) is exactly what the L4 adapter is designed to handle.

- **The harness-level IR is not fundamentally limited** — it can carry as much information as the VQ codebook can represent, conditioned on text that a frontier LLM can produce.

**What would change the verdict:**

- Phase 0a shows Scenario B3 (random LLM emission) → VSC thesis weakened, pivot to semantic-only + strong adapter
- Phase 2 shows Criterion 4 failure (CLIPScore ≈ random baseline) → IR pipeline not carrying information end-to-end

**Recommended actions:**

1. Execute Phase 0a and 0b immediately (no dependencies)
2. Add "prefix degradation curve" and "emission distribution analysis" to the M1B prep checklist
3. Upgrade adapter feature engineering from SHA256-hash to CLIP/SigLIP embedding (tracked as adapter architecture decision). The v0.1 MLP runtime now declares `featureSchema: witt.image.adapter.features/sha256-canonical-json-v0`; CLIP/SigLIP-conditioned adapters require a new runtime contract rather than silently reusing the SHA baseline.
4. File issue for Semantic IR field-sensitivity baseline measurement

## Cross-references

- `docs/research/2026-05-08-vsc-as-compression-prior.md` — Predictions 1-4 (this note operationalizes them)
- `docs/research/2026-05-22-seed-code-stability-analysis.md` — Companion note on token-level stability
- `docs/research/2026-05-22-cola-dlm-implications.md` — Cola-DLM's continuous latent as comparison point
- `docs/research/hybrid-image-code.md` — Hybrid architecture original design
- `docs/adrs/0006-layered-epistemology.md` — IR = Text | Latent | Hybrid sum type
- `docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md` — VSC first-class ratification
- `docs/research/briefs/B_compression_vs_world_models.md` — Kill criterion 2 (compositional ceiling)

## Boundaries

- Does NOT modify code or schema.
- Does NOT alter doctrine surfaces.
- Does NOT claim the IR is or isn't reliable — proposes how to find out.
