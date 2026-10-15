---
date: 2026-10-16
status: decision brief (owner-facing) — #402 remaining material; recommendation ready, owner action required
labels: [research-derived, m1-image, delivery, receipts]
tracks: [#402, #403, #435, #473]
---

# Decoder-weights hosting decision brief — canonical ONNX home + pin protocol

## Why this brief

- The S7 delivery line (S7b wiring, S7c CLI opt-in, S7d replay) is landed and
  the [closeout review](./2026-10-16-m1b-delivery-closeout-review.md) reduced
  `#402`/`#403` to **one owner decision**: where the derivative
  `llamagen_vq_ds16_decoder.onnx` lives so its URL can be SHA-pinned. Until
  then the bridge is cache-only by construction (`WEIGHTS_NOT_INSTALLED`
  before any runtime check — honest, but not installable).
- Prior doctrine already fixed the _shape_ of the answer: the
  [delivery & componentization note](./2026-05-13-delivery-and-componentization.md)
  §"Lazy weight fetch with sha256 verification" says weights are **fetched
  from HuggingFace, sha256-verified against the manifest pinned in the npm
  package; the package never bundles weights**, and the kokoro audio
  precedent (`onnx-community/Kokoro-82M-ONNX` pinned by commit SHA) is live
  in-repo. What is missing is the concrete repo + pin values for the
  _derivative_ image artifact — this brief prepares that decision.
- Facts below were verified live on 2026-10-16 against the HF API and the
  repo; interpretation and unknowns are marked.

## Current state (facts, verified this session)

- The shipped artifact is a **derivative export**: `llamagen_vq_ds16_decoder.onnx`
  (~163 MB, opset 17), exported by
  `research/validation/m1b_export_llamagen_decoder_onnx.py` from the upstream
  `vq_ds16_c2i.pt`. Audit-pinned SHA-256:
  `fd6800b3df8193968656e3e6b01ab48bd8899ebede829dfd1166da5f5b9f9389`
  (`packages/codec-image/src/decoders/llamagen/manifest.json`,
  `docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`).
- The current `manifest.json` pins `repoId: "FoundationVision/LlamaGen"`,
  `revision: "81e41139272c038412e4fe8f1c52a51ebbf95b8b"`. **Those values
  resolve to the upstream weights repo snapshot — not to a fetchable URL for
  our artifact** (verified live: the repo exists and hosts `vq_ds16_c2i.pt`
  under that revision; it does not contain any `.onnx`). A loader fetch
  against the current pin would 404 on the filename.
- Cross-check that came out of the live verification: the HF file metadata
  for `vq_ds16_c2i.pt` at that revision reports LFS `oid` =
  `109aa8afb2cf3761eec23cdc8644154cb498f5ab7eef2a35264d25e5e0499f7d` —
  **identical to the audit-recorded upstream SHA-256**. HF's LFS `oid` is the
  file's SHA-256; our audit hash and HF's storage digest agree byte-for-byte.
- The loader already speaks the HF URL scheme:
  `buildHuggingFaceAssetFetcher` resolves
  `<base>/<repoId>/resolve/<revision>/<filename>`
  (`packages/codec-image/src/decoders/llamagen.ts`), follows redirects, and
  applies a 120 s abort-controller timeout. `resolveDecoderWeights` verifies
  sha256 before atomic cache promotion; mismatched bytes are never cached or
  loaded.
- Blessing a URL is designed to be a **default flip, not a code change**
  (`packages/codec-image/src/decoders/llamagen/README.md` §"ONNX hosting"):
  pass `weightsBaseUrl: "https://huggingface.co"` or set
  `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL`; both lanes are regression-pinned in
  tests.

## Live verification (2026-10-16, HF API)

- `https://huggingface.co/api/models/onnx-community/Kokoro-82M-ONNX/tree/<commitsha>/onnx`
  returns `lfs.oid` for `onnx/model.onnx` =
  `53a71ac22a70778d57162e4f92eafc62852d9e04a4460b20638d2424796e6037` —
  **exactly the `weightsSha256` our kokoro manifest already pins**. Second
  independent instance of "LFS oid = content SHA-256".
- `resolve/<commit-sha>/<filename>` responds `302` to a signed CDN URL
  (`us.aws.cdn.hf.co`, `Hash-Algorithm=SHA256`), i.e. commit-SHA-addressed
  downloads work and our `redirect: "follow"` fetch handles them. Resolver
  rate-limit headers observed: `q=3000; w=300` (~3000 resolves / 5 min per
  client — far above install needs).
- `wittgenstein-harness` does **not** exist yet as an HF user/org (API:
  org 404, name invalid) — creating it is part of the owner action below.
  The #402 issue text already uses the name `wittgenstein-harness/image-vqgan-v1`
  as the intended repo.

## Options (comparables)

| Option                           | Mechanism                                                                                                                         | Pros                                                                                                                                                                         | Cons / why not now                                                                                                                                                                                        |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. HF Hub repo (recommended)** | `https://huggingface.co/<org>/<repo>/resolve/<commit-sha>/<file>`                                                                 | Loader already speaks it (zero code change to fetch); ecosystem default; free; commit-SHA revisions; LFS `oid` = SHA-256 (out-of-band cross-check); kokoro precedent in-repo | Needs an owner-owned HF org/repo; HF is a third-party host (deletion risk mitigated by sha-pinned cache + mirror override)                                                                                |
| B. GitHub Releases               | `github.com/<org>/<repo>/releases/download/<tag>/<file>`; assets now expose SHA-256 digests via API (GitHub changelog 2025-06-03) | Same-org hosting; digest field available                                                                                                                                     | URL shape ≠ HF → fetcher needs a second strategy (code change); tag/asset replaceable in place (digest still required); splits the one-doctrine "weights from HF" story                                   |
| C. S3 / R2 bucket                | Versioned object + `versionId`; CDN optional                                                                                      | Full control; version pinning                                                                                                                                                | Cost + credentials + ops; S3 `etag` is not a content digest for multipart uploads (same finding as the training-infra DVC brief) → still need a separate SHA-256 discipline; overkill for one 163 MB file |
| D. Zenodo DOI copy               | DOI-minted archival record                                                                                                        | Citation-grade archival                                                                                                                                                      | Not a CDN for installs; better as a _supplement_ later (e.g. paper citation), not the fetch surface                                                                                                       |
| E. npm tarball bundling          | Ship weights in the package                                                                                                       | no fetch                                                                                                                                                                     | **Forbidden by doctrine** (delivery note: package never bundles weights; `scripts/check-npm-publish-tarball.mjs` guards it)                                                                               |

## Recommendation (A, concretely)

1. **Create the HF org/user** `wittgenstein-harness` (or use a maintainer
   namespace — org preferred so multiple maintainers can own it).
2. **Create repo** `wittgenstein-harness/image-vqgan-v1` (name from #402;
   repo README = short model card: provenance = upstream repo + commit
   `ce98ec41…` / HF `FoundationVision/LlamaGen@81e41139…`, upstream `.pt`
   SHA-256 `109aa8af…`, export script + opset 17, Gate C/D receipt pointers,
   license MIT / permissive-weights; "decoder half only".
3. **Upload** `llamagen_vq_ds16_decoder.onnx` (the audited bytes, SHA-256
   `fd6800b3…`). Do **not** re-export for upload: a re-export with different
   tooling is a new artifact that needs its own four-gate evidence. Never
   replace the file in place afterwards — new uploads are new commits; the
   pin keeps old runs fetchable.
4. **Pin by commit SHA, not tag** (tags can be re-pointed; a SHA cannot).
   Record: `repoId: "wittgenstein-harness/image-vqgan-v1"`,
   `revision: "<upload commit sha>"`, `weightsFilename: "llamagen_vq_ds16_decoder.onnx"`,
   `weightsSha256: "fd6800b3…"` (verify against the API's `lfs.oid` first —
   they must match).
5. **Repo follow-ups once the URL resolves** (each small, staged):
   - update `packages/codec-image/src/decoders/llamagen/manifest.json`
     (`repoId`/`revision`; keep `weightsSha256`; comment stays "license MIT /
     weights permissive");
   - flip the llamagen weight base URL default to `https://huggingface.co`
     (keep `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL` as the mirror override);
   - `wittgenstein install image` becomes a real fetch (progress + sha256 +
     atomic promotion already implemented) and `doctor` tier readiness
     follows automatically — this closes #403's remainder;
   - S7e (runtime identity on bridge receipts) landed ahead of hosting on
     2026-10-16 (`32f7a7c` capture + `8288bda` typed row/replay evidence) —
     it never depended on the hosted bytes.
6. **Verification protocol after upload** (before flipping defaults):
   fetch the resolve URL with an empty cache, confirm `lfs.oid` ==
   `weightsSha256`, then run the repo's skippable real-bridge smoke against
   the fetched bytes (same exec as Gate D; `structural-parity` per #473).

## Trust notes (for the decision record)

- The security model does not depend on HF: verification is **sha256-pinned
  in the repo manifest**, checked before cache promotion; a mirror via
  `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL` is safe only because the pin is
  content-addressed (any mismatch fails typed, never loads).
- If the hosted repo disappears later: cached users keep working; installs
  fail typed (HTTP 404 → fetch error) with the install hint — cache-only
  posture is the designed degradation, not a silent fallback.
- Replay never fetches (S7d `cacheOnly`), so verification of existing
  manifests is unaffected by any hosting change.

## Unknowns (explicit)

- Whether maintainers prefer org name `wittgenstein-harness` vs a personal
  namespace — owner call; the loader is indifferent (`repoId` is data).
- Whether a second mirror should be blessed at the same time (not required;
  mirrors are runtime-configured, not manifest-pinned).

## Sources

- Local doctrine: `docs/research/2026-05-13-delivery-and-componentization.md`
  §1; `packages/codec-image/src/decoders/llamagen/README.md`;
  `packages/codec-audio/src/decoders/kokoro/manifest.json`;
  `docs/research/2026-10-16-m1b-delivery-closeout-review.md` (#402
  assessment).
- Live checks (2026-10-16): HF model APIs for
  `FoundationVision/LlamaGen` (revision `81e41139…`, `vq_ds16_c2i.pt`
  LFS `oid` = `109aa8af…`), `onnx-community/Kokoro-82M-ONNX` (LFS `oid` =
  pinned sha; resolve 302 → CDN; rate-limit headers).
- HF revision pinning guidance: `huggingface_hub` "resolve revisions only
  once" release note (v1.26.0) and HF file-download docs (cited in the S7d
  comparables note).
- GitHub release-asset digests: <https://github.blog/changelog/2025-06-03-releases-now-expose-digests-for-release-assets/>
