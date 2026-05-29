# Seed-length sweep report

Status: template / pre-registration  
Last reviewed: 2026-05-28

## Research question

What Visual Seed Code length and shape allow a text-first LLM plus adapter to produce decoder-compatible latents that beat deterministic baselines?

## Experimental grid

| Axis | Values |
|---|---|
| Seed length | 4, 16, 64, 256, decoder-grid |
| Shape | 1D sequence, 2D grid |
| Prompt family | object, spatial, style, count, abstract, adversarial |
| Emission mode | dry-run, LLM, LLM+repair |
| Conditioning | VSC-only, Semantic IR + VSC |
| Adapter | deterministic baseline, learned baseline, masked iterative if available |
| Decoder | placeholder, candidate frozen decoder, own-trained decoder if available |

## Metrics

Emission: valid rate, repair rate, token entropy, prefix stability.  
Adapter: invalid latent rate, loss, baseline delta, latency.  
Artifact: quality tier, reconstruction/generation metric, artifact sha, structural determinism.

## Results

Do not fill with invented numbers.

| Seed length | Shape | Valid rate | Repair rate | Adapter delta | Quality tier | Notes |
|---:|---|---:|---:|---:|---|---|
| 4 | 1D | TBD | TBD | TBD | TBD | TBD |
| 16 | 1D | TBD | TBD | TBD | TBD | TBD |
| 64 | 1D | TBD | TBD | TBD | TBD | TBD |
| 256 | 1D | TBD | TBD | TBD | TBD | TBD |
| decoder grid | 2D | TBD | TBD | TBD | TBD | TBD |

## Negative result policy

A failed sweep is useful. Document failures if seed codes collapse, invalid rate is high, adapter cannot beat baseline, decoder is too slow, or licensing/runtime constraints block release.

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
