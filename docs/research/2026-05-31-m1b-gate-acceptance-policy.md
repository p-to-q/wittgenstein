---
date: 2026-05-31
status: issue #473 decision and code contract
labels: [research-derived, m1-image, receipts, eval]
tracks: [#473, #334, #335, #402, #435, #441]
---

# M1B Gate C/D acceptance policy

Issue #473 found a real mismatch between the research verdict and the code
contract. The 2026-05-27 VQGAN-class audit accepted LlamaGen under a
`structural-parity` contract even though encode -> decode -> re-encode is not a
fixed point. The receipt code still treated `token_hamming_rate == 0` as the
hard Gate C rule. That would reject the documented passing candidate.

This note turns the policy into manifest-backed rules rather than prose.

## Decisions

| Question              | Decision                                                                                                                                                                                                            | Code surface                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Gate C token drift    | Re-encode token Hamming rate is advisory by default for VQGAN-class. It becomes a hard blocker only when the decoder-family manifest declares `maxReencodeTokenHammingRate`.                                        | `DecoderGateCAcceptanceSchema.maxReencodeTokenHammingRate` and `vqgan_gate_audit.py --gate-c-max-reencode-token-hamming-rate` |
| Gate C CPU/GPU parity | Manifest-declared. LlamaGen uses `crossDeviceParity: "structural-only"` and `capabilities.determinismClass: "structural-parity"`. Byte-identical claims require `determinismClass: "byte-parity"`.                  | `DecoderGateCAcceptanceSchema.crossDeviceParity`                                                                              |
| Gate C hard pass      | `encode_consistent=true`, `decode_consistent=true`, `sample_count >= minSampleCount`, measured `cross_device_parity` equals the manifest.                                                                           | `gateCReceiptPasses()` and `gate_c_passes()`                                                                                  |
| Gate D latency        | Manifest-declared but capped by the v0.3 policy at `<=30s` per 256-ish RGB output. A family may declare a stricter value, not a looser one, without a policy revision.                                              | `DecoderGateDAcceptanceSchema.maxCpuDecodeSeconds`                                                                            |
| Gate D output shape   | Manifest-declared and cross-checked against `capabilities.supportedShapes`. The current RGB contract is `[H, W, 3]`; LlamaGen declares `[256, 256, 3]`.                                                             | `DecoderGateDAcceptanceSchema.outputShape`                                                                                    |
| Blessing blockers     | A `blessed` decoder requires Gate A/B/C/D passed, `decoderHash`, Gate C/D receipts, Gate C/D acceptance policies, receipt tracker match, candidate-family match, and receipt metrics that pass the manifest policy. | `DecoderFamilyManifestSchema` and `validateDecoderManifestAuditReceipts()`                                                    |

## Why this is stricter than the old code

The previous hardcoded `token_hamming_rate <= 0` looked strict but was pointed
at the wrong invariant. For learned VQ decoders, re-encoding a reconstruction
can quantize a nearby point to a different token while the shipped bridge still
has the property it needs: same input tokens decode consistently under the
declared runtime and determinism class.

The new contract is stricter where release readiness actually depends on it:

- the manifest must declare the policy;
- the receipt must carry the measured parity class;
- TypeScript validation re-applies the manifest policy instead of trusting
  `pass_check=true` from the receipt;
- Gate D shape and latency are not hidden constants in one script.

## Operator guidance

For LlamaGen/VQGAN-class, run Gate C with the default structural policy:

```bash
python3 -m research.validation.vqgan_gate_audit \
  --candidate vqgan-class/llamagen \
  --weights /path/to/sha-pinned/vqgan.ckpt \
  --onnx artifacts/m1b-audit/decoder.onnx \
  --roundtrip-json artifacts/m1b-audit/gate-c-roundtrip.json \
  --onnx-json artifacts/m1b-audit/gate-d-onnx-cpu.json \
  --gate-c-cross-device-parity structural-only \
  --gate-d-max-cpu-decode-seconds 30 \
  --gate-d-output-shape 256,256,3
```

Only add `--gate-c-max-reencode-token-hamming-rate 0` for a candidate whose
owner explicitly chooses fixed-point re-encoding as a hard requirement. That is
not the LlamaGen policy recorded by the VQGAN-class audit.

## Source anchors

- PyTorch determinism is scoped to same input and same software/hardware;
  deterministic mode can switch algorithms or raise when deterministic
  implementations are unavailable:
  <https://docs.pytorch.org/docs/2.12/generated/torch.use_deterministic_algorithms.html>.
- ONNX Runtime executes a loaded model through configured execution providers;
  CPU execution is the default provider target used by Gate D:
  <https://onnxruntime.ai/docs/api/python/api_summary.html>.
- LlamaGen publishes VQ tokenizer checkpoints and sampling commands around
  `vq_ds16_c2i.pt`, the Phase-0 floor audited for M1B:
  <https://github.com/FoundationVision/LlamaGen>.
