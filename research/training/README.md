# Wittgenstein training stack

This folder hosts the canonical **GPU training programs** for
Wittgenstein-native models: tokenizers, learned adapters, and the native LLM
head distilled from a teacher. It is **not** part of the TypeScript build
graph and is **not** shipped in any npm tarball. The published packages
depend on `@wittgenstein/core` and `@wittgenstein/codec-*` only — never on
anything under `research/` or `python/`.

The directional rule (one-way only):

```
training/research Python  ──may import──▶  packages/<pkg>/src/
packages/<pkg>/src/       ──MUST NOT────▶  research/ or python/
```

CI enforces the publish surface via
`scripts/check-npm-publish-tarball.mjs` and prevents
`packages/*/src` -> training/research Python imports via
`scripts/check-no-research-imports.mjs`.

See the operating doctrine:

- [docs/research/2026-05-13-wittgenstein-research-program.md](../../docs/research/2026-05-13-wittgenstein-research-program.md) — three-track framing (engineering / research / hacker)
- [docs/research/2026-05-13-delivery-and-componentization.md](../../docs/research/2026-05-13-delivery-and-componentization.md) — tier doctrine + why training stays outside the publish surface
- [docs/training/experiment-tracking.md](../../docs/training/experiment-tracking.md) — #399 tracker receipt contract and shared-Aim boundary
- [docs/training/data.md](../../docs/training/data.md) — #400 dataset snapshot + sweep receipt contract
- [docs/research/2026-05-13-m1b-prep-research.md](../../docs/research/2026-05-13-m1b-prep-research.md) — Phase-0 literature floor (LlamaGen, Open-MAGVIT2, TiTok, VAR)
- [docs/research/2026-05-31-training-stack-re-audit-closeout.md](../../docs/research/2026-05-31-training-stack-re-audit-closeout.md) — #441 closeout: schema-aligned receipt floor + GPU wait lines
- [docs/research/2026-05-27-pre-training-readiness.md](../../docs/research/2026-05-27-pre-training-readiness.md) — engineering-readiness audit run right before specialist kickoff (Tier-0 self-check, latent bugs found + fixed, open handoff issues)
- [docs/contributing/training-setup.md](../../docs/contributing/training-setup.md) — environment setup for contributors

## Relationship to `python/image_adapter/`

`python/image_adapter/` is a recognized but narrow M1B adapter-training
surface, not a second general home for Phase-1 GPU training. It owns the
scene-spec-to-VQ-latent MLP bridge and its small NumPy/PyTorch parity
scripts. This directory remains the canonical home for the larger Phase-1
GPU programs.

Use the names precisely:

- `research/training/adapter/`: learned MaskGIT-style L4 seed-code adapter.
- `python/image_adapter/`: scene-spec-to-discrete-latent MLP bridge.

If the image-adapter trainer grows into shared datasets, training manifests,
or multi-GPU/lab execution, move or split that grown surface under
`research/training/image-adapter/` through a focused PR. Until then, the
publish guard and CI smoke cover it as a separate training/research Python
surface.

See the [training homes placement decision][training-homes-decision] for #519.

[training-homes-decision]: ../../docs/research/2026-05-31-training-homes-decision.md

## Subprograms

| Folder       | Phase 1 deliverable                                        |
| ------------ | ---------------------------------------------------------- |
| `tokenizer/` | Wittgenstein-native VQGAN-class tokenizer (ImageNet+CC12M) |
| `adapter/`   | Learned MaskGIT-style L4 seed-code adapter                 |
| `llm-head/`  | Native image-emitting LLM head distilled from teacher      |
| `_shared/`   | Datasets, manifest-spine adapters, eval harness            |

Each subprogram is a self-contained Python project with its own entrypoint.
Subprograms share dataset loading, eval, and manifest-emission helpers from
`_shared/` so receipts stay consistent across runs.

## What a training run produces

Every publishable training run emits, alongside the model checkpoint, a
Wittgenstein `TrainingRunManifest` receipt validated by
`TrainingRunManifestSchema` from `@wittgenstein/schemas`:

- Dataset `dvcRev`, name, and SHA-256
- Training step count, wall-clock, and hardware; CPU-only smoke receipts use
  `gpuCount: 0` instead of pretending a GPU ran
