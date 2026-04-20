<!--
Thanks for opening a PR! Wittgenstein is an early-stage project — any size of
contribution is welcome, including docs, typos, and "make this clearer" edits.

First PR? See CONTRIBUTING.md for the branch workflow and what we look for.
-->

## Summary

<!-- 1–3 bullets: what changed, why it matters. -->

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
- [ ] Python: ran the affected `python3 -m polyglot.cli ...` path
- [ ] Manifest still written under `artifacts/runs/<id>/` on both success and failure

## Docs / ownership

- [ ] Updated relevant file in `docs/codecs/` or `docs/`
- [ ] Respected `CODEOWNERS` boundary (or flagged cross-boundary in the summary)
- [ ] If output bytes changed, goldens under `fixtures/golden/` updated or explicitly refreshed
- [ ] If a new ⚠️ / 🔴 surface was introduced, added a row to `docs/implementation-status.md`

## Notes for reviewers

<!-- Anything non-obvious, follow-ups, open questions. -->
