# Image quality ladder

Status: draft evaluation design  
Last reviewed: 2026-05-28

## Purpose

M1B must not be validated by a single metric. The correct evaluation is layered.

## Ladder

| Level | Object | Question |
|---|---|---|
| L0 | Schema/contract | Does it parse and validate? |
| L1 | VSC emission | Can the LLM emit stable VSC? |
| L2 | Decoder candidate | Can the frozen decoder run with pinned provenance? |
| L3 | Tokenizer reconstruction | Does tokenizer preserve visual information? |
| L4 | Adapter | Does learned adapter beat baseline? |
| L5 | End-to-end artifact | Does prompt → VSC → adapter → decoder produce traceable artifact? |
| L6 | Human/reviewer | Are outputs usable and failures honest? |

## Suggested quality tiers

| Tier | Meaning |
|---|---|
| `quality.placeholder` | procedural/dry-run placeholder; not M1B |
| `quality.contract` | schema/manifest path validated |
| `quality.candidate` | candidate decoder evidence exists |
| `quality.bridge` | real decoder bridge loads pinned weights |
| `quality.adapter` | adapter path runs with metrics |
| `quality.full` | end-to-end M1B artifact with manifest and validation |

## Metrics by level

L0: parse success, schema success, repair count.  
L1: seed entropy, token usage, paraphrase stability, invalid-output receipts.  
L2: source/weights/codebook hashes, determinism class, ONNX/runtime latency.  
L3: rFID/FID, LPIPS, SSIM, PSNR, codebook perplexity, collapse rate.  
L4: baseline delta, invalid latent rate, latency, determinism.  
L5: artifact sha256, replay/structural validation, manifest completeness.  
L6: blinded side-by-side review, success/failure gallery.

## Rule

Do not use L2 candidate receipts as L5 end-to-end claims.

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