- Eval-metric snapshot (FID / CLIP / rFID per modality)
- Git SHA of the harness at training time
- Git SHA of the training code at training time
- Optimizer state SHA-256
- Seed, lockfile SHA, checkpoint path/SHA-256/bytes, and weights-license posture

A frozen checkpoint released to HuggingFace Hub ships with this manifest
beside it. A downstream `DecoderFamilyManifest` can then bless that exact
checkpoint by pointing `assets.trainingProvenance` at the training receipt.
The inference-time `RunManifest` remains a separate receipt for a concrete
artifact-producing CLI call that may load the blessed decoder.

Experiment tracking is also separate from the training manifest. The local JSONL
tracker writes `experiment-metrics.jsonl` plus a
`witt.training.experiment/v0.1` sibling receipt, and `config.json` carries only a
small `experimentTracking` reference. Shared Aim deployment remains #399's
external lab-work item.

## Receipt smoke

The shared manifest spine has a CPU-only smoke that writes a synthetic
checkpoint plus `manifest.json`, `experiment.json`, and
`experiment-metrics.jsonl` without importing torch or touching real datasets:

```bash
python3 -m research.training._shared.smoke_manifest
python3 -m unittest research.training._shared.test_manifest \
  research.training._shared.test_experiment_tracking
```

This is the receipt floor for #435 / #441. It does not claim that tokenizer,
adapter, or LLM-head training has run; it only proves that future training
programs can emit the required manifest and tracker-receipt shape before GPU
work starts.

## Data snapshot + sweep smoke

The #400 data/sweep floor has a local synthetic DVC pointer and a maintainer-run
sweep manifest writer:

```bash
python3 bench/gpu/sweep.py --spec bench/gpu/smoke-sweep.yaml
```

The command writes generated receipts under `artifacts/benchmarks/` and indexes
the smoke dataset snapshot, training manifest, checkpoint, and JSONL tracker
receipt. It is not managed GPU CI and does not claim ImageNet / CC12M / COCO are
available.

## M1B audit receipts

The VQGAN-class Gate C/D audit has a separate stdlib-only receipt harness:

```bash
pnpm m1b:audit-self-check

python3 -m research.validation.vqgan_gate_audit \
  --out artifacts/m1b-audit/vqgan-gates.json
python3 -m research.validation.m1b_export_llamagen_decoder_onnx --help
python3 -m research.validation.m1b_gate_c_roundtrip --help
python3 -m research.validation.m1b_gate_d_onnx_cpu --help
python3 -m unittest \
  research.validation.test_vqgan_gate_audit \
  research.validation.test_m1b_metric_producers
```

Without local weights the receipt is expected to stay `blocked` / `skipped`.
Gate C passes only after empirical metrics match the decoder-family manifest's
declared acceptance policy: at minimum `encode_consistent=true`,
`decode_consistent=true`, `sample_count>=3`, and the measured
`cross_device_parity`. Re-encode token drift is advisory for the LlamaGen
structural-parity policy unless the manifest declares a hard cap. Gate D passes
only after ONNX/CPU metrics match the manifest-declared latency and output shape
policy. That makes #334 / #335 close over evidence rather than prose.

When lab compute is available, use the lab gate runbook rather than treating a
contributor laptop as the full empirical gate:
[docs/research/2026-05-26-m1b-lab-gate-runbook.md](../../docs/research/2026-05-26-m1b-lab-gate-runbook.md).
The local machine still owns contract preflight and blocked-receipt shape; the
lab owns full-weight Gate C/D evidence.

## Compute

Training is GPU-only and not part of CI's free tier. Run targets:

- Tokenizer: ~1–2 GPU-weeks on 8×A100
- Adapter: ~1–3 GPU-weeks on 4×A100
- LLM head: ~4–8 GPU-weeks on 8×A100

The Phase-1 trackers in the issue list (filed under the M1B prep umbrella)
own the actual runs.

## Not in here

- Generation runtime — that's `packages/codec-image/src/`.
- Decoder bridges — that's `packages/codec-image/src/decoders/`.
- Hackathon-grade ONNX-CPU shortcuts — those served the prior framing and
  have been superseded; see the research-program note.
