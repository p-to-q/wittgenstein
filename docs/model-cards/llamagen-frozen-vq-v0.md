# Model card: LlamaGen / VQGAN-class frozen decoder candidate

Status: candidate template; not a final release card  
Last reviewed: 2026-05-28

## Warning

This card is a skeleton for a candidate bridge. It must not be treated as a final model card until manifests, hashes, license, runtime, and receipts are verified.

## Candidate identity

| Field | Value |
|---|---|
| Candidate name | LlamaGen / VQGAN-class frozen decoder candidate |
| Intended role | Frozen VQ decoder baseline for M1B |
| Bridge family | `llamagen` |
| Source repository | TBD |
| Source commit | TBD |
| Weights filename | TBD |
| Weights sha256 | TBD |
| Codebook filename | TBD |
| Codebook sha256 | TBD |
| Runtime artifact | TBD |
| Runtime artifact sha256 | TBD |
| Runtime tier | TBD |
| Determinism class | TBD |
| License — code | TBD |
| License — weights | TBD |
| Redistribution allowed | TBD |

## Intended use

Approved after verification:

- candidate decoder bridge;
- audit receipt baseline;
- adapter baseline;
- comparison point for own-trained tokenizer.

Not approved:

- marketing claim that M1B is complete;
- npm-bundled model weights;
- hidden fallback path;
- unlicensed redistribution.

## Required before release

- source commit pinned;
- weights/codebook/runtime hashes pinned;
- license terms recorded;
- lazy fetch/cache/sha behavior tested;
- runtime loads;
- failure modes tested;
- artifact manifest emitted;
- no silent fallback.

## Expected structured failures

- `WEIGHTS_FETCH_FAILED`
- `WEIGHTS_SHA256_MISMATCH`
- `WEIGHTS_LICENSE_REFUSED`
- `RUNTIME_UNAVAILABLE`
- `DECODER_MANIFEST_INVALID`
- `DECODER_INPUT_SHAPE_INVALID`
- `DECODER_BRIDGE_NOT_IMPLEMENTED` until implementation lands

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
