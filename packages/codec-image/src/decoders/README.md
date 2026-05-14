# Image decoder bridges

The image route has exactly one shipping path (per `docs/hard-constraints.md`):

```
LLM → Visual Seed Code → L4 adapter → frozen VQ decoder → PNG
```

A **decoder bridge** is what fills the `frozen VQ decoder` slot. Each bridge
encapsulates one decoder family — the ONNX session, the codebook, the
runtime tier (CPU / GPU / external), the license posture, the determinism
contract. The pipeline (`../pipeline/decoder.ts`) calls the bridge after
`adaptSceneToLatents` produces `ImageLatentCodes`; the bridge returns
`DecodedRaster` PNG bytes.

## Bridge contract

Every bridge conforms to `ImageDecoderBridge` (see [`./types.ts`](./types.ts)).
The contract surface is intentionally small:

- `capabilities` — what shapes / codebooks / determinism class / license
  posture the bridge advertises. Pipeline matches this against incoming
  latents BEFORE calling `decode()`; mismatches are typed errors, not
  runtime surprises.
- `decode(codes)` — single-call latent → PNG. Throws `WittgensteinError`s
  with stable codes (`DECODER_SHAPE_UNSUPPORTED`, `DECODER_CODEBOOK_MISMATCH`,
  `DECODER_RUNTIME_UNAVAILABLE`, `DECODER_INFERENCE_FAILED`).
- `unload()` — release weights / ONNX session. Idempotent.

Every bridge is loaded via `load<family>DecoderBridge(options)`. The loader
is the enforcement point for ADR-0020 (`allowResearchWeights` check) and
the place where the cache-or-fetch + sha256-verify of weights happens.

## Candidate families

| Family                                | Status                                                                                                                                 | Tracker                          | Audit / training doc                                                                                                                                                                                            |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wittgenstein-native` (canonical M1B) | **Own-trained VQGAN-class** on ImageNet+CC12M, K=16384, embed dim 32, ds=16. Training program in the research-program note.            | #396 (tokenizer), #397 (adapter) | [`2026-05-13-wittgenstein-research-program.md`](../../../../docs/research/2026-05-13-wittgenstein-research-program.md) §1.1                                                                                     |
| `llamagen`                            | **Fallback / floor** — only if own-trained weights aren't ready at ship time. Apache-2.0; interface locked; impl gated on #334 / #335. | #329                             | [`2026-05-13-audit-vqgan-class.md`](../../../../docs/research/2026-05-13-audit-vqgan-class.md) + [`2026-05-13-m1b-prep-research.md`](../../../../docs/research/2026-05-13-m1b-prep-research.md) (Phase 0 floor) |
| `seed`                                | alternate research-track (OpenMAGVIT2 / SEED-Voken / similar)                                                                          | #331                             | [`2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md`](../../../../docs/research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md)                                                                            |
| `var`                                 | Phase 2 architectural option — multi-scale VQ ([VAR](https://github.com/FoundationVision/VAR), NeurIPS 2024 Best Paper)                | (filed in Phase 2)               | [`2026-05-13-wittgenstein-research-program.md`](../../../../docs/research/2026-05-13-wittgenstein-research-program.md) §"Phase 2"                                                                               |
| `dvae`                                | future — for smaller ablations + eval tooling                                                                                          | —                                | —                                                                                                                                                                                                               |

All bridges here are **frozen at ship time** (ADR-0005). Per the
[research-program note](../../../../docs/research/2026-05-13-wittgenstein-research-program.md),
we now also **train** decoders ourselves; the freeze applies to the
released-binary form, not to the upstream pipeline. Training scaffolding
lives outside this directory (under `research/training/` once Phase 1
infrastructure lands).

## Files

- [`./types.ts`](./types.ts) — the bridge contract; locked surface every
  impl PR fills.
- [`./runtime.ts`](./runtime.ts) — `ensureOnnxRuntime()` helper that every
  bridge calls before building an inference session. Turns missing-peer
  failures into typed `DECODER_RUNTIME_UNAVAILABLE` errors instead of
  leaking Node's `ERR_MODULE_NOT_FOUND`.
- [`./weights.ts`](./weights.ts) — cache/sha256/license helper for #402.
  It verifies already-cached bytes, supports injected fetchers for tests and
  future installers, and enforces ADR-0020 before any runtime session starts.
- [`./llamagen.ts`](./llamagen.ts) — M1B canonical bridge (currently
  throws `LLAMAGEN_BRIDGE_NOT_IMPLEMENTED`).
- [`./seed.ts`](./seed.ts) — alternate bridge (currently throws
  `SEED_BRIDGE_NOT_IMPLEMENTED`).

## Optional peer dependencies

Per the [delivery and componentization doctrine](../../../../docs/research/2026-05-13-delivery-and-componentization.md) §"Optional/peer dependencies for runtimes",
heavy inference runtimes do NOT land in a Tier 0 user's install
footprint. They are declared in this package's `package.json` as:

```jsonc
{
  "peerDependencies": { "onnxruntime-node": "^1.18.0" },
  "peerDependenciesMeta": { "onnxruntime-node": { "optional": true } },
}
```

A clean `pnpm install @wittgenstein/cli` against a machine with no GPU /
no ONNX install pulls zero bytes of inference runtime. The CLI's
`wittgenstein install image` (tracker [#403](https://github.com/p-to-q/wittgenstein/issues/403))
fetches the runtime on demand.

Bridges call [`./runtime.ts`](./runtime.ts) to load the runtime at
bridge-load time:

```ts
import { ensureOnnxRuntime } from "./runtime.js";

