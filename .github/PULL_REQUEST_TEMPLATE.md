<!--
Thanks for opening a PR! Wittgenstein is an early-stage project — any size of
contribution is welcome, including docs, typos, and "make this clearer" edits.

First PR? See CONTRIBUTING.md for the branch workflow and what we look for.

House style — the canonical operating manual for code in this repo is
docs/engineering-discipline.md (read-before-write, smallest-effective-change,
no drive-by refactor, evidence-backed validation, structured reporting).
Reviewers will defer to that doc when something looks off.
-->

## Summary

<!-- 1–3 bullets: what changed, why it matters. -->

## Scope / hygiene

- [ ] Branch is focused on one change set (or the coupling is explained in the summary)
- [ ] Worktree is clean for the files touched by this PR
- [ ] No unrelated local experiments / artifacts were pulled into the diff
- [ ] PR is reviewable in one sitting; if not, I explained why it stays bundled
- [ ] If this PR is doctrine-bearing (ADR / RFC / exec-plan / agent-guide / shared contract / codec-shape), it has a second independent reviewer; the author is not counting their own pass as ratification

## Type

- [ ] Bug fix
- [ ] Feature
- [ ] Docs only
- [ ] Refactor / cleanup
- [ ] Experimental / RFC (labelled ⚠️ in the code)

## Surface(s) touched

- [ ] Python (`polyglot-mini/`)
- [ ] TypeScript (`packages/`)
- [ ] Docs / site / meta
- [ ] CI / tooling

## Validation

<!-- Delete rows that don't apply. -->

- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] CI check names / outcomes still make sense to a reviewer at a glance
- [ ] Python: ran the affected `python3 -m polyglot.cli ...` path
- [ ] Manifest still written under `artifacts/runs/<id>/` on both success and failure

## Docs / ownership

- [ ] Updated relevant file in `docs/codecs/` or `docs/`
- [ ] Respected `CODEOWNERS` boundary (or flagged cross-boundary in the summary)
- [ ] If output bytes changed, goldens under `fixtures/golden/` updated or explicitly refreshed
- [ ] If a new ⚠️ / 🔴 surface was introduced, added a row to `docs/implementation-status.md`

## Notes for reviewers

<!-- Anything non-obvious, follow-ups, open questions. -->
