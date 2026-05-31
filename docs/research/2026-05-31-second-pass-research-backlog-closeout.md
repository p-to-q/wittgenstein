---
date: 2026-05-31
status: issue #440 closeout
labels: [research-derived, backlog, second-pass, closeout]
tracks: [#440, #477, #478, #479, #480, #441, #402, #399, #400, #263, #476, #507]
---

# Second-Pass Research Backlog Closeout

## Purpose

This note closes #440 as a scheduling and routing ledger. It does not claim
that every downstream research or implementation lane is done. It says the
umbrella has finished its job: uncertain implementation choices now have
bounded research outputs, first artifact targets, owners, and successor issues
rather than living in an unbounded backlog.

The remaining work belongs in the named owner lanes below.

## Closure Model

#440 defined four cross-sections for research closure. All four now have
durable artifacts:

| Cross-section             | Tracker | Status   | Durable artifact                                                 | How to use it next                                                                   |
| ------------------------- | ------- | -------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Historical research debt  | #480    | `closed` | `docs/research/2026-05-31-retrospective-research-debt-ledger.md` | Classify old claims before turning them into current direction.                      |
| Local architecture optima | #478    | `closed` | `docs/research/2026-05-31-local-optima-first-pass.md`            | Use for file-backed seam decisions and falsifiers.                                   |
| Horizontal prior art      | #477    | `closed` | `docs/research/2026-05-31-horizontal-engineering-matrix.md`      | Use for copy/adapt/reject/watch decisions before importing patterns or dependencies. |
| Focused blocker spike     | #479    | `closed` | `docs/research/2026-05-31-focused-spike-template.md`             | Use for future time-boxed unknowns with kill criteria.                               |

That means new research should no longer enter #440 directly. It should enter
one of the four patterns above or a concrete successor issue.

## Lane Closeout Map

| #440 lane               | Owner lane                              | First artifact target                                                                                                             | What changed because of the research                                                                                                            | Surviving work                                                                                                         |
| ----------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Training stack          | `koriyoshi2041` with `moapacha` review  | `docs/research/2026-05-16-training-stack-re-audit.md`, #441, `docs/research/2026-05-31-training-homes-decision.md`                | The path narrowed to receipt-first PyTorch/DDP smoke before GPU scale; `research/training/` and `python/image_adapter/` are named separately.   | #441 remains the owner review lane; #399/#400 own tracker and data/sweep infrastructure before expensive training.     |
| Sensor CSV/HTML/Loupe   | `moapacha` / implementation reviewer    | `docs/codecs/sensor.md`, `docs/research/2026-05-31-independent-second-pass-cross-check-closeout.md`, #263                         | Loupe/CSV/HTML stays as the current product surface; `patchGrammar` remains internal until measurement rather than being promoted by prose.     | #263 owns operator receipts and measurement gates; #153 stays parked until measurement justifies new operators.        |
| Decoder bridge delivery | `koriyoshi2041` / image bridge reviewer | `docs/research/2026-05-31-horizontal-engineering-matrix.md`, `docs/research/2026-05-31-local-optima-first-pass.md`, #402          | The bridge stays codec-owned; remote model metadata cannot be truth; lazy fetch must preserve local SHA/license/runtime failures.               | #402 owns lazy fetch, cache layout, SHA verification, license refusal, and optional ONNX Runtime wiring.               |
| Video M4                | video/rendering reviewer                | `docs/research/2026-05-26-video-mp4-renderer-validation.md`, `docs/research/2026-05-31-architecture-benchmark-prior-art.md`, #476 | HyperFrames is a reference shape, not a vendored dependency; same-platform byte parity and cross-machine structural parity are separate claims. | #476 owns cross-machine structural parity and receipt portability.                                                     |
| Dependency/tooling      | release/package reviewer                | `docs/research/2026-05-31-reusable-module-radar.md`, #543, `docs/research/2026-05-31-retrospective-research-debt-ledger.md`       | The repo keeps local extracted helpers first; DVC/Aim/HF Hub are adapt-only in their owning issues; Execa/MCP/Remotion are not imported now.    | Future dependency proposals should cite #306/#477 and land through the issue that owns the surface, not this umbrella. |
| Public/adopter surface  | maintainer/release reviewer             | `docs/release/m1b-closeout-ledger.md`, `docs/research/2026-05-31-research-presentation-audit.md`, #507, this PR's roadmap refresh | Release wording is constrained to audit delivery / receipts / review gates, not "M1B complete" or trained weights.                              | #507 closes the release-readiness umbrella; future public-release work should be a release PR or narrower successor.   |

## Remaining Open Gates

The backlog is closed, but several execution lanes are intentionally still
open:

- #402: decoder bridge delivery contract.
- #441: Phase 1 training-stack and reuse review.
- #399/#400: experiment tracking plus DVC/GPU sweep infrastructure.
- #263: sensor measurement and operator receipt gate.
- #476: MP4 cross-machine structural parity.

The #507 release-readiness umbrella is no longer an execution gate once the
final closeout ledger lands; it exists to constrain wording, not to carry
decoder, training, or lab work.

These are not failures of #440. They are the concrete issues #440 was meant to
create or route toward.

## What Not To Reopen Here

- Do not use #440 for broad "more research" work.
- Do not relabel historical debt as current direction without first going
  through the #480-style ledger pattern.
- Do not use local-optimum notes to bypass owner decisions for model/training
  or decoder delivery.
- Do not treat external prior art as a dependency recommendation unless the
  owning issue accepts it and preserves Wittgenstein's receipt spine.

## Closeout Verdict

#440 can close. Each lane has an owner lane, a first durable artifact, and a
successor routing decision. The #477/#478/#479/#480 cross-section remains
available as a repeatable research process, while the surviving implementation
and owner-review work continues in concrete issues.

No model training, lab execution, runtime dependency, or doctrine rewrite is
part of this closeout.