export async function loadLlamagenDecoderBridge(options) {
  const ort = await ensureOnnxRuntime(); // throws DECODER_RUNTIME_UNAVAILABLE
  const session = await ort.InferenceSession.create(weightsPath);
  // ...
}
```

Failure surfaces as a `WittgensteinError` with stable code
`DECODER_RUNTIME_UNAVAILABLE` and a `details.installHint` pointing the
user at the install CLI. Never let Node's `ERR_MODULE_NOT_FOUND` reach
the user surface — it's confusing and bypasses the tier doctrine.

## How the M1B impl PR fills this

The bridge interface is decoder-family-agnostic; the same checklist
applies whether we ship with `wittgenstein-native` (own-trained, canonical
Phase 1) or with `llamagen` (Phase 0 floor / fallback).

1. Drop a `decoders/<family>/manifest.json` with pinned `weightsSha256`,
   `codebookSha256`, `trainingRunId` (own-trained) or `repoId`+`revision`
   (upstream), mirroring `codec-audio/decoders/kokoro/manifest.json`.
2. Implement `load<Family>DecoderBridge`:
   - Verify weights cache; fetch + sha256-verify on miss (own-trained
     weights live on our HuggingFace org per the research-program note).
   - Refuse if research-only + `!allowResearchWeights` (ADR-0020).
   - Build inference session under the requested runtime tier (default
     `node-onnx-cpu` for embedded deploy; `node-onnx-gpu` for the
     canonical research path; new tiers require an ADR).
   - Return an object satisfying `ImageDecoderBridge` with `capabilities`
     filled from the manifest + measured-at-load determinism class
     (likely `structural-parity` for learned-model paths).
3. Wire `../pipeline/decoder.ts` to call the bridge and stop on
   bridge-load failure with a structured error, manifest receipt, and
   warning. Do not route bridge failure into the procedural placeholder;
   M1B must not create a second raster shipping path.
4. Add `wittgenstein replay` smoke test using the wired bridge (#388
   already supports svg-local; adding image requires the bridge +
   `structural-parity`-aware comparison).
5. Update both research notes with the actual measured numbers:
   - [`../../../../docs/research/2026-05-13-wittgenstein-research-program.md`](../../../../docs/research/2026-05-13-wittgenstein-research-program.md)
     §"Phase 1 Eval program" — the canonical ablation matrix entries.
   - [`../../../../docs/research/2026-05-13-m1b-prep-research.md`](../../../../docs/research/2026-05-13-m1b-prep-research.md)
     §"Recommended minimum first-cut" — the Phase 0 floor receipts, if
     LlamaGen-fallback was actually used at any release.
