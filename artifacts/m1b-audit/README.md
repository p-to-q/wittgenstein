# M1B audit artifact handoff

This directory is the expected local drop zone for VQGAN-class Gate C/D audit
evidence. Commit this README and `.gitkeep`; do not commit generated metrics,
weights, ONNX files, logs, or large artifacts.

## Expected files after a lab run

| File | Producer | Purpose | Commit? |
|---|---|---|---|
| `gate-c-roundtrip.json` | `python3 -m research.validation.m1b_gate_c_roundtrip` | Gate C metric JSON: deterministic encode/decode/re-encode evidence | No |
| `gate-d-onnx-export.json` | `python3 -m research.validation.m1b_export_llamagen_decoder_onnx` | ONNX export receipt, including checkpoint and ONNX SHA-256 | No |
| `decoder.onnx` | `python3 -m research.validation.m1b_export_llamagen_decoder_onnx` | Exported decoder input for Gate D CPU run | No |
| `gate-d-onnx-cpu.json` | `python3 -m research.validation.m1b_gate_d_onnx_cpu` | Gate D metric JSON: ONNX Runtime CPU feasibility evidence | No |
| `vqgan-gates.json` | `python3 -m research.validation.vqgan_gate_audit` | Final Gate C/D receipt consumed by decoder-family manifest validation | No |
| `hashes.txt` | operator-written | Optional list of weights, ONNX, codebook, and source checkout hashes | No |
| `commands.log` | shell transcript | Optional exact command transcript for the run | No |

## Minimal local contract check

Run this before requesting lab execution:

```bash
pnpm m1b:audit-self-check
```

The script expands to:

```bash
python3 -m unittest \
  research.validation.test_vqgan_gate_audit \
  research.validation.test_m1b_metric_producers \
  research.training._shared.test_manifest

python3 -m research.validation.m1b_export_llamagen_decoder_onnx --help
python3 -m research.validation.m1b_gate_c_roundtrip --help
python3 -m research.validation.m1b_gate_d_onnx_cpu --help
```

These checks do not prove decoder feasibility. They prove the handoff scripts,
failure shape, and receipt contracts are available on a normal contributor
machine.

After a lab run writes real artifacts, run:

```bash
pnpm m1b:audit-artifact-check
```

For fixture-only review, the same validator accepts
`research/validation/fixtures/m1b-audit/`.

## Lab command order

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

python3 -m research.validation.vqgan_gate_audit \
  --out artifacts/m1b-audit/vqgan-gates.json \
  --candidate vqgan-class/llamagen \
  --weights /path/to/sha-pinned/vqgan.ckpt \
  --onnx artifacts/m1b-audit/decoder.onnx \
  --roundtrip-json artifacts/m1b-audit/gate-c-roundtrip.json \
  --onnx-json artifacts/m1b-audit/gate-d-onnx-cpu.json
```

Set the environment metadata flags from
`docs/research/2026-05-26-m1b-lab-gate-runbook.md` before the final receipt
command when available.

## Review checklist

- Gate C only passes when `roundtrip_passed=true`, `sample_count>=3`, and
  `token_hamming_rate=0.0`.
- Gate D only passes when `onnx_cpu_passed=true`, `cpu_decode_seconds<=30`,
  `output_shape=[256,256,3]`, and Node is available for receipt production.
- Failed exports or ONNX/CPU runs are still useful evidence. Keep the JSON
  receipt and record the command exit code.
- Do not bless a decoder manifest from intermediate metric JSON alone. Use
  `vqgan-gates.json` plus `validateDecoderManifestAuditReceipts`.
