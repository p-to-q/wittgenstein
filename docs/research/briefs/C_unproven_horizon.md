# Brief C — Unproven-but-interesting horizon scan

**Date:** 2026-04-23 (v0.1) · amended 2026-04-26 (v0.2 — added H9, H10)
**Status:** Draft v0.2
**Author:** research pass, @Jah-yee @Moapacha
**One-line summary:** Ten load-bearing hypotheses that are neither settled science (Brief A) nor live theoretical tension (Brief B) but, if they resolve the way we suspect, each flips one decision in Wittgenstein's 18-month roadmap — we name them, price them, and mark which ones to bet on now.

> **v0.2 amendment scope.** Two horizon hypotheses surfaced from a 2026-04-26 conversation pass — H9 (patch-grid / next-scale IR) and H10 (long-code clarity via test-time caption expansion). Both grew out of the user's "ViT global-relations" and "short-code → long-code compiler" framings; both are operational (each names a specific live experiment hook in RFC-0001 / Brief E) so they belong in this scan rather than Brief A or B. v0.1 hypotheses H1–H8 are unchanged. See cross-link in Brief A's lineage refresh (separate PR).

> **v0.2 scope note:** this brief is roadmap input, not a v0.2 gate. Its hypotheses inform v0.3+ sequencing; they do not block the v0.2 doctrine lock.

---

## Scope and ground rules

This brief scans the "unvalidated but actionable" horizon: claims with enough signal in the 2024–2026 literature and practice that they deserve a confidence number above noise, but not so much that they belong in the settled-lineage brief. Each of the ten hypotheses below gets a fixed shape — (a) one-sentence claim, (b) one best-supporting pointer, (c) one disconfirming pointer, (d) implication for Wittgenstein if true, (e) a confidence drawn from the discrete set **{0.1, 0.3, 0.6}** — strictly no 0.9 (Brief A/B territory) and no hand-waving intermediate values — and (f) a "what would flip this" trigger. Every hypothesis is operational: it must bear on a file, adapter, ADR, or roadmap item. Purely philosophical conjectures (e.g. "symbol grounding is solved") are excluded. Where supporting or disconfirming evidence is genuinely thin, we say so and drop confidence rather than invent a number.

---

## The ten hypotheses

### H1. Modality separability

**Claim.** Most of what makes multimodal _generation_ hard is portable into an out-of-model harness layer — i.e. a frozen text LLM plus discrete-token adapter plus frozen decoder captures ≥80% of the quality of a natively multimodal giant, at <5% of the training cost, for the artifact modalities Wittgenstein targets (image, audio, SVG, chart, sensor).

