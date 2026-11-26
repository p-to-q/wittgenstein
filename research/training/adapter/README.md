# Adapter (L4 seed expander) training subprogram

Phase 1.2 deliverable: a learned MaskGIT-style L4 adapter that maps
Visual Seed Code (short discrete sequence) → full VQ token grid for the
decoder. Per
[`docs/research/2026-05-13-wittgenstein-research-program.md`](../../../docs/research/2026-05-13-wittgenstein-research-program.md) §1.2.

## Status

**Scaffold not yet written** (this PR landed the tokenizer scaffold first
under `../tokenizer/`). The adapter is the natural follow-up: it consumes
the trained tokenizer's codebook + checkpoints as a frozen target.

Runtime-facing ABI baselines already exist in `packages/codec-image/src/adapters/`:
`placeholderSeedExpander`, `tileMosaicSeedExpander`, and
`blockCausalMaskgitSeedExpander`. They are deterministic placeholder-class
expanders for manifests, receipts, and codec routing only. They do not replace
this training subprogram; the learned adapter still owns the quality claim.

Architecture target (per research-program note):

| Field              | Choice                                                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture       | Bidirectional transformer (BERT-shaped), 12 layers, hidden 512, 8 heads (~50M params).                                                                                        |
| Training pairs     | (Visual Seed Code, full token grid). Bootstrap: categorical grid tokens sampled at fixed positions as a baseline (k ∈ {2, 4, 8}); learned compression is a separate ablation. |
| Loss               | Token-level cross-entropy over the 16384-codebook.                                                                                                                            |
| Inference schedule | 8-step parallel decoding (MaskGIT schedule), temperature 0 (deterministic) at ship time.                                                                                      |
| Data               | Token pairs extracted from ImageNet train + CC12M via the Phase-1.1 tokenizer.                                                                                                |
| Compute budget     | Historical estimate only; no current allocation or measured throughput.                                                                                                       |

## Inputs from Phase 1.1

The adapter training script will need:

1. **Frozen tokenizer checkpoint** — the result of `tokenizer/train.py`,
   verified via the training manifest's `checkpoint.sha256`.
2. **Tokenized dataset cache** — every image in the training corpus
   tokenized once into `[H, W]` integer grids, persisted to disk for
   quick reload. Cache is content-addressable by image SHA-256 and
   tokenizer checkpoint SHA-256.
3. **Visual Seed Code generator** — define and version a baseline that selects
   existing categorical tokens at fixed positions. Do not average integer token
   IDs: their numeric order does not encode visual distance. Pooling embeddings
   followed by explicit re-quantization would be a different hypothesis requiring
   its own cache identity and evaluation. No learned compressor is implemented.

Before spending on this target architecture, follow the
[compute-readiness roadmap](../../../docs/research/2026-11-27-compute-readiness-roadmap.md).
Oracle image-derived seeds test recoverable information; they do not establish
that a text-only planner can predict those seeds.

## When this lights up

After Phase 1.1 ships a publishable tokenizer checkpoint (rFID ≤ 2.0
on ImageNet val 50k), the adapter scaffold follows the same pattern as
`tokenizer/`:

```
adapter/
├── README.md           # this file
├── config.py           # AdapterConfig, TrainConfig, smoke_config
├── model.py            # MaskGitAdapter class (bidirectional transformer)
├── losses.py           # CE over codebook + masking schedule
├── train.py            # DDP-native loop, reuses _shared/manifest.py
├── smoke_test.py
└── tokenize_corpus.py  # one-time cache builder: image → tokens
```

The receipt-first design (per #441) carries through — every adapter
checkpoint's manifest pins the tokenizer run id and checkpoint SHA-256 it was
trained against, so adapter receipts are unambiguous about which tokenizer
family they go with.

## Owning issues

- [#397](https://github.com/p-to-q/wittgenstein/issues/397) — Train
  learned MaskGIT-style L4 adapter.
- [#398](https://github.com/p-to-q/wittgenstein/issues/398) — Adapter ↔
  tokenizer co-training (Phase 2 question).
- [#393](https://github.com/p-to-q/wittgenstein/issues/393) —
  Deterministic-unfolding adapter empirical sweep (baseline row).
- [#453](https://github.com/p-to-q/wittgenstein/issues/453) — Block-causal
  plus clean-repaint adapter design (Cola-DLM-inspired, alternative).
- [#454](https://github.com/p-to-q/wittgenstein/issues/454) — CoT-inspired
  visual reasoning block in the VSC preamble (Phase 2).

## Receipt contract

Every adapter training run emits a Wittgenstein manifest receipt under
`research/training/_shared/runs/<run-id>/` using the canonical
`TrainingRunManifest` shape (see `../_shared/manifest.py`). Additional
adapter-specific pins should live in the referenced training config, not as
freeform top-level manifest fields: the frozen tokenizer's checkpoint SHA-256
and training run-id must be enough to make adapter receipts unambiguous about
which Phase-1.1 checkpoint they consume.
