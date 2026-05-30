---
date: 2026-05-22
status: maintainer / researcher handoff note
labels: [research-derived, m1b-image, training, reproducibility, handoff, concern]
tracks: [#70, #259, #393, #394, #396, #397, #398, #399, #400, #435, #441, #451, #452, #453, #454]
cross-refs:
  [
    ADR-0018,
    docs/research/2026-05-08-vsc-as-compression-prior.md,
    docs/research/2026-05-13-wittgenstein-research-program.md,
    docs/research/2026-05-16-training-stack-re-audit.md,
  ]
---

# Research and Training Handoff: What We Are Actually Trying to Prove

> **Status:** handoff note, not doctrine. This is a letter to future
> researcher / maintainer passes. It tries to say the quiet part clearly:
> what we are afraid of, what would count as evidence, what prior notes
> already exist, and where outside researchers should challenge us.

## The ask

We need more than a tidy summary of the current branch. We need a real research
handoff.

Wittgenstein is trying to make a strong claim:

> A text-first LLM can plan multimodal artifacts through structured code-bearing
> contracts; for image, Visual Seed Code can become the decoder-facing layer
> between text planning and frozen pixel reconstruction.

That sounds elegant. It may also be wrong.

The job for researchers is not to protect the elegance. The job is to find out
whether the claim survives pressure.

If it survives, Wittgenstein has a research story. If it fails, we need to know
early enough to pivot without spending GPU months training the wrong adapter or
building a beautiful manifest around an empty signal.

## The current anxiety

There are two separate worries, and they should not be blurred together.

### Worry 1: Visual Seed Code may be format compliance, not information

The LLM can emit JSON. That is not the question.

The question is whether `seedCode.tokens` carry real visual information:

- Do runs for the same prompt have stable early tokens?
- Are nearby prompts mapped to nearby token distributions?
- Are first tokens more layout-bearing than later tokens?
- Does a partial prefix degrade gracefully?
- Does the token distribution resemble any real encoder distribution?

If the answer is no, then direct VSC emission is not a prior over compressed
visual programs. It is a random-number field inside valid JSON.

That does not kill the whole architecture, but it weakens the thesis. The pivot
would be: `Semantic IR + learned text/vision embedding adapter -> VQ logits`,
with `seedCode` demoted to an optional hint or stochastic seed.

### Worry 2: Training code may become expensive amateur infrastructure

M1B cannot be treated like a normal feature branch. Tokenizer / adapter /
decoder training can burn real compute and produce misleading confidence if the
data, checkpoint, eval, and publishing surfaces are weak.

The training stack must be good enough that a researcher would trust the
experiment and an engineer would trust the artifact:

- dataset snapshots are pinned;
- checkpoint bytes are hashed;
- eval preprocessing is fixed;
- framework versions and commands are recorded;
- failed runs still leave receipts;
- model cards and weight manifests say what was actually trained;
- reusable upstream code is evaluated before we write our own.

The manifest is not only accountability after the fact. It is how training code
stays professional while it is being written.

## Prior research chain we should not forget

Do not read only the 2026-05-22 notes. The real chain is longer:

- `docs/research/briefs/B_compression_vs_world_models.md` — compression /
  world-model pressure.
- `docs/research/briefs/C_unproven_horizon.md` — H9 patch-grid and H10
  long-code lanes.
- `docs/research/vq-tokens-as-interface.md` — older VQ-token interface
  framing.
- `docs/research/hybrid-image-code.md` — hybrid image code predecessor.
- `docs/research/2026-05-07-vsc-acceptance-cases.md` — lanes that define what
  success could look like.
- `docs/research/2026-05-08-vsc-as-compression-prior.md` — theoretical anchor:
  LLM as prior, decoder as decompressor.
- `docs/research/2026-05-08-image-tokenizer-decoder-radar.md` and
  `2026-05-08-vsc-eval-matrix-cells.md` — tokenizer / decoder family map.
- `docs/research/2026-05-13-m1b-prep-research.md` — Phase 0 floor, still useful
  when compute is constrained.
- `docs/research/2026-05-13-wittgenstein-research-program.md` — compute-rich
  three-track plan.
- `docs/research/2026-05-16-training-stack-re-audit.md` — training stack
  re-audit and receipt-first warning.
- `docs/research/2026-05-22-*` — new stability / Cola-DLM / SVD / CoT / IR
  reliability concerns.

The next researcher should stitch these together, not overwrite them.

## Latest outside signals that should change our research questions

Several recent tokenizer lines make the old "VQGAN-class grid first" default
feel less obviously optimal for Visual Seed Code.

- **FlexTok** projects images into ordered, variable-length 1D token sequences.
  The key claim for us is not only quality; it is that 1 to 256 tokens can form
  a hierarchy where shorter prefixes still reconstruct plausible images. That
  is close to the VSC prefix thesis.
- **Spectral Image Tokenizer** tokenizes the image spectrum with a
  coarse-to-fine ordering and explicitly supports partial decoding. This is
  almost exactly the kind of token order that VSC wants.
- **SEED-Voken / Open-MAGVIT2** keeps improving open tokenizer quality, but its
  LFQ / bit-factorized structure may change the adapter surface.
- **MaskBit** argues for embedding-free bit tokens and masked bit modeling. The
  relevance is not "copy MaskBit"; it is whether bit-token neighborhoods are
  more robust than integer codebook IDs for LLM-side emission errors.
- **BAR / masked bit modeling** suggests another direction: if large
  vocabularies are awkward, predict bits or groups of bits through progressive
  unmasking instead of predicting one huge token ID.

These are not automatically compatible with Wittgenstein. Some use decoders or
training regimes that may violate the canonical path unless frozen and treated
carefully. But they do change what "best candidate" means. A tokenizer that is
slightly worse on full reconstruction but much better under prefix truncation
may be more valuable for VSC than a better raster-grid tokenizer.

## Research questions that need answers

### RQ1 — Is direct frozen-LLM VSC emission meaningful?

Run Phase 0a:

- prompt a frontier LLM with the current VSC preamble;
- collect multiple runs per prompt at controlled temperature;
- measure token entropy, Hamming distance, early-token stability, parse
  failures, and reasoning compliance.

Expected outcomes:

- Low early-token entropy: promising; the LLM may have a useful visual prior.
- High entropy everywhere: direct VSC is probably not meaningful.
- Stable JSON but unstable tokens: schema compliance is solved, research is not.

### RQ2 — Does reasoning reduce token variance?

Compare:

- one-shot VSC without `semantic.reasoning`;
- one-shot VSC with structured reasoning;
- two-pass compile where Semantic IR is emitted first.

Measure whether reasoning changes token stability, parse success, and eventual
adapter output. If reasoning is only pretty prose, we should stop treating it as
a research lever.

### RQ3 — Which tokenizer ordering fits VSC?

Do not choose only by full rFID. Add prefix tests:

- full tokens;
- 50% prefix;
- 25% prefix;
- 12.5% prefix;
- random subset control.

The important comparison is prefix vs random subset. If prefix behaves like
random deletion, the tokenizer is not ordered in the way VSC needs.

### RQ4 — What is the null baseline for the adapter?

Before training a learned adapter, run deterministic unfolding:

- seed length S in `{4, 16, 64, 256}`;
- fixed mapping from seed positions to token grid;
- same eval set and metrics as learned adapter.

The learned adapter must beat this baseline. If it does not, the training story
is adding complexity without information gain.

### RQ5 — Does Semantic IR carry usable information?

The current placeholder path hashes semantic fields. That makes outputs differ,
but not semantically.

We need a real test:

- same seed code, varied semantic fields;
- adapter with CLIP / SigLIP / other text-vision embedding conditioning;
- output deltas aligned with field changes.

If "warm golden" and "cold fluorescent" only change arbitrary pixels, Semantic
IR is not doing its job.

## Training engineering questions that need answers before real compute

### TQ1 — Which upstream code can we reuse?

For each candidate family, answer:

- license for code and weights;
- whether the training loop is reusable or only reference material;
- whether checkpoints are SHA-pinnable;
- whether eval scripts are clean enough to trust;
- whether preprocessing is pinned;
- whether model cards / release artifacts are reproducible.

Candidates to compare include at least:

- LlamaGen;
- SEED-Voken / Open-MAGVIT2;
- MaskBit;
- TiTok / FlexTok-adjacent implementations;
- VAR / multi-scale VQ;
- clean-fid or other metric references.

If we write our own training code, it should be because reuse failed a clear
criterion, not because we did not look.

### TQ2 — What is the minimum professional training stack?

The current recommendation is plain PyTorch as the base contract, with optional
launcher / scale tools:

- PyTorch loop owns the manifest writes.
- `torchrun` / DDP first.
- FSDP2 when model size needs sharding.
- Lightning Fabric only if it preserves explicit loops.
- Accelerate only if it helps device launch or checkpoint loading without
  hiding receipts.
- DeepSpeed only as escalation for very large LLM-head distillation.

This needs maintainer challenge. If another stack is better, say why in terms
of receipts, eval, reproducibility, and reuse.

### TQ3 — What must every training run emit?

At minimum:

- `run_id`;
- git SHA;
- command and args;
- seed;
- framework versions;
- hardware fingerprint;
- dataset refs with URI / DVC hash / sample count;
- checkpoint path + sha256;
- tokenizer / decoder family + weights sha256;
- metric snapshots;
- eval set refs;
- model-card metadata;
- notes / known limitations.

This is the floor, not the final system.

### TQ4 — How do we avoid false eval wins?

Metric code must be pinned:

- exact resize / crop;
- color space;
- feature extractor version;
- sample count;
- prompt set;
- random seed;
- real-vs-generated pairing.

Any FID / rFID / CLIPScore without preprocessing receipts should be treated as
illustrative, not publishable.

## Proposed near-term work packages

## Research leads to split out

This section is deliberately a lead board, not a verdict. The next researchers
should take these as starting points, expand the citation set, inspect code /
weights / licenses, and report back with sharper recommendations.

### Lead A — Ordered / variable-length tokenizers

Core question:

> If Visual Seed Code is a prefix, which tokenizer families make prefixes
> meaningful?

Starting points:

- FlexTok: variable-length ordered 1D token sequences.
- Spectral Image Tokenizer: DWT / spectrum tokens with coarse-to-fine partial
  decoding.
- TiTok / TA-TiTok / One-D-Piece-style 1D tokenizers.
- VAR / multi-scale VQVAE as a coarse-to-fine bridge even if not used directly.

What to collect:

- prefix reconstruction curves;
- whether public weights exist;
- license for code and weights;
- whether token order is learned, spectral, multi-scale, or arbitrary;
- whether a short prefix preserves global layout;
- whether decoding a prefix is supported by the reference code or only claimed
  in paper figures.

Why it matters:

If prefix degradation is the central VSC gate, then a tokenizer with slightly
worse full rFID but graceful prefix behavior may be better than a stronger
full-grid VQGAN tokenizer.

### Lead B — Bit-token and large-vocabulary alternatives

Core question:

> Are integer codebook IDs the wrong target for a frozen text LLM?

Starting points:

- MaskBit: embedding-free bit tokens.
- BAR / masked bit autoregressive modeling.
- Open-MAGVIT2 / LFQ bit-factorized tokens.

What to collect:

- whether bit tokens are easier for an LLM to emit consistently than 14-bit /
  18-bit integer IDs;
- whether bit flips degrade locally or catastrophically;
- whether masked bit prediction can be used as the seed expander;
- whether the reference repos expose tokenizer-only encode/decode cleanly;
- whether weights are canonical-path eligible or research-only.

Why it matters:

The VSC failure mode may be "LLMs cannot choose codebook IDs," not "LLMs cannot
plan images." Bit tokens could turn one huge categorical prediction into many
smaller binary decisions.

### Lead C — Text-aware / semantic-conditioned tokenizers

Core question:

> Should the tokenizer itself know about text, or should text stay only in the
> adapter?

Starting points:

- TA-TiTok / text-aware 1D tokenizer work.
- SEED-family language-aligned tokenizer work.
- VLM bridge literature: BLIP-2, LLaVA, Q-Former-like adapters.
- CLIP / SigLIP conditioning as a baseline semantic channel.

What to collect:

- whether text-aware tokenizers improve token stability for similar prompts;
- whether they violate the frozen-decoder posture;
- whether the tokenizer / decoder can still be frozen at inference;
- whether Semantic IR fields map cleanly into their conditioning interface;
- whether this makes `semantic.reasoning` useful or redundant.

Why it matters:

If direct VSC tokens are decoder-misaligned, the next best architecture may be
`Semantic IR + text-aware adapter -> decoder tokens`, not raw prompt-emitted
token IDs.

### Lead D — Tokenizer scale and reconstruction frontier

Core question:

> How much tokenizer quality do we actually need before the adapter question is
> meaningful?

Starting points:

- GigaTok / scaled visual tokenizers.
- SoftVQ-VAE / continuous 1D tokenizer lines.
- Open-MAGVIT2 / VQGAN+ / modern VQGAN improvements.
- LlamaGen tokenizer as the reproducible older baseline.

What to collect:

- rFID / LPIPS / PSNR / SSIM on ImageNet;
- parameter count and inference cost;
- encode/decode API cleanliness;
- training recipe reproducibility;
- whether reconstruction quality remains stable under prefix / downsampled
  seed conditions.

Why it matters:

If tokenizer reconstruction is weak, adapter experiments are polluted. But if
the best tokenizer is too heavy or license-blocked, it cannot be canonical.

### Lead E — Adapter families and null baselines

Core question:

> What is the simplest adapter that beats deterministic unfolding?

Starting points:

- deterministic replicate / tile mosaic / PixelShuffle as null baselines;
- MaskGIT-style parallel unmasking;
- block-causal clean-repaint from Cola-DLM;
- coarse-to-fine next-scale prediction from VAR-like models;
- CLIP/SigLIP-conditioned MLP or transformer adapters.

What to collect:

- compute cost;
- deterministic inference path;
- ability to pin known seed positions;
- eval against seed lengths `{4, 16, 64, 256}`;
- whether it consumes Semantic IR as text embedding, structured fields, or both.

Why it matters:

The adapter is where the thesis becomes an engineering object. If a learned
adapter cannot beat a deterministic baseline, we should not spend on larger
heads.

### Lead F — Training infrastructure exemplars

Core question:

> What training-code practices should Wittgenstein copy before writing large
> model scripts?

Starting points:

- LlamaGen training scripts and eval recipe.
- Open-MAGVIT2 / SEED-Voken training surfaces.
- MaskBit / BAR reproducibility surfaces.
- PyTorch FSDP2 examples.
- Lightning Fabric launcher examples.
- Hugging Face Accelerate for launch / checkpoint-loading cases.
- DVC / DataLad-style data snapshotting.
- clean-fid and other metric implementations with pinned preprocessing.

What to collect:

- config system;
- launch command shape;
- distributed strategy;
- data snapshot contract;
- checkpoint format;
- metric wrapper;
- model-card / release convention;
- how failures are logged;
- whether code can be reused, copied with attribution, or only studied.

Why it matters:

Training manifest work is not just traceability. It is the difference between a
professional research stack and an expensive pile of scripts.

### Lead G — Cheap thesis killers

Core question:

> What is the cheapest experiment that would force us to pivot?

Candidates:

- Phase 0a: high token entropy at all positions across prompts.
- Prefix vs random-subset degradation: prefix behaves no better than random.
- Semantic field sensitivity: semantic changes produce only arbitrary output
  changes.
- Adapter null baseline: learned adapter fails to beat deterministic unfold.
- Encoder-distribution comparison: LLM-emitted tokens are far outside the
  natural encoder token distribution.

What to collect:

- exact experiment;
- expected cost;
- pass / fail threshold;
- what pivot follows if it fails.

Why it matters:

The research program should invite falsification. If no cheap experiment can
hurt the thesis, the thesis is not yet operational.

### WP1 — Research map and falsification plan

Owner shape: researcher / maintainer pair.

Output:

- one note that stitches old and new research together;
- a table mapping each hypothesis to evidence, missing experiment, and kill
  criterion;
- a candidate tokenizer table that includes prefix degradation, not only rFID.

Do not modify doctrine in this work package.

### WP2 — Phase 0 experiment hooks

Owner shape: implementation + researcher review.

Output:

- Phase 0a emission entropy script;
- Phase 0b semantic field sensitivity test;
- clean-repaint SeedExpander ABI;
- optional `semantic.reasoning` schema / preamble hook;
- prefix degradation criterion in radar docs.

This is the bridge from research prose to measurable signals.

### WP3 — Training engineering benchmark

Owner shape: infra engineer + researcher.

Output:

- comparison against upstream repos / frameworks;
- reuse vs rewrite decision table;
- manifest schema draft;
- eval wrapper plan;
- dataset snapshot contract.

This is not a training script yet.

### WP4 — Training manifest smoke

Owner shape: infra implementation.

Output:

- CPU-only synthetic checkpoint smoke;
- training manifest helper;
- tests;
- clear statement that this is a receipt floor, not a training platform.

This should be small and mergeable.

## My local answer / current best guess

My current belief:

1. Direct frozen-LLM emission of integer VQ IDs is the riskiest part of the
   thesis. It might work weakly, but we should expect B2 rather than B1:
   semantically structured but decoder-misaligned tokens.
2. Importance-ordered tokenizers are more aligned with Wittgenstein than
   raster-grid VQGAN tokenizers. FlexTok / Spectral / TiTok-style 1D or
   coarse-to-fine ordering should be promoted in the audit criteria.
3. The adapter probably has to become a real learned bridge that consumes both
   seed code and semantic embeddings. A pure SHA/hash or deterministic mosaic is
   only a seam test.
4. The training stack is the project-risk center. Bad training infra can waste
   more time and money than a wrong research note. The first serious training
   artifact must be a manifest-backed smoke, not a large model run.
5. If Phase 0a shows high entropy everywhere, we should not panic silently. We
   should pivot explicitly: Semantic IR becomes the main information carrier,
   and VSC becomes either an adapter-generated code or a learned head output,
   not raw prompt-emitted IDs.

This is not a conclusion. It is my current prior, written so other maintainers
can argue with it.

## What we need from other maintainers / researchers

Please challenge any of the following:

- Is "LLM emits visual code" a meaningful research surface, or are we merely
  rebuilding a text-conditioned tokenizer with extra ceremony?
- Which recent tokenizer family should become the next serious audit target?
- Is prefix degradation the right gate, or should we use a different
  information-ordering test?
- Which upstream training repo should we reuse before writing our own loops?
- What would make a training manifest publishable enough for a paper appendix?
- What is the cheapest experiment that could kill the VSC thesis?
- What is the strongest pivot that preserves the harness thesis if direct VSC
  fails?

The project will be healthier if these questions are answered by multiple
passes, not by one author.

## References

Local:

- `docs/research/2026-05-08-vsc-as-compression-prior.md`
- `docs/research/2026-05-13-wittgenstein-research-program.md`
- `docs/research/2026-05-16-training-stack-re-audit.md`
- `docs/research/2026-05-22-seed-code-stability-analysis.md`
- `docs/research/2026-05-22-ir-reliability-validation.md`
- `docs/research/2026-05-22-cot-inspired-improvements.md`
- `docs/research/2026-05-22-cola-dlm-implications.md`
- `docs/research/2026-05-22-svd-low-rank-and-vq-tokens.md`

External:

- FlexTok — <https://arxiv.org/abs/2502.13967>
- Spectral Image Tokenizer — <https://research.google/pubs/spectral-image-tokenizer/>
- SEED-Voken / Open-MAGVIT2 — <https://github.com/TencentARC/SEED-Voken>
- MaskBit — <https://github.com/markweberdev/maskbit>
- BAR masked bit modeling — <https://github.com/amazon-far/BAR>
- GigaTok — <https://github.com/SilentView/GigaTok>
- TA-TiTok — <https://arxiv.org/abs/2501.07730>
- SoftVQ-VAE — <https://openaccess.thecvf.com/content/CVPR2025/html/Chen_SoftVQ-VAE_Efficient_1-Dimensional_Continuous_Tokenizer_CVPR_2025_paper.html>
- PyTorch FSDP2 — <https://docs.pytorch.org/docs/main/distributed.fsdp.fully_shard.html>
- DVC remote storage — <https://dvc.org/doc/user-guide/data-management/remote-storage>
- Hugging Face model cards — <https://huggingface.co/docs/hub/en/model-cards>