- **Supporting:** SPAE (Yu et al., NeurIPS 2023) showed a _frozen_ PaLM 2 / GPT-3.5, via a learned codebook mapped to the LLM's own vocabulary, generates coherent image content and beats SOTA on image-understanding in-context learning by >25% — first existence proof that the LLM itself doesn't need to see pixels during training ([arXiv 2306.17842](https://arxiv.org/abs/2306.17842)). FLAME (CVPR 2025) extends the story to data-efficient image–language pretraining on a frozen LLM backbone ([CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Cao_FLAME_Frozen_Large_Language_Models_Enable_Data-Efficient_Language-Image_Pre-training_CVPR_2025_paper.pdf)).
- **Disconfirming:** GPT-4o's native image generation (March 2025) produces typographic fidelity, reference-consistent edits, and compositional coherence that adapter-over-frozen stacks have not publicly matched; Nathan Lambert argues native input–output multimodality is a genuinely new primitive, not a harness trick ([interconnects.ai](https://www.interconnects.ai/p/gpt-4os-images-and-lessons-from-native)).
- **Implication if true.** Wittgenstein's five-layer harness (ADR-0003) is the right shape: the text LLM stays frozen, modality-specific work lives in L2–L4 adapters and decoders, and we do not owe the world an end-to-end trained giant. The whole repo thesis holds.
- **Confidence:** **0.6** — strong existence proofs on the "80% of quality" side; the remaining 20% is exactly where GPT-4o pulls ahead and that gap is visible but not obviously unbridgeable.
- **What would flip this.** A reproducible frozen-LLM + adapter stack that hits GPT-4o parity on MJHQ-30K or DPG-Bench (↑ to 0.8), _or_ a result showing adapters plateau >15 FID behind natively multimodal models even at scale (↓ to 0.3).

### H2. Token-efficiency collapse

**Claim.** TiTok's 32-tokens-per-256×256-image direction continues: by late 2027 the SOTA lands at ≤16 tokens, and by 2028 at ≤8, for ImageNet-class reconstruction at gFID < 2.

- **Supporting:** TiTok already tokenizes 256×256 images to as few as 32 discrete tokens and beats DiT-XL/2 at 512×512 while running ~410× faster ([arXiv 2406.07550](https://arxiv.org/abs/2406.07550)). Follow-ups TA-TiTok and MaskGen extend the pattern with text-aware 1D tokenizers and continuous 32-token text-to-image at FID 6.53 on MJHQ-30K ([1d-tokenizer repo](https://github.com/bytedance/1d-tokenizer)).
- **Disconfirming:** No public result below 32 discrete tokens at competitive FID on ImageNet 256 has appeared as of April 2026; the recent unified-tokenizer surveys (UniTok, TokenFlow, VAEVQ) are pushing on _quality_ and _unification_, not on shrinking token count further ([UniTok](https://arxiv.org/html/2502.20321v1), [TokenFlow CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Qu_TokenFlow_Unified_Image_Tokenizer_for_Multimodal_Understanding_and_Generation_CVPR_2025_paper.pdf)). The trend-line for "fewer tokens" may have already plateaued.
- **Implication if true.** The LLM context-budget cost of an image falls to the cost of a short sentence. Wittgenstein's IR becomes dramatically cheaper to emit, and the argument "LLM emits VQ tokens directly" gets stronger versus "LLM emits a structured program that a renderer expands."
- **Confidence:** **0.3** — one strong trajectory, no second data point below 32. Calling this 0.6 would over-fit to TiTok.
- **What would flip this.** A peer-reviewed result at ≤16 tokens with gFID < 3 on ImageNet 256 within 12 months (↑ to 0.6). Continued 32-token ceiling through mid-2027 (↓ to 0.1).

### H3. Symbolic emergence in frozen LLMs

**Claim.** Sufficiently large frozen LLMs already contain a VQ-equivalent codebook for images — adapters are not _learning_ visual structure, they are readout heads for structure that was induced from text co-occurrence.

- **Supporting:** SPAE's central move is to quantize images into tokens _drawn from the LLM's own vocabulary_ and have in-context learning do the rest — the LLM's existing embedding space is the codebook ([arXiv 2306.17842](https://arxiv.org/abs/2306.17842)). "Beyond Text: Frozen LLMs in Visual Signal Comprehension" (CVPR 2024) replicates this finding for understanding tasks ([CVPR 2024](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhu_Beyond_Text_Frozen_Large_Language_Models_in_Visual_Signal_Comprehension_CVPR_2024_paper.pdf)).
- **Disconfirming:** VILA-U and related unified-tokenizer work argue the opposite — that _naïve_ VQGAN codebooks trained on reconstruction loss alone are misaligned with text and must be _retrained_ with text-alignment objectives to get competitive VLM performance, which implies the useful structure is not already latent in the LLM ([arXiv 2502.20321](https://arxiv.org/html/2502.20321v1)).
- **Implication if true.** The adapter is fundamentally a cheap projection (a few MLP layers, ≈5M parameters for a 7–13B backbone per CROME-style figures — [arXiv 2408.06610](https://arxiv.org/html/2408.06610v1)), not a representation learner. Wittgenstein should _never_ invest in large adapters; L3 stays small forever.
- **Confidence:** **0.3** — real existence proofs, but the strongest recent work cuts against it for generation quality. Call it "partially true, badly load-bearing."
- **What would flip this.** A probing paper showing that post-trained LLM embeddings linearly predict VQGAN codebook IDs at >70% top-1 without any vision finetuning (↑ to 0.6). Or a clean result where adapter width, not depth, is what matters for fidelity (↓ to 0.1).

### H4. Program synthesis beats sampling for structured modalities

**Claim.** For SVG, music, sensor, and most chart modalities, the right output is _code_, not sampled media — LLMs are already near-optimal code generators, and the "render" step is a deterministic decoder rather than a probabilistic sampler.

- **Supporting:** SVGenius (ACM MM 2025) evaluates 22 LLMs on 2,377 SVG queries and finds frontier proprietary models handle medium-complexity SVG generation directly, with reasoning-trained models substantially better than pure scaling ([arXiv 2506.03139](https://arxiv.org/html/2506.03139v1)). SGP-GenBench formalises "symbolic graphics programming" as the right framing ([SGP-Bench](https://sgp-bench.github.io/)). The existing Wittgenstein SVG codec already exploits this — the model writes SVG and a renderer expands it, no sampling involved.
- **Disconfirming:** SVGenius itself reports that _all_ models degrade sharply with scene complexity, and Chat2SVG-style hybrids (LLM draft + diffusion refinement) outperform pure LLM-code generation above a complexity threshold — suggesting code generation alone is not sufficient at the quality ceiling ([Empowering LLMs to Understand and Generate Complex Vector Graphics, CVPR 2025](https://openaccess.thecvf.com/content/CVPR2025/papers/Xing_Empowering_LLMs_to_Understand_and_Generate_Complex_Vector_Graphics_CVPR_2025_paper.pdf)).
- **Implication if true.** Wittgenstein doubles down on program-IR modalities (SVG, music-as-Lilypond, chart-as-Vega-Lite, sensor-as-structured-JSON) and treats pixel modalities as the hard case. RFC-0001's IR design tilts toward "executable document," not "embedding vector."
- **Confidence:** **0.6** — strong existing practice plus benchmarks that validate it for low/medium complexity; the ceiling problem is real but livable for Wittgenstein's artifact-harness use case.
- **What would flip this.** A benchmark showing LLM-emitted code loses to rasterize-then-vectorize pipelines across the full complexity range (↓ to 0.3). Or a reasoning-trained model closes the high-complexity gap on SVGenius (↑ to 0.8 — but that's Brief A territory, not this scan).

### H5. Reproducibility premium

**Claim.** As agents proliferate, deterministic artifact generation (manifest + seed + frozen decoder) becomes _economically_ more valuable than marginal quality — users pay for "runs the same tomorrow" more than for "one FID point lower today."

- **Supporting:** 2025 saw a wave of explicit determinism infrastructure — vLLM shipped a reproducibility mode, Azure OpenAI documented seed-based reproducible output, and the "deterministic replay" primitive is now considered missing-infrastructure for trustworthy agents ([vLLM reproducibility](https://docs.vllm.ai/en/latest/usage/reproducibility/), [SakuraSky on deterministic replay](https://www.sakurasky.com/blog/missing-primitives-for-trustworthy-ai-part-8/)). "Run Fingerprinting" (hash of config+data+libs+seed pinned to the artifact) is becoming a named pattern.
- **Disconfirming:** The market signal is still dominated by _quality_ benchmarks (MJHQ-30K, DPG-Bench, HumanEval-variants); no public data shows users will choose a lower-FID deterministic pipeline over a higher-FID stochastic one at comparable cost. This is a "we believe it, the market hasn't shown it yet" bet.
- **Implication if true.** Wittgenstein's reproducibility posture (frozen decoders, manifest, seed-pinned) is a _feature_, not a compliance cost. We market it. ADR-0005 ("decoder not generator") becomes a commercial moat, not just a principle.
- **Confidence:** **0.3** — the infrastructure trend is real, the willingness-to-pay is not yet proved. Cannot honestly go higher.
- **What would flip this.** An enterprise case study where deterministic replay is the explicit procurement criterion for an agent pipeline (↑ to 0.6). Three quarters of no adoption of Azure-style seeded modes outside regulated verticals (↓ to 0.1).

### H6. Adapter universality

**Claim.** One lightweight adapter architecture — call it a small Q-Former-equivalent plus a linear/MLP projection — works for _all_ L2→L4 projections across modalities; only the training data and codebook change.

- **Supporting:** Sebastian Raschka's 2024 survey of multimodal LLMs documents that the two dominant patterns (unified embedding vs. cross-attention) are architecturally narrow — essentially everyone converges on a Q-Former or an MLP projector, with adapter parameters typically 1–6% of the model ([Raschka, 2024](https://sebastianraschka.com/blog/2024/understanding-multimodal-llms.html)). CROME reports ~5M trainable adapter weights against a 7–13B backbone and claims cross-modal reusability ([arXiv 2408.06610](https://arxiv.org/html/2408.06610v1)).
- **Disconfirming:** Cross-modal adapter surveys now flag modality-specific failures — audio adapters struggle with long-horizon temporal structure, sensor data wants explicit positional/time encodings, and MoE-style multi-adapter designs are emerging precisely because one adapter doesn't cover all ([Preprints.org 2025](https://www.preprints.org/manuscript/202512.1986/v1/download)).
- **Implication if true.** Wittgenstein ships one adapter class in `packages/adapter` and instantiates it per modality with different codebooks. Saves an entire engineering axis over the 18-month roadmap.
- **Confidence:** **0.3** — true-enough for image and SVG, under real pressure from audio and sensor. "Universal within visual-ish modalities, plural elsewhere" is probably the calibrated answer.
- **What would flip this.** A published cross-modality benchmark where one adapter family wins across image+audio+sensor+SVG without architectural changes (↑ to 0.6). Or the audio/sensor codecs in this very repo end up needing different adapter shapes (↓ to 0.1) — internal signal, fastest to resolve.

### H7. Harness-as-skill convergence

**Claim.** Anthropic Skills, OpenAI Agents SDK skills, Microsoft Skills, and the broader agent tooling ecosystem have converged on "repo-as-distribution-unit" — a folder of instructions + scripts + resources, discoverable by an agent — which means Wittgenstein's distribution bet (the repo itself is the product) is load-bearing and correctly timed.

- **Supporting:** Anthropic open-sourced the Agent Skills standard in December 2025 (agentskills.io), with Microsoft, OpenAI, Atlassian, Figma, Cursor, and GitHub adopting; the `anthropics/skills` repo crossed 20k GitHub stars and partner directories include Canva, Stripe, Notion, Zapier ([The New Stack](https://thenewstack.io/agent-skills-anthropics-next-bid-to-define-ai-standards/), [anthropics/skills](https://github.com/anthropics/skills)). OpenAI shipped `openai/skills` as a Codex skills catalog and published "Using skills to accelerate OSS maintenance" alongside the Agents SDK ([OpenAI Developers](https://developers.openai.com/blog/skills-agents-sdk), [openai/skills](https://github.com/openai/skills)). The distribution unit is unambiguously a folder in a git repo. A 2026 in-the-wild minimal sample of this pattern is `jiangmuran/claude-image` ([github](https://github.com/jiangmuran/claude-image)), a thin Skill folder wrapping a single image-generation API — recorded only as evidence of the convergence shape, not as an architectural reference (see issue #66 for the biases-and-limitations breakdown).
- **Disconfirming:** There is still a plausible world where registries (npm-style, or an Anthropic-hosted marketplace) eclipse raw git repos as the canonical distribution path; SkillsMP and similar marketplaces already exist. If that happens, "the repo is the product" becomes "the package is the product" and Wittgenstein's distribution model needs a registry story.
- **Implication if true.** `docs/distribution.md` is correct. Invest in the README/SHOWCASE/agent-contact-text surface; do not build a custom runtime or custom package format.
- **Confidence:** **0.6** — the convergence has happened on the _format_; the distribution venue (git vs. registry) is the only live question, and even that lands in git-repo-shape either way.
- **What would flip this.** A registry model that does not use a git-repo-shaped artifact wins majority share of agent skill distribution by Q4 2026 (↓ to 0.3). A W3C-style ratification of the Skills spec as a cross-vendor standard (↑ to 0.8 — Brief A territory).

### H8. Unified tokenization for planning + rendering

**Claim.** The long-horizon research win is _one_ tokenization used both for planning (text + abstract/control tokens consumed by an LLM) and for rendering (VQ tokens consumed by a decoder) — i.e. a single vocabulary where "explain the image," "edit the image," and "generate the image" are all next-token-prediction on the same tape.

- **Supporting:** TokenFlow (CVPR 2025), UniTok (Feb 2025), VILA-U (ICLR 2025), and VAEVQ (AAAI 2025) all push toward a single tokenizer that serves understanding _and_ generation, with VILA-U specifically showing that text-alignment during VQ pretraining is what unlocks competitive performance on both objectives in one model ([TokenFlow](https://openaccess.thecvf.com/content/CVPR2025/papers/Qu_TokenFlow_Unified_Image_Tokenizer_for_Multimodal_Understanding_and_Generation_CVPR_2025_paper.pdf), [UniTok](https://arxiv.org/html/2502.20321v1)). The 2025 survey of discrete tokenizers calls unified tokenization an "emerging research direction" ([arXiv 2502.12448](https://arxiv.org/html/2502.12448v1)).
- **Disconfirming:** The same survey is candid that there is "no consensus on key design choices" for unified foundation models — the taxonomy it proposes has three competing paradigms (external-service-integrated, modular-joint, end-to-end). "Unified tokenization is coming" and "unified tokenization will look like X" are different bets, and the second is much weaker.
- **Implication if true.** RFC-0001's IR should be designed to _become_ a unified tokenization — i.e. abstract planning tokens and rendering tokens should share a namespace, not live in separate bags. Today's ad-hoc "structured IR + VQ" is a stepping stone, not a terminal architecture.
- **Confidence:** **0.6** on "unified tokenization will be the paradigm by late 2027"; **0.3** on "the unified scheme will look like what we'd guess today." We list this as 0.6 because the roadmap question is "is this a direction?", not "which variant wins?"
- **What would flip this.** A unified-tokenizer model beats task-specialized models on _both_ MMMU (understanding) and MJHQ-30K (generation) at comparable parameter count (↑ to 0.8). Two years of unified-tokenizer papers underperforming separate tokenizers at matched FLOPs (↓ to 0.3).

### H9. Patch-grid / next-scale IR beats structured-JSON IR for raster modalities

**Claim.** For raster image (and by extension video frame) generation, the right intermediate representation between LLM and decoder is _not_ a structured-JSON SceneSpec but a sequence of patch tokens or coarse-to-fine scale tokens — i.e. the ViT lesson ("flatten the image into a sequence; let attention discover global relations") and the VAR lesson ("predict scale-by-scale, not raster-scan") together imply Wittgenstein's current SceneSpec IR is correctly grippable for v0.1 but wrong for v0.3+ image quality.

- **Supporting:** VAR (Tian et al., NeurIPS 2024 Best Paper, [arXiv 2404.02905](https://arxiv.org/abs/2404.02905)) reports next-scale prediction taking ImageNet 256² FID from 18.65 → 1.73 versus a raster-order AR baseline, ~20× faster than diffusion, with clean power-law scaling — the first AR image result that matches diffusion on fidelity without changing the loss function. Emu3 ([arXiv 2409.18869](https://arxiv.org/abs/2409.18869)) does pure next-token prediction over ~4096 SBER-MoVQGAN patch tokens per image and beats SDXL. FlexTok (Bachmann et al., ICML 2025, [arXiv 2502.13967](https://arxiv.org/abs/2502.13967)) shows 1-D patch sequences of flexible length (1 to 256 tokens) reach FID < 2 across 8–128 tokens with a rectified-flow decoder and nested-dropout training — the patch-token IR is no longer fixed-length-rigid.
- **Disconfirming:** The current Wittgenstein image artifact is a single PNG with a SceneSpec sidecar; reviewers can read it. SVGenius / SGP-Bench (cited in H4) show structured-program IR holds for medium-complexity vector modalities. SPAE (Brief A) is direct prior art that frozen LLMs can already emit _word-vocabulary_ patch tokens without any architectural change — so the "patch IR" win, if it lands, may not require us to abandon the JSON shape, only to admit a parallel patch-grid IR alongside it.
- **Implication if true.** RFC-0001's IR sum (`text | latent | hybrid`) gains a fourth variant `patch-grid` (or scale-coarse-to-fine), and the image codec adds a route that calls a VAR-class / FlexTok-class frozen decoder directly with adapter-projected patch tokens. SceneSpec stays as the grippable-JSON route for showcase / debugging; the patch-grid route is what we ship for fidelity. The L4/L5 split (decoder vs renderer) becomes more important, not less, because patch tokens are the L4 artifact a separate L5 pixel decoder consumes.
- **Confidence:** **0.3** — VAR is one strong data point, FlexTok is a second, Emu3 is a third, but all three require a frozen decoder we do not yet have a usable-license version of (this is exactly Brief A kill criterion #3). Calling this 0.6 would over-fit to three papers from the same research direction.
- **What would flip this.** An open-weights VAR-class or FlexTok-class decoder ships under a usable license by Q4 2026 and reproduces the published FID on a free-tier T4 (↑ to 0.6) — at that point we should branch the IR. Conversely, if our SceneSpec → procedural raster pipeline beats VAR on prompt adherence (CLIPScore / VQAScore from Brief E) at matched compute on DPG-Bench prompts, the structured-IR route is sufficient and we should not bifurcate the IR (↓ to 0.1).
- **Cross-link with H10.** H9 and H10 act on adjacent nodes of the same architectural seam (the `expand → adapt → decode` chain in `codec-image/src/pipeline/`) and may converge into a two-path "thinking-model-style" pipeline. H10 is about the _input_ side of `expand`: should round 1 (intent → structured caption) become two LLM calls instead of one, FIBO-style? H9 is about the _output_ side of `adapt`: should the IR handed to the decoder be a JSON SceneSpec or a patch-grid token sequence? They share a substrate (the IR boundary) and may share an experiment (a `--expand` flag that, when on, _also_ admits a patch-grid IR variant). If both resolve true, the production pipeline forks into "long-caption JSON" (H10 alone) and "long-caption → patch-grid" (H9 + H10) routes; if only one resolves, the other becomes its own branch. They should be re-priced together when an open-weights LFQ-family decoder lands. See also "Idea-3" capture in this session's record (DALL-E 3 caption-rewriting → quality jump; Imagen T5 conditioning; Anthropic _Building Effective Agents_ on prompt chaining; `docs/research/compression-view-of-llms.md` on recall-not-reasoning), which is the practitioner-side framing of the same axis.

### H10. Long-code clarity — test-time caption expansion beats short-prompt directness

**Claim.** Letting the LLM emit a much longer structured "render program" (≈5% of context tokens, hundreds-to-thousand words of structured caption) and then rule-expanding it deterministically into a thousands-token decoder input produces higher artifact fidelity than letting the LLM emit a short prompt directly to a decoder — i.e. the "short code → long code → output" compiler chain (cf. demoscene 4KB intros, GLSL noise functions, procedural texture generators) is the right pipeline shape for image and audio, and Wittgenstein's current 3-stage `expand → adapt → decode` chain is already this pattern but currently under-using its expand stage.

- **Supporting:** FIBO ([arXiv 2511.06876](https://arxiv.org/abs/2511.06876), Nov 2025) reports SOTA prompt adherence on long-prompt benchmarks by training the model to consume 1000-word structured captions rather than short user intents — the explicit pre-expansion is what unlocks the gain. TIPO ([arXiv 2411.08127](https://arxiv.org/abs/2411.08127)) shows text-to-image prompt optimization via lightweight LLM expansion lifts adherence on standard benchmarks at marginal extra cost. "Progress by Pieces" ([arXiv 2511.21185](https://arxiv.org/abs/2511.21185), Nov 2025) demonstrates test-time scaling for AR image generation by spending more tokens at inference. Anthropic extended thinking ([anthropic docs](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)) ships 1024–128K-token internal reasoning budgets as a first-class API parameter — frontier labs are explicitly betting that "more tokens before answering" is a primitive worth pricing. Input-side inference-time scaling for diffusion ([arXiv 2510.12041](https://arxiv.org/abs/2510.12041)) generalises the same lever to non-AR pipelines.
- **Disconfirming:** TiTok / TA-TiTok (H2) compress an _entire_ image to 32 tokens at competitive FID — the "more tokens means more fidelity" intuition is not monotone; representational efficiency can win over verbosity at the encoder side. GPT-4o native generation produces SOTA edits and typographic fidelity from short user prompts with no visible long-caption stage (Lambert / interconnects.ai cited under H1) — the long-code premium may be a transient quirk of training-data distribution rather than a structural property. There is also a real risk that long-caption pipelines optimise the prompt-adherence metric (CLIPScore / VQAScore) without humans actually preferring the outputs.
- **Implication if true.** RFC-0001's pipeline gains an explicit optional `--expand` flag (or a config-level `expand: long-caption | passthrough` switch) that, when on, runs an extra LLM round to produce a FIBO-shaped long structured caption before the adapter sees it. The short-prompt path stays for receipts/showcase reproducibility; the long-caption path is what we ship for production-quality artifacts. The harness's existing 3-stage chain is exactly the right substrate — we are not redesigning the pipeline, we are putting load on its `expand` stage. ADR-0001 ("schema preamble + JSON contract") survives intact: the long caption is still schema-validated, it is just longer.
- **Confidence:** **0.3** — FIBO and TIPO are strong supporting signals on the prompt-adherence axis; the short-prompt counter-evidence (GPT-4o, TiTok's reverse direction) is real; calling this 0.6 would treat 2025 inference-time-compute hype as settled. The H10 experiment is also one of the cheapest in this brief to actually run inside the repo (Brief E benchmarks + an `--expand` flag wired into image codec), which is the calibrated reason to keep it at 0.3 rather than push it down to 0.1 — we will collect our own data point.
- **What would flip this.** A within-repo A/B run on DPG-Bench or MJHQ-30K showing the long-caption route beats the short-prompt route on CLIPScore / VQAScore at comparable Latency × Price × Quality (↑ to 0.6). A published 2026 result showing caption length plateaus past ~150 words across image benchmarks (↓ to 0.1). A FIBO follow-up retracting or weakening the SOTA claim under independent reproduction (↓ to 0.1).
- **Cross-link with H9.** See H9's cross-link paragraph above. H10 acts on the _input_ side of `expand` (one LLM call vs two — the round-count question that RFC-0001 / Brief C's E2 already flags as a live ADR-eligible decision); H9 acts on the _output_ side of `adapt` (JSON IR vs patch-grid IR). They are sibling questions on the same seam. If we ship the `--expand` flag (H10's experiment hook), the same seam can later admit a `--ir patch-grid` flag (H9's experiment hook) without re-architecting the pipeline — in fact, the natural shape is a two-axis matrix `(rounds ∈ {1,2}) × (ir ∈ {json, patch-grid})` and four routes. The Idea-3 capture from this session's record is the practitioner-side framing of H10's input axis: round 1 = skill-preset prompt + user input → structured JSON (recall-not-reasoning, cf. `docs/research/compression-view-of-llms.md`); round 2 = JSON → token sequence. The (a)+(b) sub-claim there is exactly H10; the (c) sub-claim is the SPAE-architecture lock that ADR-0007 already settled.

---

## Red team

A senior-staff engineer at a frontier lab reads this list and says: _"Every one of these hypotheses is in service of your bet. Where are the hypotheses that would_ kill _your bet? H1, H3, H6 all say 'adapters are enough.' H2, H4 say 'LLMs are almost done.' H5, H7 say 'distribution matters more than model quality.' H8 gives you an escape hatch. H9 and H10 are now also escape hatches — H9 says 'if structured-JSON IR loses, we can switch to patch grids,' H10 says 'if short prompts lose, we can spend more tokens.' You've written a prospectus, not a scan."_

Fair. The honest counter-scan — hypotheses that would _kill_ Wittgenstein if they resolve unfavourably — includes:

- **Anti-H1:** By end of 2026, a natively multimodal 100B model open-weights and beats every adapter-over-frozen stack on every artifact benchmark by a margin that makes the engineering savings irrelevant. (We priced this inside H1's disconfirming pointer but did not give it its own row; if GPT-4o-class open weights ship, this brief is wrong.)
- **Anti-H4:** Diffusion-in-the-loop becomes cheap enough (≤100ms on CPU) that the "program synthesis is cleaner" argument collapses on economics. Not currently true; plausible by 2028.
- **Anti-H7:** The agent ecosystem consolidates into 2–3 hosted runtimes that don't read repos, only registry packages, and "here's a git repo" stops being a distribution story.

The right response to the red team is not to inflate this list to 16 hypotheses but to note: Brief B (Ilya↔LeCun) already carries the deepest killer — if LeCun's world-model line is correct, text-first + adapters is a dead end regardless of how H1–H8 resolve. We do not duplicate that hypothesis here; we cite it.

---

## Kill criteria

List-level, not per-hypothesis:

1. **Confidence-drift kill.** If by Q2 2027 none of the four 0.6-confidence hypotheses (H1, H4, H7, H8-directional) has moved toward 0.8 — i.e. no frozen-LLM adapter stack has hit GPT-4o parity on a public benchmark, no structured-program IR has won a serious per-modality benchmark, and the Skills-style distribution convergence has fragmented back into walled gardens — the scan was optimistic. Re-do it with harder priors.
2. **Trend-line kill.** If three of the six 0.3-confidence hypotheses (H2, H3, H5, H6, H9, H10) have moved _down_ to 0.1 by the same date, the horizon is narrower than we thought and the 18-month roadmap should be compressed around the H1/H4/H7 spine only.
3. **Anti-correlation kill.** If GPT-5-class or Gemini-3-class native multimodal weights become open, cheap, and dominant on artifact benchmarks, every "frozen LLM + adapter" hypothesis here is at risk of being correct-but-irrelevant. That is a re-do of _the whole thesis_, not just this brief.

We commit to re-running this scan in Q2 2027 regardless of which kill criterion fires.

---

## Verdict

**Seeds the 18-month roadmap (bet on them; build as if true):**

- **H1 — Modality separability (0.6).** The whole five-layer harness (ADR-0003) assumes this. If we don't believe it, we don't have a repo.
- **H4 — Program synthesis beats sampling for structured modalities (0.6).** Directly sets the IR design in RFC-0001 and the shape of the SVG, music, and chart codecs. Already load-bearing; we are treating it as true in code.
- **H7 — Harness-as-skill convergence (0.6).** Justifies the distribution-as-README posture in `docs/distribution.md`, the SHOWCASE gallery, and the agent-contact-text package. The repo _is_ the product; this hypothesis says the market agrees.

**Worth tracking but don't architect around:**

- **H2 — Token-efficiency collapse (0.3).** If it happens we benefit; if it stalls at 32 tokens we are fine. Do not design the IR around an assumed 8-token world.
- **H8 — Unified tokenization for planning + rendering (0.6 directional, 0.3 specific).** Keep the IR _compatible_ with a future unified vocabulary, but do not ship the unified scheme in v0.3; RFC-0001 stays pragmatic.
- **H9 — Patch-grid / next-scale IR (0.3, added v0.2).** Reserve the optionality but do not bifurcate the IR yet. Concretely: keep RFC-0001's IR sum extensible (the existing `latent`/`hybrid` slots already accommodate a future patch-grid variant), and do not write a VAR-class adapter until an open-weights LFQ-family decoder ships under a usable license (Brief A kill criterion #3 is the gating event). H9 graduates to "bet on now" the moment that decoder lands.
- **H10 — Long-code clarity (0.3, added v0.2).** This is the cheapest hypothesis in this brief to actually run. The image codec already has the right pipeline shape (`expand → adapt → decode`); v0.3 should add an optional `--expand` / `expand: long-caption` switch (per RFC-0001 / Brief E benchmark wiring) and collect a within-repo A/B data point on DPG-Bench-style prompts. Do not market the long-caption pipeline as a feature until that data point exists; do build the seam now while the pipeline is still soft.

> **Convergence note (H9 + H10).** These two hypotheses are deliberately sibling-linked because they share a substrate. H10 is the _input_ side of the `expand` round (1 call vs 2); H9 is the _output_ side of `adapt` (JSON IR vs patch-grid IR). The natural pipeline shape if both lean true is a two-axis matrix `(rounds ∈ {1,2}) × (ir ∈ {json, patch-grid})` — i.e. four routes, not two — that mirrors a "thinking-model-style" branching where the codec dynamically picks the lane based on artifact-quality target. Re-price them as a pair: a positive H10 A/B result without a usable LFQ decoder pushes us toward "long-caption + JSON" (H10 alone); a usable LFQ decoder _without_ a positive H10 result pushes us toward "short-prompt + patch-grid" (H9 alone); both signals together unlock the matrix. None of this requires architecture work today — RFC-0001's IR sum and pipeline shape already accommodate the matrix as future routes.

**Explicitly deprioritised (track quietly):** H3, H5, H6. Each is plausible, each would be _nice_ if true, none of them should change a line of code in the next 18 months. H5 in particular is a marketing bet, not an architecture bet — revisit when we have a paying customer.

Signed: research-agent pass, 2026-04-23.

---

## References

- Yu et al., _SPAE: Semantic Pyramid AutoEncoder for Multimodal Generation with Frozen LLMs_, NeurIPS 2023. [arXiv:2306.17842](https://arxiv.org/abs/2306.17842)
- Yu et al., _An Image is Worth 32 Tokens for Reconstruction and Generation_ (TiTok), 2024. [arXiv:2406.07550](https://arxiv.org/abs/2406.07550) · [bytedance/1d-tokenizer](https://github.com/bytedance/1d-tokenizer)
- Cao et al., _FLAME: Frozen Large Language Models Enable Data-Efficient Language-Image Pre-training_, CVPR 2025. [PDF](https://openaccess.thecvf.com/content/CVPR2025/papers/Cao_FLAME_Frozen_Large_Language_Models_Enable_Data-Efficient_Language-Image_Pre-training_CVPR_2025_paper.pdf)
- Zhu et al., _Beyond Text: Frozen Large Language Models in Visual Signal Comprehension_, CVPR 2024. [PDF](https://openaccess.thecvf.com/content/CVPR2024/papers/Zhu_Beyond_Text_Frozen_Large_Language_Models_in_Visual_Signal_Comprehension_CVPR_2024_paper.pdf)
- Chen et al., _SVGenius: Benchmarking LLMs in SVG Understanding, Editing and Generation_, ACM MM 2025. [arXiv:2506.03139](https://arxiv.org/html/2506.03139v1)
- Xing et al., _Empowering LLMs to Understand and Generate Complex Vector Graphics_, CVPR 2025. [PDF](https://openaccess.thecvf.com/content/CVPR2025/papers/Xing_Empowering_LLMs_to_Understand_and_Generate_Complex_Vector_Graphics_CVPR_2025_paper.pdf)
- SGP-Bench (Symbolic Graphics Programming). [sgp-bench.github.io](https://sgp-bench.github.io/)
- Qu et al., _TokenFlow: Unified Image Tokenizer for Multimodal Understanding and Generation_, CVPR 2025. [PDF](https://openaccess.thecvf.com/content/CVPR2025/papers/Qu_TokenFlow_Unified_Image_Tokenizer_for_Multimodal_Understanding_and_Generation_CVPR_2025_paper.pdf)
- _UniTok: A Unified Tokenizer for Visual Generation and Understanding_, Feb 2025. [arXiv:2502.20321](https://arxiv.org/html/2502.20321v1)
- _Discrete Tokenization for Multimodal LLMs: A Comprehensive Survey_, 2025. [arXiv:2507.22920](https://arxiv.org/abs/2507.22920) · companion: [arXiv:2502.12448](https://arxiv.org/html/2502.12448v1)
- CROME: _Cross-Modal Adapters for Efficient Multimodal LLM_. [arXiv:2408.06610](https://arxiv.org/html/2408.06610v1)
- Raschka, _Understanding Multimodal LLMs_, 2024. [sebastianraschka.com](https://sebastianraschka.com/blog/2024/understanding-multimodal-llms.html)
- Lambert, _GPT-4o's images and lessons from native input-output multimodality_. [interconnects.ai](https://www.interconnects.ai/p/gpt-4os-images-and-lessons-from-native)
- vLLM reproducibility mode. [docs.vllm.ai](https://docs.vllm.ai/en/latest/usage/reproducibility/)
- SakuraSky, _Trustworthy AI Agents: Deterministic Replay_. [sakurasky.com](https://www.sakurasky.com/blog/missing-primitives-for-trustworthy-ai-part-8/)
- Anthropic Skills standard & repo. [anthropics/skills](https://github.com/anthropics/skills) · [The New Stack coverage](https://thenewstack.io/agent-skills-anthropics-next-bid-to-define-ai-standards/)
- OpenAI Agents SDK skills. [openai/skills](https://github.com/openai/skills) · [developers.openai.com/blog/skills-agents-sdk](https://developers.openai.com/blog/skills-agents-sdk)
- _Addressing Challenges in Multimodal LLM Development_, Preprints 2025. [preprints.org](https://www.preprints.org/manuscript/202512.1986/v1/download)

**Added in v0.2 (H9, H10):**

- Tian et al., _Visual Autoregressive Modeling: Scalable Image Generation via Next-Scale Prediction_ (VAR), NeurIPS 2024 Best Paper. [arXiv:2404.02905](https://arxiv.org/abs/2404.02905)
- BAAI, _Emu3: Next-Token Prediction is All You Need_, 2024. [arXiv:2409.18869](https://arxiv.org/abs/2409.18869) — also cited in Brief A.
- Bachmann et al., _FlexTok: Resampling Images into 1D Token Sequences of Flexible Length_, ICML 2025. [arXiv:2502.13967](https://arxiv.org/abs/2502.13967)
- _FIBO: Long Structured Captions for Text-to-Image Prompt Adherence_, Nov 2025. [arXiv:2511.06876](https://arxiv.org/abs/2511.06876)
- _TIPO: Text-to-Image Prompt Optimization via Lightweight LLM Expansion_, 2024. [arXiv:2411.08127](https://arxiv.org/abs/2411.08127)
- _Progress by Pieces: Test-Time Scaling for Autoregressive Image Generation_, Nov 2025. [arXiv:2511.21185](https://arxiv.org/abs/2511.21185)
- _Inference-Time Scaling for Diffusion via Input Search_, 2025. [arXiv:2510.12041](https://arxiv.org/abs/2510.12041)
- Anthropic, _Extended Thinking_ (1024–128K-token internal-reasoning budgets). [docs.anthropic.com](https://docs.anthropic.com/en/docs/build-with-claude/extended-thinking)

---

_End of Brief C v0.2. v0.1 (H1–H8) shipped 2026-04-23; v0.2 amendments (H9, H10) added 2026-04-26 from a horizon conversation pass. Next iteration (v0.3) should land after Brief B's verdict is final, since a shift in the Ilya↔LeCun stance would re-price H1 and H8; H9/H10 are also contingent on whether an open-weights LFQ-family decoder lands and whether a within-repo `--expand` A/B run produces a usable signal._
