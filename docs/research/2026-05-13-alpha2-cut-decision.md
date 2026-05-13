---
date: 2026-05-13
status: maintainer decision deliverable
labels: [release, governance, v0.3]
tracks: [#292, #283, #70]
---

# v0.3.0-alpha.2 cut decision

> **Status:** maintainer decision. The exec-plan annotation in [PR #293](https://github.com/p-to-q/wittgenstein/pull/293) explicitly named the alpha.2 cut as a maintainer call. With the per-candidate audits now landed ([#336](https://github.com/p-to-q/wittgenstein/pull/336) VQGAN-class Gates A+B; [#340](https://github.com/p-to-q/wittgenstein/pull/340) parallel audits for FSQ / OpenMAGVIT2 / TiTok / MaskBit), the uncertainty around the cut has materially reduced.
> **Decision: cut alpha.2 NOW, name M1B as the named blocker in release notes.**
> _Tracker: [#292](https://github.com/p-to-q/wittgenstein/issues/292) v0.3 trust closeout umbrella._

## Recap of the question

From [`docs/exec-plans/active/codec-v2-port.md`](../exec-plans/active/codec-v2-port.md) §"Next maintainer-facing question":

> **v0.3.0-alpha.2 cut timing.** With M1A / M2 / M3 closed and M1B blocked on #283 audits, the alpha.2 conversation is gated on the @Jah-yee disposition (per #246 / #248). Either:
> - Cut alpha.2 now, naming the blocker explicitly in release notes, OR
> - Hold alpha.2 until #283 produces at least one candidate clearance, then cut.
>
> Both are defensible. Maintainer call.

Since that annotation was written, the campaign has added five PRs that materially advance the trust surface:

| PR | What it landed | Effect on alpha.2 trust |
|---|---|---|
| [#321](https://github.com/p-to-q/wittgenstein/pull/321) | Revised patchGrammar measurement plan (sensor) | Sensor research lane is honest and ready to execute |
| [#322](https://github.com/p-to-q/wittgenstein/pull/322) | Revised radar audit plan (M1B) | M1B unblock protocol is ratified |
| [#336](https://github.com/p-to-q/wittgenstein/pull/336) | VQGAN-class Gates A+B PASS | License + weights risk for the primary candidate is retired |
| [#340](https://github.com/p-to-q/wittgenstein/pull/340) | Parallel audits FSQ / OpenMAGVIT2 / TiTok / MaskBit | Candidate set narrowed; MaskBit's weights-license carve-out surfaced |
| [#337](https://github.com/p-to-q/wittgenstein/pull/337) / [#338](https://github.com/p-to-q/wittgenstein/pull/338) / [#339](https://github.com/p-to-q/wittgenstein/pull/339) | AI-shape audit refactors (decoder.ts, render.ts, hyperframes-wrapper.ts) | Strongest AI-shape smells extracted; future M1B wiring lands on cleaner seams |

## Decision

**Cut v0.3.0-alpha.2 now.** Name M1B (image trained projector) as the named blocker in the release notes, with explicit pointers to:

- [#283](https://github.com/p-to-q/wittgenstein/issues/283) — per-candidate audit commission (parent).
- [#329](https://github.com/p-to-q/wittgenstein/issues/329) — Priority 1 sub-issue (VQGAN-class Gates A+B done; C+D pending).
- [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335) — VQGAN-class Gate C (determinism) + Gate D (Node/ONNX/CPU) implementation slices.
- [docs/research/2026-05-13-m1b-training-prep.md](2026-05-13-m1b-training-prep.md) — training-prep research (this PR's sibling).

## Rationale

### What "cut now" buys

1. **Crystallizes the current state.** alpha.2 packages the doctrine-locked, audit-ratified, refactor-cleaned baseline as a single tag. External observers (potential contributors, downstream users) can pin against a real release rather than a moving HEAD.
2. **Signals momentum.** Cutting on a date close to substantial campaign progress communicates the project is alive. Holding indefinitely on operational gates risks the audit work going stale (research notes age out fast — license terms change, README content changes, candidate repos move).
3. **Preserves the audit work as release-time evidence.** The candidate audits + AI-shape refactors are exactly the kind of trust evidence release notes can point to. Cutting now puts them on record at a fixed version.
4. **Forces the manifest spine to absorb the recent refactor.** The decoder.ts / render.ts / hyperframes-wrapper.ts splits should propagate into the next release's manifest receipts — cutting alpha.2 is the natural trigger for a CHANGELOG sweep that the next post-cut PRs would otherwise drift past.

### What "cut now" costs

1. **M1B is still a named blocker.** Release notes have to be explicit that the image trained-projector path is not yet wired. This is **already the truth in `main`**; cutting just makes it externally visible.
2. **A second cut becomes likely when Gates C+D close.** alpha.3 is the natural successor once VQGAN-class clears all four gates. That's fine — alpha.X prereleases are designed for this kind of incremental cut.
3. **Sub-candidate verdicts (#330-#333) are provisional.** Cutting now means the alpha.2 release notes carry a verdict like "VQGAN-class is the primary candidate; backup candidates have provisional audits with caveats." That's an honest read of the current state.

### Why holding is the weaker call

Holding for first-candidate-clearance means waiting on [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335) — both require **local PyTorch + a copy of the LlamaGen VQ tokenizer weights downloaded by someone with that environment**. The campaign's autonomous work can't execute these. So holding waits on an external dependency without a timeline.

The audit work that materially reduced uncertainty (#336, #340) is already done; holding waits on operational verification that the audits already framed as "lower-risk than the license/weights gates."

## Release-notes draft for alpha.2

The actual `CHANGELOG.md` `[0.3.0-alpha.2]` entry should cover at minimum:

```markdown
## [0.3.0-alpha.2] — 2026-05-13 — campaign sweep + audit ratification

### Added
- Per-candidate radar audit protocol ratified (#322); Priority 1 (VQGAN-class)
  Gates A+B PASS (#336); parallel audits Gates A+B for Priorities 2-5 (#340).
- AI-shape audit deliverable (#328) with three filed refactor follow-ups
  (#325 / #326 / #327, all landed).
- Operating-doc drift correction across AGENTS.md / PROMPT.md (#323) and
  README first-screen with compact modality map (#324).
- Sensor patchGrammar measurement plan revision (#321; NOAA LCD pinned).
- Training-prep research note for M1B (engineering practices + concrete
  code layout; no training code yet).

### Changed
- `packages/codec-image/src/pipeline/decoder.ts`: 602 → 309 lines via
  extraction of `landscape-renderer.ts` + `internal-math.ts` (#337).
- `packages/codec-sensor/src/render.ts`: 447 → 206 lines via extraction
  of `operators/` strategy directory + `loupe-renderer.ts` (#338).
- `packages/codec-video/src/hyperframes-wrapper.ts`: 409 → 167 lines via
  extraction of `compositions/{svg-slide,scene-card,shared}.ts` +
  `process-runner.ts` (#339).

### Known blockers (current mainline)
- **M1B (image trained projector)** is the named blocker. Wiring
  `loadLlamagenDecoderBridge` requires VQGAN-class Gate C (determinism;
  #334) + Gate D (Node/ONNX/CPU; #335) to clear. Both gates need
  local PyTorch + LlamaGen VQ tokenizer downloaded. Until then
  `packages/codec-image/src/decoders/llamagen.ts` remains a
  `NotImplementedError` stub.

### Trust-surface receipts
[as before — sensor parity / audio parity / training-data lock,
plus the new audit deliverables and refactor verifications]
```

The `CHANGELOG.md` sweep is itself a small follow-up PR that lands as part of the cut.

## Implementation steps for cutting alpha.2

1. **CHANGELOG sweep PR** — convert `[Unreleased]` to `[0.3.0-alpha.2]` with the above structure, plus the trailing `[Unreleased]` header reset.
2. **Version bump PR** — bump root `package.json` and all `packages/*/package.json` from `0.3.0-alpha.1` to `0.3.0-alpha.2`. Coordinated single commit.
3. **Tag + release** — `git tag v0.3.0-alpha.2` on the post-merge SHA + `gh release create` with the release notes pulled from the CHANGELOG entry.
4. **Update [`docs/exec-plans/active/codec-v2-port.md`](../exec-plans/active/codec-v2-port.md)** "Next maintainer-facing question" section — mark the alpha.2 question resolved and update the M1B-unblock pointer.

Steps 1-2 can be a single PR. Step 3 happens on its merge. Step 4 is a small followup.

## What this decision does NOT do

- **Does not unblock M1B.** Gates C+D ([#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)) still need to clear. alpha.2 names M1B as a known blocker; alpha.3 closes that blocker.
- **Does not ratify any candidate.** VQGAN-class is the primary based on the audits, but the wiring slice happens at alpha.3.
- **Does not commit to a timeline for alpha.3.** Depends on when Gates C+D get run (external dependency).
- **Does not modify any doctrine surface.** ADR-0018 / ADR-0005 / ADR-0007 unchanged.
- **Does not affect `[Unreleased]` content.** The CHANGELOG sweep is its own slice; this note is the decision deliverable, not the sweep.

## Cross-references

- v0.3 trust closeout umbrella: [#292](https://github.com/p-to-q/wittgenstein/issues/292).
- Exec-plan annotation that named the question: [PR #293](https://github.com/p-to-q/wittgenstein/pull/293).
- Audit deliverables that informed the decision: [#336](https://github.com/p-to-q/wittgenstein/pull/336) (VQGAN-class), [#340](https://github.com/p-to-q/wittgenstein/pull/340) (parallel).
- Refactor PRs landed in the alpha.2 window: [#337](https://github.com/p-to-q/wittgenstein/pull/337) / [#338](https://github.com/p-to-q/wittgenstein/pull/338) / [#339](https://github.com/p-to-q/wittgenstein/pull/339).
- Outstanding implementation gates: [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335).
- Training-prep sibling note: [docs/research/2026-05-13-m1b-training-prep.md](2026-05-13-m1b-training-prep.md).
- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70).
