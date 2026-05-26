---
date: 2026-05-26
status: boundary audit
labels: [research-derived, m1-image, owner-review]
tracks: [#334, #335, #402, #435, #441]
---

# M1B PR boundary audit

> **Status:** local diff hygiene note for the M1B audit delivery PR.
> This is not a doctrine change. It records which current worktree changes
> belong in the M1B PR and which should be split out.

## Recommended M1B PR contents

These files are in-scope for the M1B audit delivery PR:

### Decoder contract / preflight

- `packages/codec-image/src/decoders/manifest.ts`
- `packages/codec-image/src/decoders/preflight.ts`
- `packages/codec-image/test/decoder-family-manifest.test.ts`
- `packages/codec-image/test/decoder-preflight.test.ts`
- `packages/codec-image/src/decoders/README.md`

Why: these files make decoder-family blessing, Gate C/D receipts, cached
weights, license refusal, SHA mismatch, and runtime unavailable states
reviewable before a bridge loads real weights.

### CLI visibility

- `packages/cli/src/commands/install.ts`
- `packages/cli/src/commands/doctor.ts`
- `packages/cli/test/install.test.ts`
- `packages/cli/test/doctor.test.ts`

Why: #402 needs users and reviewers to see that image install remains blocked
until a decoder-family manifest is blessed, with #334/#335 called out.

### Research validation package

- `research/validation/vqgan_gate_audit.py`
- `research/validation/test_vqgan_gate_audit.py`
- `research/validation/m1b_gate_c_roundtrip.py`
- `research/validation/m1b_export_llamagen_decoder_onnx.py`
- `research/validation/m1b_gate_d_onnx_cpu.py`
- `research/validation/test_m1b_metric_producers.py`
- `research/validation/fixtures/m1b-audit/*`

Why: these provide the local contract, fixture evidence, and lab-executable
metric producer package for #334/#335 without starting training.

### Operator handoff / review docs

- `docs/research/2026-05-26-m1b-lab-gate-runbook.md`
- `docs/research/2026-05-26-m1b-audit-delivery-review-pack.md`
- `docs/research/2026-05-26-m1b-audit-delivery-pr-draft.md`
- `artifacts/m1b-audit/README.md`
- `artifacts/m1b-audit/.gitkeep`
- `research/training/README.md`

Why: #435/#441 need an owner-review entrypoint, explicit local-vs-lab boundary,
and a training-manifest smoke tie-in that does not imply training has run.

### Tooling / ignore policy

- `.gitignore`
- `package.json`
- `scripts/m1b-audit-self-check.mjs`
- `scripts/m1b-audit-artifact-check.mjs`
- `scripts/m1b-staging-plan-check.mjs`

Why: these provide one-command local validation and prevent generated lab
artifacts from entering git. The staging-plan check also keeps unrelated
governance / attribution edits out of the M1B review package.

## Recommended split-out / exclude from this PR

The following modified files are not part of M1B audit delivery and should be
split out into a separate governance/docs hygiene PR, or left out of the M1B PR:

- `CODE_OF_CONDUCT.md`
- `docs/adrs/0013-independent-ratification-for-doctrine-prs.md`
- `docs/engineering-discipline.md`
- `docs/research/briefs/A_vq_vlm_lineage_audit.md`
- `docs/research/briefs/C_unproven_horizon.md`
- `docs/research/briefs/D_cli_and_sdk_conventions.md`
- `docs/research/briefs/E_benchmarks_v2.md`
- `docs/research/briefs/F_site_reconciliation.md`
- `docs/research/briefs/G_image_network_clues.md`
- `docs/research/briefs/H_codec_engineering_prior_art.md`
- `docs/rfcs/0001-codec-protocol-v2.md`
- `docs/rfcs/0002-cli-ergonomics.md`
- `docs/rfcs/0003-naming-pass.md`
- `docs/rfcs/0004-site-reconciliation.md`
- `docs/rfcs/0005-naming-lock-v2.md`
- `docs/team-split.md`
- `docs/v02-alignment-review.md`
- `docs/v02-final-audit.md`

Observed pattern: these changes replace `max` / `max.zhuang.yan@gmail.com` with
`@Jah-yee @Moapacha`. That is governance / attribution hygiene, not decoder
delivery. Mixing it into M1B would expand review scope and trigger
doctrine-surface review obligations unrelated to #334/#335/#402.

## Validation matrix for the M1B PR

Run before opening or updating the PR:

```bash
pnpm m1b:audit-self-check
pnpm m1b:audit-artifact-check -- research/validation/fixtures/m1b-audit
pnpm m1b:audit-artifact-check -- --allow-missing
pnpm m1b:staging-plan-check
pnpm --filter @wittgenstein/cli test -- install.test.ts doctor.test.ts
pnpm --filter @wittgenstein/cli typecheck
```

If the M1B PR includes only the recommended files above, video tests are not
required for this PR. If any video files re-enter the diff, run codec-video
tests/typecheck and split the video work if possible.

## PR statement to preserve

This PR does not close #334 or #335. It makes their evidence executable and
reviewable. The closing event is a lab run producing `vqgan-gates.json` with
Gate C and Gate D both passing their hard checks.
