# Wittgenstein training stack

This folder hosts the **GPU training programs** for Wittgenstein-native
models: tokenizers, learned adapters, and the native LLM head distilled from
a teacher. It is **not** part of the TypeScript build graph and is **not**
shipped in any npm tarball. The published packages depend on
`@wittgenstein/core` and `@wittgenstein/codec-*` only — never on anything
under `research/`.

The directional rule (one-way only):

```
research/training/  ──may import──▶  packages/<pkg>/src/
packages/<pkg>/src/ ──MUST NOT────▶  research/training/
```

CI enforces the publish surface via
`scripts/check-npm-publish-tarball.mjs` and prevents
`packages/*/src` -> `research/` imports via
`scripts/check-no-research-imports.mjs`.

See the operating doctrine:

- [docs/research/2026-05-13-wittgenstein-research-program.md](../../docs/research/2026-05-13-wittgenstein-research-program.md) — three-track framing (engineering / research / hacker)
- [docs/research/2026-05-13-delivery-and-componentization.md](../../docs/research/2026-05-13-delivery-and-componentization.md) — tier doctrine + why training stays outside the publish surface
- [docs/research/2026-05-13-m1b-prep-research.md](../../docs/research/2026-05-13-m1b-prep-research.md) — Phase-0 literature floor (LlamaGen, Open-MAGVIT2, TiTok, VAR)
- [docs/research/2026-05-27-pre-training-readiness.md](../../docs/research/2026-05-27-pre-training-readiness.md) — engineering-readiness audit run right before specialist kickoff (Tier-0 self-check, latent bugs found + fixed, open handoff issues)
- [docs/contributing/training-setup.md](../../docs/contributing/training-setup.md) — environment setup for contributors

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

Every training run emits, alongside the model checkpoint, a Wittgenstein
manifest receipt (the same spine the harness uses for generation):

- Dataset hash (DVC-pinned)
- Training step count + wall-clock + GPU type
- Eval-metric snapshot (FID / CLIP / rFID per modality)
- Git SHA of the harness at training time
- Seed + lockfile hash

A frozen checkpoint released to HuggingFace Hub ships with this manifest
beside it. The CLI's `wittgenstein replay <manifest>` works equally for a
generation receipt and a training receipt — same spine.

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
