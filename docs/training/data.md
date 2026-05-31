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

## Owner Review

#435 still needs explicit owner review for:

- remote storage choice and retention policy
- dataset license posture and publishability implications
- whether DVC `md5` / `etag` fields are sufficient source evidence for each
  remote
- the final managed-vs-maintainer-run GPU sweep policy
