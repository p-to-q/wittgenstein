---
date: 2026-05-22
status: research note (improvement proposals)
labels: [research-derived, m1b-image, adapter, cot, reasoning, improvement]
tracks: [#70, #207, #67, #66]
cross-refs: [ADR-0018, Brief C H9/H10, reserve-paths.md RP-001, 2026-05-22-cola-dlm-implications.md]
---

# CoT-Inspired Improvements for Image Generation

> **Status:** research note. Not doctrine, not active execution guidance.
> Connects chain-of-thought / thinking-model ideas to Wittgenstein's image pipeline.
> Identifies what's already tracked, what's new, and proposes concrete next steps.

## Why this note exists

A maintainer observed that chain-of-thought (CoT) reasoning — where LLMs "think step by step" before answering — may improve Visual Seed Code quality. The intuition: if the LLM reasons through the visual structure before committing to VQ tokens, the tokens should be more stable, more semantically grounded, and more consistent across runs.

This note connects that intuition to three existing tracked items and two new proposals.

---

## What's already tracked

### 1. Two-pass compile (ADR-0018, lane B)

**What it is:** Pass 1 emits Semantic IR only; Pass 2 emits seed code conditioned on that IR.

**How it's CoT:** The first pass is the "thinking" step — the LLM articulates its visual plan in structured text. The second pass is the "answering" step — committing to specific VQ tokens.

**Status:** Ratified as legal lane in ADR-0018. Not implemented (expand phase is no-op in `pipeline/expand.ts`). Tracked as acceptance case in `2026-05-07-vsc-acceptance-cases.md` lane B.

**What's missing:** No implementation, no empirical comparison between one-shot and two-pass quality.

### 2. H10: Long-code clarity (Brief C, lines 113-122)

**What it is:** FIBO-style long-form caption expansion (hundreds to thousands of words) before image generation. The LLM emits 5% of its context window as a detailed "render program."

**How it's CoT:** Extensive "thinking" in natural language before committing to structured output.

**Supporting research:**

- FIBO (Nov 2025, arXiv:2511.06876): Structured long-form captions improve text-to-image alignment
- TIPO (arXiv:2411.08127): Tag-based prompt optimization
- Progress by Pieces (Nov 2025, arXiv:2511.21185): Incremental composition
- Anthropic Extended Thinking: Built-in CoT in frontier models

**Status:** Confidence 0.3 in Brief C. Verdict: "Cheapest hypothesis to run; add optional `--expand` flag." Reserve path RP-001 specifies activation criteria.

**What's missing:** No A/B test data. No `--expand` flag implementation.

### 3. H9: Patch-grid / next-scale IR (Brief C, lines 102-111)

**What it is:** VAR-style coarse-to-fine prediction where each "scale" is a CoT-like refinement step.

**How it's CoT:** Instead of emitting all tokens at once, emit coarse layout first (4x4 = 16 tokens), then refine to medium (8x8 = 64), then fine (16x16 = 256). Each scale conditions on all previous scales.

**Supporting research:**

- VAR (NeurIPS 2024 Best Paper, arXiv:2404.02905): Next-scale prediction beats next-token for images
- FlexTok (ICML 2025, arXiv:2502.13967): Elastic prefixes with any prefix valid

**Status:** Confidence 0.3 in Brief C. Gated on open-weights LFQ decoder. Tracker: #67.

**What's missing:** No open-weights LFQ decoder yet. No implementation.

---

## What's new (not yet tracked)

### 4. Structured visual reasoning before seed code emission

**Proposal:** Before emitting `seedCode.tokens`, have the LLM produce an explicit "visual reasoning" block within the Semantic IR. This is not the two-pass compile (which requires two LLM calls); it's a single-call CoT where the model reasons in the same output.

**Concrete schema addition:**

```json
{
  "semantic": {
    "intent": "Coastal cliffs at sunset",
    "reasoning": {
      "spatialPlan": "Horizon at upper third. Cliffs left-center. Ocean fills right and bottom. Sky dominates upper area.",
      "colorPlan": "Warm oranges and pinks in sky, transitioning to deep blue at horizon. Dark gray-brown cliffs. Dark blue-green ocean.",
      "depthPlan": "Foreground: cliff edge with texture. Midground: ocean surface. Background: sky gradient.",
      "tokenStrategy": "First 8 tokens: sky/horizon/cliff gross layout. Tokens 9-20: ocean and cliff detail. Tokens 21-32: texture and lighting."
    }
  },
  "seedCode": { "tokens": [...] }
}
```

**Why this helps:**

1. Forces the LLM to commit to a spatial and color plan before choosing VQ tokens
2. The `tokenStrategy` field makes the LLM reason about which tokens carry which information — this is essentially the model doing its own "importance ordering"
3. The adapter can use the reasoning fields as additional conditioning (convert to CLIP embeddings)
4. The reasoning is inspectable — if the image fails, we can diagnose whether the failure was in reasoning or in token selection

**Difference from two-pass compile:** Single LLM call, not two. The "reasoning" block is generated autoregressively before the `seedCode` block within the same output. This is exactly how CoT works in text: the model generates its reasoning, then generates its answer, conditioned on that reasoning.

**Cost:** ~50-100 extra tokens of LLM output. No extra LLM call. No new infrastructure.

**Risk:** The LLM may ignore the reasoning block when generating tokens (the reasoning may not actually condition the seed code selection). Empirical test needed.

### 5. Block-causal CoT in the adapter (from Cola-DLM)

**Proposal:** The L4 adapter uses block-causal generation where each block's prediction is conditioned on all previous blocks' resolved tokens PLUS a "planning" representation.

**Concrete mechanism:**

1. Semantic IR → CLIP embedding → "plan vector" (512-dim)
2. Divide 32 target VQ tokens into 4 blocks of 8
3. For block 1: condition on plan vector → predict 8 tokens (bidirectional within block)
4. For block 2: condition on plan vector + block 1's resolved tokens → predict 8 tokens
5. Repeat for blocks 3, 4

**How this is CoT:** The plan vector is the "thought"; each block prediction is a "step" that builds on previous steps.

**Source:** Cola-DLM's block-causal DiT (see `2026-05-22-cola-dlm-implications.md` §1).

**Advantage over fully autoregressive:** Within each block, tokens can attend to each other bidirectionally. This means token 5 in a block is informed by token 8 in the same block, not just tokens 1-4. This reduces the serial dependency length from 32 to 4.

**Cost:** Requires a trained block-causal prediction model in the adapter. Fits within L4 scope. Medium complexity.

---

## Interaction matrix: existing + new proposals

Brief C (lines 111-122) already identifies the natural shape as a 2-axis matrix:

|              | JSON IR (current)                  | Patch-grid IR (H9)             |
| ------------ | ---------------------------------- | ------------------------------ |
| **1 round**  | one-shot VSC (current default)     | one-shot VAR-style multi-scale |
| **2 rounds** | two-pass compile (ADR-0018 lane B) | two-pass + coarse-to-fine      |

Adding the CoT proposals:

|                                     | JSON IR                  | JSON IR + reasoning        | Patch-grid IR             |
| ----------------------------------- | ------------------------ | -------------------------- | ------------------------- |
| **1 round, autoregressive adapter** | Current default          | New proposal #4            | H9 future                 |
| **1 round, block-causal adapter**   | With Cola-DLM adapter    | #4 + #5 combined           | H9 + Cola-DLM             |
| **2 rounds**                        | Two-pass compile         | Two-pass + reasoning       | Two-pass + coarse-to-fine |
| **2 rounds + expand**               | H10 long-code + two-pass | H10 + reasoning + two-pass | Full pipeline             |

The **recommended immediate path** is #4 (structured visual reasoning in single-call) because it:

- Has zero infrastructure cost (just a schema/preamble change)
- Is compatible with all future adapter architectures
- Provides immediate empirical signal on whether CoT helps image planning
- Does not require tokenizer family selection or adapter training

---

## Proposed actions

### Immediate (zero-cost)

1. **Preamble experiment:** Modify the VSC skill preamble to include a `reasoning` block template. Test with frontier LLMs. Measure:
   - Whether the LLM produces coherent spatial/color/depth plans
   - Whether the seed code tokens change when reasoning is included vs excluded
   - Whether image quality (perceptual, via human inspection) improves

2. **`--expand` flag stub:** Add a CLI flag that triggers two-pass compile. Even without a trained adapter, the two-pass flow exercises the harness path and validates the schema.

### Short-term (after tokenizer selection)

3. **Prefix degradation with/without CoT:** Compare TiTok-32 rFID when seed codes come from:
   - Direct one-shot emission (no reasoning)
   - CoT reasoning + emission (proposal #4)
   - Two-pass compile (lane B)
     Measure whether CoT reduces variance in seed code quality.

### Medium-term (after adapter training)

4. **Block-causal adapter (proposal #5):** Implement as a SeedExpander variant. Train on (plan-vector, ground-truth-VQ) pairs. Compare against:
   - Fully autoregressive adapter
   - MaskGIT-style parallel adapter
   - Placeholder expander (baseline)

---

## Connection to the two core concerns

### Concern (a): Seed code stability

CoT directly helps here. If the LLM reasons about spatial layout and token strategy before committing to VQ tokens, the tokens should be:

- More consistent across runs (the reasoning constrains the output)
- More importance-ordered (the model explicitly plans "first 8 tokens = gross layout")
- More robust to temperature variation (the reasoning anchors the distribution)

### Concern (b): IR reliability

CoT provides an additional information channel. Even if the seed code tokens are noisy, the `reasoning` block carries structured visual information that the adapter can use as conditioning. This is a **belt-and-suspenders** approach: the IR carries information through both structured text (reasoning) and discrete tokens (seed code).

---

## What NOT to do

1. **Do NOT add CoT as a mandatory pipeline step.** Keep it optional (`--expand` flag, or schema field). One-shot VSC must remain the fast default path.
2. **Do NOT train a separate "reasoning model."** Use the same LLM — CoT is a prompting strategy, not a model change.
3. **Do NOT block M1B on CoT results.** CoT is an improvement hypothesis, not a prerequisite. M1B should ship with one-shot VSC as default; CoT experiments inform the post-M1B optimization phase.

## Cross-references

- `docs/research/briefs/C_unproven_horizon.md` — H9 (patch-grid), H10 (long-code)
- `docs/reserve-paths.md` — RP-001 (two-round interaction)
- `docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md` — Two-pass compile lane
- `docs/research/2026-05-22-cola-dlm-implications.md` — Block-causal adapter source
- `docs/research/2026-05-22-seed-code-stability-analysis.md` — Stability concern
- `docs/research/2026-05-22-ir-reliability-validation.md` — IR reliability concern
- `docs/research/visual-seed-code-skill-playbook.md` — Current preamble design

## Boundaries

- This note started as a proposal. A follow-up #454 implementation may modify the
  image schema / preamble to add optional `semantic.reasoning`; that code change
  should be reviewed as an experiment hook, not doctrine.
- Does NOT alter doctrine surfaces.
- Does NOT require new infrastructure for the immediate proposals.
