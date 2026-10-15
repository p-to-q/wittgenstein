---
date: 2026-10-16
status: research note — decision briefs feeding #399 / #400 owner review
labels: [research-derived, training, reproducibility, tracking, data, maintainer-audit]
tracks: [#399, #400, #435, #441]
---

# Training-infra decision briefs: tracker hosting, DVC source evidence, license-clean corpora

This note is the comparables-research backfill for the Phase 1 training-infra
gates [#399](https://github.com/p-to-q/wittgenstein/issues/399) (tracker) and
[#400](https://github.com/p-to-q/wittgenstein/issues/400) (data + sweeps),
per the standing directive that no slice proceeds without a research pass
over peer repos, docs, and engineering write-ups. It answers three open
questions and records the decisions that the repo docs now carry:

1. **Tracker hosting** — which tracker can the lab actually self-host with
   contributor access and retention? (`aim` vs W&B vs MLflow)
2. **DVC source evidence** — are `.dvc` `md5` / `etag` fields sufficient
   source evidence for each remote? (#400 owner-review item)
3. **License-clean corpora** — what unblocks _publishable_ checkpoints when
   the current corpus is research-only?

Claims are labeled **(F)** fact read from a primary source, **(I)**
interpretation, **(U)** unknown / not verified. This note deploys nothing
and closes nothing; it records decision inputs and the deployment gates that
now apply.

## Brief 1 — Tracker hosting (#399): Aim vs W&B vs MLflow

**Question.** #399's remaining acceptance is lab evidence: a shared Aim
instance accessible to contributors, endpoint/credential/retention docs, and
a contributor-visible deployed run (repo-side plumbing landed in #566). Can
the lab self-host that with the current OSS options?

**Findings.**

- (F) Aim OSS ships remote tracking first-class: a server process over a
  repo directory (`aim server --repo <REPO_PATH>`), default port **53800**
  (binds `0.0.0.0`), UI via `aim up --repo`, and clients connect with
  `Run(repo='aim://<host>:53800')`; TLS is supported via `--ssl-keyfile` /
  `--ssl-certfile` plus a client-side certificate file env
  (`__AIM_CLIENT_SSL_CERTIFICATES_FILE__`).
  [aim docs](https://aimstack.readthedocs.io/en/latest/using/remote_tracking.html)
- (F) **Security reality changed after the May tracker choice.** The Aim
  remote tracking server has an open critical advisory: unauthenticated
  arbitrary method/attribute dispatch (read all runs / delete all runs),
  confirmed against 3.29.1; the bearer-token constant is a placeholder that
  is never checked. `aimhubio/aim#3412`; CVE-2026-85663, CVSS 9.8, affected
  ≤ 3.29.1, status deferred, mitigation = restrict to trusted networks. As
  of this note there is no fixed stable release (latest stable remains
  3.29.1). Reported June 2026, CVE published 2026-09-04 — after the
  tracker decision, so this is an operational amendment, not a reversal.
  [issue](https://github.com/aimhubio/aim/issues/3412) ·
  [CVE](https://nvd.nist.gov/vuln/detail/CVE-2026-85663)
- (F) W&B's self-managed deployment path sits under its Enterprise license
  offering; the managed tiers are hosted products. Lab self-hosting implies
  procurement. [hosting options](https://docs.wandb.ai/platform/hosting/hosting-options) ·
  [enterprise licenses](https://docs.wandb.ai/platform/hosting/enterprise-licenses)
- (F) MLflow is OSS and self-hostable: a tracking server with a pluggable
  backend store (SQLite default; PostgreSQL/MySQL for production) and a
  separate artifact store; its security middleware defaults to
  localhost-only, and opening it to a team requires explicit host/CORS
  configuration.
  [mlflow docs](https://mlflow.org/docs/latest/self-hosting/architecture/tracking-server.html)
- (I) The Aim advisory does not flip the tracker choice (Apache-2.0,
  self-hostable, matches the permissive-infra posture of ADR-0020) — it
  changes **how** the instance may be deployed: through an isolated lab
  network path (SSH tunnel / VPN / firewall allowlist), never a public
  endpoint.

**Decision (recorded; owner-overridable as before).**

- Keep `aim` as the intended lab default; keep the repo-side sibling-receipt
  contract unchanged (no freeform `experiment` block in
  `TrainingRunManifest`).
- #399 deployment gates, now including the security gate:
  1. host + repo path + **pinned version**, on a trusted network only
     (loopback + SSH tunnel, or VPN / firewall allowlist); watch `#3412`
     for a patched release before widening access; never expose publicly;
  2. contributor access path documented (how a fresh checkout reaches the
     dashboard);
  3. retention / backup policy for the Aim repo directory (it is the only
     copy of the tracking data);
  4. one deployed tokenizer run whose `experiment.json` records the
     endpoint / run id, visible to contributors.
- Fallbacks: MLflow if the lab needs a wider-access endpoint and accepts its
  ops surface; W&B only behind an enterprise-license decision.
- Caution: #399's text predates this evidence — it mentions `aim up` port
  43800; the docs' default is 53800 (use the docs).

## Brief 2 — DVC source evidence (#400): are `md5` / `etag` sufficient?

**Question.** #400's ready trigger includes a "source-evidence decision for
DVC md5/etag/sha fields": do the fields DVC records prove that the right
bytes came from the right remote?

**Findings.**

- (F) `.dvc` pointers hash with `md5` only (the `hash` field); outs[] entries
  additionally carry `size`, `nfiles`, and per-remote identity fields:
  `md5` for filesystem / SSH external outputs, **`etag` for HTTP / S3 /
  Azure**, `checksum` for HDFS-family; cloud versioning adds `version_id`.
  [dvc docs](https://dvc.org/doc/user-guide/project-structure/dvc-files)
- (F) An S3 ETag is not necessarily the MD5 of the object: multipart
  uploads (and some encryption configurations) produce ETags that are not
  content digests; multipart integrity checks use part-level checksums.
  [S3 Object API](https://docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html) ·
  [integrity checking](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html)
- (I) Therefore "sufficient" is per remote: `md5` is sufficient content
  evidence where it is present (filesystem / SSH); `etag` is
  identity-at-fetch evidence only and cannot stand in for a content hash on
  S3 / Azure / HTTP. For URL-backed crawls (CC12M family) no source-side
  checksum exists at all — the pinned copy is the canonical object.
- (F) Context from #400: #566 moved the run manifest's dataset fingerprint
  to a real per-file content hash (`cache_per_file=True`), but the lock
  itself (a committed `.dvc` pin, `revision` no longer "uncommitted") is
  still missing. The bundle below is what the pin must satisfy.

**Decision.** A snapshot is "sourced" only with this bundle:

1. the `.dvc` pointer fields available for its remote type (`md5` and/or
   `etag`, `size`, `repoRevLock`);
2. a **recomputed content hash over the pinned copy**, recorded when the
   copy lands (this, not the remote field, is the reconstruction key);
3. fetch metadata: remote name/URL, fetch date, `version_id` when the
   bucket uses cloud versioning;
4. `deadLinkRate` for URL-backed corpora (existing policy).

Per remote: filesystem / SSH → `md5` sufficient; S3 / Azure → do **not**
treat `etag` as a content digest, record it as fetch-time identity plus the
recomputed hash; HTTP → `etag` is a hint only. Before a snapshot backs a
publishable claim, re-verify by readback (fetch from the remote and
compare) — receipts are records, not verification. Alternatives (HF
datasets, lakeFS, DataChain) were surveyed at headline level only; nothing
in them is required for this decision, and a hands-on comparison would be a
separate pass (U).

## Brief 3 — License-clean corpora for publishable checkpoints

**Question.** #400's other ready trigger: stage a license-clean corpus. The
blocker: the recent Phase-1.1 run trained on LLaVA-Pretrain (research-only),
so its checkpoint is validation-only and not publishable.

**Findings.**

- (F) Owner comment on #400 (2026-05-31): the LLaVA-Pretrain-trained
  checkpoint "is validation-only and not publishable"; every training run
  stays in that state until a license-clean corpus is staged.
- (F) URL-backed corpora decay measurably: across a 24-dataset survey of
  web-sourced datasets, >20% of URLs were unavailable (mean availability
  78.1%), with ImageNet among the worst and the Conceptual Captions family
  showing many soft-404s.
  [link rot study](https://lucaro.ch/papers/MMM23_Link-Rot.pdf)
- (F) PD12M is a concrete license-clean candidate: 12.4M image-caption
  pairs, public domain / CC0 per item, auto-recaptioned and quality/safety
  filtered; metadata includes per-item `license` and `hash`; datasets
  licence is CDLA-Permissive-2.0; images are hosted on a dedicated AWS S3
  bucket rather than left at origin URLs.
  [paper](https://arxiv.org/abs/2410.23144) ·
  [dataset card](https://huggingface.co/datasets/Spawning/PD12M)
- (F) DataComp (CommonPool) exists as a larger candidate pool, with licence
  restrictions noted; assess before use.
  [paper](https://arxiv.org/abs/2304.14108)
- (I) PD12M is the leading first staging candidate for a _publishable_
  Phase 1 corpus; its single-provider bucket is an ops dependency (pin a
  snapshot + hashes per Brief 2), not a licensing blocker.

**Decision.**

- Publishable checkpoints train only on corpora whose per-item licence is
  clean for the intended release terms; research-only corpora remain
  validation-only and their receipts must say so.
- Preferred shape: operator-hosted image storage (immune to link rot) with
  per-item licence metadata; PD12M first, DataComp and others to be
  assessed before use.
- Keep ImageNet / COCO pointers as planned for lab and eval use; their use
  for _publishable_ training stays open until the same licence evidence
  exists.

## What this revises

- Answers the tracker open question in
  [`2026-05-13-wittgenstein-research-program.md`](2026-05-13-wittgenstein-research-program.md):
  `aim` stays the default, amended with a network-isolation gate
  (CVE-2026-85663) for any shared deployment.
- Updates repo docs on this branch: `docs/training/experiment-tracking.md`
  (deployment gates + pointer) and `docs/training/data.md` (source-evidence
  decision; license-clean policy; stale #435 owner-review reference fixed —
  #435 closed 2026-05-31 and the items were carried by #399 / #400 / #441).
- No schema, receipt, or code changes; the tracker enum and snapshot fields
  already cover the decisions.

## Sources

All fetched 2026-10-16.

- Aim remote tracking — <https://aimstack.readthedocs.io/en/latest/using/remote_tracking.html>
- Aim security advisory — <https://github.com/aimhubio/aim/issues/3412>; CVE-2026-85663 — <https://nvd.nist.gov/vuln/detail/CVE-2026-85663>
- W&B hosting options — <https://docs.wandb.ai/platform/hosting/hosting-options>; enterprise licenses — <https://docs.wandb.ai/platform/hosting/enterprise-licenses>
- MLflow tracking server — <https://mlflow.org/docs/latest/self-hosting/architecture/tracking-server.html>
- DVC `.dvc` files — <https://dvc.org/doc/user-guide/project-structure/dvc-files>
- S3 ETag semantics — <https://docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html>; integrity checking — <https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity.html>
- Link rot — Lakic, Rossetto, Bernstein, MMM 2023 — <https://lucaro.ch/papers/MMM23_Link-Rot.pdf>
- PD12M — <https://arxiv.org/abs/2410.23144>; dataset card — <https://huggingface.co/datasets/Spawning/PD12M>
- DataComp — <https://arxiv.org/abs/2304.14108>
- Issue context — #399, #400, #435, #441, #566, #581, #582 (p-to-q/wittgenstein)
