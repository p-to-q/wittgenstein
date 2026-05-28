---
date: 2026-05-27
status: audit deliverable (Gates C+D for Priority 1 of #283) — ALL FOUR GATES PASS
labels: [research-derived, m1-image, audit]
tracks: [#334, #335, #329, #283, #70]
follows-from: docs/research/2026-05-13-audit-vqgan-class.md
---

# VQGAN-class per-candidate audit — Gates C and D verdict

> **Status:** four-gate audit for VQGAN-class, closing the operational
> gates (C: determinism, D: Node/ONNX/CPU feasibility) left as
> follow-ups by the Gates A+B audit on 2026-05-13. **All four gates
> pass** under the `structural-parity` determinism contract (ADR-0015
> precedent). Combined with the earlier Gates A+B verdict this completes
> the audit cycle for issue
> [#329](https://github.com/p-to-q/wittgenstein/issues/329) and
> **unblocks M1B** per the exec plan annotation in
> [PR #293](https://github.com/p-to-q/wittgenstein/pull/293).
> _Trackers: [#334](https://github.com/p-to-q/wittgenstein/issues/334)
> (Gate C), [#335](https://github.com/p-to-q/wittgenstein/issues/335)
> (Gate D); parent
> [#283](https://github.com/p-to-q/wittgenstein/issues/283); M1B umbrella
> [#70](https://github.com/p-to-q/wittgenstein/issues/70)._

## Why this audit comes next

Per [`docs/research/2026-05-13-audit-vqgan-class.md`](2026-05-13-audit-vqgan-class.md), Gates A and B passed via external inspection: both `CompVis/taming-transformers` and `FoundationVision/LlamaGen` carry MIT
licenses, and the LlamaGen VQ tokenizer is hosted on HuggingFace with
SHA-pinnable revisions at ~280MB FP32 (well under the audit-plan's
<1GB CPU-runnable threshold). The remaining risk was operational:
empirical determinism (Gate C) and Node/ONNX/CPU feasibility (Gate D).

This note delivers the empirical verdicts. Both audits use the same
pinned weights file and the same upstream commit of the LlamaGen source
for reproducibility, and both run on the same machine (qiyuan
`node1048`, 8× A800-SXM4-80GB) for cross-device (CPU vs CUDA) parity
characterization.

## Pinned artifacts

| Artifact | Value |
|---|---|
| LlamaGen upstream commit | `ce98ec41803a74a90ce68c40ababa9eaeffeb4ec` |
| LlamaGen weights repo | `FoundationVision/LlamaGen` on HuggingFace (mirrored via `hf-mirror.com`) |
| HF revision snapshot id | `81e41139272c038412e4fe8f1c52a51ebbf95b8b` |
| Weights file | `vq_ds16_c2i.pt` (ImageNet class-conditional) |
| Weights SHA-256 | `109aa8afb2cf3761eec23cdc8644154cb498f5ab7eef2a35264d25e5e0499f7d` |
| Weights size | ~287 MB FP32 |
| Loaded weights key | `model` (LlamaGen ships both `model` and EMA copies; this revision keys under `model`) |
| Param count | 71,883,403 (~71.9M — matches Gates A+B reported range) |
| Codebook size K | 16384 |
| Codebook embed dim D | 8 |
| Spatial downsample p | 16 (256×256 input → 16×16 = 256 tokens) |
| Image preproc | center-crop 256×256, [-1,1] normalize (LlamaGen `vq_demo.py` canonical) |
| Input image | `llamagen-upstream/assets/teaser.jpg`, SHA-256 `7c35929e7495148f438510a825b9768835f08b8b7cd4142fa9afb2306fe12aeb` |
| Preprocessed pixel array SHA-256 | `7150edb446ac9a6d7ca2e67a884a4e5e582ed89cfd61f0661ddf9bf7c46f3a7a` |

## Gate C — Deterministic round-trip → ✅ PASS (structural-parity)

### Methodology

Three sub-tests, repeated 3× per machine (n_runs=3):

- **T1 (encode parity)** — Run `encode(image)` 3× on the same machine,
  same seed, same device. Assert byte-identical integer token grid
  across all runs. SHA-256 of the int64-serialized indices is the
  invariant.
- **T2 (decode parity)** — Run `decode_code(tokens)` 3× on the same
  tokens (the run-1 tokens from T1). Assert byte-identical PNG SHA-256
  across all runs. PNG is emitted via deterministic re-encode
  (`compress_level=6`, no tEXt timestamp, `optimize=False`).
- **T3 (round-trip stability)** — `encode → decode → re-encode` on
  the same image. Compare re-encoded tokens to the original tokens.
  Report exact-match boolean AND token-grid Hamming distance — even
  if not exact, the bridge only needs T1+T2 byte-equality plus
  structural-parity at the pixel level (per ADR-0015 audio precedent).

### Determinism harness

- `torch.manual_seed`, `torch.cuda.manual_seed_all`,
  `torch.backends.cudnn.deterministic = True`,
  `torch.backends.cudnn.benchmark = False`.
- `weights_only=True` on `torch.load` (audit hygiene: SHA-pinning is
  meaningless if the pickle eval'd arbitrary code).
- `torch.set_grad_enabled(False)` for all inference.
- We do NOT call `torch.use_deterministic_algorithms(True)` because some
  conv backward kernels lack deterministic CUDA paths; Gate C is about
  forward-pass determinism, which is what the bridge contracts at ship
  time.

### Results

| Machine | Device | T1 (encode parity) | T2 (decode parity) | T3 (round-trip exact) | T3 drift | Per-decode latency (median, warm) |
|---|---|---|---|---|---|---|
| node1048 | cuda (A800-80G, cudnn 8500) | ✅ all 3 runs equal | ✅ all 3 runs equal | ❌ drift | 30 / 256 tokens (11.72%) | encode 9.6 ms · decode 13.0 ms |
| node1048 | cpu (x86_64, glibc 2.35) | ✅ all 3 runs equal | ✅ all 3 runs equal | ❌ drift | 31 / 256 tokens (12.11%) | encode 4.04 s · decode 5.19 s |

**Within-device determinism**: byte-identical across all 3 runs on both
devices, for both encode (token grid) and decode (PNG SHA-256).

**Cross-device (CPU vs CUDA) parity**: encode token grid SHA-256 and
decode PNG SHA-256 BOTH differ across devices on the same input:

```
CUDA encode tokens SHA: 7355722b5c98bf11896b1766567aff6720e10837cae750f254d4463924ce6508
CPU  encode tokens SHA: 73a7d74ab21edc643f2d123749cba2c6700fd0c0eac1ec613e744ed5b2b61a73

CUDA decode PNG SHA:    5e9b31870d73e46fe55b44717243f3fe75adc572797ba592193accb4e87f320a
CPU  decode PNG SHA:    cee790bce0acad0810163e57ea819d6e5d54ed183c04c0f01a04bb5bd537110f
```

This is canonical float-arithmetic drift between cuDNN conv kernels and
oneDNN CPU kernels — exactly what `structural-parity` describes per
ADR-0015. The bridge's `capabilities.determinismClass` MUST be declared
`"structural-parity"`, not `"byte-parity"`, for any wiring that exposes
both runtime tiers.

**T3 round-trip exact-match drift (~12%)** is consistent with a
non-fixed-point VQ tokenizer: re-encoding a decoded reconstruction
quantizes against a slightly different point in latent space, producing
a token-grid Hamming distance of order 30/256. The bridge does NOT
contract T3 exact-match; T3 is informational only.

### Verdict

**✅ Gate C PASS** under the canonical `structural-parity` determinism
class. T1 + T2 are byte-exact per device, which is the load-bearing
invariant for the bridge contract (`decode(codes) → identical raster`
for the same caller). Cross-device drift is the expected and explicitly
contracted `structural-parity` behavior.

## Gate D — Node / ONNX / CPU feasibility → ✅ PASS

### Methodology

Decoder-only export — `(token_indices: int64[B, H*W]) → (image:
float32[B, 3, 256, 256])` — wrapped in a fixed-shape `nn.Module` with
no Python control flow. Encoder is offline tooling per the bridge
contract and is intentionally not exported.

Steps:

1. Construct `VQ_models["VQ-16"]` with `codebook_size=16384`,
   `codebook_embed_dim=8`; load weights via `torch.load(...,
   weights_only=True)` using the `"model"` key (this LlamaGen revision
   ships only `model`, not `ema`).
2. Wrap `decode_code` with a static-shape `DecoderWrapper(latent_h=16,
   latent_w=16, embed_dim=8)`.
3. Call `torch.onnx.export(opset_version=17)` with `dynamic_axes` on
   batch only.
4. Load the resulting `.onnx` via
   `onnxruntime.InferenceSession(..., providers=["CPUExecutionProvider"])`.
5. Time `n_warmup=1` + `n_timed=5` decode runs at batch=1.
6. Functional parity: compare ONNX output array vs PyTorch CPU
   reference output, report `max(abs(diff))`.

### Pass criteria (from audit plan)

- Export completes without raising. ✅
- onnxruntime loads the model. ✅
- CPU latency for one 256² image decode < 5 minutes (the explicit
  falsifies-recommendation threshold). ✅ — actual median 0.824 s.
- Functional parity within reasonable float epsilon (informational). ✅
  — max abs diff 9.95e-5 (within 1e-4).

### Results

| Step | Outcome | Detail |
|---|---|---|
| ONNX export (opset 17) | ✅ succeeded | 12.99 s elapsed; file size 162.57 MB; SHA-256 `fd6800b3df8193968656e3e6b01ab48bd8899ebede829dfd1166da5f5b9f9389` |
| onnxruntime CPU load | ✅ loaded | providers = `["CPUExecutionProvider"]`; input dtype `int64`, output dtype `float32`, output shape `[1, 3, 256, 256]` |
| Median decode latency (CPU, batch=1) | ✅ 0.824 s | min 0.768 s · median 0.824 s · max 0.888 s · mean 0.832 s (n_timed=5 after n_warmup=1) |
| ONNX vs PyTorch CPU `abs_diff_max` | ✅ 9.95e-5 | mean abs diff 1.15e-6; within both 1e-3 and 1e-4 |

### Notes on export shape

- The wrapper bakes a 16×16 token grid as static shape; bridges that
  later need 32×32 (LlamaGen's `vq_ds8_c2i.pt` variant) re-export
  with `--latent-grid 32 32`.
- `dynamic_axes` is declared on batch only (the bridge `capabilities`
  contract expects each `(shape, output-resolution)` combination to be
  a separate advertised entry — see `DecoderShapeSupport` union in
  `decoders/types.ts`).
- ONNX opset 17 is the runtime's stable middle ground (current
  `onnxruntime` 1.23.2 supports through opset 26; downgrading the
  export keeps compat with `onnxruntime-node` LTS).

### Verdict

**✅ Gate D PASS**. ONNX export is clean, runtime loads, CPU inference
is 363× faster than the 5-minute falsifies-recommendation threshold,
and ONNX↔PyTorch functional parity is well within float epsilon. There
are no falsifies-recommendation triggers — VQGAN-class remains the
audit-plan's Priority 1.

## Combined four-gate matrix

| Gate | Verdict | Source |
|---|---|---|
| **A. License** | ✅ PASS | [2026-05-13 audit](2026-05-13-audit-vqgan-class.md) |
| **B. Weights** | ✅ PASS (LlamaGen) / ⚠️ PARTIAL (taming-transformers upstream — not the wiring target) | [2026-05-13 audit](2026-05-13-audit-vqgan-class.md) |
| **C. Determinism** | ✅ PASS (structural-parity) | this note |
| **D. Node / ONNX / CPU** | ✅ PASS | this note |

**All four gates pass.** The audit-plan's M1B unblock criterion ("at
least one candidate clears all four gates") is now met by VQGAN-class /
LlamaGen.

## What this enables

Per `docs/exec-plans/active/codec-v2-port.md` § M1B unblock criterion,
this verdict authorizes the following work to begin:

- `packages/codec-image/src/decoders/llamagen.ts` —
  `loadLlamagenDecoderBridge()` becomes a contract-fill (the bridge
  interface in `types.ts` is already locked). The bridge advertises:
  - `family: "llamagen"`,
  - `decoderId: "llamagen-frozen-vq-v0"` (locked constant per
    `decoders/llamagen.ts`),
  - `supportedShapes: [{ shape: "2D", tokenGrid: [16, 16], outputPixels: [256, 256] }]`,
  - `codebook: "vq_ds16_c2i"`, `codebookVersion: "FoundationVision/LlamaGen@81e41139"`,
  - `determinismClass: "structural-parity"` (this audit),
  - `runtimeTier: "node-onnx-cpu"` (canonical M-phase tier),
  - `codeLicense: "MIT"`, `weightsLicense: "permissive"`.
- A `decoders/llamagen/manifest.json` (sibling of `decoders/kokoro/manifest.json`)
  pinned to the SHAs above (weights + ONNX export).
- The first `quality.full` image manifest receipt under the canonical
  `node-onnx-cpu` runtime tier.
- The first structural-parity-pinned image golden in `pnpm test:golden`.

This is also the green light for the Phase 1 research-program lane
([`2026-05-13-wittgenstein-research-program.md`](2026-05-13-wittgenstein-research-program.md))
to begin training the Wittgenstein-native VQGAN-class tokenizer — the
audited LlamaGen baseline is the apples-to-apples comparison point for
any own-trained checkpoint, and these receipts establish the eval
infrastructure (token-grid SHA, PNG SHA, structural-parity contract)
that own-trained weights will plug into.

## What this does NOT establish

- Does NOT verify the trained AR head (`vq_t2i` / class-conditional
  generators) — only the VQ tokenizer's encode/decode bridge is in
  scope for M1B per the bridge contract.
- Does NOT promise cross-platform byte parity at the PNG level when
  CUDA is involved; that is explicitly `structural-parity` by
  ADR-0015 / #374 precedent and not a Gate C failure.
- Does NOT upgrade `taming-transformers` upstream weights from PARTIAL
  — that work, if ever needed, is a separate wiring-slice follow-up.
- Does NOT measure a second machine. node1048 was the only host audited
  in this pass; a sibling node audit (172.16.1.35-40 on the same
  cluster) would cross-confirm the `structural-parity` declaration but
  is not a release blocker.
- Does NOT touch the GPU ONNX runtime tier — Gate D measures
  `CPUExecutionProvider` only, which is the canonical M-phase
  `node-onnx-cpu` target. A `node-onnx-gpu` audit is its own follow-up
  if/when that tier becomes part of the canonical path.

## Reproducibility — sources and tools

| Item | Pinned value |
|---|---|
| Audit-plan template | [`docs/research/2026-05-08-radar-audit-plan.md`](2026-05-08-radar-audit-plan.md) |
| Prior audit (Gates A+B) | [`docs/research/2026-05-13-audit-vqgan-class.md`](2026-05-13-audit-vqgan-class.md) |
| Bridge contract | [`packages/codec-image/src/decoders/types.ts`](../../packages/codec-image/src/decoders/types.ts) |
| Determinism class precedent | [ADR-0015](../adrs/0015-audio-decoder-family.md) (audio); [#374](https://github.com/p-to-q/wittgenstein/issues/374) (image) |
| Gate C script | `m1b-work/scripts/gate_c_roundtrip.py` SHA-256 `a333000f11b9ebcc6a692112f7f46197075ba82a276f21bdf06b4cde5c8abd98` |
| Gate D script | `m1b-work/scripts/gate_d_onnx_export.py` SHA-256 `393ddb8728808e528f77765c0003e8c911e746efea15788d9aa9b17272e1cae6` |
| Run driver | `m1b-work/scripts/run_audits.sh` SHA-256 `d3570957d476d9bdbd5773b2afb8589634bdb1591a3a6376c9d3dcffe620ce2b` |
| Receipts | `m1b-work/receipts/gate_c_cuda_node1048_20260527T092649Z.json`, `gate_c_cpu_*.json`, `gate_d_*.json` |
| Hardware (primary) | qiyuan node1048, 8× A800-SXM4-80GB, NVIDIA CUDA 11.7 cudnn 8500 |
| Software | linear conda env: torch 2.0.1+cu117, onnx 1.21.0 (opset_max 26), onnxruntime 1.23.2, PIL 11.3.0, numpy 1.23.5, Python 3.10.18 |
| OS | Linux 5.15.0-60-generic x86_64 glibc 2.35 |

## Cross-references

- Parent commission: [#283](https://github.com/p-to-q/wittgenstein/issues/283).
- Per-candidate sub-issue: [#329](https://github.com/p-to-q/wittgenstein/issues/329).
- Gate C tracker: [#334](https://github.com/p-to-q/wittgenstein/issues/334) — closes with this note.
- Gate D tracker: [#335](https://github.com/p-to-q/wittgenstein/issues/335) — closes with this note.
- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70) — unblocked.
- Exec-plan annotation: [PR #293](https://github.com/p-to-q/wittgenstein/pull/293).
- Bridge stub awaiting fill: [`packages/codec-image/src/decoders/llamagen.ts`](../../packages/codec-image/src/decoders/llamagen.ts).
- Phase 1 research program: [`2026-05-13-wittgenstein-research-program.md`](2026-05-13-wittgenstein-research-program.md).
