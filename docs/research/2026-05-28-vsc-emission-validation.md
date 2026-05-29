# Visual Seed Code emission validation

Status: draft validation plan  
Date: 2026-05-28

## Purpose

Validate whether a text-first LLM can reliably emit Visual Seed Code. A decoder can be feasible and still not deliver M1B if the LLM-facing contract is unstable.

## Prompt families

1. Simple object: cube, tree, lighthouse.
2. Spatial composition: left/right/foreground/background.
3. Style and lighting: fog, neon, vector icon.
4. Counting and attributes: five birds, two triangles, grid of windows.
5. Abstract prompts: uncertainty, memory, compression.
6. Adversarial prompts: raw JS/Python renderer request, cloud API request, contradictory prompt.

## Metrics

- JSON parse success;
- schema-valid VSC rate;
- repair rate;
- refusal rate;
- seed length distribution;
- token entropy;
- token uniqueness;
- paraphrase edit distance;
- grid shape stability;
- semantic/VSC agreement;
- adapter acceptance;
- hidden fallback rate.

## Required artifacts

For each run:

- raw prompt;
- raw model output;
- parsed VSC;
- parser diagnostics;
- repair diagnostics;
- adapter acceptance result;
- failure receipt if applicable.

Suggested directory:

```text
artifacts/validation/vsc-emission/<date>/<model>/<prompt-family>/
```

## Placeholder thresholds

These are not policy until maintainer-approved:

- schema-valid rate >= 95% on non-adversarial prompts;
- repair rate <= 10%;
- hidden fallback rate = 0%;
- invalid-output receipt rate = 100%;
- paraphrase shape stability >= 90%.

## Pass/fail

Pass: VSC is valid, stable, information-rich, adapter-consumable, and failures are visible.

Conditional pass: emission is valid but weak; release wording must say quality is pending.

Fail: invalid rate high, repair hides failures, token collapse, prompt-insensitive VSC, or procedural fallback satisfies real-decoder tier.

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
