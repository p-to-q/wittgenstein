---
date: 2026-05-26
status: execution runbook
labels: [research-derived, m1-image, audit-plan]
tracks: [#334, #335, #402, #435, #441]
---

# M1B lab gate runbook

> **Status:** execution runbook, not audit results.
> This note splits local contract preflight from lab empirical evidence for the
> VQGAN-class decoder delivery line. It does not bless a decoder family and does
> not start model training.

## Why lab resources change execution, not gates

The M1B unblock criterion is unchanged: a candidate decoder must clear Gate C
(deterministic round-trip) and Gate D (Node / ONNX / CPU feasibility) before a
decoder-family manifest can be treated as blessed.

Lab compute changes where the expensive evidence is produced. A contributor
laptop, including an Apple M4 Max MacBook Pro, should not be the blocker for
full-weight PyTorch / ONNX experiments. Local machines still own the cheap
contract surface: schema validation, blocked receipts, cache / SHA failure
paths, license refusal, runtime-unavailable reporting, and CLI / doctor
visibility.

## Execution lanes

| Lane | Runs where | Must prove | Does not prove |
|---|---|---|---|
| Local contract preflight | Any dev machine, CPU-only | Scripts start, failure receipts are structured, manifest validation rejects unsupported claims | Decoder feasibility |
| Lab empirical gate | Lab node with pinned weights/tooling | Gate C/D metrics under real weights and recorded runtime environment | Contributor install UX |
| Contributor smoke | MacBook / common laptop after lab pass | Doctor/install/cache/runtime messages are usable on non-lab machines | Gate C/D by itself |

## Local contract preflight

Run these before spending lab time:

```bash
pnpm m1b:audit-self-check
```

Expected state without weights: `research.validation.vqgan_gate_audit` writes a
blocked receipt with Gate C/D skipped or blocked. That is success for this lane;
it proves honest failure shape, not model readiness.

## Lab empirical gate

The lab run should pin:

- repo git SHA for this harness checkout
- candidate decoder family and upstream revision
- weights file SHA-256 and codebook SHA-256 when applicable
- hardware / node type
- accelerator type
- Python, PyTorch, ONNX Runtime, CUDA, and driver versions
- exact commands used to produce the Gate C and Gate D metric JSON files

The final receipt is written by the stdlib wrapper:

```bash
python3 -m research.validation.vqgan_gate_audit \
  --out artifacts/m1b-audit/vqgan-gates.json \
  --candidate vqgan-class/llamagen \
  --weights /path/to/sha-pinned/weights \
  --onnx /path/to/exported/decoder.onnx \
  --roundtrip-json artifacts/m1b-audit/gate-c-roundtrip.json \
  --onnx-json artifacts/m1b-audit/gate-d-onnx-cpu.json \
  --lab-run-id "$WITTGENSTEIN_LAB_RUN_ID" \
  --hardware "$WITTGENSTEIN_AUDIT_HARDWARE" \
  --accelerator "$WITTGENSTEIN_AUDIT_ACCELERATOR" \
  --torch-version "$WITTGENSTEIN_AUDIT_TORCH_VERSION" \
  --onnxruntime-version "$WITTGENSTEIN_AUDIT_ONNXRUNTIME_VERSION" \
  --cuda-version "$WITTGENSTEIN_AUDIT_CUDA_VERSION" \
  --driver-version "$WITTGENSTEIN_AUDIT_DRIVER_VERSION"
```

The metric producers are:

```bash
python3 -m research.validation.m1b_gate_c_roundtrip \
  --out artifacts/m1b-audit/gate-c-roundtrip.json \
  --llamagen-root /path/to/FoundationVision/LlamaGen \
  --vq-ckpt /path/to/sha-pinned/vqgan.ckpt

python3 -m research.validation.m1b_export_llamagen_decoder_onnx \
  --out artifacts/m1b-audit/decoder.onnx \
  --receipt artifacts/m1b-audit/gate-d-onnx-export.json \
  --llamagen-root /path/to/FoundationVision/LlamaGen \
  --vq-ckpt /path/to/sha-pinned/vqgan.ckpt

python3 -m research.validation.m1b_gate_d_onnx_cpu \
  --out artifacts/m1b-audit/gate-d-onnx-cpu.json \
  --onnx artifacts/m1b-audit/decoder.onnx
```

They write plain JSON only; the receipt wrapper applies the hard pass criteria.
The export and ONNX/CPU commands return non-zero when their own step blocks,
while still writing a JSON receipt when possible. Treat the exit code as the
job status and the JSON as the audit evidence.

## Gate C metric shape

`artifacts/m1b-audit/gate-c-roundtrip.json` must include:

```json
{
  "roundtrip_passed": true,
  "sample_count": 3,
  "token_hamming_rate": 0.0
}
```

Minimum pass criteria:

- `roundtrip_passed=true`
- `sample_count>=3`
- `token_hamming_rate=0.0`

## Gate D metric shape

`artifacts/m1b-audit/gate-d-onnx-cpu.json` must include:

```json
{
  "onnx_cpu_passed": true,
  "cpu_decode_seconds": 30.0,
  "output_shape": [256, 256, 3]
}
```

Minimum pass criteria:

- `onnx_cpu_passed=true`
- `cpu_decode_seconds<=30`
- `output_shape=[256,256,3]`
- Node is available in the receipt-producing environment

## Artifact rule

Keep all lab evidence under `artifacts/m1b-audit/` for the run:

- `vqgan-gates.json`
- `gate-c-roundtrip.json`
- `gate-d-onnx-export.json`
- `gate-d-onnx-cpu.json`
- `decoder.onnx`
- raw command logs, if kept
- hashes for weights / ONNX / codebook assets

Do not paste large logs into a research note. The note should summarize the
verdict and point to receipt artifacts.
The directory template in `artifacts/m1b-audit/README.md` is the handoff
checklist for operators; generated files in that directory are intentionally
ignored by git.
Run `pnpm m1b:audit-artifact-check` after the lab run to check that the expected
JSON receipts are present and structurally readable before summarizing results.

## Blessing rule

A decoder-family manifest may move from `candidate` to `blessed` only after:

1. Gate A/B license and weights evidence remain valid for the exact asset
   revision.
2. Gate C and Gate D have a receipt that passes the hard checks in
   `packages/codec-image/src/decoders/manifest.ts`.
3. `wittgenstein doctor` and `wittgenstein install image --dry-run` expose the
   selected family, cache, license, and runtime status without silent fallback.
4. The PR states which checks were local contract checks and which were lab
   empirical checks.

Until then, #402 remains blocked and M1B wiring must keep the current structured
`NotImplementedError` / preflight surface.

## External references used

- LlamaGen upstream: releases VQ-VAE tokenizers, PyTorch sampling code, and
  `vq_ds16_c2i.pt` / `vq_ds8_c2i.pt` checkpoints under the VQ tokenizer section:
  <https://github.com/FoundationVision/LlamaGen>.
- PyTorch deterministic inference: `torch.use_deterministic_algorithms(True)`
  makes supported operations deterministic or raises when only nondeterministic
  implementations are available:
  <https://docs.pytorch.org/docs/stable/generated/torch.use_deterministic_algorithms.html>.
- PyTorch ONNX exporter: `torch.onnx.export` / the modern `dynamo=True`
  exporter is the supported bridge from PyTorch modules to ONNX graphs:
  <https://docs.pytorch.org/docs/stable/onnx.html>.
- ONNX Runtime Python API: `InferenceSession` loads an ONNX model and can be
  configured with execution providers, including CPU:
  <https://onnxruntime.ai/docs/api/python/api_summary.html>.
