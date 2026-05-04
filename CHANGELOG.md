# Changelog

All notable changes to Wittgenstein are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Isolated `apps/wittgenstein-kimi` from the root `pnpm` workspace (Issue #112).
  The Kimi-flavored agent demo (~7,400 LOC of React / Radix / Vite) now carries
  its own `pnpm-lock.yaml` under `apps/wittgenstein-kimi/`, so its 70+ transitive
  deps no longer enter the core supply-chain audit surface. `vercel.json` and the
  `dev:wittgenstein-kimi` root script switched to direct path-based commands.
  Dependabot gets a separate monthly directory entry for the kimi workspace.

### Fixed

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

[Unreleased]: https://github.com/p-to-q/wittgenstein/compare/v0.2.0-alpha.2...HEAD
[0.2.0-alpha.2]: https://github.com/p-to-q/wittgenstein/compare/v0.2.0-alpha.1...v0.2.0-alpha.2
[0.2.0-alpha.1]: https://github.com/p-to-q/wittgenstein/compare/v0.1.0-alpha.2...v0.2.0-alpha.1
[0.1.0-alpha.2]: https://github.com/p-to-q/wittgenstein/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/p-to-q/wittgenstein/releases/tag/v0.1.0-alpha.1
