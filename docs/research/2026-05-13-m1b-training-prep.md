---
date: 2026-05-13
status: research note (training-prep; no implementation in this PR)
labels: [research-derived, m1-image, m1b-prep]
tracks: [#70, #283, #329, #330]
---

# M1B training preparation — engineering practices, parameter survey, layout

> **Status:** research-only. Documents (a) what M1B actually requires once a per-candidate audit clears, (b) engineering practices for adapter / tokenizer training drawn from prior art, (c) starting-point parameters worth knowing, and (d) a concrete code layout that the wiring slice can drop into without re-deciding directory shape. **No training code lands in this PR.** Per the maintainer's direction: research first.
> _Tracker: [#70](https://github.com/p-to-q/wittgenstein/issues/70) (M1B umbrella); informed by [#283](https://github.com/p-to-q/wittgenstein/issues/283) audit work, [#329](https://github.com/p-to-q/wittgenstein/issues/329) VQGAN-class audit, [#330](https://github.com/p-to-q/wittgenstein/issues/330) FSQ shape findings._

## Why this note exists now

The per-candidate audits ([#329 VQGAN-class](https://github.com/p-to-q/wittgenstein/issues/329) Gates A+B PASS, [#330](https://github.com/p-to-q/wittgenstein/issues/330) / [#331](https://github.com/p-to-q/wittgenstein/issues/331) / [#332](https://github.com/p-to-q/wittgenstein/issues/332) / [#333](https://github.com/p-to-q/wittgenstein/issues/333) provisional) have moved the M1B unblock conversation from "can we wire any candidate at all" to "what does wiring look like once we have one." This note answers the second question without committing to a specific candidate or writing any training code.

There are **two distinct M1B paths** the audits surface, and they have different engineering shapes:

1. **VQGAN-class wiring path** (primary; gated on [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)): pull a pretrained VQ tokenizer (LlamaGen 70-72M), wire `loadLlamagenDecoderBridge`, train only a **small adapter** that maps `Semantic IR` / Visual Seed Code → decoder-native token grid.
2. **FSQ training path** (alternate; per [#330](https://github.com/p-to-q/wittgenstein/issues/330) audit): no pretrained weights; train our own encoder-decoder end-to-end with FSQ as the quantization step. Higher upfront cost, cleaner long-term license posture (we own everything).

Both paths share substantial infrastructure (training-data lock, manifest receipts, deterministic seeding). This note covers the shared infra plus path-specific notes.

## Path 1 — Adapter training for VQGAN-class wiring

### What the adapter actually does

Per [ADR-0018](../adrs/0018-hybrid-image-code-and-visual-seed-token.md): "the image adapter is primarily a **seed expander / visual-code compiler**." Concretely:

- **Input:** structured output from the LLM — `seedCode` (Visual Seed Token string) and optional `semantic` (Semantic IR JSON) and optional `coarseVq` (coarse token grid hint).
- **Output:** a full token grid in the decoder's native vocabulary (for LlamaGen: a 16×16 or 32×32 grid of VQ codebook indices).

This is a **small mapping problem**, not a "train another image model" problem. The shape is closer to a learned tokenizer-output projector than to a generative network.

### Engineering practices distilled from prior art

LoRA / small-adapter training literature for similar mapping problems converges on a tight set of parameter ranges. The 2024 prior art on LoRA for vision-language adapters and small bridge networks gives the following starting points:

| Knob | Conservative starting point | Range observed in literature |
|---|---|---|
| Adapter rank (LoRA) or hidden dim (small MLP bridge) | 16 | 4-64 |
| Adapter alpha (LoRA scaling) | rank | 0.5-2× rank |
| Learning rate (AdamW, fresh init) | 1e-4 | 5e-5 to 5e-4 |
| Learning rate (small dataset, <1000 pairs) | 5e-5 | 5e-6 to 5e-5 |
| Batch size | 16-32 | 4-64 (CPU-bound for our hardware) |
| Training-data pairs | 1k-10k | 200 (style transfer) to 100k+ (general) |
| Epochs | 10-30 | with aggressive early stopping |
| Weight decay | 0.01 | 0.0-0.1 |
| Warmup steps | 5% of total | 0-10% |

**These are starting points, not commitments.** The adapter's actual configuration should be ratified via a small empirical sweep during the implementation phase (#70). The point of listing them here is so the wiring slice doesn't have to re-discover parameter ranges from scratch.

### Training-data strategy

The two viable data-source strategies, in order of preference:

1. **License-clean image-text pairs** at the small-data scale (1k-10k):
   - **COCO** (CC-BY-4.0; ~118k captions but we'd subsample) — gold standard, well-documented.
   - **Conceptual Captions** (CC0 for the URLs but image rights vary per-source) — riskier; license per image must be verified.
   - **LAION-Aesthetics-Mini** subsets — sometimes carry research-only restrictions; verify per release.
   - **Domain-specific small corpora** the repo already curates: `data/image_adapter/raw/images/` (the reference-landscape bypass dataset, currently 5-15 images per scene mode per [`packages/codec-image/src/pipeline/landscape-renderer.ts`](../../packages/codec-image/src/pipeline/landscape-renderer.ts) — too small for adapter training, but it's a clean signal that the repo already has the license-clean small-corpus pattern).

2. **Synthetic paired generation** — use the existing LLM to produce `seedCode` for known images, train the adapter to predict the corresponding pretrained-tokenizer output. This is the FSQ-style "train our own pairing" approach applied to the VQGAN path. Cost: LLM tokens for 1k-10k images. License: we own everything.

**Recommended starting strategy:** synthetic paired generation against a small 500-1000 image license-clean corpus, with the LlamaGen tokenizer providing the target token grid. This is the cheapest path to a first golden image and the least exposed to upstream license drift.

### Deterministic-training requirements (manifest spine integration)

Wittgenstein's manifest spine is non-negotiable for the production code path. Training-time receipts must integrate:

- **Seed pinning:** `torch.manual_seed` + `numpy.random.seed` + `python random.seed` all set from a single value recorded in the training manifest.
- **Tokenizer version pinning:** the LlamaGen weights file SHA-256 + HF commit hash recorded at the head of every training run's manifest.
- **Training-data hash:** SHA-256 over the sorted list of input file paths + per-file SHA — matches the existing pattern at [`polyglot-mini/train/data_manifest.json`](../../polyglot-mini/train/data_manifest.json) (lockfile structure from PR #130).
- **Adapter weight hash:** SHA-256 of the final `.safetensors` or `.pth` file, recorded in the training manifest and propagated to every inference run that loads those weights.
- **Lockfile hash:** the Python `requirements.txt` lockfile SHA — matches the existing manifest spine contract.

The training script's output is **not just weights** — it's `(weights, training-manifest.json)` where the manifest is itself byte-pinned and reproducible. This matches the ADR-0005 "decoder is not generator; reproducibility is structural" doctrine and the existing manifest spine for inference runs.

### Cross-platform determinism caveat

The audio M2 sweep ([CHANGELOG.md](../../CHANGELOG.md) `0.3.0-alpha.1`) found that **Kokoro is same-platform deterministic but produces different cross-platform WAV hashes**. The same constraint will apply to PyTorch-based adapter inference: byte-equality across platforms is not realistic. The training-manifest contract should explicitly carry:

- `determinismClass: "byte-parity-on-platform"` (default) OR `"structural-parity-cross-platform"` (degraded)
- Hardware fingerprint at training time (CPU/GPU model, CUDA version if used)

This matches the audio precedent and keeps the manifest honest about what reproducibility means.

## Path 2 — End-to-end FSQ training (alternate)

If VQGAN-class fails its operational gates ([#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)) or its license cleanliness is ever challenged, FSQ becomes the natural pivot. Per the [#330 audit](2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md), this means:

1. **Pick an encoder-decoder architecture sized for our hardware.** Candidates:
   - Small VQGAN-style convnet (encoder + decoder + FSQ bottleneck) — ~50-100M params.
   - Even simpler: small ResNet encoder + transposed-conv decoder + FSQ bottleneck — ~20-40M params, faster to train.
2. **Embed FSQ as the bottleneck.** ~50 lines of code (just rounding/clamping; no codebook losses needed).
3. **Train on a license-clean corpus** with reconstruction loss only (no adversarial / perceptual loss for v1 — adds complexity without proportional gain at our scale).
4. **Ship our own weights** with our own license terms. Cleanest long-term posture but highest upfront cost.

### FSQ path engineering practices

Different from adapter training because we're training a full network from scratch:

| Knob | Starting point | Reasoning |
|---|---|---|
| Encoder-decoder architecture | Small VQGAN-style (50-100M) | Matches LlamaGen's tokenizer size, well-studied shape |
| FSQ levels | `[8, 5, 5, 5]` | The default from Mentzer et al. 2023; ~1000 implicit codebook entries |
| FSQ projection dim | 4 (matches `[8, 5, 5, 5]`) | Paper-default; no codebook collapse possible |
| Training-data scale | 100k-500k images | Far larger than adapter training; from-scratch needs more |
| Learning rate | 1e-4 (AdamW with cosine schedule) | Conservative; from-scratch training is delicate |
| Batch size | 64-128 | GPU-dependent |
| Training time | 1-3 days on a single A100 | Real cost; not feasible on developer laptops |

**This path is realistic only if we have GPU access.** Per the campaign's CPU-friendly bias, the adapter-training path (#1) is strongly preferred unless VQGAN-class fails outright.

## Concrete code layout (no code in this PR; layout only)

```
packages/codec-image/
├── src/
│   ├── decoders/
│   │   ├── README.md                    (existing)
│   │   ├── llamagen.ts                  (existing stub; M1B wires)
│   │   └── seed.ts                      (existing stub)
│   ├── adapters/                        (existing dir)
│   │   ├── adapter-resolve.ts           (existing)
│   │   ├── seed-expander.ts             (existing)
│   │   ├── seed-expander-tile-mosaic.ts (existing)
│   │   ├── mlp-runtime.ts               (existing; placeholder MLP)
│   │   └── README.md                    (NEW; layout doc for adapter weight conventions)
│   └── training/                        (NEW DIR; entry point for M1B training scripts)
│       ├── README.md                    (NEW; training recipe + parameter ranges + reproducibility contract)
│       ├── manifest-schema.ts           (NEW; shared TS types for training-manifest.json)
│       └── (Python training scripts live under polyglot-mini/train/m1b/)
└── test/
    └── (existing tests preserved)

polyglot-mini/
├── train/                               (existing dir; M2 audio training pattern)
│   ├── data_manifest.json               (existing; pattern to mirror)
│   ├── m1b/                             (NEW; M1B adapter training scripts)
│   │   ├── train_adapter.py             (NEW; entry point — VQGAN-class adapter)
│   │   ├── train_fsq.py                 (NEW; entry point — FSQ end-to-end, opt-in)
│   │   ├── eval.py                      (NEW; CLIPScore / VQAScore measurement against the goldens)
│   │   ├── doctor.py                    (NEW; environment sanity check)
│   │   ├── requirements.txt             (NEW; pinned dependencies — PyTorch + safetensors + ...)
│   │   ├── requirements.lock            (NEW; full transitive lockfile SHA recorded in manifest)
│   │   └── manifest.template.json       (NEW; the training-manifest contract this directory writes)
│   └── README.md                        (existing)

fixtures/golden/image/                   (existing dir; will gain training-time goldens)
└── (M1B will add: 5-10 prompts × 1 deterministic seed each → byte-pinned PNGs after training succeeds)
```

The `polyglot-mini/train/m1b/` placement mirrors the existing M2 audio training pattern (data_manifest.json there is the lockfile precedent). The `packages/codec-image/src/training/` directory holds **TypeScript** glue — manifest schema types, weight-loading helpers — that the runtime needs to consume trained weights. **No PyTorch in TypeScript packages.**

### Manifest-schema contract (TS, lands when wiring starts)

Sketch of what `packages/codec-image/src/training/manifest-schema.ts` will export:

```ts
export const TrainingManifestSchema = z.object({
  // Tokenizer / decoder provenance
  tokenizer: z.object({
    family: z.enum(["llamagen", "fsq-custom"]),
    hfCommit: z.string().optional(),  // for llamagen
    weightsSha256: z.string(),
    paramCount: z.number(),
  }),
  // Adapter / trained weights
  adapter: z.object({
    kind: z.enum(["lora", "mlp", "seed-expander", "fsq-encoder-decoder"]),
    weightsPath: z.string(),
    weightsSha256: z.string(),
    rank: z.number().optional(),
    paramCount: z.number(),
  }),
  // Training-time inputs
  data: z.object({
    manifestSha256: z.string(),  // SHA over polyglot-mini/train/m1b/data_manifest.json
    pairCount: z.number(),
    license: z.string(),  // e.g. "CC-BY-4.0" or "synthetic-self-generated"
  }),
  // Reproducibility
  seed: z.number(),
  determinismClass: z.enum(["byte-parity-on-platform", "structural-parity-cross-platform"]),
  hardware: z.object({
    platform: z.string(),       // e.g. "linux-x86_64", "darwin-arm64"
    cudaVersion: z.string().optional(),
    cudnnVersion: z.string().optional(),
  }),
  // Software lockfile
  requirementsLockSha256: z.string(),
  // Provenance
  trainedAt: z.string(),  // ISO 8601
  gitSha: z.string(),     // wittgenstein repo SHA at training time
});
```

This is **what the TS runtime needs to know** to validate that a loaded adapter is compatible with its claimed tokenizer family. It doesn't need to know how the adapter was trained — that's the Python side's domain.

## Specific parameter starting points worth recording

From the prior-art survey + the radar audits, the following are reasonable starting points for the M1B adapter training (recording them here so the wiring slice doesn't re-discover):

### For VQGAN-class adapter (Path 1)

- **Target token grid:** match LlamaGen's tokenizer native output (16×16 for 256² images, or 32×32 for 512² — to be confirmed against the actual LlamaGen weights at fetch time).
- **Adapter architecture:** small MLP (2-4 hidden layers, rank/hidden ~16-32) mapping `seedCode` embeddings + optional `semantic` embeddings → 256 or 1024 codebook indices.
- **Loss function:** cross-entropy against LlamaGen-tokenizer-emitted ground-truth token grids (synthetic pairing).
- **Evaluation:** byte-stable golden test (5-10 fixed prompts → fixed PNGs) + CLIPScore measurement against a held-out validation set.

### For FSQ end-to-end (Path 2; if Path 1 fails)

- **FSQ levels:** `[8, 5, 5, 5]` per Mentzer et al. 2023 paper default — 1000 implicit codebook entries.
- **Encoder-decoder shape:** small VQGAN-style convnet (50-100M params total).
- **Loss:** L1 + L2 reconstruction (no adversarial loss for v1).
- **Evaluation:** same as Path 1 for downstream comparability.

### Cross-path: training-data hashing (the lockfile contract)

The existing [`polyglot-mini/train/data_manifest.json`](../../polyglot-mini/train/data_manifest.json) pattern (PR #130) carries:

- `selection.sha256` — SHA over the sorted list of input file paths.
- `output.sha256` — SHA over the produced `data.jsonl` (or equivalent).
- Per-file SHAs in a nested array, optional but recommended.

M1B training must produce a comparable manifest:

```json
{
  "selection": {
    "files": ["abc.jpg", "def.jpg", ...],
    "sha256": "<sha of sorted file list>"
  },
  "output": {
    "path": "data/m1b/pairs.jsonl",
    "sha256": "<sha of pairs jsonl>"
  },
  "tokenizer": { "family": "llamagen", "weightsSha256": "..." }
}
```

This locks the training-time data inputs and the tokenizer they were paired against. A re-run with the same lockfile produces identical pairs → identical adapter weights (within platform determinism class).

## Open questions deliberately not resolved here

These are **maintainer-decision** questions that this research note flags but does not settle:

1. **Which dataset for synthetic pairing?** Likely COCO subsampled, but the license-clean subset choice affects the manifest contract.
2. **GPU access policy.** Path 2 (FSQ end-to-end) needs GPU. Path 1 (adapter only) can be CPU-trained on 1k-pair data. If we don't commit to GPU, Path 1 is effectively the only path.
3. **Heavy-tier evaluation gate.** CLIPScore + VQAScore are named in Brief E as the v0.3 default-tier image metrics ([`docs/exec-plans/active/codec-v2-port.md`](../exec-plans/active/codec-v2-port.md) M5a). The training-time goldens are byte-pinned; the metric-time evaluation needs a separate slice.
4. **Cross-platform parity class.** The audio precedent (Kokoro structural-parity-cross-platform) suggests the adapter will also be platform-specific for byte equality. Confirm at training time.
5. **Re-training cadence.** If LlamaGen ships an updated tokenizer with the same family + better quality, do we re-train automatically? Probably no for v0.3; revisit at v0.4.

## What this note does NOT do

- **No training code.** Not in this PR; the layout names directories and entry points, not implementation.
- **No doctrine change.** ADR-0018 / ADR-0005 / ADR-0007 framing is preserved.
- **No commitment to a specific path.** Path 1 vs Path 2 is gated on VQGAN-class operational gates ([#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)).
- **No new RFC.** Doctrine-bearing decisions about adapter family / training-manifest shape go through the engineering lane when wiring starts.
- **No specific dataset commitment.** COCO is named as the cheapest viable option, not a ratified choice.

## Cross-references

- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70).
- Per-candidate audits: [#329](https://github.com/p-to-q/wittgenstein/issues/329) VQGAN-class (delivered via [PR #336](https://github.com/p-to-q/wittgenstein/pull/336)); [#330](https://github.com/p-to-q/wittgenstein/issues/330) / [#331](https://github.com/p-to-q/wittgenstein/issues/331) / [#332](https://github.com/p-to-q/wittgenstein/issues/332) / [#333](https://github.com/p-to-q/wittgenstein/issues/333) (delivered via PR #340).
- Implementation gates: [#334](https://github.com/p-to-q/wittgenstein/issues/334) (Gate C), [#335](https://github.com/p-to-q/wittgenstein/issues/335) (Gate D).
- ADRs: [ADR-0018](../adrs/0018-hybrid-image-code-and-visual-seed-token.md) (Visual Seed Code image route), [ADR-0005](../adrs/0005-frozen-vq-decoder-only.md) (frozen-decoder doctrine), [ADR-0007](../adrs/0007-path-c-rejected.md) (no fused multimodal retrain).
- Existing training-manifest pattern: [`polyglot-mini/train/data_manifest.json`](../../polyglot-mini/train/data_manifest.json) (PR #130 — `Added CI-gated sensor goldens and training-data lock receipts`).
- Audio precedent for cross-platform parity class: [CHANGELOG.md](../../CHANGELOG.md) `0.3.0-alpha.1` § Kokoro structural-parity verdict.

## Sources (prior-art parameter survey)

Parameter ranges drawn from publicly-available LoRA + small-adapter training literature, verified 2026-05-13:

- LoRA hyperparameter convergence: rank 4-32, alpha ≈ rank, learning rate 1e-4 to 5e-4 (AdamW), small-batch sizes for small datasets.
- FSQ defaults: levels `[8, 5, 5, 5]` per Mentzer et al. 2023, arXiv:2309.15505.
- Small-dataset fine-tuning practice: learning rates 5e-6 to 5e-5 for <1k examples, aggressive early stopping.

These are starting points, not commitments — the wiring slice will refine them empirically.
