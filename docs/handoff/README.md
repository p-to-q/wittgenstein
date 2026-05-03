# Handoff Briefings

Self-contained briefings for picking up a single bounded slice of work cold. Each file is the **only** doc the contributor / agent needs to read to land that slice.

A handoff doc is **not** a brief, RFC, ADR, or exec-plan. It is the executable summary that points at all four. When the slice ships, the handoff doc closes (move to `archive/` or delete; the underlying briefs / ADRs / exec-plans remain canonical).

## Current handoffs

- [`m2-slice-c2-kokoro.md`](m2-slice-c2-kokoro.md) — Kokoro-82M ONNX backend wiring; Issue #116.

## When to add a handoff

- The slice has clear inputs (briefs / ADRs / prior PRs) and clear acceptance gates.
- Multiple contributors / agents may pick it up; the briefing should not assume conversational context.
- Adding the doc costs less than re-explaining the slice in three issue comments.

When in doubt, do **not** add a handoff doc — the issue body should be enough. Handoff docs exist for the cases where the issue body would balloon past the point of being skimmable.
