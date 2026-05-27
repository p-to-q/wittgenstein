---
date: 2026-05-27
status: engineering-readiness audit
labels: [research-derived, stage/cross-cutting, slice/closeout, m1b-prep]
tracks: [#481, #482, #483, #484, #485]
---

# Pre-training engineering readiness audit

## Context

The model-training specialist is about to engage M1B (image trained projector).
Before that handoff, the engineering surface they will land against needs to be
honest — every Tier-0 command must do what its name claims, every guard must
actually guard, every README must accurately describe the directory it sits in.

This note records the audit that ran the morning of 2026-05-27 and the fixes
that landed before specialist kickoff. It is the engineering-side counterpart
to [`docs/research/2026-05-13-m1b-training-prep.md`](2026-05-13-m1b-training-prep.md):
that earlier note framed _what_ M1B needs; this note records _what was wrong_
right before the work began, and what is now true.

## What was found

### 1. `pnpm reviewer-bench` was failing on `main` (silent)

The Tier-0 reviewer verification command — the first thing a contributor types
after `pnpm install` — reported 6/8 pass, 2/8 fail. Two SHA mismatches:

| Row             | Expected (stale pin) | Observed (current)  |
| --------------- | -------------------- | ------------------- |
| `sensor-ecg`    | `dbbf8cca…48e27d14`  | `2684d511…f676eb4d` |
| `sensor-replay` | `7fe25f0e…903ac742`  | `bce0ef86…0e30bc04` |

Root cause: PRs [#426](https://github.com/p-to-q/wittgenstein/pull/426) (ship
sensor sidecar receipts and bundled loupe) and
[#389](https://github.com/p-to-q/wittgenstein/pull/389) (fix codec-sensor HTML
fallback embeds csv basename) intentionally changed sensor HTML output, but
the `examples/reviewer-bench/expected.json` pins were not refreshed in either
PR. There was no CI check that would catch this drift before merge.

**Why this matters before training:** `pnpm reviewer-bench` is the canonical
self-check. A new contributor seeing it fail on a clean checkout has no way
to distinguish "their machine is misconfigured" from "the repo is broken".
Specialist onboarding would have started with a confusing red signal.

### 2. CI was not enforcing the reviewer-bench

Recap of the CI coverage gap that allowed (1) to land:

- `scripts/check-no-research-imports.mjs` — wired into CI ✅
- `scripts/check-npm-publish-tarball.mjs` — wired into CI ✅
- `pnpm reviewer-bench` — **not** in CI ❌

Any PR that touched a deterministic-by-construction codec could change the
output bytes without a same-PR pin refresh and CI would say green.

### 3. `research/training/{tokenizer,adapter,llm-head}/` directories were empty

[`research/training/README.md`](../../research/training/README.md) advertises
three subprograms and points readers at those subdirectories. The directories
existed but contained nothing — not even a README or `.gitkeep` placeholder.
A specialist walking into `research/training/tokenizer/` on day one saw an
empty directory and no signal of where to look for the owning issue stack.

### 4. Eleven of twelve packages missing license / repository / homepage / bugs

Only `@wittgenstein/cli` had all four standard metadata fields in its
`package.json`. The other 11 packages were missing all four — even though
the repo is Apache-2.0 and every package belongs to the same monorepo.

Risk: flipping any private package to public would publish without a license
field. Today nothing is published, so this is latent — but flipping
`private:false` is a one-line config change a future maintainer might make
without re-auditing every package.

## What is now true

After landing [#481](https://github.com/p-to-q/wittgenstein/pull/481) and
[#485](https://github.com/p-to-q/wittgenstein/pull/485):

| Surface                                 | State                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm reviewer-bench`                   | 8/8 pass — `expected.json` refreshed via `scripts/reviewer-bench-pin.ts`, ran twice to verify determinism                            |
| `Verify (Node + Python)` CI step        | Now runs `pnpm reviewer-bench`; future SHA drift fails the PR, not main                                                              |
| `research/training/tokenizer/README.md` | New — declares Phase-1 deliverable, marks the directory as a skeleton placeholder, cross-links #396 / #329–#335 / #334 / #335 / #473 |
| `research/training/adapter/README.md`   | New — same shape, cross-links #397 / #393 / #453 / #454                                                                              |
| `research/training/llm-head/README.md`  | New — same shape, cross-links #398 / #451 / #452                                                                                     |
| All 12 packages                         | `license: "Apache-2.0"` + `repository` + `homepage` + `bugs` present                                                                 |

## Pre-training Tier-0 self-check (specialist onboarding)

Run after a clean clone and `pnpm install --frozen-lockfile`:

```bash
pnpm reviewer-bench               # expect 8/8 pass
pnpm -r typecheck                 # expect green
pnpm -r test                      # expect 266+ tests pass (no skip outside Kokoro determinism)
pnpm test:golden                  # expect 15 golden tests pass
pnpm lint:deps                    # expect 6 codec packages clean
pnpm lint:publish-surface         # expect no research/ leak, tarball clean
pnpm --filter @wittgenstein/cli exec wittgenstein doctor
# expect: tier0.ready=true, tier1.ready=false (#403), tier3.ready=false (not user tier)
```

If any of these fail, **stop before training** — something has drifted since
this note was written, and the specialist's first step is to identify what.

## Local-optimum studies surfaced during the audit

These were noticed but intentionally **not** fixed in the readiness sweep,
because each is a local-optimum question that benefits from a separate small
PR with its own R/E/H review, not a bundled "audit closeout" commit:

1. **Duplicated `firstOutputLine` helper.** Identical 3-line function lives
   in `packages/cli/src/commands/doctor.ts` and
   `packages/codec-video/src/hyperframes-cli-renderer.ts`. A single-arg
   variant `firstLine` lives in `packages/codec-video/src/mp4-renderer.ts`.
   Consolidating into `@wittgenstein/process-runner` or `@wittgenstein/core`
   is mechanical but not load-bearing.
2. **Hardcoded issue tracker URLs.** `packages/cli/src/commands/install.ts`
   embeds `https://github.com/p-to-q/wittgenstein/issues/402` (and similar)
   as string literals. If the repo moves orgs or issues get renumbered the
   URLs go stale. Could live behind a constant in `@wittgenstein/schemas`.
3. **`spawnSync` usage patterns.** Three different files do `spawnSync(cmd,
args, { encoding: "utf8", timeout: N })` with slightly different timeouts
   (1000ms in doctor, 10_000ms in hyperframes-cli, varies in mp4-renderer).
   A `spawnVersionCheck()` helper would standardize the timeout policy.

Each could be a follow-up issue if the specialist wants tighter local
optima, but none block training.

## Open handoff issues filed

Three issues were filed during the audit for problems the specialist will
hit at known milestones:

- [#482](https://github.com/p-to-q/wittgenstein/issues/482) — Define
  training-run manifest schema (separate from inference `RunManifest`).
  Trigger: before the first real training run produces a checkpoint.
- [#483](https://github.com/p-to-q/wittgenstein/issues/483) — End-to-end
  test for `wittgenstein install image` post-blessing unblock path.
  Trigger: after [#457](https://github.com/p-to-q/wittgenstein/pull/457)
  merges and the first `DecoderFamilyManifest` is blessed.
- [#484](https://github.com/p-to-q/wittgenstein/issues/484) — `wittgenstein
doctor` reads decoder-family manifest when `WITTGENSTEIN_DECODER_MANIFEST`
  is set. Trigger: same as #483; the closeout of the ADR-0020 acceptance
  list from #376.

## What this note is not

- **Not** a doctrine change. The doctrine docs (THESIS, hard-constraints,
  ADRs, RFCs) are untouched.
- **Not** a research conclusion about M1B itself. Training-side research
  lives in [`2026-05-13-m1b-training-prep.md`](2026-05-13-m1b-training-prep.md)
  and the issue stack under stage/m1-image.
- **Not** a checklist for shipping a release. v0.3.0-alpha.3 is already cut.
  This is the pre-handoff audit for the next phase of work, not a release
  gate.
