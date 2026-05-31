---
date: 2026-05-31
status: decision closeout
labels: [research-derived, m1b-image, openmagvit2, decoder, receipts]
tracks: [#331, #283, #402]
---

# OpenMAGVIT2 Gate B Closeout

This closes the stale external-inspection gap in #331. The previous repository
state still described OpenMAGVIT2 Gate B as "partial" because the first
2026-05-13 pass saw README claims but no direct Hugging Face URL. That is no
longer the current state.

## Sources Checked

- HF model tree, checked 2026-05-31:
  https://huggingface.co/TencentARC/Open-MAGVIT2/tree/main
- HF model card raw README, checked 2026-05-31:
  https://huggingface.co/TencentARC/Open-MAGVIT2/raw/main/README.md
- Upstream code repo, checked 2026-05-31:
  https://github.com/TencentARC/SEED-Voken

## Decision

Gate B is **PASS at external-inspection level**:

- canonical HF repo: `TencentARC/Open-MAGVIT2`;
- HF model card license: Apache-2.0;
- current HF tree has concrete checkpoint filenames:
  `imagenet_128_L.ckpt`, `imagenet_256_L.ckpt`, `AR_256_B.ckpt`,
  `AR_256_L.ckpt`, and `AR_256_XL.ckpt`;
- HEAD requests to `resolve/main/imagenet_128_L.ckpt` and
  `resolve/main/imagenet_256_L.ckpt` returned HTTP 200 in the local check.

The HF README still links `imagenet_128_B.ckpt` and `imagenet_256_B.ckpt`, which
returned HTTP 404 in the local check. Treat the file tree/API as source of truth
for wiring, not the stale README link text.

## Remaining Blockers

OpenMAGVIT2 is still **not blessed**:

- Gate C deterministic round-trip still needs local/lab compute.
- Gate D Node/ONNX/CPU feasibility still needs local/lab compute.
- Wiring must record exact file SHA-256 at fetch time before any runtime can
  cache or load weights.

Therefore the runtime-facing seed bridge should report A/B passed but C/D
blocked. That is the decision this closeout makes durable in code.
