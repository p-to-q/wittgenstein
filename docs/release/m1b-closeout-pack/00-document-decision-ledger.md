# Document decision ledger

Date: 2026-05-28

## Why write these documents now

The repo has reached an inflection point: public docs describe `v0.3.0-alpha.3`, current status says image/audio/sensor/video HTML produce artifacts, video MP4 is opt-in local render, and M1B is still the image blocker. Open PRs focus on M1B audit surfaces, Gate C/D receipts, decoder provenance, tokenizer scaffolding, and research handoff. Issue #507 explicitly asks for closeout, review gates, and prerelease criteria. That makes documentation useful now, but only if it controls claims.

## Decision table

| Document | Should write? | Reason | Main uncertainty | Merge posture |
|---|---:|---|---|---|
| `docs/history/image-route-evolution.md` | Yes | Prevents reviewers from mistaking early procedural PNG for final image doctrine, and explains why VSC became primary. | Exact historical dates may need commit archaeology. | Good first PR. |
| `docs/acceptance/m1b-image.md` | Yes | M1B needs explicit acceptance gates before release language gets ahead of evidence. | Gate thresholds still need owner decisions. | Good first PR. |
| `docs/release/m1b-closeout-ledger.md` | Yes | #457/#491/#492/#493/#455/#402/#507 need one map. | Live PR status may change. | Good first PR after recheck. |
| `docs/research/2026-05-28-m1b-ml-review-checklist.md` | Yes | ML review must cover VSC, decoder, tokenizer, adapter, and E2E receipts, not only singular values. | Metrics/thresholds need ML owner. | Good first PR. |
| `docs/research/2026-05-28-vsc-emission-validation.md` | Yes | Decoder feasibility is meaningless if the LLM cannot emit valid/stable VSC. | Prompt/model matrix not fixed. | Good first PR. |
| `docs/evals/image-quality-ladder.md` | Yes | Avoids one-number validation and separates contract, decoder, tokenizer, adapter, E2E. | Requires ML owner thresholds. | PR 2. |
| `docs/research/seed-length-sweep-report.md` | Yes, as template | Seed length determines VSC information budget. | No experiment results yet. | Template only. |
| `docs/model-cards/llamagen-frozen-vq-v0.md` | Yes, as candidate card | #491/#492 make the LlamaGen/VQGAN candidate important enough to card. | License/fetch/runtime claims must be verified. | PR 3; candidate only. |
| `docs/model-cards/witt-vqgan-tokenizer.md` | Yes, as future template | #493 suggests own-trained tokenizer scaffold; card should exist before claims appear. | No trained tokenizer yet. | PR 3; template only. |
| `docs/failure-receipts/m1b-image.md` | Yes | Failure receipts are the no-silent-fallback enforcement surface. | Exact error names may change. | PR 2. |
| `docs/acceptance/m4-video-renderer.md` | Yes | Video status changed; MP4 local renderer needs acceptance criteria separate from neural video. | Latest local validation should be rerun. | Separate PR. |
| `docs/research/prior-work-map.md` | Yes | Prior work must be framed as controller/codec/runtime/reproducibility, not generic multimodal generation. | Bibliography can expand. | Research PR. |
| `docs/research/bibliography.md` | Yes | Helps reviewer alignment. | Formal citations may need polishing. | Research PR. |
| `docs/release/distribution-guide.md` | Yes | Pack is too large to distribute blindly. | Maintainer preference may differ. | Keep in pack or PR. |
| `docs/release/closeout-pr-template.md` | Yes | Prevents overclaiming in PR language. | Live status may change. | Ready. |

## Documents not to write yet

- `docs/release/m1b-complete.md` — M1B is not complete.
- `docs/evals/final-image-benchmark.md` — no final E2E benchmark exists in this pack.
- `docs/model-cards/witt-vqgan-tokenizer-final.md` — no released tokenizer.
- `docs/marketing/image-generation.md` — wrong tone; this is an audit-delivery closeout.
- `docs/release/video-generation-complete.md` — current video is structured render, not neural video generation.

## Safe claims

- The repo has a text-first modality harness with schema/code contracts and manifest receipts.
- Image emits PNG today, but the real M1B neural/frozen-decoder path remains pending.
- M1B work is active across audit surface, Gate C/D receipt, bridge provenance, tokenizer scaffold, and handoff PRs.
- Video HTML ships; MP4 is opt-in local rendering requiring local dependencies.

## Unsafe claims

- M1B is complete.
- Trained tokenizer ships.
- Gate C/D doc-only receipt is enough to call the product path complete.
- Video is a neural text-to-video generator.

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
