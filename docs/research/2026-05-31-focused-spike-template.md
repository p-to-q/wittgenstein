---
date: 2026-05-31
status: issue #479 deliverable
labels: [research-derived, focused-spike, process]
tracks: [#479, #478, #480, #474, #476, #439]
---

# Focused exploratory spike template

This note delivers #479: a reusable shape for exploratory research that is
small enough to run, strict enough to kill, and attached to a real blocker.

## When to use this shape

Use a focused spike when the next question is too uncertain for a local-optimum
comparison (#478), but too concrete to leave as a broad research ledger item
(#440 / #439).

Do not use this shape for:

- historical under-research or past decision debt; classify that in #480 first;
- alternatives already clear enough to compare directly; use #478 instead;
- doctrine changes; route those through Brief / RFC / ADR;
- training runs, model-owner decisions, or hardware gates that have not been
  explicitly commissioned.

The spike must end in one of four states:

- `promote`: enough evidence exists to open a focused PR/issue or feed #478;
- `park`: the question is real, but the kill criterion fired;
- `unknown`: evidence is missing and the next evidence source is named;
- `doctrine`: the finding changes rules, so it exits to RFC/ADR.

## Template

Copy this block into a new research note or issue comment.

```md
## Focused spike: <short name>

**Question.** What exact uncertainty are we trying to remove?

**Blocker answered.** Which issue / PR / release gate becomes clearer if this
spike lands?

**Why now.** Why is this the next smallest useful question rather than backlog
wandering?

**Smallest source set.**

- Local files:
  - `<path>`
  - `<path>`
- Issue / PR anchors:
  - `#NNN`
  - `#NNN`
- External sources, if any:
  - `<URL or paper>` inspected on `<date>`

**Experiment / audit steps.**

1. Command, fixture, source inspection, or comparison to run.
2. What output is recorded.
3. What is intentionally not tested.

**Pass / fail / unknown criteria.**

- Pass:
- Fail / kill:
- Unknown:

**Safety boundaries.**

- No training:
- No doctrine bypass:
- No release claim:
- No user-worktree mutation:

**Expected artifact.**

- Research note / issue comment / fixture / command output path:
- Validation command:

**Promotion path.**

- If pass:
- If fail:
- If unknown:

**Closeout sentence.** One sentence future maintainers can paste into the
target issue without overclaiming.
```

## Rules for reviewers

1. Reject a spike that does not name a blocker.
2. Reject a spike whose pass criteria are softer than its conclusion.
3. Reject a spike that says "needs more research" without naming the next
   evidence source.
4. If the spike finds stable alternatives, promote it to #478 or a focused
   implementation issue.
5. If the spike finds a rule change, stop writing code and open the governance
   lane.

## Example 1: #474 M1B artifact closeout

**Question.** Are real lab-produced VQGAN Gate C/D artifacts present and
validated strongly enough to close #474?

**Blocker answered.** #474 asks whether lab receipts have been reconciled into
durable repo state without over-reading #491 / #492 / #528 as implementation
completion.

**Why now.** #491 closed the empirical Gate C/D audit, #492 pinned the LlamaGen
bridge manifest, and #528 landed validator / preflight infrastructure. That
makes #474 tempting to close, but only if real artifact files are present.

**Smallest source set.**

- `scripts/m1b-audit-artifact-check.mjs`
- `artifacts/m1b-audit/README.md`
- `docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`
- `packages/codec-image/src/decoders/llamagen/manifest.json`
- Issues / PRs: #474, #491, #492, #528, #402

**Experiment / audit steps.**

1. Run `pnpm m1b:audit-artifact-check`.
2. Inspect whether these files exist under `artifacts/m1b-audit/`:
   `gate-c-roundtrip.json`, `gate-d-onnx-export.json`,
   `gate-d-onnx-cpu.json`, `vqgan-gates.json`.
3. If present, compare artifact hashes and environment fields against #491.
4. Confirm #402 remains open unless lazy fetch / install delivery is truly
   implemented.

**Pass / fail / unknown criteria.**

- Pass: all four real artifact files exist, validator passes, hashes match the
  accepted #491 receipt, and #402 is updated but not falsely closed.
- Fail / kill: validator reports missing real artifacts or only fixture files.
- Unknown: artifacts exist but cannot be matched to #491's hardware / hash
  claims.

**Safety boundaries.**

- No training or re-running GPU jobs.
- No closing #402 from this spike.
- No release language stronger than "audit receipt reconciled".

**Current disposition on 2026-05-31.**

`pnpm m1b:audit-artifact-check` reports all four expected real artifact files
missing. This fires the kill criterion for closing #474 now.

**Promotion path.**

- If pass later: close #474 with artifact hashes and validator output.
- If fail now: keep #474 open and, if useful, open a focused artifact-import
  issue naming the four missing files.
- If unknown: ask the lab owner for the exact artifact bundle, not a prose
  restatement.

**Closeout sentence.** Do not close #474 yet; the validator still lacks the real
Gate C/D artifact files, so the repo has audit prose and fixtures but not the
durable receipt bundle requested by #474.

## Example 2: #476 MP4 cross-machine portability

**Question.** Does the repo-owned MP4 renderer produce portable structural
receipts across machines, not only byte-identical output on one machine?

**Blocker answered.** #476 is the remaining M4 video research blocker after
same-platform parity was shown; it needs cross-machine receipt portability.

**Why now.** `docs/codecs/video.md` documents a repo-owned Chrome + FFmpeg MP4
renderer, `videoRender` receipts, and local validation. That is enough to define
the spike without inventing a broader video benchmark.

**Smallest source set.**

- `docs/codecs/video.md`
- `research/validation/video_mp4_renderer_validate.ts`
- `docs/research/2026-05-26-video-mp4-renderer-validation.md`
- Issue #476

**Experiment / audit steps.**

1. Run the default validation:
   `node --import tsx research/validation/video_mp4_renderer_validate.ts`.
2. On hosts with Chrome/Chromium + FFmpeg, run the MP4 gate:
   ```bash
   WITTGENSTEIN_VALIDATE_VIDEO_MP4=1 \
     WITTGENSTEIN_HYPERFRAMES_RENDER=1 \
     node --import tsx research/validation/video_mp4_renderer_validate.ts
   ```
3. Record OS, Node, Chrome, FFmpeg, renderer backend, output kind, frame count,
   duration, dimensions, and SHA-256.
4. Repeat on at least one distinct machine or container image.
5. Compare structural metadata first; compare bytes only within a declared
   same-platform class.

**Pass / fail / unknown criteria.**

- Pass: two distinct environments produce matching structural metadata and
  manifest receipt fields for the fixed inline-SVG fixture; same-platform byte
  equality remains an extra, not the cross-machine gate.
- Fail / kill: frame count, duration, dimensions, or playable MP4 structure
  diverges for the same fixed fixture.
- Unknown: only one environment is available, or MP4 dependencies are absent.

**Safety boundaries.**

- No neural video claim.
- No upstream HyperFrames dependency promotion.
- No changing default renderer backend from `distilled-internal`.

**Promotion path.**

- If pass: write a short receipt note and close #476.
- If fail: open a focused renderer-portability issue naming the divergent field
  and backend.
- If unknown: comment on #476 with the local environment and missing second
  environment; do not close it.

**Closeout sentence.** Cross-machine #476 can close only on structural metadata
agreement across at least two environments; one-machine byte parity is useful
but insufficient.

## Reviewer checklist

Before accepting a spike closeout, verify:

- the blocker issue is named and current;
- the source set is small enough to inspect;
- the command or artifact exists and was actually run or inspected;
- every pass/fail/unknown branch maps to a concrete next action;
- no training, release, or doctrine claim sneaks in through language;
- the final closeout sentence is narrower than the evidence, not wider.
