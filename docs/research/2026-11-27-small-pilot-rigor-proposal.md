# Small-pilot rigor proposal — 2026-11-27

**Status: execution hypothesis for review, not ratified doctrine, a training
launch approval, or a result.** This proposal refines questions in #396–#400,
#394 and #452 without changing ADR-0018, the VSC wire format, decoder selection,
or the single image path. An implementation that changes those contracts must
still take the engineering decision lane. Larger allocation remains gated by
the [compute-readiness roadmap](2026-11-27-compute-readiness-roadmap.md).

## Separate the claims before choosing the experiment

| Question                                    | Necessary comparison                                                                                                             | What a positive result would not establish                            |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Does the tokenizer preserve images?         | Fixed held-out images → full tokens → frozen decoder, with pinned preprocessing/weights                                          | Text-to-image ability, compact-code utility, or frontier quality      |
| Does compact VSC retain useful information? | Image-derived oracle seeds → expander → same frozen decoder; compare deterministic and learned expansion at the same seed budget | That a text planner can predict those seeds                           |
| Can text produce useful VSC?                | Text-predicted vs oracle seeds, using the same expander/decoder and held-out split                                               | End-to-end user utility or general superiority over stronger models   |
| Does the expander use its input?            | Correct, shuffled, blank and mismatched seeds; semantic support on/off                                                           | A benefit attributable to VSC if semantic side information carries it |
| Is the whole system useful?                 | Fixed task/prompt set, blinded paired comparison, repair/failure/latency accounting                                              | Novelty or broad usefulness from one aggregate image metric           |

Choose **one** question for the first useful allocation. A trained tokenizer is
not automatically a prerequisite for the cheapest discriminating pilot if a
rights-cleared, compatible frozen target becomes available through #402. The
learned adapter and native LLM head remain unimplemented (#397/#398): documentation
or a smoke must not label them runnable. Their full acceptance criteria remain
open.

## Correct two ambiguous execution assumptions

1. **Categorical IDs are not continuous coordinates.** The `block-averaged
coarse tokens` wording in #397 cannot mean averaging integer codebook IDs.
   A simple baseline selects specified existing positions, preserving IDs.
   Averaging codebook embeddings and re-quantizing is a different hypothesis;
   learned compression is another. Write down the selection, order, seed
   budget and tokenizer checkpoint. A codebook-label permutation should not
   change the meaning of a representation merely because its integer values
   changed. This correction does not prescribe a new shipping representation.
2. **Different output lengths do not define a KL target by themselves.** For
   #398, explicitly specify how each compact student position aligns with
   teacher positions, whether targets are probabilities or categorical labels,
   and what spatial information pooling discards. A reconstruction loss through
   a discrete argmax/token lookup has no ordinary gradient to the emitter;
   name and test the estimator or differentiable relaxation before budgeting
   training. A frozen decoder can pass gradients to continuous inputs; frozen
   parameters alone are not the obstruction. Test shape alignment and gradient
   flow on tiny artificial logits before any model/data allocation.

The official [LlamaGen quantizer source](https://github.com/FoundationVision/LlamaGen/blob/main/tokenizer/tokenizer_image/vq_model.py)
uses nearest-code assignment and embedding lookup; its codebook labels are not
image intensities. The [MaskGIT paper](https://arxiv.org/abs/2202.04200) motivates
masked token prediction and iterative decoding, not averaging label IDs. These
are implementation precedents, not evidence that this repo's proposed seed
representation works.

## Minimum prespecification for a bounded pilot

Before examining validation results, record in the owning issue and run config:

- One primary question, one primary endpoint, its direction, a reference
  baseline, and a numerical minimum useful effect chosen for the task. Mark
  all other metrics exploratory; do not choose the endpoint after seeing which
  metric improved.
- Immutable train/validation/final-eval content identities, grouping rules,
  exclusions, rights evidence and preprocessing. Run the
  [technical audit](2026-11-27-dataset-audit.md), then separately review near
  duplicates, subjects/captions and teacher leakage. Preserve failures.
- Model/tokenizer/teacher/decoder hashes, seed length and coding/alignment,
  parameter counts, total training/inference work, semantic side information
  and the available compute/storage/wall-time cap. Compare at matched budgets
  or disclose the mismatch rather than crediting extra compute to VSC.
- Repeated **training** seeds where affordable and fixed paired evaluation
  examples. Per-image paired intervals measure variation across examples;
  they do not replace independent training repeats. Keep dependence from
  shared subjects/prompts in the uncertainty unit rather than treating every
  correlated image as an independent replicate.
- A stopping decision: invalid/collapsed codes, training–validation divergence,
  indistinguishable performance from the null baseline, input-insensitive
  outputs, or exhausted resource cap. A negative pilot can be informative;
  publication value is not guaranteed by either a positive or negative sign.

Keep compact-seed reconstruction separate from generative distribution metrics.
For rFID/FID, pin the implementation, feature model, preprocessing, sample
count, real reference set and environment; a small-subset score is not directly
comparable to a historical 30K/50K score. The
[Clean-FID implementation](https://github.com/GaParmar/clean-fid) is the current
metric dependency, not a substitute for matching those choices. Missing metrics
or partial coverage stay explicit rather than becoming successful qualification.

## Cheap next steps that do not consume a training allocation

1. Run the new fixture-backed software/data checks and resolve real data rights,
   immutable split selection and an independent remote restore (#400).
2. Review the two target-definition corrections above in #397/#398; implement
   only the agreed CPU-checkable pair/target contract and gradient/shape tests
   before a trainer or export claims compatibility. Avoid a speculative large
   model implementation against an undefined compact target.
3. Select one experiment from the first table, pin its prespecification and
   obtain an explicit target-host resource cap. Then implement/qualify only the
   missing pieces for that experiment.

This proposal does not relax independent review or silently rewrite the
historical research-program note. The earlier full-training recipes remain
hypotheses, not evidence that compute is the only unresolved dependency.
