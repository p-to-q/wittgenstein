---
date: 2026-05-08
status: research note
labels: [research-derived, m1-image, theoretical-anchor]
tracks: [#205, #258, #255]
---

# Visual Seed Code as Compression-Prior + Decompressor

> **Status:** research note (not doctrine, not active execution guidance).
> Theoretical anchor for the Visual Seed Code direction. Frames why VSC is a defensible research bet — independent of which tokenizer family wins the radar in #258. Pins nothing as doctrine; commits no implementation.
> _Tracker: [#255](https://github.com/p-to-q/wittgenstein/issues/255), gates [#258](https://github.com/p-to-q/wittgenstein/issues/258)._

## Why this note exists

The Visual Seed Code correction (RFC-0006, ADR-0018) ratified the *architecture*: LLM emits a compact discrete code, runtime expands it to decoder-native latents, frozen decoder reconstructs pixels. What it did not produce is the *theoretical defense*: why this ought to work at all, what published research traditions it inherits from, and which assumptions it would need to falsify before the architecture is honestly positioned.

Without a theoretical anchor, the VSC direction reads as ergonomic engineering — "JSON is easier than pixels for LLMs to emit, let's use that." That's true but thin. With an anchor, it reads as a particular bet within a broader research lineage: **the LLM is a strong prior over compressed visual programs; the decoder is the decompressor; the seed code is the program the prior emits.**

This note states that bet, places it within named research traditions with citations, and lists what the bet *does not* defend.

## The architecture, in one paragraph

A *visual seed code* is a short, discrete, decoder-aligned representation. The LLM emits it as JSON. A deterministic runtime (`SeedExpander`) expands the seed into the decoder's native token grid — possibly through learned projection (#70), possibly through the placeholder fill that ships today. A frozen decoder reconstructs the pixel array. The *whole pipeline is the decompressor*; the LLM's job is to be a good prior over what to compress *to*.

The question this note addresses: **why might that be worth doing instead of fine-tuning a multimodal model end-to-end on pixels?**

## Three published research traditions this inherits from

### 1. The compression-as-intelligence framing (Sutskever)

Sutskever has argued in multiple talks that "compression is intelligence" — the claim is that a model that compresses a stream of tokens well must have learned the stream's generative structure. Predicting the next token under cross-entropy loss is *literally* arithmetic-code compression in expectation; a perfect predictor is a perfect compressor.

The VSC direction inherits this framing in a specific way: instead of asking the LLM to compress *pixels*, ask it to compress *to* a discrete code that a downstream component already knows how to decompress. The LLM still does the hard part (the prior over plausible visual structures); the decoder handles the structure-to-pixels expansion that the LLM is bad at.

> **Citations / verify-status.** The compression-intelligence framing has many talk versions and no canonical short paper. The cleanest written version is the introduction to Hutter (2007), *Universal AI*, which formalizes the AIXI agent under Solomonoff induction; the modern LLM-specific framing appears in MacKay (2003) *Information Theory, Inference, and Learning Algorithms* and is repeatedly invoked in talks by Sutskever and others. The specific claim *"next-token prediction = compression"* is straightforward arithmetic-coding reasoning and does not need a paper-citation. This note treats the framing as a useful frame, not as a settled empirical fact.

### 2. Predict representations, not pixels (LeCun / JEPA)

LeCun's position paper *"A Path Towards Autonomous Machine Intelligence"* (2022, OpenReview) argues that predictive models for visual content should predict in *representation space* rather than pixel space — generative models that try to reconstruct pixel-perfect output are wasting capacity on irreducible noise. The Joint Embedding Predictive Architecture (JEPA) family operationalizes this by predicting embeddings from masked context.

The VSC direction inherits the same intuition through a different mechanism: the LLM is asked to emit a *representation* (the seed code), not pixels. The decoder is the only component that touches pixels, and it does so deterministically given a code. This is structurally similar to JEPA's "predict latents, not pixels" position even though VSC's representations are discrete codes rather than continuous embeddings.

> **Citations.** LeCun (2022), *"A Path Towards Autonomous Machine Intelligence"* (OpenReview). I-JEPA: Assran et al. (2023), *"Self-Supervised Learning from Images with a Joint-Embedding Predictive Architecture"* (CVPR 2023, arXiv:2301.08243). V-JEPA: Bardes et al. (2024), *"Revisiting Feature Prediction for Learning Visual Representations from Video"* (arXiv:2404.08471). All three are public preprints. The connection to VSC is structural, not citational — neither paper discusses VSC-shaped systems.

### 3. Discrete visual tokens as a language-model interface (VQ-VAE, ViT, VLMs)

The path from "images are pixel grids" to "images are discrete code sequences" is well-trodden:

- **VQ-VAE** (van den Oord et al., NeurIPS 2017, arXiv:1711.00937) introduced discrete latent codes via vector quantization with a learned codebook.
- **VQGAN** (Esser et al., CVPR 2021, arXiv:2012.09841) added adversarial loss for sharper reconstructions.
- **ViT** (Dosovitskiy et al., ICLR 2021, arXiv:2010.11929) showed that flat patches-as-tokens is sufficient for image classification with transformers.
- **DALL-E 1** (Ramesh et al., 2021, arXiv:2102.12092) trained an autoregressive transformer over VQ-VAE codes, demonstrating that discrete-code prediction by a language-model-shaped network can produce coherent images.
- **VLMs** (BLIP-2: Li et al., ICML 2023, arXiv:2301.12597; LLaVA: Liu et al., NeurIPS 2023, arXiv:2304.08485) showed that frozen LLMs can be steered by visual representations through small bridge adapters.
- **VAR** (Tian et al., NeurIPS 2024, arXiv:2404.02905) demonstrated next-scale token prediction beats next-token prediction for visual generation, validating that token *ordering* matters.
- **TiTok** (Yu et al., ICLR 2024, arXiv:2406.07550) showed that 32 tokens can suffice to reconstruct a 256² image — extreme compression with rFID < 2.

VSC takes the union of these results and bets that:

- The *frozen LLM* (not a fine-tuned multimodal model) can emit valid discrete visual codes when prompted in a structured JSON format.
- The discrete-code grid can be small enough (32–1024 tokens depending on tokenizer family) to fit in a JSON response.
- The frozen decoder can reconstruct from those codes with quality bounded by tokenizer-family choice, not by LLM capacity.

> **Citations.** All papers above are public preprints. License and weights for the *paired tokenizer + decoder* assets are tracked separately in #238 and #254 (with explicit `unknown` / `unclear` flags where local audit hasn't happened).

## What this framing predicts (testable consequences)

A research bet is honest only if it lists what evidence would falsify it. The VSC-as-compression-prior framing predicts:

1. **Frozen-LLM emission of valid VSC sequences should be measurable.** Not "does it produce JSON" — that's just format compliance — but "does the JSON's `seedCode.tokens` distribution match what a published encoder would produce on similar images?" If frozen LLMs emit token distributions that look nothing like the encoder's natural distribution, the LLM is *not* a useful prior over compressed visual programs.
2. **Decoder receipt fidelity should be byte-pinnable on a fixed (codebook, decoder, seed) tuple.** If the decoder is genuinely deterministic given fixed inputs, two runs with the same seed code should produce byte-identical pixel outputs. Random behavior here would mean the "decompressor" is not actually a function in the mathematical sense, and the receipt story collapses.
3. **Compact codes (TiTok-class, ≤64 tokens) should be feasible without quality cliffs.** If the published rFID-stays-low-at-32-tokens claim doesn't replicate when the LLM (rather than the encoder) emits the codes, the bet on compact codes is broken — even if the decoder reconstructs cleanly when *encoded* tokens are passed in.
4. **The `coarseVq → seedCode` two-pass should improve emission reliability.** If a coarse layout (e.g. 4×4 = 16 tokens) is emitted first and then refined, the LLM should emit more valid full sequences than in one shot. If two-pass shows no measurable improvement, the "scaffold then enhance" framing the user named is empirically thin.

Items 1 and 2 are testable today (1 needs a published encoder reference + one VLM emission corpus; 2 needs only a frozen decoder pinned by SHA). Items 3 and 4 require the radar (#258) to lock the tokenizer family first.

## The ASCII-art lens (pedagogical, not formal)

A useful informal lens for non-research readers: an image's ASCII-art rendering is itself a compressed visual code. ASCII art works because images have low-Kolmogorov-complexity structure — large regions, repeating textures, edge contours — that a small alphabet of symbols can capture sparsely. The reverse direction (ASCII art → image) is underdetermined: many pixel arrays map to the same ASCII art. To go back, you need a *prior* over plausible expansions — and that prior is exactly what a strong decoder provides.

VSC sits in the same conceptual position but with higher fidelity:

- **ASCII art:** ~ 80×24 = 1,920 grid positions × ~6 bits of per-cell information ≈ 12kbit; recognizable but lossy; decompression-prior needed for sharpness.
- **VSC (TiTok-class):** 32 tokens × ~14 bits each ≈ 450 bits; needs a paired neural decoder to expand; quality bounded by tokenizer training.
- **VSC (VQGAN-class):** 1,024 tokens × ~13 bits each ≈ 13kbit; needs the matching VQGAN decoder; closer to ASCII art's "many bits, modest decoder needs."

The ASCII art comparison is informal — Kolmogorov complexity is uncomputable, and "bits per token" is not a clean measure of representational power. But the *structural insight* is right: pre-specifying the rough shape and ordering with a small symbolic code, then letting a stronger decompressor fill in the high-frequency content, is a known and effective strategy. VSC bets that LLMs are good at producing the small symbolic code part.

> **Citations.** Kolmogorov complexity formal background: Li & Vitányi (2008), *"An Introduction to Kolmogorov Complexity and Its Applications"*, 3rd ed., Springer (textbook, not a paper, no arXiv). The ASCII-art-as-compression observation is folklore; no canonical paper. This section is presented as pedagogical scaffolding, not load-bearing evidence.

## What this framing does NOT defend

Honesty discipline (per #254 r2 review): a research note's value is in what it explicitly does not claim.

- **It does not claim VSC will outperform diffusion or end-to-end multimodal models on pixel-level quality benchmarks.** The compression-prior framing is about *architectural elegance and inspectability*, not about beating SOTA on FID. If the goal is solely "best image quality on a benchmark," fine-tuning an end-to-end model is a different and possibly better bet.
- **It does not claim a particular tokenizer family is best.** The radar (#258) is the proper home for that question. This note's framing is family-agnostic — it would still hold even if the eventual choice were SPAE rather than VQGAN.
- **It does not claim placeholder SeedExpanders produce real generation.** The current `placeholderSeedExpander` and `tileMosaicSeedExpander` are deterministic mosaics that demonstrate the seam works; they do not demonstrate the compression-prior framing empirically. That demonstration requires a trained projector (#70 reframed M1B).
- **It does not claim frozen-LLM emission of compact visual codes is empirically reliable.** That's prediction 1 above — a testable consequence, not a settled fact. If it fails, the architecture remains valid but the LLM-emission-as-prior bet specifically is in trouble; falling back to "LLM emits semantic plan + a small encoder produces the seed code" would be the natural recovery.
- **It does not claim Kolmogorov complexity is computable or that we have any practical way to measure compression quality of generated codes.** The complexity framing is descriptive; it does not give us an algorithm for picking the best tokenizer.
- **It does not invent doctrine.** RFC-0006 and ADR-0018 are the doctrine; this note is research scaffolding behind them. If anything in this note conflicts with those, those win.

## How this anchors the radar (#258)

The radar's job is to evaluate seed-token candidates against decision criteria. This note proposes those criteria flow from the four predictions above:

| Prediction | Radar criterion |
|---|---|
| Frozen-LLM can emit valid sequences | Has a published rFID at low token budgets; has a public *and* runnable encoder so we can compare distributions |
| Decoder receipt is byte-pinnable | Decoder weights pin to a SHA; ablation shows no nondeterminism |
| Compact codes don't cliff | rFID curve at 8 / 32 / 256 / 1024 tokens published or verifiable |
| Two-pass scaffolding helps | Tokenizer admits a coarse-to-fine ordering (VAR-style) or a clean prefix mode |

The radar can score candidate families against these criteria with citations or `unknown` flags, exactly as #254 r2 does for the cell matrix. The output is a ranked shortlist with the named gates from the radar; the decision to wire one is a follow-on issue, not the radar itself.

## Connections to be explored later (open research variables)

These are not addressed here but should land in subsequent notes:

- **MaskBit / bit-token / embedding-free generation** (#258 starting reference). Whether bit-tokens preserve the compression-prior framing or break it.
- **MAGVIT / OpenMAGVIT video tokenizers.** If image tokenization extends naturally to video, the same theoretical anchor extends. If not, the video lane (#264) needs its own anchor.
- **Frozen-LLM as image tokenizer (SPAE).** This is the most aggressive form of the compression-prior framing — the LLM's own vocabulary IS the codebook. Receipt-fidelity unknowns make this hard to evaluate today (#254 r2 §6).
- **Empirical measurement of frozen-LLM emission distributions.** Prediction 1 is testable but requires infrastructure we don't have yet (a comparison harness with published encoders). #258 radar is a prerequisite.
- **The relationship to LeCun's V-JEPA-2 / world-models direction.** JEPA predicts representations; VSC asks the LLM to *emit* representations. The structural similarity is suggestive; the operational difference (predict-by-completion vs emit-by-prompt) deserves its own treatment.

## Boundaries this note does NOT cross

- Does NOT modify any code or schema.
- Does NOT change `docs/codecs/image.md`, `docs/architecture.md`, or other doctrine surfaces.
- Does NOT supersede ADR-0018 or RFC-0006 — it sits *behind* them as theoretical scaffolding.
- Does NOT add or rename any modality.
- Does NOT pick a tokenizer family — explicitly defers to #258.
- Does NOT propose new operating-doc text. If this anchor's framing should appear in operating docs (e.g. README, AGENTS.md), that's a follow-up after researcher review of this note, not a parallel diff.

## Cross-references

- RFC-0006 §3 — visual seed token role (the doctrine this anchor sits behind).
- ADR-0018 — Visual Seed Token first-class, adapter as seed expander.
- `docs/research/hybrid-image-code.md` — earlier framing; this note refines it.
- `docs/research/2026-05-07-vsc-seed-token-eval-matrix.md` (#238) — family-level survey.
- `docs/research/2026-05-08-vsc-eval-matrix-cells.md` (#254 r2) — cell matrix with citation discipline.
- `docs/research/visual-seed-code-skill-playbook.md` — agent-side prompting (Lane 3 in #255).
- `docs/research/frozen-llm-multimodality.md` — closely related; this note is the deeper version.
- #258 — image tokenizer/decoder radar (consumes this note's predictions as criteria).
- #205 — first locked eval matrix.
- #207 — one-shot vs two-pass acceptance cases (validates prediction 4).
- #70 — M1B trained-projector umbrella.
- #109 — VQ decoder bridge readiness tracker.

## Suggested follow-up notes

If this anchor is ratified, two natural follow-ups land downstream:

1. **An empirical measurement plan** — once #258 names the decoder bridge, a small note proposing how to test predictions 1–4 with public datasets and minimal infrastructure.
2. **A LeCun-JEPA / VSC structural comparison note** — what does "predict representations" buy us specifically vs "emit representations," and where does the analogy break?

Both are deferred until #258 lands and any pushback on this anchor's framing settles.
