# M1B closeout ledger

Status: draft release-readiness ledger  
Last reviewed: 2026-05-28

## Purpose

Map the active M1B stack and prevent overclaiming.

## Current stack

- #507 — umbrella issue for M1B audit-delivery closeout and prerelease criteria.
- #457 — M1B decoder audit delivery surface.
- #491 — VQGAN-class Gate C/D receipt.
- #492 — LlamaGen decoder bridge manifest + provenance.
- #493 — tokenizer scaffold with manifest spine and smoke-validated DDP loop.
- #455 — research handoff and experiment hooks.
- #402 — canonical lazy weight fetch + sha256 delivery gate.

## #457 — audit delivery surface

Proves:

- audit surface is visible;
- fixtures/preflight/review pack can exist;
- local/lab boundaries can be documented.

Does not prove:

- real weights load;
- VSC emission works;
- image quality is acceptable;
- training decisions are resolved.

Review focus:

- schema/manifest correctness;
- structured failure behavior;
- no hidden fallback.

## #491 — Gate C/D receipt

Proves:

- a VQGAN-class candidate may have determinism and ONNX/CPU feasibility evidence under stated conditions.

Does not prove:

- product bridge implementation;
- user install success;
- final M1B quality;
- own-trained tokenizer quality.

Review focus:

- narrow "unblocked" wording to exact gates;
- preserve environment, scripts, hashes, hardware, and thresholds;
- do not turn doc-only evidence into product claim.

## #492 — bridge manifest / provenance

Proves:

- candidate metadata can be pinned.

Does not prove:

- lazy fetch works;
- license refusal is implemented;
- runtime availability is tested;
- real artifacts are emitted.

Review focus:

- align with #402;
- avoid redistribution overclaim;
- validate manifest contract.

## #493 — tokenizer scaffold

Proves:

- training code layout and manifest spine may exist;
- DDP smoke can be exercised.

Does not prove:

- tokenizer is trained;
- reconstruction quality;
- dataset/license acceptance;
- releaseable weights.

Review focus:

- ML-specialist review;
- static checks;
- dataset/license framing;
- do not call smoke validation training success.

## #455 — research handoff

Proves:

- research context and hooks exist.

Does not prove:

- route is chosen;
- metrics pass.

Review focus:

- preserve useful context;
- slice if too large;
- keep owner instructions visible.

## #402 — delivery gate

This remains mandatory for a real decoder delivery story. Acceptance requires typed manifest schema, lazy fetch/cache, sha verification, license refusal, runtime errors, tests, npm weight exclusion, and no silent fallback.

## Prerelease criteria

A small prerelease is reasonable only if:

- #457 is merged or accepted as audit surface;
- #491/#492 claims are narrowed;
- #493 is fixed or deferred;
- #455 is preserved/sliced/deferred intentionally;
- ML-owner review is visible;
- #402 is implemented or explicitly called pending;
- release notes say "audit delivery" and not "M1B complete."

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
