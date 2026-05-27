# Adapter (L4 seed expander) training subprogram

Phase 1.2 deliverable: a learned MaskGIT-style L4 adapter that maps
Visual Seed Code (short discrete sequence) → full VQ token grid for the
decoder. Per
[`docs/research/2026-05-13-wittgenstein-research-program.md`](../../../docs/research/2026-05-13-wittgenstein-research-program.md) §1.2.

## Status

**Scaffold not yet written** (this PR landed the tokenizer scaffold first
under `../tokenizer/`). The adapter is the natural follow-up: it consumes
the trained tokenizer's codebook + checkpoints as a frozen target.

Architecture target (per research-program note):

| Field | Choice |
|---|---|
| Architecture | Bidirectional transformer (BERT-shaped), 12 layers, hidden 512, 8 heads (~50M params). |
| Training pairs | (Visual Seed Code, full token grid). Bootstrap: VSC = full grid block-averaged to k×k coarse tokens (k ∈ {2, 4, 8} ablated). |
| Loss | Token-level cross-entropy over the 16384-codebook. |
| Inference schedule | 8-step parallel decoding (MaskGIT schedule), temperature 0 (deterministic) at ship time. |
| Data | Token pairs extracted from ImageNet train + CC12M via the Phase-1.1 tokenizer. |
| Compute budget | ~1–3 GPU-weeks on 4× A800. |

## Inputs from Phase 1.1

The adapter training script will need:

1. **Frozen tokenizer checkpoint** — the result of `tokenizer/train.py`,
   verified via the training manifest's `checkpoint.weights_sha256`.
2. **Tokenized dataset cache** — every image in the training corpus
   tokenized once into `[H, W]` integer grids, persisted to disk for
   quick reload. Cache is content-addressable by `(image_sha256,
   tokenizer_weights_sha256)`.
3. **Visual Seed Code generator** — initial bootstrap: block-average
   pooling of the full grid to coarse k×k. Phase 2 may replace this
   with a learned compress step.

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
checkpoint's manifest pins the tokenizer SHA it was trained against,
so adapter receipts are unambiguous about which tokenizer family they
go with.

## Owning issues

- [#397](https://github.com/p-to-q/wittgenstein/issues/397) — Train
  learned MaskGIT-style L4 adapter.
- [#398](https://github.com/p-to-q/wittgenstein/issues/398) — Adapter ↔
  tokenizer co-training (Phase 2 question).
- [#393](https://github.com/p-to-q/wittgenstein/issues/393) —
  Deterministic-unfolding adapter empirical sweep (baseline row).
- [#453](https://github.com/p-to-q/wittgenstein/issues/453) — Block-causal
  + clean-repaint adapter design (Cola-DLM-inspired, alternative).
- [#454](https://github.com/p-to-q/wittgenstein/issues/454) — CoT-inspired
  visual reasoning block in the VSC preamble (Phase 2).

## Receipt contract

Every adapter training run emits a Wittgenstein manifest receipt under
`research/training/_shared/runs/<run-id>/` mirroring the tokenizer's
`TrainingManifest` shape (see `../_shared/manifest.py`). Additional
adapter-specific fields go into the `config.tokenizer_pin` slot:
the frozen tokenizer's `weights_sha256` and training run-id, so adapter
receipts are unambiguous about which Phase-1.1 checkpoint they consume.
