# Distribution guide

Status: draft  
Last reviewed: 2026-05-28

## Goal

Distribute the closeout docs without making one enormous review burden or overstating M1B.

## PR sequence

### PR 1 — claim-control core

Files:

- `docs/history/image-route-evolution.md`
- `docs/acceptance/m1b-image.md`
- `docs/release/m1b-closeout-ledger.md`
- `docs/research/2026-05-28-m1b-ml-review-checklist.md`
- `docs/research/2026-05-28-vsc-emission-validation.md`

Title:

```text
docs(m1b): add image route history and acceptance closeout ledger
```

### PR 2 — eval and failure receipts

Files:

- `docs/evals/image-quality-ladder.md`
- `docs/research/seed-length-sweep-report.md`
- `docs/failure-receipts/m1b-image.md`

Title:

```text
docs(m1b): add image eval ladder and failure receipt templates
```

### PR 3 — model cards

Files:

- `docs/model-cards/llamagen-frozen-vq-v0.md`
- `docs/model-cards/witt-vqgan-tokenizer.md`

Title:

```text
docs(model-cards): add M1B decoder and tokenizer card templates
```

### PR 4 — video acceptance

File:

- `docs/acceptance/m4-video-renderer.md`

Title:

```text
docs(video): add M4 structured renderer acceptance criteria
```

### PR 5 — prior work

Files:

- `docs/research/prior-work-map.md`
- `docs/research/bibliography.md`

Title:

```text
docs(research): add prior-work map for codec/controller artifact routes
```

## Before opening PRs

Recheck:

- README status;
- CHANGELOG Unreleased;
- implementation-status;
- #507;
- #402;
- #457/#491/#492/#493/#455;
- open PR count.

## Language

Say:

> This is a documentation-only closeout PR that adds claim-control surfaces for M1B. It does not claim M1B is complete and does not ship trained weights.

Do not say:

- M1B complete;
- image generation ships;
- trained tokenizer;
- full video generation;
- SVD proves the model.

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
