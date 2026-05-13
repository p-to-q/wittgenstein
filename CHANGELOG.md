# Changelog

All notable changes to Wittgenstein are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0-alpha.2] — 2026-05-13 — campaign sweep, audit ratification, AI-shape refactors

This prerelease packages the trust-surface advances from the May-2026
maintainer-onboarding campaign: per-candidate M1B audits, AI-shape audit
follow-ups, operating-doc drift correction, and three module-extraction
refactors. The image trained projector (M1B) remains the named blocker; see
[#283](https://github.com/p-to-q/wittgenstein/issues/283) and [#329](https://github.com/p-to-q/wittgenstein/issues/329).

### Added

- Per-candidate radar audit protocol ratified (`docs/research/2026-05-08-radar-audit-plan.md`,
  via PR #322). Decomposed `#283` into five per-candidate sub-issues
  (#329 VQGAN-class, #330 FSQ, #331 OpenMAGVIT2, #332 TiTok, #333 MaskBit)
  plus two implementation gates (#334 Gate C determinism, #335 Gate D ONNX/CPU).
- VQGAN-class per-candidate audit Gates A + B PASS via external inspection
  (PR #336). LlamaGen MIT-licensed at code + project level; 70-72M VQ tokenizer
  HF-hosted at `FoundationVision/LlamaGen`; SHA-pinnable. Gates C / D require
  local PyTorch + LlamaGen weights download and are filed as #334 / #335.
- Parallel per-candidate audits for Priorities 2-5 (PR #340) covering FSQ,
  OpenMAGVIT2 / SEED-Voken, TiTok / 1d-tokenizer, MaskBit. Surfaced **MaskBit's
  weights "research purposes only" carve-out** as the first weights/code license
  divergence in the radar. Surfaced FSQ as a different-shape candidate
  (quantization primitive, not packaged tokenizer).
- AI-shape audit deliverable (`docs/research/2026-05-13-ai-shape-audit.md`,
  via PR #328) with three filed refactor follow-ups (#325 / #326 / #327, all
  landed this release).
- Sensor `patchGrammar` measurement plan revised (PR #321): UCI HAR thermal
  claim removed, NOAA LCD pinned as the sole temperature source, tone made
  repository-neutral. Pre-registered sample-size escalation rule added.
- Operating-doc drift correction across AGENTS.md / PROMPT.md (PR #323) and
  README first-screen with compact modality map (PR #324). README architecture
  wording correction (PR #312). All five operating-doc surfaces now agree on
  the Visual Seed Code framing.
- M1B training-prep research note (`docs/research/2026-05-13-m1b-training-prep.md`,
  via PR #341) covering engineering practices, parameter starting points, and
  a concrete code layout for the eventual M1B wiring. **No training code yet**
  per the maintainer's "research first" directive.
- alpha.2 cut decision deliverable (`docs/research/2026-05-13-alpha2-cut-decision.md`,
  via PR #341) with rationale, release-notes draft, and a four-step cut
  procedure.

### Changed

- **`packages/codec-image/src/pipeline/decoder.ts` shrinks 602 → 309 lines**
  (PR #337). Extracted `pipeline/landscape-renderer.ts` (procedural landscape
  rendering + `FIELD_SALTS` named constants) and `pipeline/internal-math.ts`
  (shared math helpers). `decodeLatentsToRaster` public API and pixel output
  preserved byte-for-byte. Refactor seam unblocks future M1B wiring without
  unentangling placeholder rendering.
- **`packages/codec-sensor/src/render.ts` shrinks 447 → 206 lines** (PR #338).
  Extracted `operators/` directory (one file per `SensorOperator` type with
  `dispatchOperator` registry) and `loupe-renderer.ts` (3-level fallback chain
  behind a single API). `expandSensorAlgorithm` and all 6 sensor goldens
  preserve byte-for-byte (the patchGrammar recursion-seam invariant holds).
- **`packages/codec-video/src/hyperframes-wrapper.ts` shrinks 409 → 167 lines**
  (PR #339). Extracted `compositions/{svg-slide,scene-card,shared}.ts` and
  `process-runner.ts` (typed subprocess runner with bounded stdout/stderr
  capture, errorPrefix + timeoutHint). `renderWithHyperFrames` public API
  preserved. HTML output semantically identical; tests use `toContain` checks.
- README first-screen rewritten with compact modality map (PR #324) per #256.
- AGENTS.md and PROMPT.md glossary tables aligned with ADR-0011 + ADR-0018
  framing (PR #323). M-phase status updated across both files: M0 / M1A /
  M2 audio / M3 sensor landed; M1B = current v0.3 mainline blocker.
- `docs/codecs/sensor.md` and `docs/research/2026-05-08-sensor-algorithmic-research.md`
  tightened to keep PR #295 references provisional (PR #312).

### Fixed

- `process-runner` stdout/stderr capture bounded at 32 KB per stream (post-PR-#339
  CodeRabbit catch). Pre-refactor `spawnProcess` accumulated unbounded strings;
  the bound stays well above what error messages consume.
- Removed an unused `ProcessRunnerError` interface (post-PR-#339 CodeRabbit
  cleanup; `runProcess` rejects with plain `Error` matching the pre-refactor
  pattern).
- Issue queue triage: closed #109 superseded by #283 radar work; closed #150
  early after WORKFLOW.md kill-criterion signal 3 met; closed #287 with audit
  comment; closed #305 with continuation map; closed #308 with reply sweep.
  Status comments on #70, #190 (with `status/needs-triage` → `status/parked`
  + `horizon-spike` label updates), #304, #306, #307, #309, #310.

### Known blockers (current mainline)

- **M1B (image trained projector) is the named blocker** for v0.3.0. Wiring
  `loadLlamagenDecoderBridge` at `packages/codec-image/src/decoders/llamagen.ts`
  requires VQGAN-class Gate C (determinism; #334) + Gate D (Node/ONNX/CPU;
  #335) to clear. Both gates need local PyTorch + the LlamaGen VQ tokenizer
  downloaded. Until then the bridge remains a `NotImplementedError` stub.
- Sensor `patchGrammar` promotion: gated on #284 measurement (plan ratified
  by #321; measurement run pending local Python tooling).
- Video M4: `codec-video` remains a stub; #282 (HyperFrames distillation)
  and #265 (HF receipts) carry that forward.

### Repo infra (carried from earlier `[Unreleased]`)

- Committed CodeRabbit repository configuration (`.coderabbit.yaml`) so PR
  review behavior is versioned in-repo instead of living only in a dashboard.
- AutoAssign configuration so new PRs assign the counterpart maintainer
  (`Jah-yee -> Moapacha`, `Moapacha -> Jah-yee`) without duplicating
  CODEOWNERS-based reviewer routing.
- Narrow Markdown `reviewdog` workflow plus `.markdownlint-cli2.yaml` so docs
  get lightweight PR annotations without turning legacy line-length and inline-HTML
  debt into a merge blocker.
- Expanded `reviewdog` to cover ESLint review comments and Prettier suggestion
  comments on changed files; advisory and PR-local, not hard CI gates.

## [0.3.0-alpha.1] — 2026-05-06 — M2 audio sweep and reproducibility gates

This prerelease closes the v0.3 M2 audio line far enough to cut a release
surface: audio has codec-v2 routing, codec-authored manifest evidence,
same-seed parity receipts, an opt-in Kokoro speech backend, and a recorded
sweep verdict. It also tightens the repo's release-facing evidence story:
goldens, cold-checkout receipts, LLM-boundary validation, and CI/supply-chain
gates now back the public claims.

The key audio verdict is intentionally conservative. Kokoro-82M is useful and
same-platform deterministic, but macOS and Linux produce different same-seed
WAV artifact hashes. Therefore `procedural-audio-runtime` remains the v0.3
default speech backend, while Kokoro stays opt-in via
`WITTGENSTEIN_AUDIO_BACKEND=kokoro` and records
`determinismClass: "structural-parity"`.

### Added

- Added the Kokoro-82M family as an opt-in speech decoder backend for the audio
  codec, gated behind `WITTGENSTEIN_AUDIO_BACKEND=kokoro`.
- Added same-seed audio parity/golden tests for speech, soundscape, and music
  routes.
- Added `pnpm sweep:audio-kokoro`, a release-facing receipt script that runs
  three same-seed Kokoro speech renders and records artifact hashes plus
  manifest evidence.
- Added release-facing cold-checkout receipts for the v0.3 truth surface.
- Added CI-gated sensor goldens and training-data lock receipts so the README
  receipts table points at checkable artifacts rather than narrative claims.
- Added benchmark-tool skeletons and generalized `pnpm test:golden` across codec
  packages.
- Added doctrine guardrail coverage for manifest and modality schemas.

### Changed

- Kept the default audio backend procedural after the M2 sweep showed Kokoro is
  same-platform deterministic but not cross-platform byte-identical.
- Updated README and status surfaces around the harness-first thesis and the
  current maturity of image, audio, sensor, SVG, and video outputs.
- Tightened reproducibility and evidence surfaces: README receipts, sensor
  goldens, audio sweep receipts, and cold-checkout verification now point to
  concrete commands or artifacts.
- Isolated `apps/wittgenstein-kimi` from the root `pnpm` workspace (Issue #112).
  The Kimi-flavored agent demo (~7,400 LOC of React / Radix / Vite) now carries
  its own `pnpm-lock.yaml` under `apps/wittgenstein-kimi/`, so its 70+ transitive
  deps no longer enter the core supply-chain audit surface. `vercel.json` and the
  `dev:wittgenstein-kimi` root script switched to direct path-based commands.
  Dependabot gets a separate monthly directory entry for the kimi workspace.

### Fixed

- Fixed the Kokoro opt-in test timeout so local decoder initialization can
  complete before Vitest aborts.
- Fixed the Kokoro integrity-mismatch path so SHA-256 mismatches surface with a
  typed `INTEGRITY_MISMATCH` code.
- Fixed LLM response handling so provider responses are zod-validated at the
  boundary instead of being trusted through TypeScript casts.
- Fixed the polyglot-mini TTS status surface so Linux no longer advertises a
  fictional `edge-tts` fallback.
- Fixed the Kokoro sweep workflow summary so it includes nested manifest
  evidence, not only artifact SHA-256 values.
- Fixed release-gate drift by recording the current v0.3 gate state in an
  explicit roadmap index.
- Aligned top-level onboarding/status docs with the `v0.2.0-alpha.2` pre-M2
  state instead of the older M0/M1A wording.
- Added a top-level research program map that closes the pre-M2 engineering-borrow
  and model/literature research audit without creating new doctrine.
- Reclassified the hackathon launch checklist as an archived historical receipt
  rather than active pre-M2 execution guidance.
- Made `BaseCodec.produce()` validate that a declared route matches before
  running codec phases, and exported `CodecRouteError` for typed route failures.
- Cleaned the lingering sensor-render lint warning so `pnpm lint` is warning-free.
- Repaired frontend build drift found during the final pre-M2 check:
  - `apps/site` now keeps React and `react-dom` on the same React 18 line while
    using Tailwind v4's `@tailwindcss/postcss` plugin.
  - `apps/wittgenstein-kimi` stays on its Tailwind v3 / Vite 7-compatible
    stack instead of half-migrating to Tailwind v4 / Vite 8.

### Verification

- `pnpm install --frozen-lockfile`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm test:golden`
- `pnpm smoke:cli`
- `pnpm sweep:audio-kokoro -- --out artifacts/tmp/kokoro-sweep-final-macos.json`

### Known limits

- Kokoro remains opt-in with `determinismClass: "structural-parity"`; the v0.3
  default speech backend remains `procedural-audio-runtime`.
- Linux/Docker and macOS Kokoro receipts are same-platform stable but produce
  different artifact SHA-256 values across platforms.
- `costUsd` is not yet computed: both LLM adapters return `costUsd: 0`
  regardless of provider/model/tokens. The manifest spine is honest about
  duration, tokens, and artifact hash, but the price column is not a reliable
  benchmark signal yet. Tracked in Issue #182.
- This prerelease does not add neural soundscape, neural music, GPU inference,
  voice cloning, Piper wiring, or a new audio manifest schema.

## [0.2.0-alpha.2] — 2026-04-29 — M2 preflight closure

This prerelease marks the transition from the v0.2 doctrine lock into the
edge of M2 implementation. It is **not** the audio port itself. Instead, it is
the release where the repo becomes decision-complete enough to start the M2
audio codec-v2 port without reopening decoder choice, route-deprecation policy,
or migration framing mid-flight.

In short: M0 and M1A have landed, the audio research layer is complete enough
to ratify, and M2 is now staged as a three-slice implementation train.

### Current stage

- `M0` — codec protocol v2 foundation landed.
- `M1A` — image codec-v2 raster port landed and closed out.
- `M1B` — deferred until a usable LFQ-family decoder line is ready.
- `M2` — audio port is at the **preflight-closed / implementation-ready**
  boundary.
- `M3+` — sensor, cleanup, and benchmark bridge phases remain queued.

### Added — M2 audio research and ratification

- `docs/research/briefs/I_audio_codec_landscape.md` — audio codec landscape
  sweep. Verdict:
  - speech default: `Kokoro-82M-family`
  - fallback: `Piper-family`
  - no audio tokenizer at the v0.3 harness boundary
  - neural soundscape and neural music deferred beyond v0.3
  - reproducibility contract split into CPU byte-parity and GPU structural
    parity
- `docs/research/briefs/J_audio_engineering_and_routes.md` — audio
  engineering brief covering route shape, manifest fields, fixture strategy,
  and route-deprecation policy.
- `docs/research/briefs/M2-route-deprecation-inventory.md` — bounded caller
  inventory for `AudioRequest.route`, CLI `--route`, and request-side
  migration surfaces.
- `docs/adrs/0015-audio-decoder-family.md` — ratifies the audio decoder
  family so M2 no longer depends on a brief-only conclusion.
- `docs/research/m2-implementation-design-2026-04.md` — implementation-facing
  memo for M2 Slice A/B/C. It is explicitly non-doctrine and subordinate to the
  ratified ADR and active execution plan.

### Changed — canonical audio story

- `docs/codecs/audio.md` now treats `Kokoro-82M-family` as the default speech
  decoder and `Piper-family` as the fallback. The old Piper-centered wording is
  no longer canonical.
- `docs/agent-guides/audio-port.md` and
  `docs/exec-plans/active/codec-v2-port.md` now separate locked decisions from
  current best implementation hypotheses:
  - helper extraction first
  - thin route files
  - `BaseAudioRoute` only as a follow-up if genuinely shared-mechanical
    duplication remains above threshold
  - `AudioRequest.route` keeps a one-minor-version soft-deprecation window
- `ROADMAP.md` now reflects ADR-0015: no host-TTS fallback story, no neural
  soundscape/music in v0.3, and audio quality targets based on UTMOS +
  Whisper-WER rather than stale Coqui/Piper wording.

### Added — M0 / M1A execution receipts

- `packages/schemas/src/codec/v2/` — codec protocol v2 schema surface.
- `packages/codec-image/src/codec.ts` and pipeline support — image codec-v2
  port with codec-owned packaging, warning channel, and route/harness
  alignment.
- `packages/core/src/runtime/harness.ts` and registry updates — harness made
  more modality-blind in preparation for the remaining codec-v2 ports.
- Tests for codec-v2 contracts, image round-trip behavior, warning-channel
  behavior, and harness modality-blindness.
- `docs/research/briefs/H_codec_engineering_prior_art.md` and
  `docs/reserve-paths.md` — engineering prior-art and sealed alternatives
  used during M0/M1A execution.

### Added — governance and collaboration hardening

- `docs/labels.md` plus ADR-0012 — label taxonomy is now a documented repo
  contract.
- ADR-0013 — doctrine-bearing PRs require independent ratification; authors do
  not self-review their own doctrine.
- ADR-0014 — governance changes now use their own lane:
  `(optional Governance Note) → ADR → inline summary`.
- `docs/archive-policy.md` — preserves historical reasoning without keeping
  old notes on the active decision path.
- `docs/research/research-system-audit-2026-04.md` — local-first audit of the
  research-note to brief/RFC/ADR conversion path.
- First-contact docs (`README.md`, `PROMPT.md`, `AGENTS.md`,
  `docs/contributor-map.md`) now point contributors toward the engineering and
  governance lanes instead of burying process rules in chat history.

### Added — automation and repo hygiene

- Path-based PR labeling and issue-title labeling.
- Doctrine guardrail workflow: PRs touching doctrine-bearing surfaces without
  an ADR get a non-blocking reminder.
- Monthly markdown link checker.
- Additional issue templates for discussion, horizon spikes, trackers, and
  governance notes.
- `CODEOWNERS` coverage expanded to doctrine surfaces.
- GitHub org links updated from the old `wittgenstein-cli` namespace to
  `p-to-q`.

### Fixed

- Closed the M2 preflight drift where audio docs implied a settled
  `BaseAudioRoute` shape before implementation evidence existed.
- Closed the audio decoder-family gap: Brief I now feeds ADR-0015 instead of
  remaining only a research verdict.
- Removed stale `Coqui XTTS or Piper` / host-TTS fallback phrasing from
  canonical roadmap guidance.
- Preserved useful research signals from closed or superseded PRs in issues
  instead of leaving them hidden in stale branches.

### Not included

- No M2 runtime implementation yet.
- No fourth audio route.
- No neural soundscape or neural music path in v0.3.
- No audio tokenizer at the v0.3 harness boundary.
- No hard removal of `AudioRequest.route` or CLI `--route`; M2 will introduce
  compatibility warnings first.

### Next

The next implementation line is **M2 Slice A**:

- make `AudioCodec` own route dispatch
- thin the harness-side audio branch
- keep public CLI behavior intact
- defer helper collapse, manifest authorship, warnings, and parity tests to
  later M2 slices

Slice A should use ADR-0015 and
`docs/research/m2-implementation-design-2026-04.md` as its controlling
preflight surfaces.

## [0.2.0-alpha.1] — 2026-04-25 — v0.2 doctrine lock (pre-launch)

Doctrine lock for v0.2. **No code changes** — this cut is the paper
trail that the next phase (P6 — codec-v2 port, M0→M5b) executes
against. Tagged as a pre-launch so contributors can reference a stable
SHA for the doctrine surface while M0/M1 work begins on top of it.

### Added — Foundational

- `docs/THESIS.md` — smallest locked statement of the project
- `docs/inheritance-audit.md` — keep / promote / revise / retire ledger
- `docs/glossary.md` — locked vocabulary (Harness / Codec / Spec / IR /
  Decoder / Adapter / Packaging) per ADR-0011
- `docs/tracks.md` — Researcher / Hacker dual-track contract
- `docs/contributor-map.md` — onboarding map for humans + agents
- `docs/SYNTHESIS_v0.2.md` — end-of-phase rollup
- `docs/v02-alignment-review.md`, `docs/v02-final-audit.md` — audit ledgers

### Added — Research briefs (`docs/research/briefs/`)

- `A_vq_vlm_lineage_audit.md` — VQ / VLM lineage 2026 refresh
- `B_compression_vs_world_models.md` — Ilya ↔ LeCun position
- `C_unproven_horizon.md` — v0.3 horizon scan
- `D_cli_and_sdk_conventions.md` — CLI / SDK conventions audit
- `E_benchmarks_v2.md` — per-modality quality benchmarks
- `F_site_reconciliation.md` — site ↔ repo reconciliation
- `G_image_network_clues.md` — image decoder / data / packaging
  (M1 prerequisite, Draft v0.1)

### Added — RFCs (`docs/rfcs/`)

- `0001-codec-protocol-v2.md` — `Codec<Req, Art>.produce` primitive
  (🟢 ratified by ADR-0008)
- `0002-cli-ergonomics.md` — CLI v2 (🟢 ratified by ADR-0009)
- `0003-naming-pass.md` — ⛔ superseded by RFC-0005
- `0004-site-reconciliation.md` — site rewrite plan
- `0005-naming-lock-v2.md` — naming v2 (🟢 ratified by ADR-0011)

### Added — ADRs (`docs/adrs/`)

- `0006-layered-epistemology.md` — verdict of brief B
- `0007-path-c-rejected.md` — Chameleon-style retrain rejected through v0.4
- `0008-codec-protocol-v2-adoption.md` — ratifies RFC-0001
- `0009-cli-ergonomics-v2.md` — ratifies RFC-0002
- `0010` — ⛔ superseded by ADR-0011
- `0011-naming-locked.md` — naming v2 locked

### Added — Execution

- `docs/exec-plans/active/codec-v2-port.md` — live P6 plan, M0→M5b,
  image-first execution order
- `docs/agent-guides/` — prompt-ready execution briefs
  (`image-to-audio-port.md`, `audio-port.md`, `sensor-port.md`)
- `docs/exec-plans/archive/` — historical day-1 fragments with
  subsumption notes

### Added — Engineering discipline

- `.claude/AGENT_PROMPT.md` — agent orientation (locked vocabulary,
  read-before-write, escalation rules)
- `docs/engineering-discipline.md` — working standards fused from
  Jah-yee/cursor-rules, specialised for Wittgenstein

### Changed

- `AGENTS.md` — leads with `.claude/AGENT_PROMPT.md` and
  `docs/engineering-discipline.md` before doctrine; locked-constraints
  section refreshed against v0.2 vocabulary
- `docs/hard-constraints.md` — rewritten from 9-line stub to canonical
  v0.2 constraint pack (architecture / runtime / packages / process /
  out-of-scope)
- `docs/codecs/audio.md` — rewritten with per-route decoder rationale,
  failure modes, honest risk statement
- `docs/codecs/sensor.md` — rewritten as no-L4 confirmation case;
  byte-for-byte parity required
- `docs/codecs/video.md` — marked 🔴 stub awaiting post-v0.3 M-slot
- `docs/index.md` — surfaces THESIS, briefs A–G, RFCs 0001–0005,
  ADRs 0006–0011, agent-guides, codec-v2-port
- `README.md` — doc-pack expanded with contributor-map, glossary,
  tracks, agent-guides, RFCs, ADRs

### Maintenance

- Repo migrated to `p-to-q/wittgenstein` org;
  changelog compare links updated accordingly
- `.github/dependabot.yml` — github-actions updates grouped to reduce
  PR noise
- `.github/workflows/release.yml` — tag-driven GitHub Release with
  CHANGELOG-section body; `-alpha`/`-beta`/`-rc`/`-pre` versions
  auto-marked as prerelease
- `.github/workflows/auto-merge-dependabot.yml` — auto-squash-merge
  Dependabot PRs that are minor/patch or grouped, after required
  checks pass. Major-version bumps still require human review.

### Changed — CI hygiene

- `.github/workflows/ci.yml` split into `verify-code` (full Node +
  Python suite) and `verify-docs` (prettier-only fast lane), gated by
  `dorny/paths-filter` so docs-only PRs no longer pay for the full
  Node + Python verify. Pattern: pre-launch had been merging on red
  because docs PRs always tripped CI on irrelevant signal; the new
  shape gives green-on-green on docs-only changes in &lt;30s and full
  validation on code touches.
- `.prettierrc` — added `proseWrap: "preserve"` so prose markdown is
  no longer reflowed (was the recurring source of red docs CI).
- `format:check:maintained` — dropped `docs/research/briefs/**/*.md`
  from the prettier glob; briefs are prose, not config.

## [0.1.0-alpha.2] — 2026-04-20 — Early-adopter polish

Second prerelease. No API surface changes; this cut is about making the project
**legible and welcoming to early adopters and contributors** before we keep moving.

### Added

- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1 summary with project-specific notes
- `SUPPORT.md` — where to ask what, expected response times, how to file an effective issue
- `.github/ISSUE_TEMPLATE/question.md` — low-friction "how do I..." template
- `.github/ISSUE_TEMPLATE/experimental-feedback.md` — explicit channel for feedback on
  ⚠️ Partial / 🔴 Stub surfaces, the signal we most want right now
- `.github/ISSUE_TEMPLATE/config.yml` — disables blank issues, surfaces SUPPORT.md and the
  implementation-status matrix before new issues are filed
- README sections:
  - **Project status** banner at the top (early-stage, prerelease, breaking changes possible)
  - **Experimental surfaces** table with honest disclosure of ⚠️/🔴 items
  - **How to help** — three scoped paths from "try quickstart and tell us" to "own a surface"
  - Release and Status badges, plus PRs-welcome badge

### Changed

- `README.md` — adds status banner, experimental-surfaces table, how-to-help section,
  docs-map entries for `CONTRIBUTING.md` and `SUPPORT.md`; badge set updated to include
  Release and Status; Node version badge corrected to 20.19
- `CONTRIBUTING.md` — rewritten for early contributors: first-time setup (both surfaces),
  "where to start" table by difficulty, explicit branch workflow with fork-sync instructions,
  experimental-vs-shipping rules, docs-only fast-path
- `.github/PULL_REQUEST_TEMPLATE.md` — friendlier tone, surface checkboxes, separate section
  for experimental/RFC PRs, reminder to update `docs/implementation-status.md` when adding
  new ⚠️/🔴 surfaces
- `.github/ISSUE_TEMPLATE/bug.md` — asks for surface, environment versions, and the
  run manifest (single most useful debug artifact)
- `.github/ISSUE_TEMPLATE/feature.md` — five-layer checklist, hard-constraint confirmation,
  willingness-to-contribute signal
- `benchmarks/README.md` — explicit ⚠️ banner clarifying that today's quality scores are
  structural proxies, not research-grade metrics

### Fixed

- Synced fork `origin/main` (Jah-yee) to `upstream/main` (Moapacha) — was 402 files behind
- Deleted three merged / superseded remote branches on the fork:
  `chore/repo-root-wittgenstein`, `feat/foundation-framework`,
  `docs/root-docs-readme-changelog`

### Removed

- `.claude/skills/site-clone/`, `.codex/skills/site-clone/`, `.cursor/commands/site-clone.md`
  — generic website-cloning skill files, unrelated to Wittgenstein
- `Kimi_Agent_克隆 aquin/` (91 files, ~6.8 MB) — standalone Vite app unrelated to the project
- `DESIGN.md` (20 KB) — Claude design-system notes used as input for the removed
  site-clone skill; not referenced by any Wittgenstein doc or code path
- `research/chat2svg-lora/__pycache__/` — Python bytecode cache, never belongs in git
- `.gitignore` hardened: `.claude/`, `.codex/`, `.cursor/`, `**/__pycache__/`, `**/*.pyc`
  added so these categories do not leak back

### Maintenance

- Root `package.json` version bumped `0.0.0` → `0.1.0-alpha.2` to match the tag

## [0.1.0-alpha.1] — 2026-04-20 — Early Preview

First public prerelease before the formal `0.1.0` cut. This snapshot is the current
verified stage build: enough of the system ships to produce real files, benchmark dry
runs, and exercise the core harness contracts, while the neural image decoder bridge and
video renderer remain intentionally incomplete.

### Added

- TypeScript monorepo (`packages/*`) with pnpm workspaces, strict mode, project references
- `@wittgenstein/schemas` — shared zod codec contract, `RunManifest`, `Modality`
- `@wittgenstein/core` — harness runtime with routing, retry, budget, telemetry, manifest spine, seed control
- `@wittgenstein/codec-image` — neural codec skeleton: LLM → JSON scene spec → adapter → frozen decoder → PNG
- `@wittgenstein/codec-audio` — speech, soundscape, music routes with ambient layering
- `@wittgenstein/codec-sensor` — deterministic operator-spec signal generation + loupe HTML dashboard
- `@wittgenstein/codec-video` — composition IR scaffold
- `@wittgenstein/cli` — `wittgenstein` command with init, image, audio, tts, video, sensor, doctor subcommands
- `polyglot-mini/` — Python rapid-prototype surface implementing the same five layers end-to-end
- `loupe.py` — zero-dependency CSV/JSON → self-contained interactive HTML dashboard
- `apps/site/` — Next.js 14 App Router site scaffold
- `.github/workflows/ci.yml` — install, lint, typecheck, test on push and PR
- Apache 2.0 license
- `docs/research/vq-tokens-as-interface.md` — core design note explaining why discrete VQ tokens are the chosen LLM–decoder interface
- `docs/implementation-status.md` — honest Ships / Partial / Stub matrix across Python + TS surfaces
- `docs/quickstart.md` — 30-second tour producing real files (sensor, audio, image paths)
- `docs/extending.md` — concrete recipes for adding codecs and adapters in both surfaces
- `CHANGELOG.md`, `ROADMAP.md`, `SECURITY.md` at repo root
- Baseline results table in `benchmarks/README.md` (dry-run 2026-04)
- Adapter training baselines: image style MLP (781 COCO examples, 9 s, val BCE 0.7698) and audio ambient classifier (369 examples, < 5 s)

### Changed

- Root `README.md` — restructured for engineer / hacker / researcher readability; receipts table; two-surface positioning; extensibility section
- `docs/benchmark-standards.md` — full measurement protocol, per-modality quality-proxy scoring breakdown, real measured baselines
- Research notes (`compression-view-of-llms.md`, `frozen-llm-multimodality.md`, `neural-codec-references.md`) rewritten from stubs to full arguments with citations
- `polyglot-mini/README.md` — explicit five-layer mapping, precise MLP architecture numbers, provider routing table, decoder ≠ generator section
- `.env.example` — added LLM provider keys (Moonshot / MiniMax / OpenAI / Anthropic)
- `packages/codec-sensor/src/render.ts` — promoted dynamic imports to static top-level; hoisted `__dir` to module scope
- `polyglot-mini/train/train.py` and `train_audio.py` — suppress numpy overflow / divide-by-zero RuntimeWarnings during training

### Fixed

- Deleted stale merged branches `chore/repo-root-wittgenstein` and `feat/foundation-framework`
- Removed pointless `.gitkeep` at repo root and empty legacy `train/` directory

### Locked

- Image has exactly one path: `LLM → JSON scene → adapter → frozen decoder → PNG`
- No diffusion generators, no SVG/HTML/Canvas fallbacks for image
- Every run writes a manifest under `artifacts/runs/<id>/`
- Shared contracts live in `@wittgenstein/schemas`; codec packages depend on schemas, not each other

[Unreleased]: https://github.com/p-to-q/wittgenstein/compare/v0.3.0-alpha.1...HEAD
[0.3.0-alpha.1]: https://github.com/p-to-q/wittgenstein/compare/v0.2.0-alpha.2...v0.3.0-alpha.1
[0.2.0-alpha.2]: https://github.com/p-to-q/wittgenstein/compare/v0.2.0-alpha.1...v0.2.0-alpha.2
[0.2.0-alpha.1]: https://github.com/p-to-q/wittgenstein/compare/v0.1.0-alpha.2...v0.2.0-alpha.1
[0.1.0-alpha.2]: https://github.com/p-to-q/wittgenstein/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/p-to-q/wittgenstein/releases/tag/v0.1.0-alpha.1
