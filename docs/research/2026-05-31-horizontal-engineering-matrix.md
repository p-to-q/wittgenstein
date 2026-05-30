---
date: 2026-05-31
status: horizontal prior-art matrix
labels: [research-derived, architecture, local-engineering, evaluation]
tracks: [#477, #478, #480, #479, #543, #476, #474, #399, #400, #261]
---

# Horizontal engineering matrix for local surfaces

## Purpose

This note delivers #477: a compact prior-art matrix for local engineering
surfaces Wittgenstein already has to ship. It is not a doctrine change and does
not choose a new decoder, model family, renderer, or training stack. It compares
local seams against adjacent projects and patterns, then routes concrete work to
existing implementation or research issues.

The main question is practical:

> Which outside engineering shapes should Wittgenstein copy, adapt, reject, or
> watch when hardening decoder delivery, manifests, local renderers,
> doctor/install surfaces, and validation gates?

## Method

The review combined three evidence classes:

1. Current repository surfaces:
   - `packages/codec-image/src/decoders/{manifest,preflight,runtime}.ts`
   - `packages/codec-video/src/{mp4-renderer,mp4-renderer-runtime}.ts`
   - `packages/cli/src/commands/{doctor,install,decoder-manifest}.ts`
   - `packages/process-runner/src/index.ts`
   - `packages/schemas/src/{manifest,training-manifest}.ts`
   - `research/validation/video_mp4_renderer_validate.ts`
   - `research/validation/fixtures/m1b-audit/`
2. Local research already accepted or recently audited:
   - `docs/research/briefs/H_codec_engineering_prior_art.md`
   - `docs/research/briefs/J_audio_engineering_and_routes.md`
   - `docs/research/2026-05-13-verification-ladder.md`
   - `docs/research/2026-05-26-video-mp4-renderer-validation.md`
   - `docs/research/2026-05-31-local-optima-first-pass.md`
   - `docs/research/2026-05-31-research-presentation-audit.md`
3. External first-party references:
   - Hugging Face Hub model card docs.
   - MLflow Tracking docs.
   - OCI Image Specification descriptor docs.
   - OpenTelemetry semantic conventions.
   - Playwright visual comparison docs.
   - FFmpeg / ffprobe docs.
   - GitHub CLI `gh auth status` manual.
   - Homebrew `brew doctor` manual.

## Matrix

| Surface                                                                                     | Positive prior art                                                                                                                                                                                                                               | Negative / incompatible prior art                                                                                                                                                                   | Copy now                                                                                                                                    | Adapt                                                                                                                                                                                  | Reject                                                                                                                  | Verdict and routing                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frozen decoder bridge: local weights, SHA pins, license refusal, runtime unavailable states | Hugging Face Hub model cards put model metadata next to artifacts; OCI descriptors make digest and size first-class content identifiers.                                                                                                         | Treating a remote model registry or mutable model card as the source of truth would violate local receipt discipline. A card can describe provenance, but it cannot bless an unverified local path. | Use descriptor-like fields for every load-bearing artifact: `digest`, `size`, `mediaType`, and source path/revision where available.        | Keep the model-card shape as human-facing documentation, but bind product readiness to codec-owned manifest/preflight checks and lab receipts.                                         | Do not turn Hub availability, README metadata, or downloaded file names into readiness proof.                           | `adapt`. Keep image bridge semantics in `@wittgenstein/codec-image`. #474 remains the closeout for real Gate C/D receipts and manifest blessing.                                                       |
| Manifest and receipt spine: artifact hashes, run metadata, lab-vs-local evidence            | MLflow separates params, metrics, and artifacts under a run; OpenTelemetry semantic conventions show why stable attribute names matter across tools; OCI descriptors show the minimal content-addressed artifact record.                         | A mandatory remote tracker would make local replay depend on mutable service state. OpenTelemetry span conventions are observability metadata, not acceptance policy.                               | Keep stable names for cross-surface facts: runtime, version, artifact hash, byte size, deterministic class, environment, and tracker issue. | Apply MLflow's params/metrics/artifacts split only as a local receipt organization principle. Apply OTel-style naming discipline without adopting OTel as the product manifest format. | Do not store acceptance truth only in dashboards. Do not promote every research fixture into `packages/schemas`.        | `adapt`. Product manifests stay in `packages/schemas`; candidate/lab receipts stay codec-local or research-local until a public runtime consumes them. #399 and #400 are the right future infra lanes. |
| Local renderer paths: video MP4/HTML, audio routes, sensor, image decoder                   | Playwright's visual comparison docs explicitly warn that browser rendering can vary by host; ffprobe gives structured stream/format fields for video inspection; existing audio/sensor paths prove byte parity where rendering is deterministic. | Cross-machine byte parity as a universal rule is too strict for browser/media stacks and would create false failures. Screenshot byte diff alone is too weak for MP4 portability.                   | Keep same-platform byte parity for deterministic backends and record tool versions in receipts.                                             | Use structural parity across machines for browser/media renderers: codec, dimensions, FPS, duration, frame count, and receipt fields.                                                  | Do not claim cross-machine MP4 bytes are stable until measured. Do not hide backend drift behind a single `ok` boolean. | `copy now` for structural receipt floor; `adapt` for media bytes. #476 is the portability sweep; #359 can close once same-platform evidence is treated as delivered and #476 owns cross-machine work.  |
| CLI doctor/install surfaces: optional backends and missing runtimes                         | `gh auth status` is a focused environment probe; `brew doctor` is a diagnostic surface, not an implicit repair engine. Both keep setup diagnosis visible to users.                                                                               | A generic installer that silently downloads heavy optional runtimes would violate Tier 0 and surprise users. A doctor that embeds codec policy would duplicate runtime loaders.                     | Emit normalized probe receipts with status, runtime, tier, version/path/message, and install hint.                                          | Keep install/doctor presentation shared, but leave codec-local loaders responsible for whether a missing runtime blocks a specific operation.                                          | Do not make ONNX, Puppeteer, Chrome, FFmpeg, or HyperFrames hard dependencies of the base package.                      | `copy now`. Implemented by #543: shared runtime probe receipt helpers in `@wittgenstein/process-runner` while image/video loaders remain codec-local.                                                  |
| Validation harnesses: deterministic fixtures, negative fixtures, gate scripts, CI policy    | MLflow's artifact logging and OCI descriptors reinforce that evidence should be attached to runs; Playwright and ffprobe reinforce tool-version-aware validation; local fixture tests prove schema drift can be caught before lab execution.     | Green CI alone is not proof for lab gates. Prose-only research notes cannot carry pass/fail claims that should be falsifiable.                                                                      | Keep fixture round-trips, negative fixtures, and command-output receipts near the code that consumes them.                                  | Use CI for contract floors and docs for interpretation; use issue closeout comments for lab evidence that cannot be reproduced in base CI.                                             | Do not close empirical gates because scripts exist. Do not bless decoder readiness from fixture-only passes.            | `adapt`. #474 owns lab receipt reconciliation; #473 owns threshold policy; `pnpm m1b:audit-self-check` and `pnpm m1b:audit-artifact-check` remain the local contract floor.                            |

### Watch verdicts

These items are worth monitoring but should not become current PR scope:

| Watch item                                                    | Why not now                                                                                                                   | Revisit trigger                                                                                                             |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Remote registry automation for decoder candidates             | Local bridge receipts and license gates are not accepted yet. Remote metadata should index accepted evidence, not replace it. | #474 accepts real Gate C/D receipts and a second decoder family creates repeated manifest/preflight pressure.               |
| MLflow / OpenTelemetry GenAI dashboard export                 | Local manifests need to remain the acceptance truth. A dashboard is useful only after receipt names stabilize.                | #399 or #400 starts exporting local receipts to an external tracker.                                                        |
| Tighter cross-machine byte policy for browser/media renderers | Playwright-style host variance and the existing MP4 note make byte parity too brittle as a universal gate.                    | #476 proves cross-machine byte parity under pinned Chrome/FFmpeg, or structural parity fails and needs a stricter contract. |
| Postsubmit or hermetic validation lanes                       | The current docs-only and contract-floor checks are cheap enough for presubmit.                                               | v0.3 release closeout needs slower lab/cold-checkout checks that should not block every PR.                                 |

Positive prior art used in the table: Hugging Face model cards for colocated
human-facing metadata, MLflow run organization, OCI descriptors, OpenTelemetry
semantic naming discipline, Playwright host-variance guidance, ffprobe
inspection, `gh auth status`, and `brew doctor`. Negative prior art is not a
named project failure; it is the incompatible application of those patterns:
mutable registries as truth, remote dashboards as acceptance evidence,
cross-machine byte parity for browser/media artifacts, and doctor/install
surfaces that silently mutate heavy optional dependencies.

## Surface conclusions

### 1. Frozen decoder bridge

The best external shape is not "use a model hub as the runtime source." It is
"separate human-facing model documentation from machine-verifiable artifact
descriptors." Hugging Face model cards are useful because they colocate model
metadata with repository content, but they are not sufficient evidence that a
local package can decode safely. OCI descriptors are closer to the product
need: content identity is digest plus byte size plus media type.

For Wittgenstein, the bridge must stay stricter than either reference alone:

- the model card can explain candidate identity;
- the decoder-family manifest must pin local files and licenses;
- Gate C/D receipts must prove the candidate actually passes the accepted
  policy;
- `install image --json`, `doctor`, and decoder preflight must report blocked
  states without falling back.

This supports the #478 local optimum: keep bridge policy in
`@wittgenstein/codec-image` until a second decoder family proves a reusable
shared schema is needed.

### 2. Manifest and receipt spine

MLflow is the useful positive reference, but only as a shape. Its params,
metrics, and artifacts split maps well to Wittgenstein's proof surfaces:

- params: seed, backend, runtime, environment, CLI flags;
- metrics: Gate C/D scores, frame counts, duration, byte parity verdicts;
- artifacts: output files, manifests, lab receipts, model files.

The incompatible part is the service dependency. Wittgenstein's strongest
claim is local reproducibility from a repository, lockfile, and manifest. A
remote tracker can index or visualize receipts later, but it cannot be the only
place where acceptance truth lives. OpenTelemetry's semantic conventions add a
second lesson: field names need to be stable across producers, or downstream
tools cannot compare them. That supports #543's normalized optional-runtime
probe receipts and the promote-on-consumption rule from #478.

Routing:

- #399 is the right place to add optional experiment tracking integration.
- #400 is the right place for DVC/GPU sweep infrastructure.
- No new manifest umbrella should be opened from this note.

### 3. Local renderers

The video path should not chase universal byte parity. Browser/media tooling is
too sensitive to OS, browser version, codecs, fonts, and headless settings.
Playwright documents this class of host variance for visual snapshots, and the
local MP4 validation note already observed the same practical boundary:
same-platform byte parity is meaningful; cross-machine structural parity is the
portable floor unless evidence says otherwise.

The robust receipt shape is therefore:

- exact bytes for deterministic local renderers where the implementation is
  repo-owned and host-independent;
- same-platform byte parity for browser/FFmpeg paths;
- cross-machine structural parity for MP4 and screenshot-derived artifacts;
- explicit backend and tool-version fields whenever host tooling participates.

Routing:

- #476 owns the cross-machine MP4 sweep.
- #359 should not stay open for cross-machine work once same-platform evidence
  is accepted; #476 is the successor portability tracker.

### 4. CLI doctor and install

`doctor` should be a diagnostic surface, not a policy engine. `gh auth status`
and `brew doctor` are useful because they make environment state visible without
silently changing the system. Wittgenstein's version of that pattern is
runtime-probe receipts: users and agents should see what was checked, what was
missing, and which tier is affected.

#543 implemented the right split:

- shared receipt vocabulary and subprocess probing live in
  `@wittgenstein/process-runner`;
- image and video runtime loaders remain codec-local;
- optional runtime absence does not become a base install failure.

This is the most direct "copy now" row in the matrix.

### 5. Validation harnesses

The current repo has the right split, but future reviewers need to preserve it:

- fixture receipts prove schema shape and validator behavior;
- local contract checks prove command surfaces and failure receipt shape;
- lab receipts prove empirical Gates C/D;
- docs explain how to interpret evidence, but do not replace evidence.

The negative reference is the common research-project failure mode: a script
exists, so the issue gets closed. #474 explicitly forbids that, and this matrix
agrees. A script is infrastructure; a receipt plus accepted policy is evidence.

## Handoff decisions

| Decision                                                    | Routing                                                                                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Runtime probe receipt normalization                         | Done by #543. No further umbrella needed unless a new codec exposes codec-specific helper pressure.                      |
| MP4 cross-machine portability                               | Keep in #476. Do not reopen #359 for portability once same-platform determinism is accepted.                             |
| Decoder Gate C/D and manifest blessing                      | Keep in #474, with #473 as threshold-policy input. Do not bless from fixtures alone.                                     |
| Experiment tracking and data/versioning infra               | Keep in #399 and #400. Do not introduce a remote tracker as acceptance truth.                                            |
| Audio route-specific receipt gates                          | Keep in #261. Use the same receipt discipline, but do not collapse audio routes into a generic manifest row prematurely. |
| Historical under-researched claims found during this matrix | None found that require a new #480 ledger entry. The active concerns already have owners/issues.                         |

## Reviewer checklist

- At least three local-engineering surfaces are covered: decoder bridge,
  receipt spine, renderers, CLI doctor/install, and validation harnesses.
- Positive and negative prior art are both present.
- Every concrete action routes to an existing issue or already-landed PR.
- No doctrine file is changed.
- No model training, lab run, or external runtime install is required.

## References

- #477 - horizontal matrix tracker.
- #478 - local architecture optima; delivered the #543 handoff.
- #543 / PR #545 - runtime probe receipt normalization.
- #476 - MP4 cross-machine structural parity and receipt portability.
- #474 - M1B lab receipt closeout.
- #399 / #400 - experiment tracking and DVC/GPU sweep infra.
- Hugging Face Hub model cards: <https://huggingface.co/docs/hub/en/model-cards>
- MLflow Tracking: <https://www.mlflow.org/docs/latest/ml/tracking>
- OCI Descriptor spec:
  <https://specs.opencontainers.org/image-spec/descriptor/>
- OpenTelemetry semantic conventions:
  <https://opentelemetry.io/docs/concepts/semantic-conventions/>
- Playwright visual comparisons:
  <https://playwright.dev/docs/next/test-snapshots>
- FFmpeg / ffprobe docs: <https://www.ffmpeg.org/ffprobe-all.html>
- GitHub CLI `gh auth status`:
  <https://cli.github.com/manual/gh_auth_status>
- Homebrew `brew doctor`: <https://docs.brew.sh/Manpage>
