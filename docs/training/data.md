# Training Data Versioning

Issue [#400](https://github.com/p-to-q/wittgenstein/issues/400) owns the
Phase 1 data-versioning and GPU-sweep receipt surface. The current repo
provides the executable contract floor; lab owners still need to publish the
real ImageNet / CC12M / COCO snapshots and remote credentials.

## Receipt Shape

Dataset access is DVC-shaped, but DVC checksums are not the canonical
Wittgenstein dataset identity. Each dataset snapshot writes a sibling receipt:

- `schemaVersion: "witt.training.dataset-snapshot/v0.1"`
- dataset name, split, role, URI, license posture, sample count, and optional
  CC12M dead-link rate
- DVC pointer path, `repoRevLock`, optional remote name/URL, and DVC
  `outs[]` fields (`path`, `size`, `md5` / `etag` / `checksum`)
- a Wittgenstein `sha256` over the normalized dataset + DVC receipt payload

Training runs continue to emit `witt.training.run-manifest/v0.1`; sweep rows
point at the dataset snapshot receipt and the training-run manifest. The
training manifest stays strict and does not absorb DVC's full pointer payload.

## Smoke Snapshot

The checked-in smoke pointer is deliberately tiny:

```text
research/training/data/snapshots/synthetic-smoke.dvc
research/training/data/smoke/synthetic-manifest-smoke.txt
```

It proves the contract without requiring DVC, S3/R2 credentials, ImageNet, or
GPU access. Generate the smoke dataset snapshot and sweep manifest under
`artifacts/benchmarks/` with:

```bash
python3 bench/gpu/sweep.py --spec bench/gpu/smoke-sweep.yaml
```

The command writes generated receipts under `artifacts/benchmarks/`, which are
ignored like other benchmark output.

## Real Snapshot Policy

Before starting publishable Phase 1 training, a model owner must add DVC
pointers for:

- ImageNet train and val
- CC12M filtered snapshot, named by quarter such as `cc12m-2026q2`, with
  `deadLinkRate`
- COCO 2017 train and val for eval and caption-conditioned rows

Each pointer must resolve through the chosen lab remote (S3 or Cloudflare R2)
and the generated dataset snapshot receipt must record `repoRevLock`. The
remote URL can be documented without credentials; credentials stay outside the
repo.

## Refresh Policy

ImageNet and COCO snapshots should be treated as stable unless the lab remote is
rebuilt. CC12M is URL-backed and decays over time, so each refresh gets a new
snapshot id (`cc12m-YYYYqN`) and records the observed dead-link rate. Do not
silently replace an existing CC12M pointer with a fresher crawl.

## Source Evidence: `md5` / `etag` Sufficiency (2026-10-16 decision)

Answer to the #400 owner-review item, per remote:

- `.dvc` pointers hash with `md5` only; `etag` is a remote-specific identity
  field. For **filesystem / SSH** remotes the recorded `md5` (computed over
  content by DVC) is sufficient content evidence of the pinned copy.
- For **S3 / Azure** external outputs DVC records `etag`, and an S3 ETag is
  not necessarily the MD5 of object content (multipart uploads, some
  encryption settings). Do not treat `etag` as a content digest: keep it as
  identity-at-fetch evidence and pair it with a recomputed content hash of
  the pinned copy (`version_id` too when cloud versioning is enabled).
- For **HTTP** remotes ETag semantics are server-defined; provenance hint
  only.
- For **URL-backed crawls** (CC12M family) there is no source-side checksum
  at all: the pinned copy plus its recomputed hash is the canonical
  identity; keep recording `deadLinkRate` per refresh.

So sufficiency holds only as a bundle: the `.dvc` fields for the remote
type, plus a recomputed content hash of the pinned copy recorded when the
copy lands, plus fetch metadata (remote, date, `version_id`). A snapshot
that backs a publishable claim is re-verified by readback (fetch from the
remote and compare) — receipts are records, not verification. Rationale and
sources:
[`2026-10-16-training-infra-decision-briefs.md`](../research/2026-10-16-training-infra-decision-briefs.md).

## License-clean corpora for publishable checkpoints

A checkpoint trained on a research-only corpus (the recent Phase-1.1 run
used LLaVA-Pretrain) is validation-only and cannot be published; runs stay
in that state until a license-clean corpus is staged.

- Publishable checkpoints train only on corpora whose per-item licence is
  clean for the intended release terms; record the licence posture in the
  dataset snapshot receipt.
- Prefer operator-hosted storage over origin URLs — URL-backed corpora
  measurably decay (>20% of URLs unavailable across a 24-dataset survey).
- First staging candidate: PD12M (12.4M public-domain / CC0 image-caption
  pairs on a dedicated S3 bucket, per-item licence metadata, dataset licence
  CDLA-Permissive-2.0). Assess further candidates (e.g. DataComp
  CommonPool) in the decision briefs note before use.
- ImageNet / COCO pointers stay required as planned; their use for
  _publishable_ training stays open until the same licence evidence exists.

## Owner Review

#435 (the owner-facing map) closed 2026-05-31; the items below are carried
forward by #399 / #400 / #441 and still need owner decisions:

- lab remote/storage choice and retention policy
- dataset license posture and publishability implications (license-clean
  policy recorded above)
- whether DVC `md5` / `etag` fields are sufficient source evidence for each
  remote (decision recorded above; owner acknowledgment pending)
- the final managed-vs-maintainer-run GPU sweep policy
