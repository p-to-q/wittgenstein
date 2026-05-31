---
date: 2026-05-31
status: issue #332 closeout
tracks: [#332, #352, #283, #70]
---

# TiTok Gate B and license closeout

This note closes the non-compute portion of the TiTok audit for
[#332](https://github.com/p-to-q/wittgenstein/issues/332). It updates the
2026-05-13 per-candidate audit with a narrower decision than the original
PARTIAL Gate B result:

- **Gate B is now PASS for availability.** The TiTok tokenizer checkpoints are
  present on Hugging Face and expose concrete, SHA-pinnable files.
- **Gate A is no longer clean for canonical M1B.** The code repository is
  Apache-2.0, but the upstream TiTok README says the released models are for
  research purposes. Under ADR-0020, that makes TiTok a research/benchmarking
  candidate only unless the maintainer records permissive terms for the
  weights.
- **RFC-0007 is not activated by TiTok.** The schema discriminator remains a
  useful draft for a future permissive 1D-token candidate, but TiTok did not
  clear all four gates.

## Source inspection

Checked 2026-05-31:

- GitHub repo:
  [`bytedance/1d-tokenizer`](https://github.com/bytedance/1d-tokenizer).
  GitHub reports Apache-2.0, default branch `main`, latest observed push
  `2025-03-20T17:30:54Z`.
- GitHub `LICENSE` blob:
  `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`.
- GitHub `README_TiTok.md` blob:
  `89c3701f03b3356e8cde80194edd15e2426315af`.
- `README_TiTok.md` model zoo links concrete HF checkpoint repos:
  `yucornetto/tokenizer_titok_l32_imagenet`,
  `yucornetto/tokenizer_titok_b64_imagenet`,
  `yucornetto/tokenizer_titok_s128_imagenet`, plus generator and BL/VAE
  variants.
- The same README says the released models are trained on ImageNet and are
  only for research purposes. That is the stricter upstream weight-use
  statement this closeout follows.
- HF API for the three first-line tokenizer repos returned public, ungated
  repos with `license: apache-2.0`, concrete `model.safetensors` files, and
  current revisions:
  - `yucornetto/tokenizer_titok_l32_imagenet`
    at `1c9a2084c59112fd415b7ed97d4c200e864a95de`
  - `yucornetto/tokenizer_titok_b64_imagenet`
    at `603747b9431d1d903ce6f1c55207f3c3bea4c785`
  - `yucornetto/tokenizer_titok_s128_imagenet`
    at `aa8740991cc9e5965e6dea04caad8905193fc24b`
- HEAD probes against the three `model.safetensors` URLs returned HTTP 200.
- The consolidated HF repo
  [`fun-research/TiTok`](https://huggingface.co/fun-research/TiTok) also
  exists at revision `ab646ed225080a3acb7c78440a574d7f67f16fa7` and contains
  `tokenizer_titok_l32.bin`, `tokenizer_titok_b64.bin`, and
  `tokenizer_titok_s128.bin`; HEAD probes returned HTTP 200 for those files.

The HF model-card metadata is permissive, but the upstream README's
research-only model statement is a code/weights divergence. ADR-0020 says the
canonical M-phase path must be permissive for both code and weights, and
research-only weights require explicit opt-in benchmarking.

## Decision

TiTok should not be wired into `DecoderFamilySchema` or a decoder bridge as a
canonical M1B candidate from the current upstream pretrained weights.

The right durable state is:

1. Treat TiTok as **research-only / benchmarking-only** unless a future source
   inspection records permissive weight terms.
2. Do not spend another static pass on Gate B; the availability question is
   answered.
3. Do not spend Gate C/D compute on TiTok for canonical selection while the
   weight-use restriction remains.
4. Keep RFC-0007 dormant. A future permissive 1D tokenizer can reactivate it,
   but TiTok did not trigger it because all four gates did not pass.

## What would reopen TiTok

Reopen only if at least one of these becomes true:

- upstream changes the released model terms to permissive and the PR records
  the exact source revision;
- the project trains TiTok-style weights itself under a permissive project-owned
  license;
- the maintainer explicitly decides to benchmark TiTok under ADR-0020's
  `--allow-research-weights` research path, with receipts recording the
  restriction.

Until then, TiTok is not a default image decoder bridge candidate.
