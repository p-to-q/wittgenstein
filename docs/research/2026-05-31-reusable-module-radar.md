---
date: 2026-05-31
status: issue #306 closeout radar
labels: [research-derived, engineering, reusable-modules, ai-collaboration]
tracks: [#306, #304, #325, #326, #327, #399, #400, #402, #476, #477, #478]
---

# Reusable-module Radar and AI-collaboration Leverage

## Purpose

This note delivers #306. It is the reusable-module follow-up to the AI-shape
audit after the three local refactors landed:

- #325 extracted the image landscape renderer.
- #326 extracted sensor operator strategies.
- #327 extracted video composition builders and `@wittgenstein/process-runner`.

The question is not "which popular package can we add?" The useful question is:
which mature module, repository, or collaboration pattern should Wittgenstein
reuse, adapt, copy as form, or reject so future work does less greenfield
engineering while preserving local receipts, deterministic behavior, and the
Tier 0 footprint.

## Method

The review used three inputs:

1. Current local module seams:
   - `packages/process-runner/src/index.ts`
   - `packages/codec-image/src/decoders/{manifest,preflight,runtime}.ts`
   - `packages/codec-image/src/pipeline/landscape-renderer.ts`
   - `packages/codec-sensor/src/operators/`
   - `packages/codec-video/src/{compositions/,mp4-renderer.ts,mp4-renderer-runtime.ts}`
2. Existing research and routing notes:
   - `docs/research/2026-05-13-ai-shape-audit.md`
   - `docs/research/2026-05-31-horizontal-engineering-matrix.md`
   - `docs/research/2026-05-31-local-optima-first-pass.md`
   - `docs/research/2026-05-31-retrospective-research-debt-ledger.md`
3. Current first-party external references for candidate modules and patterns:
   - DVC `.dvc` files and data access docs.
   - Aim and MLflow tracking docs.
   - Hugging Face JS Hub docs.
   - OCI Image Spec descriptors.
   - OpenTelemetry semantic conventions.
   - Playwright visual comparison docs.
   - FFmpeg legal and ffprobe docs.
   - GitHub Issue Forms and MCP specification docs.
   - Commander.js, Execa, and Transformers.js repositories.

## Verdict Scale

- `direct now`: already fits the repo and should be reused by the next local
  surface without a new architecture decision.
- `adapt`: strong match, but only inside the existing owning issue or spike.
- `form only`: copy the shape, vocabulary, or validation practice; do not import
  the dependency.
- `reject now`: avoid the dependency or pattern until a concrete falsifier
  changes the local constraints.

## Radar

### Local extracted modules

- **Verdict:** `direct now`.
- **Source/license:** this repo, Apache-2.0.
- **Stack fit:** exact TypeScript/Node fit.
- **Reusable piece:** `runProcess`, `spawnVersionCheck`, `firstOutputLine`,
  runtime probe receipts, codec-local strategy modules, and extracted video
  composition builders.
- **Decision:** reuse these before adding general-purpose helpers.
- **Risk/falsifier:** future callers may inflate `@wittgenstein/process-runner`
  beyond subprocess/probe facts. Revisit only if two non-process domains need
  the same abstraction.

### Commander.js

- **Verdict:** `direct now`.
- **Source/license:** `tj/commander.js`, MIT.
- **Stack fit:** already used by `@wittgenstein/cli`.
- **Reusable piece:** command and option parsing.
- **Decision:** keep it as the CLI parser.
- **Risk/falsifier:** command files can become policy sinks. Do not move
  manifest, codec policy, or readiness rules into Commander action handlers.

### FFmpeg and ffprobe

- **Verdict:** `direct now` as system tools.
- **Source/license:** FFmpeg project, LGPL-2.1+ with GPL applying to some
  builds.
- **Stack fit:** good as host tools; poor as vendored runtime.
- **Reusable piece:** MP4 encode and structural media inspection.
- **Decision:** keep as explicit optional host tools surfaced through doctor and
  receipts.
- **Risk/falsifier:** build flags and codec versions affect bytes, so receipts
  must record tool versions.

### Hugging Face `@huggingface/hub`

- **Verdict:** `adapt`.
- **Source/license:** `huggingface/huggingface.js`, MIT.
- **Stack fit:** good Node 18+ TypeScript fit.
- **Reusable piece:** `downloadFile`, `downloadFileToCacheDir`,
  `snapshotDownload`, and repo/revision/path metadata.
- **Decision:** #402 should run a focused comparison against native `fetch`.
  Adopt only if it reduces cache/download code while preserving local SHA-256
  verification, license refusal, and no remote-metadata-as-truth shortcut.
- **Risk/falsifier:** Hub cache semantics or auth behavior could hide product
  readiness behind a mutable service.

### DVC

- **Verdict:** `adapt`.
- **Source/license:** `treeverse/dvc`, Apache-2.0.
- **Stack fit:** Python/CLI infra, not runtime package code.
- **Reusable piece:** `.dvc` pointer files, remote storage layout,
  `repo.rev_lock`, size, and checksum fields.
- **Decision:** #400 should use DVC directly for dataset snapshots and sweep
  inputs. This challenges the assumed greenfield data-pinning path.
- **Risk/falsifier:** DVC's MD5/ETag/checksum vocabulary must map explicitly to
  Wittgenstein manifest SHA fields rather than replacing them.

### Aim

- **Verdict:** `adapt`.
- **Source/license:** `aimhubio/aim`, Apache-2.0.
- **Stack fit:** good Python training-side fit; no product runtime fit.
- **Reusable piece:** self-hosted/offline-friendly experiment tracking,
  hparams/metrics/artifacts UI.
- **Decision:** #399 can default to Aim for local tracker deployment, with the
  training manifest remaining the canonical receipt.
- **Risk/falsifier:** dashboard uptime or tracker mutation must not become
  acceptance truth.

### MLflow Tracking

- **Verdict:** `adapt` or `form only`.
- **Source/license:** `mlflow/mlflow`, Apache-2.0.
- **Stack fit:** good Python tracking fit; heavier service shape.
- **Reusable piece:** params/metrics/artifacts/run organization and optional
  model checkpoint tracking.
- **Decision:** use as fallback or vocabulary reference for #399 if Aim is not
  accepted. Do not make MLflow the only store of release evidence.
- **Risk/falsifier:** remote backend/database operation can become
  infrastructure drag before training receipts stabilize.

### OCI Image Spec descriptors

- **Verdict:** `form only`.
- **Source/license:** `opencontainers/image-spec`, Apache-2.0.
- **Stack fit:** strong shape fit; registry runtime not needed.
- **Reusable piece:** `digest`, `size`, `mediaType`, annotations, and descriptor
  lists.
- **Decision:** copy descriptor discipline into decoder manifests and artifact
  receipts. Do not adopt an OCI registry for model weights now.
- **Risk/falsifier:** a registry-shaped solution could smuggle distribution
  doctrine into #402 without owner review.

### OpenTelemetry semantic conventions

- **Verdict:** `form only`.
- **Source/license:** `open-telemetry/semantic-conventions`, Apache-2.0.
- **Stack fit:** strong naming reference; SDK is not needed.
- **Reusable piece:** stable attribute naming across producers.
- **Decision:** use the discipline for receipt field names such as `runtime`,
  `version`, `path`, `status`, and `tracker`. Do not adopt OTel SDKs for product
  manifests.
- **Risk/falsifier:** observability spans are not acceptance policy.

### Playwright visual comparisons

- **Verdict:** `form only`.
- **Source/license:** `microsoft/playwright`, Apache-2.0.
- **Stack fit:** useful validation reference; current MP4 stack already uses
  `puppeteer-core`.
- **Reusable piece:** host-aware snapshot expectations and repeated-capture
  stability.
- **Decision:** #476 should keep same-platform byte parity and cross-machine
  structural parity separate. Do not replace the MP4 renderer with Playwright
  just to inherit snapshot tooling.
- **Risk/falsifier:** browser bundles inflate optional video setup.

### GitHub Issue Forms

- **Verdict:** `form only`.
- **Source/license:** GitHub hosted feature; local YAML authored by this repo.
- **Stack fit:** good collaboration fit, no runtime import.
- **Reusable piece:** structured issue intake with typed fields, required
  validation, and default labels.
- **Decision:** use if recurring research gates keep arriving under-specified.
  For now, existing issue bodies plus #479 spike template are enough.
- **Risk/falsifier:** over-templating can slow small issues and create process
  churn.

### MCP specification and schema-first packaging

- **Verdict:** `form only`.
- **Source/license:** `modelcontextprotocol/modelcontextprotocol`,
  Apache-2.0/MIT transition for specs and code; CC-BY-4.0 for documentation.
- **Stack fit:** future agent packaging fit; premature product runtime.
- **Reusable piece:** TypeScript-first schema plus JSON Schema publication and
  a tool capability boundary.
- **Decision:** keep as future packaging reference for v0.3+ MCP/skill work. Do
  not route current codec internals through MCP just because AI agents are
  involved.
- **Risk/falsifier:** protocol work before the CLI/SDK surface stabilizes.

### Execa

- **Verdict:** `reject now`.
- **Source/license:** `sindresorhus/execa`, MIT.
- **Stack fit:** good general Node fit, but broader than current need.
- **Reusable piece:** safer process execution ergonomics.
- **Decision:** do not import now. The local `ProcessRunner` validates the
  greenfield path because the repo needs a tiny timeout/output/probe surface
  with no dependencies.
- **Risk/falsifier:** repeated future process work needs streaming, cancellation
  trees, Windows-specific behavior, or local-bin resolution that the current
  helper cannot support cleanly.

### Transformers.js / `@huggingface/transformers` for the image bridge

- **Verdict:** `reject now`.
- **Source/license:** `huggingface/transformers.js`, Apache-2.0.
- **Stack fit:** good generic inference stack; poor fit for the image decoder
  bridge contract.
- **Reusable piece:** pipeline/model loading patterns.
- **Decision:** the audio package already carries `@huggingface/transformers`
  where Kokoro needs it. Do not add it to `@wittgenstein/codec-image` for M1B:
  the bridge needs family manifests, exact weights/codebook SHA checks,
  optional ONNX peer behavior, and Gate C/D receipts.
- **Risk/falsifier:** generic pipeline convenience can bypass decoder-family
  readiness rules.

## Concrete Reuse and Adaptation Opportunities

### 1. #402 should compare `@huggingface/hub` against native fetch

The lazy weight fetch implementation is the strongest immediate external
reuse candidate. The package exposes file download and cache-directory helpers
that overlap with #402's planned cache-miss path. The adoption test should be
small and mechanical:

- Can it fetch `repo`, `revision`, and `path` without forcing Hub metadata to
  become readiness proof?
- Can Wittgenstein still verify SHA-256 before promoting bytes into its cache?
- Can research-only weights still fail before network fetch when
  `allowResearchWeights` is false?
- Can missing credentials and 404s be shaped into the existing structured
  errors?

If any answer is no, native `fetch` remains better. Either way, this avoids a
blind greenfield download layer.

### 2. #400 should use DVC instead of inventing dataset pins

Dataset snapshotting is not product runtime code. DVC already provides the
right split: Git tracks small pointer files while remote storage carries the
large data. The adaptation work is mapping DVC's file vocabulary into
Wittgenstein training manifests:

- DVC `path`, `size`, `checksum`/`md5`/`etag`, and `repo.rev_lock` describe the
  snapshot source.
- Wittgenstein manifests still carry the canonical dataset identity, SHA field,
  and training run linkage.
- GPU sweep rows should point at DVC-pinned dataset versions, not prose dataset
  names.

This directly challenges the assumed greenfield data-versioning path.

### 3. #399 should not build a tracker

Aim is the default tracking candidate because it is open source, self-hostable,
and training-side. MLflow remains a credible fallback and a useful vocabulary
reference. In both cases the tracker is an index and dashboard; the manifest is
the receipt. The implementation should log hparams, scalars, artifacts, and the
tracker URI, then emit a `TrainingRunManifestSchema` record that can survive
without the tracker UI.

### 4. #476 should copy Playwright's validation stance, not its dependency

Playwright's snapshot docs are useful because they treat generated visual output
as environment-sensitive and make baseline storage explicit. Wittgenstein's MP4
path should keep the current `puppeteer-core` + Chrome + FFmpeg implementation,
but the closeout evidence for #476 should preserve three separate claims:

- same-machine byte parity;
- cross-machine byte parity observed or not expected;
- cross-machine structural parity through ffprobe and manifest fields.

That is a validation-pattern reuse, not a renderer rewrite.

## Greenfield Paths Validated or Challenged

- **Write a local subprocess helper instead of importing Execa:** validated.
  `@wittgenstein/process-runner` is intentionally tiny, dependency-free, and
  already serves doctor/video probes without leaking codec policy.
- **Write dataset versioning from scratch:** challenged. DVC's
  pointer-plus-remote-storage model is a better fit for #400 than a repo-specific
  dataset index.
- **Build a Wittgenstein tracker:** challenged. Aim or MLflow should own run
  dashboards; Wittgenstein manifests should own acceptance truth.
- **Treat model hubs as decoder readiness proof:** rejected. Hugging Face can
  provide download APIs and human-facing metadata, but local manifests, SHA
  checks, license gates, and audit receipts decide readiness.
- **Enforce cross-machine MP4 byte parity as the default:** challenged.
  Browser/media rendering should use same-platform bytes and cross-machine
  structural receipts unless #476 proves stricter portability.
- **Promote all receipts into `packages/schemas` immediately:** rejected.
  #478's promote-on-consumption rule remains the local optimum; candidate/lab
  receipts stay local until product code consumes them.

## AI-collaboration Patterns

The best collaboration reuse is structure, not a new runtime:

- Keep issue bodies self-contained, with acceptance criteria and explicit
  non-goals. #306 itself was actionable once #325/#326/#327 closed.
- Use #479's focused-spike template when a candidate dependency has unresolved
  adoption risk.
- Consider GitHub Issue Forms only for repeated research-gate intake, where
  required fields can prevent missing source/license/receipt information.
- Keep MCP and skill packaging as future distribution references, not current
  architecture. The repo already has CLI and manifest surfaces that agents can
  use today.

## Handoff Decisions

- Reuse local subprocess/probe helpers first:
  already implemented in `@wittgenstein/process-runner`; apply to future
  doctor/runtime probes before adding dependencies.
- Evaluate Hugging Face Hub client for decoder file fetch:
  #402, as a focused comparison against native `fetch`.
- Use DVC for dataset pinning and sweep inputs:
  #400.
- Use Aim by default, MLflow as fallback/reference:
  #399, with model-owner review via #435.
- Copy OCI/OTel descriptor and naming discipline:
  current manifest/receipt work; no new dependency or doctrine issue.
- Preserve MP4 structural parity policy:
  #476.
- Defer issue forms/MCP/skill packaging until repeated pressure appears:
  #479 successor or v0.3 packaging issue, not #306.

## Closeout

#306 can close with this radar. It identifies concrete adaptation paths for
#402, #400, #399, and #476; validates the local `ProcessRunner` path against
Execa; rejects generic model-pipeline reuse for the image decoder bridge; and
does not add runtime dependencies, change doctrine, or touch model training.

## References

- DVC data access:
  <https://dvc.org/doc/user-guide/data-management/discovering-and-accessing-data>
- DVC `.dvc` files:
  <https://dvc.org/doc/user-guide/project-structure/dvc-files>
- DVC repository and license: <https://github.com/treeverse/dvc>
- Aim: <https://aimstack.io/>
- Aim repository and license: <https://github.com/aimhubio/aim>
- MLflow Tracking: <https://www.mlflow.org/docs/latest/ml/tracking>
- MLflow repository and license: <https://github.com/mlflow/mlflow>
- Hugging Face JS Hub docs:
  <https://huggingface.co/docs/huggingface.js/en/hub/modules>
- Hugging Face JS repository and license:
  <https://github.com/huggingface/huggingface.js>
- Transformers.js repository and license:
  <https://github.com/huggingface/transformers.js>
- OCI descriptor spec:
  <https://specs.opencontainers.org/image-spec/descriptor/>
- OCI Image Spec repository and license:
  <https://github.com/opencontainers/image-spec>
- OpenTelemetry semantic conventions:
  <https://opentelemetry.io/docs/specs/otel/semantic-conventions/>
- OpenTelemetry semantic-conventions repository:
  <https://github.com/open-telemetry/semantic-conventions>
- Playwright visual comparisons:
  <https://playwright.dev/docs/next/test-snapshots>
- Playwright repository and license: <https://github.com/microsoft/playwright>
- FFmpeg license/legal notes: <https://www.ffmpeg.org/legal.html>
- ffprobe documentation: <https://www.ffmpeg.org/ffprobe-all.html>
- GitHub Issue Forms:
  <https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms>
- MCP specification repository and license:
  <https://github.com/modelcontextprotocol/modelcontextprotocol>
- Commander.js repository and license: <https://github.com/tj/commander.js>
- Execa repository and license: <https://github.com/sindresorhus/execa>
