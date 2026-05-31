---
date: 2026-05-31
status: issue #567 research-to-engineering note
labels: [research-derived, m1b-image, needs-ml-specialist]
tracks: [#567, #332, #393, #352, #70]
cross-refs:
  [
    2026-05-31-titok-gate-b-license-closeout.md,
    2026-05-22-svd-low-rank-and-vq-tokens.md,
    RFC-0007,
    ADR-0020,
  ]
---

# TiTok lessons for compact 1D seed-code design

This note closes
[#567](https://github.com/p-to-q/wittgenstein/issues/567). It is a
method/code extraction from TiTok, not a TiTok adoption proposal.

The durable decision is:

- Keep the #332 decision intact: upstream TiTok weights are research-only for
  canonical M1B purposes and TiTok stays out of `DecoderFamilySchema`.
- Learn the architecture pattern: true compact 1D visual tokens need explicit
  sequence shape, learned order, a tokenizer-native decoder, and a generator
  that understands masked positions.
- Treat prefix meaning as an empirical claim, not a property guaranteed by
  "1D".
- If Wittgenstein later trains project-owned compact 1D weights, start from a
  proxy-code warm-up recipe and falsify ordering assumptions before exposing
  prefix semantics to the LLM-facing `seedCode` layer.

## Non-adoption boundary

This PR does not:

- wire TiTok into any decoder bridge;
- download or cache TiTok weights;
- start any training process;
- activate
  [RFC-0007](../rfcs/0007-image-seedcode-shape-discriminator.md);
- claim TiTok is a canonical M1B candidate under
  [ADR-0020](../adrs/0020-code-weights-license-divergence-policy.md).

The inspected upstream repository code is Apache-2.0, but the current
released pretrained models remain blocked for canonical use by the model-use
boundary recorded in the
[TiTok Gate B closeout](2026-05-31-titok-gate-b-license-closeout.md).

## Source map

Checked on 2026-05-31.

| Source                                                                                                                                              | Observed fact                                                                                                                                                                                                                           | Wittgenstein implication                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TiTok paper, [arXiv:2406.07550](https://arxiv.org/abs/2406.07550), sections 3.2 and 3.3                                                             | The paper distinguishes TiTok from flattening a 2D latent grid. It uses 1D latent tokens plus decoder mask tokens, and trains generation with masked-token prediction over those discrete IDs.                                          | A future 1D latent schema must carry `sequenceLength` and must not hide the candidate behind `tokenGrid: [N, 1]` as if token order were row-major image space.                                      |
| TiTok paper, [arXiv:2406.07550](https://arxiv.org/abs/2406.07550), two-stage training                                                               | Stage 1 trains the 1D tokenizer against proxy codes from an existing MaskGIT/VQGAN tokenizer; stage 2 fine-tunes the decoder toward pixels.                                                                                             | If we train project-owned compact 1D weights, use teacher-token distillation before pixel/GAN losses. Do not start from raw pixel reconstruction plus adversarial loss as the first serious recipe. |
| [`README_TiTok.md`](https://raw.githubusercontent.com/bytedance/1d-tokenizer/main/README_TiTok.md), blob `89c3701f03b3356e8cde80194edd15e2426315af` | The model zoo exposes L32/B64/S128 tokenizers and generators, shows 32-token encode/decode usage, and says the released models are for research purposes.                                                                               | The code is useful prior art; the weights are not a default runtime dependency. Any benchmark must be opt-in and receipt the restriction.                                                           |
| `bytedance/1d-tokenizer` commit `942a96fbdd873780179d1b78d5462911528bf8c8`                                                                          | GitHub reports default branch `main`, latest observed push `2025-03-20T17:30:54Z`, and Apache-2.0 repo license.                                                                                                                         | Pin source revisions in future audits. Do not infer weight terms from repository license alone.                                                                                                     |
| `modeling/titok.py`                                                                                                                                 | `TiTok` creates `latent_tokens`, runs the image patches and latent tokens through a ViT encoder, quantizes with `VectorQuantizer`, and decodes from `decode_tokens()` by reshaping token IDs to an internal `[B, C, 1, N]` tensor.      | "1D" is decoder-native sequence semantics, even when implementation uses a height-1 tensor for convenience. Our manifest should expose sequence shape, not implementation storage.                  |
| `modeling/modules/blocks.py`                                                                                                                        | `TiTokEncoder` appends learned latent tokens after image patch tokens. `TiTokDecoder` asserts `H == 1` and `W == num_latent_tokens`, adds decoder mask tokens for the output patch grid, and uses learned latent positional embeddings. | A compact 1D tokenizer is a learned query bottleneck, not a lossy reshape. Decoder reconstruction depends on learned positions and mask-fill capacity.                                              |
| `modeling/quantizer/quantizer.py`                                                                                                                   | The VQ path uses a codebook with configurable size/token dimension, optional L2 normalization, straight-through quantization, and records codebook/commitment losses.                                                                   | A future 1D bridge manifest needs codebook size, token dimension, quantizer mode, normalization, and sequence length. Shape alone is insufficient.                                                  |
| `modeling/maskgit.py`                                                                                                                               | `ImageBert.generate()` initializes all positions as a mask token, predicts token IDs iteratively, and keeps/remasks positions by confidence under an arccos schedule.                                                                   | The reusable idea for seed expanders is confidence-based fill and remasking. It does not require adopting TiTok weights.                                                                            |
| `configs/training/TiTok/stage1/titok_b64.yaml`                                                                                                      | B64 stage 1 uses `codebook_size: 4096`, `token_size: 12`, `num_latent_tokens: 64`, `finetune_decoder: false`, and a pretrained MaskGIT-VQGAN tokenizer weight.                                                                          | The compact token count is not the whole contract. Training recipe and teacher tokenizer provenance must be part of the experiment receipt.                                                         |
| `configs/training/TiTok/stage2/titok_b64.yaml`                                                                                                      | B64 stage 2 starts from `titok_b_64_stage1.bin`, freezes encoder/quantizer in code, sets `finetune_decoder: true`, and adds perceptual/GAN pixel losses.                                                                                | Decoder fine-tuning should be a second gate after the bottleneck learns stable codes.                                                                                                               |
| `configs/training/generator/maskgit.yaml`                                                                                                           | The generator sequence length is `${model.vq_model.num_latent_tokens}` and uses masked-token generation over the tokenizer codebook.                                                                                                    | Generator/training claims should not be mixed with tokenizer-interface claims. A tokenizer may reconstruct well before a generator is good, and vice versa.                                         |
| Our [RFC-0007](../rfcs/0007-image-seedcode-shape-discriminator.md)                                                                                  | Drafts a `shape` discriminator with `1D` and `2D` cases, plus `sequenceLength` for the 1D case.                                                                                                                                         | Keep dormant, but update the activation criteria: 1D shape does not imply prefix-preview semantics.                                                                                                 |
| Our [decoder bridge README](../../packages/codec-image/src/decoders/README.md)                                                                      | Records `titok` as not registered after #332.                                                                                                                                                                                           | Keep the row, add this note as the method-learning sibling to the license closeout.                                                                                                                 |

## What TiTok teaches

### 1. True 1D is a learned bottleneck, not a flattened grid

TiTok inserts a learned latent-token sequence into a ViT encoder alongside
image patch tokens. The encoder returns only those latent-token states, then
the quantizer maps them to discrete codebook IDs. The decoder consumes a
height-1 sequence tensor and learned positional embeddings, then fills an
output patch grid through decoder mask tokens.

That is meaningfully different from taking a 16x16 VQGAN grid and flattening
it to 256 IDs. Flattening preserves spatial patch identity. TiTok asks the
model to compress the image into `N` learned query slots.

**Engineering consequence:** a future 1D candidate should not be represented
as `tokenGrid: [N, 1]` in receipts. If RFC-0007 activates, the manifest and
latent payload need at least:

- `shape: "1D"`;
- `sequenceLength`;
- `codebookSize`;
- `tokenSize` or embedding dimension;
- `quantizeMode` (`vq` vs VAE-like variants);
- normalization flags such as L2 codebook normalization;
- whether ordering is opaque, prefix-meaningful, or explicitly
  coarse-to-fine.

The last item is a manifest/eval claim, not something `shape` can prove.

### 2. Prefix meaning is not automatic

The old SVD analogy in
[2026-05-22-svd-low-rank-and-vq-tokens.md](2026-05-22-svd-low-rank-and-vq-tokens.md)
was directionally useful but too strong about TiTok. TiTok proves that a short
learned 1D sequence can reconstruct well. It does not prove that token IDs
`0..k-1` form the best preview prefix for every `k`.

The upstream implementation has learned positional embeddings for latent
slots, but no visible objective that explicitly ranks earlier slots by visual
importance. The MaskGIT generator randomly masks positions during training and
uses confidence to decide which positions stay fixed during sampling. That
supports iterative fill, not prefix semantics.

**Engineering consequence:** for Wittgenstein, `seedCode.mode: "lexical"` is
the honest default for a TiTok-like learned sequence unless the tokenizer was
trained for elastic prefixes or an eval proves prefix ordering. A future
`seedCode.mode: "prefix"` claim needs a falsification test:

- ordered prefix beats same-size suffix;
- ordered prefix beats same-size random subset under a fixed fill policy;
- ordered prefix is not destroyed by small perturbations to the missing-token
  fill strategy;
- the advantage holds on held-out images, not only a cherry-picked sample.

If those fail, the sequence is still useful as a compact decoder-native code,
but the LLM should treat it as an opaque lexical code, not as a progressive
preview.

### 3. Proxy-code warm-up is the transferable training recipe

TiTok's most directly reusable training lesson is not "use this model zoo".
It is "make the compact bottleneck learn against an easier teacher-token
target before spending compute on pixel-perfect reconstruction."

In stage 1, the training script downloads or loads a MaskGIT-VQGAN tokenizer
weight, obtains proxy codes with `PretrainedTokenizer.encode(images)`, and
uses cross-entropy over those proxy codes as the reconstruction target. In
stage 2, the implementation freezes the encoder/quantizer/latent tokens and
fine-tunes decoder-side reconstruction with perceptual and adversarial losses.

**Engineering consequence:** if #396 or a future compact-1D training issue
tries project-owned 1D weights, the first serious recipe should be:

1. Pick a permissive/project-owned 2D teacher tokenizer or our own VQGAN-class
   tokenizer once ready.
2. Train a 1D bottleneck to predict teacher code distributions, with full
   teacher and dataset provenance in receipts.
3. Only after the bottleneck has stable token usage, fine-tune a decoder toward
   pixels.
4. Record whether generator quality is evaluated separately from tokenizer
   reconstruction quality.

This is more reliable than opening with raw pixels plus GAN loss. It also
keeps the training question testable: if proxy-code distillation cannot beat
the deterministic adapter floor, do not escalate to expensive decoder
fine-tuning.

### 4. Masked-token generation maps to seed expansion, not adoption

TiTok's MaskGIT generator starts from all masked positions, predicts tokens,
then remasks low-confidence positions under an arccos schedule. This is useful
for Wittgenstein even without TiTok weights.

For the seed-expander line, the transferable idea is:

- known seed positions should be pinned;
- unknown positions can be filled iteratively;
- each step should make a confidence claim;
- low-confidence positions should remain editable longer than high-confidence
  positions;
- final receipts should say how many positions were fixed from the LLM seed
  versus filled by the adapter.

That maps naturally to the block-causal / clean-repaint seed-expander work and
to #393's seed-length sweep. It does not require TiTok as the decoder family.

### 5. Runtime and export risk is real

The upstream path is PyTorch-centered. The tokenizer/generator classes use
Hugging Face model mixins, OmegaConf configs, ViT blocks, custom quantizer
logic, optional CUDA/xFormers/flash attention branches, and a MaskGIT
generator. The README demonstrates PyTorch inference and model loading; the
inspected source did not expose a first-class ONNX/Node export path.

**Engineering consequence:** any future 1D bridge should fail Gate C unless it
has a measured export story. The manifest must not just say "1D tokenizer";
it needs runtime tier, export format, custom-op inventory, deterministic
settings, and cache/license receipts.

### 6. TiTok metrics are useful but not our metrics

TiTok reports reconstruction and generation metrics for encoder-native tokens
and its paired generator. Those are relevant for model capability, but they do
not answer whether an LLM can emit stable useful seed codes.

For Wittgenstein, the extra questions are:

- Does the LLM-facing `seedCode` distribution carry visual information, or is
  it just a random seed?
- Does a partial seed code degrade gracefully under our adapter?
- Does a claimed 1D ordering survive prefix/suffix/random-subset ablations?
- Are receipts enough to reproduce every bridge/load/fill decision?

These questions belong in #393 and later M1B gate work, not in a TiTok
adoption shortcut.

## Copy / adapt / avoid

| Decision | What to do                                                                                              | Why                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Copy     | Model true 1D latents as `sequenceLength` plus codebook metadata.                                       | The decoder semantics are sequence-native; fake 2D grids make receipts misleading. |
| Copy     | Use proxy-code warm-up before pixel/GAN decoder fine-tuning for any project-owned compact 1D tokenizer. | TiTok's strongest transferable recipe is the staged target hierarchy.              |
| Copy     | Use masked-token confidence fill as an adapter/generator pattern.                                       | It is useful for seed expansion and clean repaint even when TiTok is not adopted.  |
| Adapt    | Keep TiTok as method prior art, not runtime dependency.                                                 | #332/ADR-0020 block default pretrained-weight use.                                 |
| Adapt    | Turn "1D order" into an eval field, not a schema assumption.                                            | Learned latent slots are ordered, but not necessarily prefix-ranked.               |
| Adapt    | Compare tokenizer reconstruction, generator quality, and LLM seed-code quality separately.              | TiTok's published metrics do not measure our LLM-emitted seed interface.           |
| Avoid    | Do not add `titok` to `DecoderFamilySchema`.                                                            | Upstream weight terms remain incompatible with canonical M1B.                      |
| Avoid    | Do not treat `tokenGrid: [N, 1]` as an honest 1D contract.                                              | Internal tensor layout is not the same as latent semantics.                        |
| Avoid    | Do not claim prefix preview from TiTok-style tokens without a prefix-order audit.                       | The upstream objective does not visibly enforce first-k importance.                |
| Avoid    | Do not start compact-1D training from raw pixel GAN loss as the first serious recipe.                   | The proxy-code stage is the lower-risk path.                                       |

## Downstream recommendations

1. **For #393:** add a prefix-order falsification section once the sweep has a
   working tokenizer. Compare ordered prefixes against suffixes, random
   subsets, and shuffled same-size subsets under the same fill policy. A good
   `S=16` curve is not enough if it only works for arbitrary known positions.
2. **For RFC-0007:** keep `shape: "1D"` plus `sequenceLength`, but do not let
   the shape discriminator imply prefix semantics. When a 1D candidate clears
   gates, add a manifest-level `orderSemantics` claim such as `opaque`,
   `prefix-meaningful`, or `coarse-to-fine`, backed by eval receipts.
3. **For future own-trained compact 1D weights:** write the first experiment as
   teacher-token distillation from a permissive tokenizer, then decoder
   fine-tuning. Do not escalate to generator training until reconstruction and
   token-usage receipts pass.
4. **For the seed-expander path:** steal confidence-based masked fill, not the
   weights. The bridge/adapter should record pinned seed positions, generated
   positions, fill schedule, and final confidence statistics.
5. **For docs and claims:** revise TiTok references that imply prefix ranking.
   The correct claim is "compact learned 1D sequence"; prefix-preview remains a
   hypothesis.

## Small non-training evals to run later

These should not load TiTok research-only weights by default.

| Eval                             | Needs weights?                     | Acceptance signal                                                                                                                                                                                                                |
| -------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1D manifest shape fixture        | No                                 | A future manifest fixture with `shape: "1D"` and `sequenceLength` validates, while the same token payload disguised as `tokenGrid: [N, 1]` is rejected once RFC-0007 activates.                                                  |
| Prefix-claim audit harness       | Optional opt-in                    | With allowed/project-owned weights, ordered prefixes outperform suffix/random/shuffled subsets at the same token budget under a fixed fill policy. Without allowed weights, the harness remains skipped and cannot close a gate. |
| Seed-expander confidence receipt | No model download for fixture mode | A fixture adapter records pinned/fill counts and deterministic confidence buckets for the same seed, giving #393 a receipt shape before a learned adapter exists.                                                                |

## Kill criteria

- If no permissive or project-owned compact 1D weights exist, do not wire a 1D
  bridge.
- If prefix-vs-random/suffix ablations do not show an ordered-prefix advantage,
  keep `seedCode.mode: "lexical"` for the family and do not market fast prefix
  preview.
- If proxy-code warm-up cannot beat the deterministic-unfolding adapter floor
  in #393, do not spend compute on compact-1D decoder fine-tuning.
- If ONNX/Node export requires unbounded custom PyTorch/runtime work, keep the
  candidate research-only even if reconstruction quality is attractive.
- If generator metrics improve while tokenizer reconstruction or LLM seed-code
  stability does not, do not count that as M1B progress.

## Closeout

TiTok should influence Wittgenstein as a design pressure, not as a dependency:
compact decoder-native sequences are viable, but shape, ordering, training
recipe, runtime export, and license receipts must be independently proven.
