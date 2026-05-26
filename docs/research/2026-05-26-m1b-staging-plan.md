---
date: 2026-05-26
status: staging plan
labels: [research-derived, m1-image, owner-review]
tracks: [#334, #335, #402, #435, #441]
---

# M1B audit delivery staging plan

> **Status:** staging guide only. Do not treat this as a commit log.
> The goal is to stage the M1B audit delivery PR without accidentally bundling
> unrelated governance / attribution edits.

## Stage for M1B PR

```bash
git add \
  .gitignore \
  package.json \
  artifacts/m1b-audit/.gitkeep \
  artifacts/m1b-audit/README.md \
  docs/research/2026-05-26-m1b-audit-delivery-pr-draft.md \
  docs/research/2026-05-26-m1b-audit-delivery-review-pack.md \
  docs/research/2026-05-26-m1b-lab-gate-runbook.md \
  docs/research/2026-05-26-m1b-pr-boundary-audit.md \
  docs/research/2026-05-26-m1b-staging-plan.md \
  packages/cli/src/commands/doctor.ts \
  packages/cli/src/commands/install.ts \
  packages/cli/test/doctor.test.ts \
  packages/cli/test/install.test.ts \
  packages/codec-image/src/decoders/README.md \
  packages/codec-image/src/decoders/manifest.ts \
  packages/codec-image/src/decoders/preflight.ts \
  packages/codec-image/test/decoder-family-manifest.test.ts \
  packages/codec-image/test/decoder-preflight.test.ts \
  research/training/README.md \
  research/validation/fixtures/m1b-audit/README.md \
  research/validation/fixtures/m1b-audit/gate-c-pass.fixture.json \
  research/validation/fixtures/m1b-audit/gate-d-fail.fixture.json \
  research/validation/fixtures/m1b-audit/gate-d-onnx-export.fixture.json \
  research/validation/fixtures/m1b-audit/vqgan-gates-blocked.fixture.json \
  research/validation/m1b_export_llamagen_decoder_onnx.py \
  research/validation/m1b_gate_c_roundtrip.py \
  research/validation/m1b_gate_d_onnx_cpu.py \
  research/validation/test_m1b_metric_producers.py \
  research/validation/test_vqgan_gate_audit.py \
  research/validation/vqgan_gate_audit.py \
  scripts/m1b-audit-artifact-check.mjs \
  scripts/m1b-audit-self-check.mjs \
  scripts/m1b-staging-plan-check.mjs
```

## Do not stage for M1B PR

These should be a separate governance / attribution hygiene PR, if kept:

```bash
CODE_OF_CONDUCT.md
docs/adrs/0013-independent-ratification-for-doctrine-prs.md
docs/engineering-discipline.md
docs/research/briefs/A_vq_vlm_lineage_audit.md
docs/research/briefs/C_unproven_horizon.md
docs/research/briefs/D_cli_and_sdk_conventions.md
docs/research/briefs/E_benchmarks_v2.md
docs/research/briefs/F_site_reconciliation.md
docs/research/briefs/G_image_network_clues.md
docs/research/briefs/H_codec_engineering_prior_art.md
docs/rfcs/0001-codec-protocol-v2.md
docs/rfcs/0002-cli-ergonomics.md
docs/rfcs/0003-naming-pass.md
docs/rfcs/0004-site-reconciliation.md
docs/rfcs/0005-naming-lock-v2.md
docs/team-split.md
docs/v02-alignment-review.md
docs/v02-final-audit.md
```

## Pre-PR verification

```bash
pnpm m1b:audit-self-check
pnpm m1b:audit-artifact-check -- research/validation/fixtures/m1b-audit
pnpm m1b:audit-artifact-check -- --allow-missing
pnpm m1b:staging-plan-check
pnpm --filter @wittgenstein/cli test -- install.test.ts doctor.test.ts
pnpm --filter @wittgenstein/cli typecheck
```

## After staging

Check that only M1B files are staged:

```bash
git diff --cached --name-only
```

If any file from "Do not stage" appears, unstage it before opening the M1B PR.
