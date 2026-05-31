---
date: 2026-05-26
status: owner-review pack
labels: [research-derived, m1-image, owner-review]
tracks: [#334, #335, #402, #435, #441]
---

# M1B audit delivery review pack

> **Status:** review entrypoint for the M1B decoder-delivery audit package.
> This pack does not claim Gate C/D have passed. It maps the local contract
> work that is ready for review and the lab empirical work still required.

## What this package changes

This package turns the M1B decoder-delivery blocker into a verifiable surface:

- Decoder-family manifests can describe candidate / blessed status, assets,
  audit gates, runtime tier, and decoder hashes.
- Gate C/D claims are checked against structured receipts instead of prose.
- Image decoder preflight reports manifest, audit, weights, license, cache, and
  runtime blockers before any real bridge is wired.
- CLI install / doctor surfaces expose image decoder readiness without fetching
  weights or silently falling back.
- Lab-oriented metric producers can generate Gate C, ONNX export, and Gate D
  CPU evidence from a pinned LlamaGen VQ checkpoint.
- Artifact handoff and fixture files make review possible without access to lab
  hardware.

## Issue map

| Issue | Role in this package            | Current state                                                                                       |
| ----- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| #334  | Gate C deterministic round-trip | Metric producer + receipt hard checks exist; real lab run still required                            |
| #335  | Gate D ONNX / CPU feasibility   | ONNX export producer + CPU metric producer + receipt hard checks exist; real lab run still required |
| #402  | Decoder delivery decision       | Preflight / CLI visibility blocks install until a manifest is blessed                               |
| #435  | Owner-review hub                | This review pack and artifact handoff provide the review map                                        |
| #441  | Training-stack re-audit         | Training manifest smoke remains CPU-only; lab gate evidence is separate from training               |

## Local contract checks

Run:

```bash
pnpm m1b:audit-self-check
```

This proves:

- Python validation tests pass without torch, ONNX Runtime, weights, or GPU.
- Metric/export scripts expose stable CLI contracts.
- Fixture receipts satisfy the artifact checklist.
- Decoder-family manifest validation accepts/rejects Gate C/D receipts by hard
  criteria.
- Generated lab artifacts are ignored by git, while README / `.gitkeep` remain
  trackable.

This does **not** prove:

- LlamaGen checkpoint keys match the exporter on a real checkout.
- Gate C is deterministic under real weights.
- ONNX export succeeds for the real decoder half.
- ONNX Runtime CPU decode completes in <=30 seconds.

## Lab empirical checks still required

The lab run must produce, under `artifacts/m1b-audit/`:

- `gate-c-roundtrip.json`
- `gate-d-onnx-export.json`
- `decoder.onnx`
- `gate-d-onnx-cpu.json`
- `vqgan-gates.json`

Before treating the run as evidence, run:

```bash
pnpm m1b:audit-artifact-check
```

The final `vqgan-gates.json` is the receipt that should be referenced by a
decoder-family manifest. Intermediate metric JSON is useful evidence, but it is
not sufficient to bless a decoder.

## Research presentation guardrails

- Do not write "Gate C passed" unless `vqgan-gates.json` contains Gate C with
  `status=passed`, hard metrics `encode_consistent=true`,
  `decode_consistent=true`, `sample_count>=3`, and measured
  `cross_device_parity` matching the decoder-family manifest. Re-encode drift
  is a hard blocker only when the manifest declares
  `maxReencodeTokenHammingRate`.
- Do not write "Gate D passed" unless `vqgan-gates.json` contains Gate D with
  `status=passed` and hard metrics matching the decoder-family manifest's
  `maxCpuDecodeSeconds` and `outputShape`.
- Do not describe fixture files as empirical results.
- Do not wire `loadLlamagenDecoderBridge` from this package alone; wiring comes
  after a blessed manifest and lab evidence.

## Review file map

| Surface                           | Files                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manifest / receipt contract       | `packages/codec-image/src/decoders/manifest.ts`, `packages/codec-image/test/decoder-family-manifest.test.ts`                                           |
| Preflight / CLI visibility        | `packages/codec-image/src/decoders/preflight.ts`, `packages/cli/src/commands/install.ts`, `packages/cli/src/commands/doctor.ts`                        |
| Gate C/D metric producers         | `research/validation/m1b_gate_c_roundtrip.py`, `research/validation/m1b_export_llamagen_decoder_onnx.py`, `research/validation/m1b_gate_d_onnx_cpu.py` |
| Final receipt wrapper             | `research/validation/vqgan_gate_audit.py`, `research/validation/test_vqgan_gate_audit.py`                                                              |
| Fixture receipts                  | `research/validation/fixtures/m1b-audit/*.fixture.json`                                                                                                |
| Local self-check / artifact check | `scripts/m1b-audit-self-check.mjs`, `scripts/m1b-audit-artifact-check.mjs`, `scripts/m1b-staging-plan-check.mjs`                                       |
| Operator handoff                  | `artifacts/m1b-audit/README.md`, `docs/research/2026-05-26-m1b-lab-gate-runbook.md`                                                                    |

## Suggested reviewer path

1. Run `pnpm m1b:audit-self-check`.
2. Run `pnpm m1b:staging-plan-check` if the working tree still contains
   unrelated governance / attribution edits.
3. Read this pack, then the lab runbook.
4. Review fixture JSON to confirm pass/fail semantics are honest.
5. Review `manifest.ts` hard checks before reviewing CLI surfaces.
6. Confirm docs do not imply Gate C/D have already passed.

## PR draft

Use `docs/research/2026-05-26-m1b-audit-delivery-pr-draft.md` as the starting
PR description. It is intentionally a draft, not a global template.

Use `docs/research/2026-05-26-m1b-pr-boundary-audit.md` to keep unrelated
governance / attribution hygiene changes out of the M1B PR.
Use `docs/research/2026-05-26-m1b-staging-plan.md` when staging the PR so only
the M1B delivery files are included.
