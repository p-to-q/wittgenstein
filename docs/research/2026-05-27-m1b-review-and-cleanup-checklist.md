# M1B review and cleanup checklist

Date: 2026-05-27

Purpose: give maintainers one small map for the current M1B review state without
merging PRs, starting training, or deleting local history.

## Current PR state

### PR #457: M1B decoder audit delivery surface

URL: https://github.com/p-to-q/wittgenstein/pull/457

Status as of this checklist:

- Engineering CI is green: `Verify (Node + Python)`, Prettier, static checks,
  and reviewdog completed successfully on `1c2e912`.
- CodeRabbit completed successfully after the mechanical syntax/format fix.
- Vercel remains a known authorization failure covered by #460.
- Review is still requested from `koriyoshi2041`; merge should wait for
  model-owner / ML-specialist sign-off.

Engineering items already addressed:

- Rebased doctor surface against the post-#456 video doctor shape.
- Fixed `preflight.ts` ready-path tracker to return `null`.
- Fixed `doctor.ts` syntax and formatting after the final rebase.

Owner-review questions still open:

- Are Gate C/D metric producer shapes sufficient to close #334/#335?
- Should Gate C require strict zero token Hamming rate, or should a
  candidate-specific epsilon be allowed?
- Should Gate D expected output shape stay hardcoded at `[256, 256, 3]`, or be
  manifest-declared for future 512x512 candidates?
- Is the decoder manifest `blessed` lifecycle acceptable as the canonical bridge
  contract for #402/#435/#441?

### PR #455: M1B research handoff and experiment hooks

URL: https://github.com/p-to-q/wittgenstein/pull/455

Status as of this checklist:

- `mergeStateStatus=DIRTY`.
- Review is requested from `koriyoshi2041`.
- CodeRabbit and engineering review both indicate the doctor/video diagnostics
  slice is now stale after #456.

Dry-run rebase result:

- Command context: temporary worktree at `/tmp/wittgenstein-pr455-dryrun`.
- `git rebase main` conflicts only on commit `eff4f0d Add video render doctor checks`.
- Conflict files:
  - `docs/implementation-status.md`
  - `packages/cli/src/commands/doctor.ts`
  - `packages/cli/test/doctor.test.ts`
- `git rebase --skip` for that commit succeeds.
- The remaining three commits rebase cleanly:
  - `Add image stability experiment hooks`
  - `Add training manifest smoke helpers`
  - `Add M1B research handoff notes`

Recommended #455 split path:

- Drop or redo the stale video/doctor commit instead of resolving it in-place.
- Keep image-codec hooks as their own low-risk slice:
  - `packages/codec-image/src/schema.ts`
  - `packages/codec-image/src/adapters/seed-expander.ts`
  - `packages/codec-image/src/adapters/seed-expander-tile-mosaic.ts`
  - related image tests
- Keep training smoke + research docs as the ML-specialist slice:
  - `research/training/_shared/*`
  - `research/validation/phase0a_emission_entropy.py`
  - `docs/research/2026-05-22-*.md`
- Do not merge #455 until the specialist decides whether the image hooks and
  training/research smoke should remain together.

## Issue mapping for #457

| Issue                                  | #457 coverage                                                                                                         | Remaining owner decision                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| #329 VQGAN-class four-gate audit       | Adds VQGAN audit harness, fixtures, Gate C/D producer shape, and blocked/pass receipt templates.                      | Confirm whether this is sufficient as the VQGAN candidate audit entrypoint.  |
| #334 Gate C deterministic round-trip   | Adds `m1b_gate_c_roundtrip.py`, fixture, and manifest hard-check binding.                                             | Confirm strict-zero Hamming requirement on real lab runs.                    |
| #335 Gate D ONNX / CPU feasibility     | Adds export and ONNX CPU metric producers plus schema validation.                                                     | Confirm CPU threshold and output-shape expectations.                         |
| #402 Lazy weight fetch + sha256 verify | Adds decoder preflight reasons for missing/invalid weights, runtime unavailable, manifest invalid, and audit invalid. | Decide final wiring with install/download UX.                                |
| #435 Owner-review pack                 | Adds review pack, runbook, PR boundary audit, and staging plan docs.                                                  | Owner should sign off on what remains lab-only.                              |
| #441 Training/research re-audit        | Keeps delivery surface below training; adds lab handoff/runbook and receipt expectations.                             | Specialist decides whether training manifest smoke belongs in #455 or later. |

## Local cleanup candidates

No deletion has been performed by this checklist.

Merged local branches that appear safe to delete after maintainer confirmation:

- `claude/blissful-darwin-f6d920`
- `claude/blissful-shannon-c55eed`
- `claude/eager-archimedes-5fa9da`
- `claude/eloquent-bell-d75d41`
- `claude/infallible-black-89d78b`
- `claude/silly-wilbur-ac5c7d`
- `local-main`

Clean local worktrees that can be removed after maintainer confirmation:

- `.claude/worktrees/blissful-shannon-c55eed`
- `.claude/worktrees/infallible-black-89d78b`

Branches not merged into `main` should not be deleted as part of routine cleanup
without a separate owner decision. Many point at older upstream Claude branches
and may be preserved as review/audit history.

## Suggested next actions

1. Wait for `koriyoshi2041` on #457; only fix small CodeRabbit/reviewer nits
   that are clearly engineering-level.
2. Ask the #455 owner/specialist to either drop `eff4f0d` or split the PR using
   the clean dry-run result above.
3. If maintainers approve cleanup, remove only the listed clean worktrees and
   merged local branches.
4. After #457 merges, close or update the linked M1B issues with exact receipt
   gaps rather than broad status comments.
