# Third-party vendored sources

Code in this directory is **vendored from external repositories** with
their licenses preserved alongside. Use only via the wrapper modules in
`research/training/`, which add Wittgenstein-side attribution and
config defaults.

## `llamagen_vq_model.py`

- **Source:** `FoundationVision/LlamaGen`, file `tokenizer/tokenizer_image/vq_model.py`
- **Upstream URL:** <https://github.com/FoundationVision/LlamaGen>
- **Pinned commit:** `ce98ec41803a74a90ce68c40ababa9eaeffeb4ec`
- **License:** MIT (see [`LICENSE.llamagen`](./LICENSE.llamagen))
- **Why vendored, not imported:** Wittgenstein training stays
  self-contained — no `sys.path` tricks against an external clone. The
  VQGAN-class architecture is the audited baseline (see
  [`docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`](../../../../docs/research/2026-05-27-audit-vqgan-class-gates-cd.md));
  we train new weights against this proven architecture per the
  research-program note. Our "Wittgenstein-native" lane = same
  architecture, our config (D=32 vs LlamaGen's D=8), our data,
  our weights, our license posture.
- **Modifications:** None. Pure copy. If we ever need to modify, fork
  to a `wittgenstein_*.py` sibling and document the diff here.
- **Update protocol:** When upstream lands a relevant fix, re-vendor
  by overwriting this file from the pinned upstream commit, update
  the "Pinned commit" line above, and re-run any training that
  consumed the old version (the training manifest captures
  `_shared/_third_party/llamagen_vq_model.py`'s SHA-256, so a
  re-vendor that changes behavior will produce a new manifest hash
  that invalidates downstream receipts).
