---
date: 2026-05-31
status: issue #309 closeout benchmark
labels: [research-derived, architecture, prior-art, local-optima]
tracks: [#309, #288, #306, #477, #478, #300, #402, #476, #399, #400, #263]
---

# Architecture Benchmark Against Prior Art

## Purpose

This note delivers #309. It is the external architecture comparison that was
deferred until the local AI-shape refactors landed. It does not replace the
local audits:

- #288 found the original mono-file / mixed-responsibility seams.
- #325, #326, and #327 extracted the strongest AI-shaped modules.
- #477 compared local engineering surfaces against adjacent prior art.
- #478 chose local optima for concrete seams.
- #306 classified reusable modules and dependency adoption strength.

This note answers the remaining #309 question: after those changes, is the
current architecture actually a good local optimum, where is it weaker than
mature patterns, and what should change next?

## Method

The review compared current code against first-party external references. It
used only surfaces that map to a real Wittgenstein seam:

- Harness and codec protocol:
  `packages/core/src/runtime/harness.ts`,
  `packages/schemas/src/codec-v2.ts`, and Standard Schema.
- Package boundaries:
  workspace `package.json` files, `pnpm-workspace.yaml`, and pnpm workspace
  protocol docs.
- Receipts and manifests:
  `packages/schemas/src/manifest.ts`,
  `packages/codec-image/src/decoders/{manifest,preflight,weights}.ts`,
  MLflow Tracking, OCI descriptors, OpenTelemetry semantic conventions, and
  Bazel hermeticity guidance.
- CLI inspection:
  `packages/cli/src/commands/{doctor,install,decoder-manifest}.ts`,
  `packages/process-runner/src/index.ts`, `gh auth status`, and `brew doctor`.
- Image adapter and decoder seam:
  `packages/codec-image/src/adapters/`, `packages/codec-image/src/decoders/`,
  Hugging Face Hub JS, and ONNX Runtime Node.js binding docs.
- Sensor operator/runtime seam:
  `packages/codec-sensor/src/{operators/,loupe-renderer.ts,render.ts}`, Apache
  Beam transform concepts, and the W3C Web Audio graph model.
- Video renderer seam:
  `packages/codec-video/src/{compositions/,mp4-renderer.ts}`, Remotion renderer
  docs, Playwright visual comparison docs, and ffprobe docs.

## Executive Verdict

The current architecture is a defensible local optimum for v0.3-era delivery.
The strongest parts are the package seams, codec-owned request validation,
receipt spine, optional runtime probe split, and the post-#325/#326/#327 module
extractions. The repo is no longer suffering from the three worst AI-shaped
mono-file shortcuts identified in #288.

The weak parts are mostly not rewrite-now problems:

- `packages/core/src/runtime/harness.ts` still carries legacy codec plumbing
  beside the v2 path.
- `packages/codec-image` still has a typed but unwired frozen-decoder bridge.
- `packages/codec-audio/src/codec.ts` remains broad enough to deserve a future
  dispatcher/facade extraction if audio grows.
- `packages/codec-image/test/codec.test.ts` remains a large contract test file
  that should be split only when it next changes.
- Cross-machine media determinism is intentionally not proven yet.

No new doctrine change is warranted. The right move is to keep the current local
shape, route the unresolved empirical work through existing issues, and avoid
importing large external frameworks merely because they are more mature.

## Benchmark By Seam

### 1. Harness and codec protocol

**Current shape.** The v2 path validates requests through
`codec.schema["~standard"].validate(request)`, builds a typed `HarnessCtx`,
lets codecs own `produce()`, and folds codec-owned manifest rows into a shared
run manifest. The same file still carries the legacy codec pipeline.

**External comparison.**

- Standard Schema solves the cross-library validation interface problem by
  standardizing the `~standard.validate()` surface, which matches the repo's
  codec-owned validation boundary.
- MCP and Vercel AI SDK-style interfaces show the value of schema-described
  tool/provider boundaries, but they solve distribution, host integration, and
  provider abstraction, not internal codec execution.

**Verdict.** `keep current`.

The v2 harness shape is better than a greenfield class hierarchy or
framework-specific runtime. It follows the useful part of Standard Schema:
unknown input enters through a common validation interface, then typed codec
code owns the domain behavior. That is stronger than a central harness switch
over every modality.

**Weakness.** The legacy pipeline still makes `harness.ts` larger than ideal.
This is historical migration debt, not a reason to redesign the v2 boundary.
Route retirement through the existing M4 / #300 path rather than rewriting the
harness now.

### 2. Package and monorepo boundaries

**Current shape.** Runtime packages depend on each other through workspace
packages. Optional heavy runtimes stay as optional peer dependencies. Package
code is guarded from importing `research/`.

**External comparison.**

- pnpm's `workspace:` protocol is the right local dependency guard: it refuses
  to resolve to anything except a local workspace package and rewrites workspace
  specs for publish.
- Bazel's hermeticity guidance is useful as a verification ideal: host tools
  and system binaries must either be pinned or recorded when they influence
  output.

**Verdict.** `keep current; borrow hermeticity discipline`.

The current pnpm workspace is good enough. A Bazel/Nx/Rush migration would add
process weight before the repo has enough build graph pressure. The borrowed
lesson is narrower: when Chrome, FFmpeg, ONNX Runtime, or Python training tools
affect outputs, receipts must record tool versions and environment shape.

**Weakness.** Tool hermeticity is not complete for MP4 and training. Existing
issues already own this: #476 for cross-machine video receipts and #399/#400
for training tracker/data infrastructure.

### 3. Manifest and receipt spine

**Current shape.** Product manifests live in `packages/schemas`; candidate
decoder manifests and M1B Gate C/D audit receipts stay codec-local; research
receipts stay under `research/` until a public runtime consumes them.

**External comparison.**

- MLflow's run organization splits params, metrics, artifacts, and run identity.
- OCI descriptors make digest, size, and media type first-class artifact facts.
- OpenTelemetry semantic conventions reinforce stable field names across
  producers.
- Bazel hermeticity guidance reinforces source identity and explicit tool inputs.

**Verdict.** `keep current; continue promote-on-consumption`.

Wittgenstein's local receipt spine is stronger than a dashboard-only tracker.
The shared manifest is load-bearing, while external dashboards should be indexes
or views. The current split also prevents `packages/schemas` from becoming a
research-fixture dumping ground.

**Weakness.** `RunManifestSchema` is now broad. That is acceptable while it is
the product manifest root, but future per-modality receipts should become typed
sub-objects before adding more top-level ad hoc keys.

### 4. CLI inspection, doctor, and install

**Current shape.** `doctor` reports Node, API-key presence, tier readiness,
video runtime probes, and image decoder readiness. `@wittgenstein/process-runner`
owns subprocess/version probes and normalized runtime probe receipts. Codec-local
loaders still decide whether a missing runtime blocks a specific operation.

**External comparison.**

- `gh auth status` is a focused diagnostic surface.
- `brew doctor` is diagnostic rather than an implicit repair engine.
- Execa would provide a richer process abstraction, but #306 found the current
  local helper is smaller and better matched to the repo.

**Verdict.** `solid; keep current`.

The current split is a good local optimum. Doctor should keep showing facts and
install hints; it should not silently install heavy optional peers or become the
codec policy engine.

**Weakness.** `doctor.ts` is a naturally growing coordination file. If a third
optional-runtime family adds another branch, extract per-tier doctor modules;
until then, the shared receipt helper is enough.

### 5. Image adapter and frozen-decoder seam

**Current shape.** The image codec has semantic/VSC parsing, seed expansion,
placeholder MLP adapter support, a procedural landscape placeholder decoder, and
typed frozen-decoder bridge stubs. The LlamaGen bridge still throws a structured
`LLAMAGEN_BRIDGE_NOT_IMPLEMENTED` error. Decoder weights resolution already
models cache lookup, SHA-256 verification, research-only opt-in, and structured
fetch failures.

**External comparison.**

- Hugging Face Hub JS exposes repo, revision, cache, and metadata helpers that
  are close to #402's lazy-fetch needs.
- ONNX Runtime's Node.js binding is the correct concrete inference target for
  the `node-onnx-*` runtime tiers, but it is a heavy optional peer.
- OCI descriptor shape remains the cleanest artifact identity model.
- Transformers.js is a useful generic pipeline runtime, but it is too broad for
  the decoder-family manifest contract.

**Verdict.** `research first; implement via #402`.

This is the least complete major seam. The architecture is not wrong, but it is
not proven until the bridge stops being a typed stub. The next implementation
should compare `@huggingface/hub` against native `fetch`, keep ONNX Runtime as
an optional peer, and preserve codec-owned manifest/preflight rules.

**Weakness.** The adapter fallback chain is useful for local experiments but not
the final architecture. Do not clean it up in isolation; change it when #402,
#435, #441, or #259 supplies real model/adapter pressure.

### 6. Sensor operator and runtime seam

**Current shape.** The sensor renderer now delegates operator behavior to files
under `packages/codec-sensor/src/operators/`, and Loupe subprocess rendering has
a dedicated `LoupeRenderer`.

**External comparison.**

- Apache Beam's model separates user-constructed pipelines, transforms, and
  runners. That is useful as form, not as a dependency.
- The Web Audio API's audio routing graph shows a mature graph-of-nodes model
  for signal processing, with explicit node types and graph connections.

**Verdict.** `solid; borrow graph vocabulary later`.

#326 fixed the main AI-shaped smell. The current strategy modules are the right
local shape for deterministic fixture-backed operators. A Beam/Web Audio-style
graph would be premature for today's ECG/temperature/gyro surfaces, but it is a
good reference if #263 or future chaotic-operator work introduces multi-stage
operator graphs, fan-out, or stateful windows.

**Weakness.** Sensor needs product measurement gates more than architecture
changes. Keep #263 parked until the post-M3 gate fires.

### 7. Video renderer and local media path

**Current shape.** Video composition is now split into SVG-slide and scene-card
builders. MP4 rendering is opt-in, uses `puppeteer-core` plus a local
Chrome/Chromium binary, captures one frame per deterministic frame-time URL,
then encodes with FFmpeg. Receipts record backend, dimensions, frame count,
duration, and tool versions.

**External comparison.**

- Remotion's `renderMedia()` is stronger as a general video architecture because
  it explicitly separates composition config, bundle URL, codec, output
  location, and render progress.
- Playwright's visual-comparison stance is the right validation reference for
  browser-rendered outputs: host rendering can vary, so structural comparison is
  different from byte comparison.
- ffprobe remains the right low-level media inspection tool.

**Verdict.** `keep current; do not import Remotion`.

Remotion is better as a full video product, but Wittgenstein only needs a small
receipt-bearing renderer for M4. The current distilled renderer keeps Tier 0
small and makes cross-machine uncertainty explicit. Copy Remotion's separation
of composition and render parameters when the video surface grows; do not add
Remotion as a dependency now.

**Weakness.** Cross-machine parity remains evidence-bound. #476 is the right
owner.

## Areas That Look Solid

- Codec v2 request validation through Standard Schema.
- Per-codec package ownership and pnpm workspace dependencies.
- Product manifest schemas in `packages/schemas`, with candidate/lab receipts
  local until consumed.
- Optional runtime absence as structured readiness/probe receipts rather than
  silent fallback.
- Post-#325 image landscape extraction.
- Post-#326 sensor operator strategy extraction.
- Post-#327 video composition/process extraction.

## Areas That Are Probably Not Best Local Optima Yet

- `packages/core/src/runtime/harness.ts` still carries legacy and v2 execution
  in one file. Keep until the legacy surface can be retired cleanly.
- `packages/codec-image/src/decoders/llamagen.ts` and `seed.ts` remain typed
  stubs. The seam is shaped, but the architecture is not proven.
- `packages/codec-audio/src/codec.ts` combines plan inference, route dispatch,
  WAV metadata, and decode output. This is mild now, but it will become real
  debt when audio route work resumes.
- `packages/codec-image/test/codec.test.ts` is a large contract test file with
  repeated fixture setup. Split when the next image contract PR touches it.
- Cross-machine media output policy is structural, not byte-proven.

## Outside Patterns To Borrow

- Standard Schema: keep schema-owned validation, not framework adapters.
- pnpm `workspace:` protocol: keep local package dependencies explicit.
- Bazel hermeticity: record host tools and avoid claiming reproducibility when
  system binaries participate.
- MLflow: use params/metrics/artifacts as tracker organization, not as the
  acceptance truth store.
- OCI descriptors: keep digest/size/mediaType/source identity on artifacts.
- OpenTelemetry semantic conventions: keep field names stable across producers.
- Hugging Face Hub JS: evaluate for #402 file fetch/cache only.
- ONNX Runtime Node: use as optional inference peer, never Tier 0.
- Apache Beam and Web Audio: borrow graph/transform vocabulary only if sensor or
  audio operator graphs actually need it.
- Remotion: borrow composition/render parameter separation, not the runtime.

## AI-shaped Or Under-factored Remnants

The original strong AI-shaped modules from #288 are fixed enough for this phase.
Remaining debt is lower grade:

- Broad but coherent: `packages/core/src/runtime/harness.ts`.
- Broad and likely future refactor: `packages/codec-audio/src/codec.ts`.
- Large but useful contract lock: `packages/codec-image/test/codec.test.ts`.
- Temporary but honest stubs: image decoder bridges and seed bridge.
- Host-tool determinism gap: MP4 and training environments.

None of these justify a giant rewrite PR. They need targeted follow-through when
their owning lane resumes.

## Ranked Next Steps

### Refactor now

No new refactor-now item comes out of this benchmark. The refactor-now items
found by the local audit already landed as #325, #326, #327, and #543. Opening a
new rewrite from #309 would be less rigorous than letting the current seams
prove where they fail.

### Research or implementation first

- #402: implement lazy decoder file fetch, SHA verification, cache layout, and
  optional ONNX Runtime wiring. Compare `@huggingface/hub` to native `fetch` in
  that PR.
- #476: run the MP4 cross-machine structural parity sweep; do not infer
  cross-machine byte parity from same-machine success.
- #399/#400: wire training tracker/data infrastructure so training claims are
  traceable without making dashboards the source of truth.
- #441/#435: keep training-stack and model-owner review outside this benchmark;
  do not let architecture notes bless model choices.
- #263: keep sensor measurement gates parked until post-M3 execution pressure
  exists.

### Park

- MCP-first internal runtime.
- Remotion as a video dependency.
- Bazel/Nx/Rush migration.
- Generic Execa replacement for `@wittgenstein/process-runner`.
- A shared universal receipt schema for all research artifacts.
- Beam/Web Audio-style graph runtime for today's sensor renderer.

## Closeout

#309 can close with this note. The external comparison is now explicit, the
current local optimum is defended where it is strong, weaker seams are named,
and every next action routes to an existing issue or a park decision. No runtime
dependency, model-training path, or doctrine surface changes in this closeout.

## References

- #288 - local AI-shape audit.
- #306 - reusable-module radar.
- #477 - horizontal engineering matrix.
- #478 - local architecture optima first pass.
- #300 - harness modality-blind cleanup lane.
- #402 - decoder lazy fetch and SHA verification.
- #476 - MP4 cross-machine structural parity.
- #399/#400 - tracker and DVC/GPU sweep infrastructure.
- #263 - sensor operator receipts and measurement gates.
- Standard Schema: <https://standardschema.dev/>
- Model Context Protocol architecture:
  <https://modelcontextprotocol.io/docs/learn/architecture>
- Vercel AI SDK:
  <https://vercel.com/docs/ai-sdk>
- pnpm workspaces:
  <https://pnpm.io/workspaces>
- Bazel hermeticity:
  <https://docs.bazel.build/versions/master/hermeticity.html>
- MLflow Tracking:
  <https://www.mlflow.org/docs/latest/ml/tracking>
- OCI descriptor spec:
  <https://specs.opencontainers.org/image-spec/descriptor/>
- OpenTelemetry semantic conventions:
  <https://opentelemetry.io/docs/specs/otel/semantic-conventions/>
- Hugging Face Hub JS:
  <https://huggingface.co/docs/huggingface.js/en/hub/modules>
- ONNX Runtime Node.js binding:
  <https://onnxruntime.ai/docs/get-started/with-javascript/node.html>
- Apache Beam model basics:
  <https://beam.apache.org/documentation/basics/>
- W3C Web Audio API:
  <https://www.w3.org/TR/webaudio/>
- Remotion `renderMedia()`:
  <https://www.remotion.dev/docs/renderer/render-media>
- Playwright visual comparisons:
  <https://playwright.dev/docs/next/test-snapshots>
- ffprobe documentation:
  <https://www.ffmpeg.org/ffprobe-all.html>
