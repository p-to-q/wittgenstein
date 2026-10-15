# LlamaGen frozen decoder bridge

`packages/codec-image/src/decoders/llamagen/` holds the build-time
artifacts for the LlamaGen-class image decoder bridge. The bridge code
lives in [`../llamagen.ts`](../llamagen.ts) (the loader) and reuses the
shared [`../weights.ts`](../weights.ts) cache + sha256 resolver and the
[`../runtime.ts`](../runtime.ts) ONNX-runtime probe.

## Files

- [`manifest.json`](./manifest.json) — `DecoderWeightsManifest`-shaped
  pin record: `family`, `repoId`, `revision`, `weightsFilename`,
  `weightsSha256`, `license`. Parsed by `DecoderWeightsManifestSchema`
  in `../weights.ts`.

## Provenance

- **Upstream source repo** — `FoundationVision/LlamaGen` ([github](https://github.com/FoundationVision/LlamaGen),
  MIT). The `repoId` + `revision` in the manifest point at the
  audited snapshot (`81e41139…`) of the VQ tokenizer source code.
- **Upstream weights** — `vq_ds16_c2i.pt` (~287 MB FP32, ~72M
  parameters, K=16384, embed dim D=8, downsample factor p=16).
  Upstream SHA-256: `109aa8afb2cf3761eec23cdc8644154cb498f5ab7eef2a35264d25e5e0499f7d`.
- **Shipped weights file** — `llamagen_vq_ds16_decoder.onnx` (~163 MB,
  opset 17). This is the upstream tokenizer's **decoder half** exported
  via `torch.onnx.export` per the audit script
  `m1b-work/scripts/gate_d_onnx_export.py`. Encoder is intentionally
  not in the shipped file — the bridge contract is `decode(codes) →
raster`; encoders are offline tooling for adapter training only.
- **Audit provenance** — Gates A+B in
  [`docs/research/2026-05-13-audit-vqgan-class.md`](../../../../../docs/research/2026-05-13-audit-vqgan-class.md);
  Gates C+D in
  [`docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`](../../../../../docs/research/2026-05-27-audit-vqgan-class-gates-cd.md).

## Capabilities the bridge advertises

| Field              | Value                                                              | Source                                                |
| ------------------ | ------------------------------------------------------------------ | ----------------------------------------------------- |
| `family`           | `"llamagen"`                                                       | manifest                                              |
| `decoderId`        | `"llamagen-frozen-vq-v0"`                                          | locked constant in `../llamagen.ts`                   |
| `supportedShapes`  | `[{ shape: "2D", tokenGrid: [16, 16], outputPixels: [256, 256] }]` | Gate D `latent_grid` + `image_size`                   |
| `codebook`         | `"vq_ds16_c2i"`                                                    | upstream tokenizer artifact name                      |
| `codebookVersion`  | `"FoundationVision/LlamaGen@81e41139"`                             | manifest `repoId@revision` shortening                 |
| `determinismClass` | `"structural-parity"`                                              | Gate C verdict (ADR-0015 cross-platform precedent)    |
| `runtimeTier`      | `"node-onnx-cpu"`                                                  | canonical M-phase tier per `docs/hard-constraints.md` |
| `codeLicense`      | `"MIT"`                                                            | manifest                                              |
| `weightsLicense`   | `"permissive"`                                                     | manifest                                              |

## ONNX hosting — cache-only until the canonical URL lands

The shipped `.onnx` is a derivative artifact (we exported it from the
upstream `.pt`; the upstream repo does not publish ONNX). For the
bridge to fetch on cache-miss, the ONNX needs a stable, SHA-pinnable
URL.

Until that URL is decided (tracked by [#402](https://github.com/p-to-q/wittgenstein/issues/402) —
decoder-delivery; [#435](https://github.com/p-to-q/wittgenstein/issues/435) —
model-owner review hub; owner-facing decision material prepared 2026-10-16:
[`docs/research/2026-10-16-decoder-weights-hosting-decision-brief.md`](../../../../../docs/research/2026-10-16-decoder-weights-hosting-decision-brief.md)),
the bridge runs in **cache-only mode by
default**: `loadLlamagenDecoderBridge()` supplies no fetcher to
`resolveDecoderWeights()`, and weight resolution deliberately runs
before `ensureOnnxRuntime()` — so a cache miss surfaces as
`WEIGHTS_NOT_INSTALLED` with `installHint: "wittgenstein install image"`
deterministically, even on machines without the `onnxruntime-node`
peer (the install CLI for both is tracked by
[#403](https://github.com/p-to-q/wittgenstein/issues/403)).

The fetcher already exists behind a config switch, so blessing a URL
later is a default flip, not a code change: pass
`weightsBaseUrl: "https://huggingface.co"` in
`LoadDecoderBridgeOptions` or set `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL`
to a HuggingFace-style base. The bridge then resolves
`<base>/<repoId>/resolve/<revision>/<filename>` through
`buildHuggingFaceAssetFetcher` (AbortController + unref'ed timeout,
mirroring the core harness fetch-with-timeout contract) and hands the
bytes to `resolveDecoderWeights()`, which sha256-verifies them before
atomic cache promotion — mismatched bytes are never cached or loaded.
Both lanes are regression-pinned in `test/decoder-weights.test.ts` and
`test/llamagen-decoder.test.ts`.

## Phase relationship

Per [`2026-05-13-wittgenstein-research-program.md`](../../../../../docs/research/2026-05-13-wittgenstein-research-program.md):

- **LlamaGen is the M1B Phase 0 floor** — ships first, validates the
  full bridge → adapter → decoder → PNG pipeline end-to-end with a
  permissive baseline.
- **`wittgenstein-native` is Phase 1 canonical** — our own-trained
  VQGAN-class tokenizer on ImageNet+CC12M, K=16384, embed dim D=32,
  rFID target ≤ 2.0 on ImageNet val. Training tracked at
  [#396](https://github.com/p-to-q/wittgenstein/issues/396);
  scaffold at `research/training/tokenizer/`.

The LlamaGen bridge advertises its own `decoderId` so manifest
receipts can be filtered per family. Replacing the canonical lane with
`wittgenstein-native` later is a separate bridge package; this one
stays as the audited floor.
