# 0020 Code/weights license divergence policy

## Status

Accepted (2026-05-13). Governance lane (ADR-0014).

## Context

The image tokenizer radar (PR #272, [research note](../research/2026-05-08-image-tokenizer-decoder-radar.md)) names eleven candidates. The [radar audit plan](../research/2026-05-08-radar-audit-plan.md)'s Gate A requires "license must cover both code and weights." That gate was written assuming candidates would have uniform license posture across both artifacts.

The 2026-05-13 per-candidate audits surfaced the first counterexample: [MaskBit](https://github.com/p-to-q/wittgenstein/issues/333)'s code is Apache-2.0 (permissive), but the trained ImageNet weights are released "for research purposes only." The radar's binary "permissive or not" framing has no clean answer for this case.

[Governance Note 2026-05-13](../governance/notes/2026-05-13-code-weights-license-divergence.md) scopes three alternatives:

- **A.** Refuse all candidates with code/weights license divergence — strict, clean, but discards a substantial body of research-released models.
- **B.** Allow research-only weights for benchmarking with explicit opt-in; canonical M-phase path stays on permissive-weights candidates.
- **C.** Always allow; rely on the manifest to record restrictions — silent foot-gun.

This ADR ratifies the recommendation in the Governance Note.

## Decision

Wittgenstein adopts **Option B**: code/weights license divergence is **conditionally permitted**, with four concrete enforcement points.

1. **Canonical M-phase path is permissive-only.** Any candidate selected as the canonical implementation for an M-phase milestone (M1B image, M2 audio variant, etc.) must have **both** code AND weights under a permissive (Apache-2.0 / MIT / BSD-style) license. Research-only weights disqualify a candidate from the canonical path, even if its code is permissive.

2. **Research / benchmarking use is opt-in.** Candidates with permissive code + research-only weights may be loaded for benchmarking or comparative study via an explicit CLI flag: `--allow-research-weights`. Without the flag, the CLI refuses to load such weights and returns a structured error citing this ADR.

3. **Manifest records the restriction.** Any run that loaded research-only weights writes `license.weightsRestriction: "research-only"` on the run manifest. Runs with permissive weights write `license.weightsRestriction: "permissive"`. The field is required, never optional — receipts must be honest about redistribution constraints.

4. **Doctrine surface is the inline summary in `docs/hard-constraints.md`**, citing this ADR. The full reasoning lives here; the constraints file carries a one-paragraph summary so contributors can spot the rule when scanning.

The Gate A wording in the radar audit plan is amended to: "license must cover both code AND weights; OR, code is permissive AND weights are research-only AND the candidate is being considered for **research / benchmarking only** (not the canonical M-phase path)."

## Consequence

- **MaskBit ([#333](https://github.com/p-to-q/wittgenstein/issues/333))** is now formally classified as research-track. It will not be the M1B canonical candidate. Future benchmark comparison work may use it via `--allow-research-weights`; manifest receipts will record the restriction.
- **CLI work**: a follow-up issue tracks adding the `--allow-research-weights` flag and the schema field. The flag and field together are the implementation surface for this ADR. Filing the implementation slot is part of this ADR's landing.
- **Schema work**: `RunManifestSchema` gains a `license: { weightsRestriction: "permissive" | "research-only" }` field (or equivalent). Implementation in the follow-up.
- **Hard-constraints inline summary**: added in the same PR as this ADR, citing ADR-0020.
- **Audit plan amendment**: the radar audit plan's Gate A line is updated to reflect the conditional reading. Done in the same PR.
- **Future divergences**: if a future candidate has **research-only code** (the dual case), this ADR does not cover it. Open a new ADR slot.

## Kill criterion

If, within one year, no research-only-weights candidate is actually loaded for benchmarking (the `--allow-research-weights` flag is never invoked), revisit whether Option A (strict refusal) would be cleaner with less doctrine surface. The current decision is conservatively permissive on the bet that benchmarking will surface real demand.

## Refs

- Governance Note: [2026-05-13 code/weights license divergence](../governance/notes/2026-05-13-code-weights-license-divergence.md)
- Triggering audit: [2026-05-13 candidate audits](../research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md) §Priority 5
- Triggering issue: [#353](https://github.com/p-to-q/wittgenstein/issues/353); MaskBit thread: [#333](https://github.com/p-to-q/wittgenstein/issues/333)
- Audit plan: [`docs/research/2026-05-08-radar-audit-plan.md`](../research/2026-05-08-radar-audit-plan.md)
- Governance lane shape: [ADR-0014](0014-governance-lane-for-meta-process-doctrine.md)
- Hard-constraints inline summary: [`docs/hard-constraints.md`](../hard-constraints.md)
