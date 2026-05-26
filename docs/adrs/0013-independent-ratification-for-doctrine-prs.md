# 0013 Independent Ratification for Doctrine-Bearing PRs

## Status

Accepted (ratifies the rule introduced via PR #75).

## Context

Multiple recent PRs (#72, #74, #75, #78, #80) were authored by Codex agents and merged with no formal GitHub Review — only PR comments (some by another agent, some by the human maintainer). For purely engineering work this is fine; for **doctrine-bearing** work it creates a self-ratification loop: the same author who writes the rule effectively approves it, which is the failure mode the rule is supposed to prevent.

A 2026-04-27 audit found 5 doctrine sections added to `docs/engineering-discipline.md` in a 36-hour window with **no Brief / RFC / ADR pre-flight**, illustrating the gap concretely. The content of those sections was mostly correct; the process was not.

## Decision

For any PR that touches a **doctrine-bearing surface**, authorship and ratification must be **separated**:

1. **Doctrine-bearing surfaces** (the explicit list):
   - `docs/engineering-discipline.md`
   - `docs/architecture.md`, `docs/hard-constraints.md`, `docs/THESIS.md`
   - any file under `docs/adrs/` or `docs/rfcs/`
   - any file under `docs/exec-plans/active/`
   - any file under `docs/agent-guides/` (per-port execution briefs)
   - `docs/codec-protocol.md`, `docs/reproducibility.md`
   - `AGENTS.md`, `PROMPT.md`, `CONTRIBUTING.md`, `docs/labels.md`, `WORKFLOW.md`
   - any change to a shared protocol contract under `packages/schemas/src/codec/v2/*`
   - any change that materially alters the `BaseCodec` lifecycle

2. **Independent ratification rule**: the author of a doctrine-bearing PR is not its sole reviewer. A second independent pass — distinct from the authoring context — is required before merge.
   - The default reviewer pair is **@Jah-yee @Moapacha**. Equivalent agent-assisted work counts only if the two passes are genuinely independent (the second reviewer can disagree, request changes, or block).
   - "Independent" excludes self-review by the same agent, even with different prompts.
   - A formal GitHub Review (`Approve` / `Request changes`), not a PR comment, is the mechanism. Where the same GitHub identity is used by multiple agents (e.g. Jah-yee fork shared by Codex + Claude), the ratification is recorded in the PR body by the human maintainer naming the reviewers explicitly.

3. **Engineering hypothesis is not doctrine.** A change to a brief, an exec-plan section, or a port guide that **replaces an outdated execution hypothesis with a corrected one** (e.g. "the route copy-paste was already partially collapsed in `runtime.ts`, so this assumption is wrong") does **not** require ADR ratification. Doctrine is about how-we-decide, not what-we-execute. ADR-0014 governs the boundary.

4. **CI is necessary, not sufficient.** A green CI run is not ratification. A doctrine PR that merges on CI alone violates this ADR.

## Consequence

- The PR template carries a doctrine-bearing checkbox; checking it off without a second review is a process violation.
- Doctrine PRs that have already merged without independent ratification (specifically #71, #72) are not retroactively void — but the doctrine they introduced is now retroactively ratified by ADRs 0012 and 0014, which **are** going through the chain.
- Future doctrine-bearing PRs should pair with the ratifying ADR in the same PR (or land the ADR first), eliminating the "doctrine without audit trail" failure mode.
- Kill criterion: if independent review becomes a merge bottleneck (queue > 5 doctrine PRs waiting on @Jah-yee @Moapacha), reopen this ADR to delegate ratification authority to a named non-author agent / contributor pool.
