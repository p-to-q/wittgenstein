---
date: 2026-05-31
status: audit note
labels: [research-derived, presentation-audit]
tracks: [#475, #457, #527, #334, #335, #359, #473, #474, #476]
---

# Research presentation audit - M1B and MP4 surfaces

## Purpose

This note audits whether the current research delivery surfaces let a reviewer
understand, reproduce, and falsify the claim from repository artifacts alone.
It covers the #475 required surfaces:

- the M1B decoder audit delivery surface originally staged through #457 and
  clean-rebased as #527;
- fixture receipts under `research/validation/fixtures/m1b-audit/`;
- the MP4 validation note and `research/validation/video_mp4_renderer_validate.ts`;
- successor review packs that could be mistaken for empirical readiness claims.

This audit does not alter doctrine docs, does not bless any decoder, does not
run model training, and does not require external lab execution.

## Method

Each surface was checked against the #475 presentation criteria:

- clear hypothesis or gate;
- explicit non-goals and blocked states;
- reproducible command line, environment fields, and artifact names;
- machine-readable receipt schema or fixture;
- pass/fail criteria outside prose;
- negative or failure fixture where failure is meaningful;
- links to governing issues / docs;
- honest separation between local contract, lab evidence, and future training.

## Findings

| Surface                                        | Status                 | Evidence                                                                                                                                                                                                                                                                                              | Notes                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1B review pack and lab runbook                | `ready`                | `docs/research/2026-05-26-m1b-audit-delivery-review-pack.md`, `docs/research/2026-05-26-m1b-lab-gate-runbook.md`                                                                                                                                                                                      | The local-vs-lab split is explicit. Gate C/D pass criteria and artifact names are listed.                                                                                                                                                                 |
| M1B fixture receipts and artifact validator    | `ready` after this PR  | `research/validation/fixtures/m1b-audit/*.fixture.json`, `scripts/m1b-audit-artifact-check.mjs`                                                                                                                                                                                                       | Found and fixed a fixture drift: `gate-c-pass.fixture.json` claimed pass semantics with `sample_count=1` while the hard gate requires `sample_count>=3`.                                                                                                  |
| M1B operator handoff                           | `ready` after this PR  | `artifacts/m1b-audit/README.md`, `scripts/m1b-audit-self-check.mjs`                                                                                                                                                                                                                                   | Found and fixed stale README text that referenced `research.training._shared.test_manifest`, which is not part of the current self-check and is not present in the tree. Also split the M1B staging-plan check back out of the evergreen self-check path. |
| M1B metric producers and final receipt wrapper | `ready`                | `research/validation/m1b_gate_c_roundtrip.py`, `research/validation/m1b_export_llamagen_decoder_onnx.py`, `research/validation/m1b_gate_d_onnx_cpu.py`, `research/validation/vqgan_gate_audit.py`, `research/validation/test_m1b_metric_producers.py`, `research/validation/test_vqgan_gate_audit.py` | The scripts expose command-line contracts and write structured JSON. They do not pretend to pass without weights / ONNX evidence.                                                                                                                         |
| M1B threshold policy                           | `needs-owner-decision` | `docs/research/2026-05-27-m1b-review-and-cleanup-checklist.md`, #473, #474                                                                                                                                                                                                                            | Strict `token_hamming_rate=0.0`, `[256,256,3]`, and `cpu_decode_seconds<=30` are enforced by engineering surfaces, but final research policy remains owner / ML-specialist scope already tracked by #473 and #474.                                        |
| MP4 validation note and script                 | `ready`                | `docs/research/2026-05-26-video-mp4-renderer-validation.md`, `research/validation/video_mp4_renderer_validate.ts`                                                                                                                                                                                     | The claim is scoped to same-platform byte parity and ffprobe structural checks. The note explicitly routes cross-machine portability to future measurement.                                                                                               |
| MP4 cross-machine portability                  | `needs-owner-decision` | #476                                                                                                                                                                                                                                                                                                  | Current artifacts do not claim cross-machine byte parity. #476 is the right follow-up for portability evidence rather than a blocker for this audit.                                                                                                      |

## Concrete fixes made in this PR

1. Updated `research/validation/fixtures/m1b-audit/gate-c-pass.fixture.json`
   so the fixture actually satisfies the Gate C hard floor:
   `roundtrip_passed=true`, `sample_count=3`, and `token_hamming_rate=0.0`.
2. Updated `artifacts/m1b-audit/README.md` so the documented self-check command
   matches `scripts/m1b-audit-self-check.mjs` and no longer names the absent
   `research.training._shared.test_manifest` module.
3. Updated `scripts/m1b-audit-self-check.mjs` so the evergreen self-check no
   longer runs the one-off staging-plan diff checker. The dedicated staging
   command remains available when staging an M1B delivery PR:
   `pnpm m1b:staging-plan-check`.

## Follow-up routing

No new issue is required from this audit:

- M1B threshold and blessing policy are already tracked by #473 and #474.
- MP4 cross-machine portability is already tracked by #476.
- The concrete small presentation gaps found during this audit are fixed in
  this PR.

## Reviewer handoff checklist

Before using these surfaces as evidence in a future research PR:

- Run `pnpm m1b:audit-self-check` for the local M1B contract floor.
- Run `pnpm m1b:audit-artifact-check -- research/validation/fixtures/m1b-audit`
  for fixture-only review.
- Run `pnpm m1b:audit-artifact-check` after a lab run writes
  `artifacts/m1b-audit/*`.
- Run `node --import tsx research/validation/video_mp4_renderer_validate.ts`
  for the HTML-only video receipt floor.
- Add `WITTGENSTEIN_VALIDATE_VIDEO_MP4=1` and the documented Chrome / FFmpeg
  environment when making MP4 parity claims.
