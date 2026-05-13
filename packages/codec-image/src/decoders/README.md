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

| Family     | Status                                                             | Tracker | Audit doc                                                                                                                            |
| ---------- | ------------------------------------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `llamagen` | M1B canonical target — interface locked; impl gated on #334 / #335 | #329    | [`2026-05-13-audit-vqgan-class.md`](../../../../docs/research/2026-05-13-audit-vqgan-class.md)                                       |
| `seed`     | alternate (OpenMAGVIT2 / SEED-Voken / similar)                     | #331    | [`2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md`](../../../../docs/research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md) |
| `dvae`     | future — for smaller ablations + eval tooling                      | —       | —                                                                                                                                    |

All bridges here are intended to be **frozen pretrained decoders**, not
generators (ADR-0005). Training a decoder from scratch is out of scope
for v0.x.

## Files

- [`./types.ts`](./types.ts) — the bridge contract; locked surface every
  impl PR fills.
- [`./llamagen.ts`](./llamagen.ts) — M1B canonical bridge (currently
  throws `LLAMAGEN_BRIDGE_NOT_IMPLEMENTED`).
- [`./seed.ts`](./seed.ts) — alternate bridge (currently throws
  `SEED_BRIDGE_NOT_IMPLEMENTED`).

## How the M1B impl PR fills this

1. Drop a `decoders/llamagen/manifest.json` with pinned `weightsSha256`,
   `codebookSha256`, `repoId`, `revision`, mirroring `codec-audio/decoders/kokoro/manifest.json`.
2. Implement `loadLlamagenDecoderBridge`:
   - Verify weights cache; fetch + sha256-verify on miss.
   - Refuse if research-only + `!allowResearchWeights`.
   - Build ONNX session (default tier `node-onnx-cpu`).
   - Return an object satisfying `ImageDecoderBridge` with `capabilities`
     filled from the manifest + measured-at-load determinism class.
3. Wire `../pipeline/decoder.ts` to call the bridge and stop on bridge-load
   failure with a structured error, manifest receipt, and warning. Do not route
   bridge failure into the procedural placeholder; M1B must not create a second
   raster shipping path.
4. Add `wittgenstein replay` smoke test using the wired bridge (#388
   already supports svg-local; adding image requires the bridge).
5. Update `docs/research/2026-05-13-m1b-prep-research.md` with the actual
   measured numbers (quality, latency, decoder hash, determinism class).
