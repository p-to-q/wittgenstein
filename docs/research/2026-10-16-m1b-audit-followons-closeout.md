---
date: 2026-10-16
status: closeout — OpenMAGVIT2 audit follow-ons 2 + 3 landed (CI wiring, tracker tooling)
labels: [research-derived, m1-image, audit, ci, tooling]
tracks: [#331, #283, #334, #335]
follows-from: docs/research/2026-10-16-openmagvit2-gate-cd-audit.md
---

# M1B audit follow-ons — CI wiring + tracker tooling closeout

> **Status:** the two follow-ons the OpenMAGVIT2 Gate C/D audit note left open
> both landed the same day: (2) the `research/validation` producer tests run in
> the Python CI half, and (3) the composite audit harness takes per-family
> gate-tracker overrides instead of hardcoding the VQGAN-class issues. The #331
> audit deliverable stays complete; delivery/selection decisions are untouched
> (floor remains `llamagen`, no family manifest scheduled).

## What landed

### 1. `research/validation` tests in CI (`a33f7c0`)

- New `Python unit tests (M1B audit producers)` step in the `verify-code` job,
  placed after the NumPy install:
  `python -m unittest discover -s research/validation -t . -p 'test_*.py' -v`.
- New empty `research/validation/__init__.py`. Discovery needs the directory to
  be a regular package: Python >=3.11 no longer discovers namespace packages,
  and the tests use relative imports (`from .vqgan_gate_audit import ...`),
  which only resolve when imported as `research.validation.*`.
- Covers 27 tests: producer parser/metric shapes, EMA selection, the composite
  receipt harness (including the new tracker pins), and the phase0b fixture
  checks. NumPy-backed cases execute in CI (numpy is installed by the
  preceding step); they skip-guard when numpy is absent locally.
- `m1b:audit-self-check` stays local-only — it exercises built package outputs
  and the artifact-check fixtures on top of the same Python tests.

### 2. Gate-tracker overrides + family-neutral wording (`73b3794`)

- `research/validation/vqgan_gate_audit.py` gained
  `--gate-c-tracker` / `--gate-d-tracker` (http(s) URL, validated). Defaults
  stay the VQGAN-class gate-protocol issues #334/#335, so existing receipts
  and tests are unchanged.
- Why: `validateDecoderManifestAuditReceipts` requires each passed gate row's
  `tracker` to equal the family manifest's `audits.gateX.tracker`. A
  seed-family manifest would point its gates at the per-candidate audit issue
  (#331); the hardcoded rows could never match it.
- Wording de-scoped from "VQGAN-class" to the candidate family ("SHA-pinned
  decoder weights for the candidate family"); the committed fixture copy is
  synced. The `m1b-vqgan-gate-audit.v0` schema id is kept — it is pinned by
  `DecoderGateAuditReceiptSchema`, and renaming is a shape change with no
  current benefit.
- Re-run evidence: the composite over the OpenMAGVIT2 receipts with both
  tracker rows on #331 returns `status: "passed"` (receipt kept out of git per
  the `artifacts/m1b-audit/` rule; lab copy at
  `/tmp/om2/out/om2-vqgan-gate-audit-331.json`).

## Findings recorded (not fixed in this slice)

1. **Candidate-label constraint for any future seed manifest.**
   `candidateMatchesFamily` accepts a receipt `candidate` only when it equals
   the family or ends with `/<family>` (families: `llamagen`, `seed`, `dvae`).
   The label used on this audit's composite receipt, `seed/openmagvit2`, is
   family-first and would fail that rule against a `seed`-family manifest.
   Before a seed-family manifest is wired, either the label shape (e.g.
   `<variant>/seed`) or the rule (additively accept a `family/...` prefix)
   must change; the prefix-widening was not landed here. Decision deliberately
   deferred to the seed-bridge slice — no family manifest is scheduled.
2. **Closed trackers still listed as active in `packages/schemas/src/trackers.ts`.**
   - `m1bImageDecoderUmbrella` (#283) closed 2026-05-13 (COMPLETED) but sits
     in `TRACKERS` and is emitted by `seed.ts` blockers.
   - `m1bGateCDeterminism` (#334) / `m1bGateDOnnxCpu` (#335) closed 2026-05-28
     (COMPLETED) but sit in `TRACKERS` with "VQGAN-class" comments.
   Per the file's own convention these are closed-but-referenced provenance and
   belong in `CLOSED_TRACKERS`, with a successor named for the umbrella. New
   follow-on; kept as its own slice because it is a schema-package surface
   change, not tooling.

## Cross-references

- Parent audit (Gates C/D verdict, follow-on list): [2026-10-16 OpenMAGVIT2 Gate C/D audit](2026-10-16-openmagvit2-gate-cd-audit.md)
- Acceptance policy the tracker rows are validated against: [2026-05-31 M1B gate C/D acceptance policy](2026-05-31-m1b-gate-acceptance-policy.md)
- Gate B closeout (audit chain): [2026-05-31 OpenMAGVIT2 Gate B closeout](2026-05-31-openmagvit2-gate-b-closeout.md)
