---
date: 2026-05-26
status: PR draft
labels: [research-derived, m1-image, owner-review]
tracks: [#334, #335, #402, #435, #441]
---

# PR draft — M1B decoder audit delivery surface

## Summary

- Adds a verifiable M1B decoder-family manifest / audit receipt surface so Gate
  C/D claims cannot be blessed from prose alone.
- Adds local-only Gate C, ONNX export, and Gate D metric producer scripts plus
  fixture receipts and artifact validators for owner-review.
- Exposes image decoder readiness through install / doctor preflight while
  keeping M1B blocked until lab empirical evidence clears #334 and #335.

## Scope / hygiene

- [ ] Branch is focused on M1B decoder delivery audit surface.
- [ ] PR boundary matches
      `docs/research/2026-05-26-m1b-pr-boundary-audit.md`.
- [ ] No generated lab artifacts, weights, ONNX files, or command logs are
      committed.
- [ ] `artifacts/m1b-audit/` keeps only `README.md` and `.gitkeep` in git.
- [ ] This PR does not wire `loadLlamagenDecoderBridge`.
- [ ] This PR does not start model training.

## Issue closure / progress

- #334: Progress only. Gate C metric producer + hard-check receipt shape exist;
  real lab run still required before closure.
- #335: Progress only. ONNX export producer + ONNX Runtime CPU metric producer
  exist; real lab run still required before closure.
- #402: Progress only. Install / doctor now expose decoder-delivery blockers;
  delivery remains blocked until a decoder manifest is blessed.
- #435: Provides owner-review pack and file map.
- #441: Keeps training manifest smoke separate from decoder empirical gates.

## Local validation

```bash
pnpm m1b:audit-self-check
pnpm m1b:audit-artifact-check -- research/validation/fixtures/m1b-audit
pnpm m1b:audit-artifact-check -- --allow-missing
pnpm m1b:staging-plan-check
pnpm --filter @wittgenstein/cli test -- install.test.ts doctor.test.ts
pnpm --filter @wittgenstein/cli typecheck
```

Expected result: all commands pass locally without torch, ONNX Runtime,
weights, GPU, or lab access. Last checked on 2026-05-26:

- `pnpm m1b:audit-self-check`: passed, including Python validation tests,
  decoder manifest / preflight tests, codec-image typecheck, fixture artifact
  check, staging-plan coverage, and generated-artifact ignore checks.
- `pnpm m1b:audit-artifact-check -- research/validation/fixtures/m1b-audit`:
  passed against fixture receipts.
- `pnpm m1b:audit-artifact-check -- --allow-missing`: passed for an empty
  local `artifacts/m1b-audit/` handoff directory.
- `pnpm m1b:staging-plan-check`: passed with 33 M1B stage entries and 18
  governance / attribution files classified as do-not-stage.
- `pnpm --filter @wittgenstein/cli test -- install.test.ts doctor.test.ts`:
  passed, 2 files / 7 tests.
- `pnpm --filter @wittgenstein/cli typecheck`: passed.

## What remains empirical

- Real LlamaGen checkpoint loading against the metric producers.
- Gate C deterministic encode / decode / re-encode under real weights.
- ONNX export of the decoder half from the pinned checkpoint.
- ONNX Runtime CPU decode timing and shape check.
- Final `vqgan-gates.json` from a lab run.

## Reviewer notes

- Fixture JSON files are intentionally fake contract examples, not evidence.
- The artifact validator accepts fixtures for local review and standard
  filenames under `artifacts/m1b-audit/` after a lab run.
- A decoder-family manifest may be marked `blessed` only when Gate A/B remain
  valid for the exact asset revision and Gate C/D pass via
  `validateDecoderManifestAuditReceipts`.

## Suggested labels

- `research-derived`
- `stage/m1-image`
- `slice/receipts`
- `slice/eval`
- `priority/p1`
