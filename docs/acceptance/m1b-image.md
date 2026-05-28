# M1B image acceptance criteria

Status: draft acceptance checklist  
Last reviewed: 2026-05-28

## Purpose

Define what must be true before the repository can claim M1B image depth is complete.

Current safe release language:

> M1B audit delivery surface.

Unsafe release language:

> M1B completed.

## Gate 0 — doctrine and scope

Required:

- one canonical image route;
- Visual Seed Code is primary;
- Semantic IR is support/conditioning/inspection;
- no cloud render API;
- no diffusion default;
- no SVG/canvas/procedural path satisfying the real decoder tier;
- no silent fallback.

## Gate 1 — bridge manifest and provenance

Required fields:

- bridge family;
- source repository and commit/revision;
- weights filename and sha256;
- codebook filename and sha256 if separate;
- runtime artifact and sha256 if applicable;
- code license;
- weights license;
- runtime tier;
- determinism class;
- supported input shape;
- known non-goals.

Acceptance:

- schema typed;
- manifest validates;
- invalid manifest fails;
- heavy weights are excluded from npm package;
- manifest can be compared with lab receipts.

## Gate 2 — lazy weight delivery

Required:

- package does not bundle model weights;
- loader checks cache by sha256;
- cache miss fetches from approved source;
- bytes are sha256-verified before cache promotion;
- hash mismatch never enters cache;
- research-only weights are refused unless explicitly allowed;
- missing runtime returns structured error;
- fetch failures are structured;
- no silent fallback.

Required tests:

- cache hit;
- cache miss;
- sha mismatch;
- license refused;
- runtime unavailable;
- fetch failed;
- corrupted cache;
- tarball weight exclusion.

## Gate 3 — VSC emission validation

Required metrics:

- JSON parse success;
- schema-valid VSC rate;
- repair rate;
- seed length distribution;
- token entropy/usage;
- paraphrase stability;
- semantic/VSC agreement;
- invalid-output receipts.

M1B cannot be complete if the LLM-facing contract is unstable.

## Gate 4 — tokenizer / decoder reconstruction

Required metrics:

- rFID or FID;
- LPIPS;
- SSIM / PSNR;
- codebook usage;
- codebook perplexity;
- collapse rate;
- decode latency;
- memory footprint;
- dataset/license/split.

Candidate decoder evidence and own-trained tokenizer evidence must be separated.

## Gate 5 — adapter / seed expander

Required baselines:

- deterministic replication;
- trivial seed expander;
- semantic-only fallback;
- learned adapter;
- optionally masked iterative adapter.

Pass condition:

- learned path beats pre-registered baseline, or negative result is documented and claim is narrowed.

## Gate 6 — end-to-end artifact receipt

A valid M1B run manifest must include:

- prompt;
- model/provider/version;
- raw output;
- parsed VSC;
- semantic support if used;
- adapter identity;
- decoder identity;
- weights/codebook/runtime hashes;
- determinism class;
- seed;
- artifact sha256;
- failure receipt if failed.

## Gate 7 — ML owner review

ML owner must review:

- tokenizer choice;
- dataset/license;
- reconstruction metrics;
- adapter architecture;
- seed-length sweep;
- quality ladder;
- release-note wording.

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
