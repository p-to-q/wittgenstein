# Wittgenstein closeout documentation pack

Date: 2026-05-28  
Scope: GitHub-only static closeout documentation pack for `p-to-q/wittgenstein`.

## Conservative summary

Wittgenstein now has a stronger text-first modality harness, a clearer manifest/receipt discipline, active M1B image audit-delivery work, and a video path that has moved from pure stub into structured HTML plus opt-in repo-owned MP4 rendering. The correct closeout language is still conservative:

> M1B image depth is not complete until decoder delivery, weight provenance, VSC emission, tokenizer/adapter evidence, and end-to-end artifact receipts are all validated.

## Files in this pack

1. `00-document-decision-ledger.md` — why each document should exist, what it may claim, and what remains uncertain.
2. `docs/history/image-route-evolution.md` — route history from early procedural PNG to VSC and frozen decoder.
3. `docs/acceptance/m1b-image.md` — M1B acceptance gates.
4. `docs/release/m1b-closeout-ledger.md` — PR/issue map for #457/#491/#492/#493/#455/#402/#507.
5. `docs/research/2026-05-28-m1b-ml-review-checklist.md` — ML review checklist beyond singular-value intuition.
6. `docs/research/2026-05-28-vsc-emission-validation.md` — VSC emission validation plan.
7. `docs/evals/image-quality-ladder.md` — layered quality/eval ladder.
8. `docs/research/seed-length-sweep-report.md` — pre-registered seed-length sweep template.
9. `docs/model-cards/llamagen-frozen-vq-v0.md` — candidate model card skeleton.
10. `docs/model-cards/witt-vqgan-tokenizer.md` — future own-trained tokenizer card template.
11. `docs/failure-receipts/m1b-image.md` — M1B failure receipt taxonomy.
12. `docs/acceptance/m4-video-renderer.md` — structured video renderer acceptance checklist.
13. `docs/research/prior-work-map.md` — research map across controller/codec/tokens/renderer/reproducibility.
14. `docs/research/bibliography.md` — curated bibliography.
15. `docs/release/distribution-guide.md` — PR split and distribution instructions.
16. `docs/release/closeout-pr-template.md` — copyable PR body.
17. `SOURCES.md` — source anchors.

## Recommended PR split

Do not merge this as one giant PR unless maintainers ask for a bulk docs drop.

- PR 1: history + M1B acceptance + closeout ledger + ML/VSC checklists.
- PR 2: image eval ladder + seed sweep template + failure receipts.
- PR 3: candidate model-card templates.
- PR 4: M4 video acceptance.
- PR 5: prior-work map and bibliography.

## Non-goals

This pack does not claim M1B is complete, does not ship trained weights, does not claim a trained tokenizer exists, and does not describe video as a neural text-to-video model.

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
