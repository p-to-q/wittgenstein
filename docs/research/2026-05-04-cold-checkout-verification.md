# Cold-checkout Verification — 2026-05-04

**Date:** 2026-05-04
**Repo commit:** `87ab242527ffc0a3cf2451fd206d1e716302e266`
**Environment:** macOS (local desktop thread), Node `v22.20.0`, pnpm `9.12.0`
**Clone root:** `/private/tmp/wittgenstein-cold-jhnwle/wittgenstein-cold`
**Status:** Failed on artifact production

## Summary

This was a true fresh clone of `upstream/main` into `/private/tmp`, followed by install, full workspace verification, and dry-run CLI attempts for sensor, image, and TTS.

The repo currently **passes install, typecheck, lint, and test from a fresh checkout**, but it **does not produce artifacts from the workspace CLI path**. The issue body's `pnpm cli ...` command is not valid, and the canonical workspace command (`pnpm --filter @wittgenstein/cli exec wittgenstein ...`) exits `0` while producing no stdout JSON, no output artifact, and no `artifacts/runs/<run-id>/manifest.json`.

## Step Results

| Step | Command                                                                                                                                   | Result              | Notes                                                                                                                                               |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `git clone https://github.com/p-to-q/wittgenstein.git ...`                                                                                | Pass                | Clone completed in `8.78s`.                                                                                                                         |
| 2    | `nvm use` / Node check                                                                                                                    | Pass                | No `nvm use` step was required. Local Node `v22.20.0` satisfies repo engine `>=20.19.0`.                                                            |
| 3    | `pnpm install`                                                                                                                            | Pass                | Completed in `5.64s`. One warning seen when checking pnpm version outside workspace: top-level `workspaces` field notice. Install itself was clean. |
| 4    | `pnpm typecheck && pnpm lint && pnpm test`                                                                                                | Pass                | `typecheck 12.92s`, `lint 13.15s`, `test 12.32s`. Full fresh-checkout workspace green.                                                              |
| 5    | `pnpm cli sensor "ECG 72 bpm"`                                                                                                            | Fail                | `pnpm cli ...` is not a real command: `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "cli" not found`.                                                 |
| 5b   | `pnpm --filter @wittgenstein/cli exec wittgenstein sensor "ECG 72 bpm" --dry-run --seed 7 --out artifacts/cold-checkout/sensor-run1.json` | Fail                | Exited `0` but produced no artifact, no JSON summary, and no run manifest.                                                                          |
| 6    | `pnpm --filter @wittgenstein/cli exec wittgenstein image "a forest" --dry-run --seed 7 --out artifacts/cold-checkout/image-run1.png`      | Fail                | Same silent no-op behavior as sensor.                                                                                                               |
| 7    | `pnpm --filter @wittgenstein/cli exec wittgenstein tts "hello" --dry-run --seed 7 --out artifacts/cold-checkout/tts-run1.wav`             | Fail                | Same silent no-op behavior as sensor/image.                                                                                                         |
| 8    | Repeat 5b-7 with same seed and compare bytes                                                                                              | Fail / not testable | No artifacts or manifests were emitted, so byte equality could not be evaluated.                                                                    |

## Time To First Artifact

No artifact was produced, so **time-to-first-artifact is currently undefined** from a fresh checkout.

The shortest observed path to the first failed artifact attempt was:

- clone: `8.78s`
- install: `5.64s`
- first CLI dry-run invocation: sub-second exit, but with no artifact side effect

That means the repo reaches "all checks green" from scratch in roughly 40 seconds on this machine, but it does **not** currently reach "first manifested artifact."

## Evidence And Root Cause

The key evidence is in the CLI entrypoint shape:

- [packages/cli/bin/wittgenstein.js](/Users/dujiayi/Desktop/Wittgenstein/packages/cli/bin/wittgenstein.js:1) detects a workspace checkout via `pnpm-workspace.yaml` and, in that case, runs the source entrypoint with `node --import tsx .../src/index.ts`.
- [packages/cli/src/index.ts](/Users/dujiayi/Desktop/Wittgenstein/packages/cli/src/index.ts:1) exports `createProgram()` and `runCli()` but does **not** invoke `runCli()` at module top level.
- The built file at [packages/cli/dist/index.js](/Users/dujiayi/Desktop/Wittgenstein/packages/cli/dist/index.js:1) has the same shape.

As a result, workspace CLI invocations and the package smoke script:

- `pnpm --filter @wittgenstein/cli exec wittgenstein ...`
- `pnpm --filter @wittgenstein/cli run smoke`

both exit successfully without running any command handlers. This explains why no artifact files appeared under `artifacts/cold-checkout/`, and why `artifacts/runs/` remained at `.gitkeep` only.

## Warnings, Errors, And Doc Gaps

- The issue body's `pnpm cli ...` command is stale or incorrect for the current repo; the actual documented workspace invocation is `pnpm --filter @wittgenstein/cli exec wittgenstein ...`.
- The current CLI smoke test is a false green for this failure mode, because it exercises the same entrypoint path that silently no-ops.
- README / docs examples for workspace CLI invocation are closer to correct than the issue body, but they are not enough to prevent this failure because the entrypoint itself is broken.

## Verdict

The README "Receipts" rows are **not currently reproducible from scratch through the workspace CLI path** on `main` as of 2026-05-04. The repo can be cloned, installed, typechecked, linted, and tested successfully from a fresh checkout, which is real progress. But the strongest reproducibility claim in the project is about producing manifested artifacts, and that claim is not presently verified because the workspace CLI entrypoint exits without executing commands. This should be treated as a pre-#116 reliability issue: not because it blocks the audio backend design itself, but because it blocks honest end-to-end validation of that next slice from a clean checkout.
