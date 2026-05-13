# Governance Note — Code/weights license divergence policy

**Date:** 2026-05-13
**Author:** Maintainer collective (opened via [#353](https://github.com/p-to-q/wittgenstein/issues/353))
**Status:** 🟡 Scoping; the ratifying ADR is [ADR-0020](../../adrs/0020-code-weights-license-divergence-policy.md).
**Triggered by:** [#333 MaskBit per-candidate audit](https://github.com/p-to-q/wittgenstein/issues/333) — first radar candidate with permissive code (Apache-2.0) and research-only trained weights.

---

## Why this Note exists

The [radar audit plan](../../research/2026-05-08-radar-audit-plan.md) Gate A requires "license must cover both code and weights." It was written assuming candidates would have uniform license posture across both artifacts. The 2026-05-13 per-candidate audits surfaced the first counterexample: MaskBit's code is permissive, its trained ImageNet weights are research-only. The radar didn't anticipate this case, so we need a clarification before more candidates with similar divergence surface (likely, as the radar expands).

This Note scopes the alternatives. The decision lives in [ADR-0020](../../adrs/0020-code-weights-license-divergence-policy.md).

## Alternatives considered

### A. Refuse all candidates with code/weights divergence

The strictest posture: if weights aren't permissive, the candidate is out — full stop. Cleanest doctrine; matches Gate A's literal reading.

**Pros:** zero ambiguity for the M-phase decision. Receipts can never carry a research-only-weights claim. Easy to audit.

**Cons:** discards the substantial body of high-quality research-released models. MaskBit-style candidates may be the only ones with certain properties (e.g. specific tokenizer design) for years. Refusing them entirely forecloses benchmarking + research use that doesn't redistribute weights.

### B. Allow research-only weights for benchmarking, refuse for the canonical M-phase path

The M-phase canonical path (the one the alpha-release receipts attest to) requires fully permissive license. But researchers benchmarking on their own machines can use research-only-weights candidates with an explicit opt-in flag; the manifest records the restriction.

**Pros:** preserves research velocity. Honest receipts: any run that touched research-only weights is marked. Canonical path stays clean.

**Cons:** more state to track. Two paths through the codec (canonical vs research). Requires CLI flag + manifest field + clear doctrine boundary.

### C. Always allow, mark in manifest only

Permit all candidates; rely on the manifest to record the license restriction. No CLI gating.

**Pros:** minimum doctrine surface.

**Cons:** silent foot-gun. Operators may accidentally redistribute artifacts produced via research-only-weights. Doesn't match Wittgenstein's "no silent fallbacks" doctrine — the user must consciously opt in to a constrained path.

## Recommendation

**Option B.** It preserves research velocity without compromising the canonical M-phase claim. The opt-in flag forces conscious choice; the manifest field keeps receipts honest. The alternative — allowing or refusing uniformly — sacrifices either honesty or capability.

The ADR codifies B as the default posture.

## Open questions

- **Exact CLI flag name** — `--allow-research-weights` is explicit; `--unrestricted-weights` is shorter but unclear. ADR-0020 picks one; revisit if usage feedback suggests confusion.
- **Manifest field exact shape** — `license.weightsRestriction: "research-only" | "permissive"` is the proposed pair. Should there be a "commercial" tier as well? Unlikely in the short term; defer.
- **Future research-only-code cases** — what if a future candidate has research-only **code**? Different question; not in scope for this Note. Open a new ADR slot when it surfaces.

## Refs

- Triggering audit: [2026-05-13 candidate audits](../../research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md) §Priority 5 — MaskBit
- Triggering issue: [#333](https://github.com/p-to-q/wittgenstein/issues/333)
- Audit plan: [2026-05-08 radar audit plan](../../research/2026-05-08-radar-audit-plan.md)
- Governance lane shape: [ADR-0014](../../adrs/0014-governance-lane-for-meta-process-doctrine.md)
- Hard-constraints doctrine: [`docs/hard-constraints.md`](../../hard-constraints.md)
