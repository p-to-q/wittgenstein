# Docs Index

The current doctrine surface for v0.2. Read top-to-bottom for an onboarding pass; jump in by section after that. The order below matches what `AGENTS.md` and `docs/contributor-map.md` recommend.

## For agents and maintainers: Start here first

Read these two files before any task:

- [`../PROMPT.md`](../PROMPT.md) — public agent handoff prompt (what the project is, how to find information, exact working discipline)
- [`engineering-discipline.md`](engineering-discipline.md) — working standards (code style, robustness, testing, reporting, constraints)
- [`archive-policy.md`](archive-policy.md) — how to decide delete vs archive vs refresh vs reclassify when old files drift

For doctrine-bearing PRs, also remember the review rule now locked in `engineering-discipline.md`: authoring a PR does not count as ratifying it; a second independent review pass is required before merge.

## Then understand the thesis and governance

- [`THESIS.md`](THESIS.md) — smallest locked statement of the project
- [`tracks.md`](tracks.md) — Researcher / Hacker dual-track contract
- [`contributor-map.md`](contributor-map.md) — onboarding map for humans + agents
- [`glossary.md`](glossary.md) — locked vocabulary in one page
- [`inheritance-audit.md`](inheritance-audit.md) — keep / promote / revise / retire table
- [`v02-final-audit.md`](v02-final-audit.md) — pre-lock decision ledger

## Architecture and constraints

- [`architecture.md`](architecture.md) — L1–L5 layered architecture
- [`build-philosophy.md`](build-philosophy.md)
- [`hard-constraints.md`](hard-constraints.md) — non-negotiables (no silent fallback, decoder ≠ generator, etc.)
- [`codec-protocol.md`](codec-protocol.md) — v0.1 protocol surface (v2 lives in RFC-0001)
- [`reproducibility.md`](reproducibility.md) — manifest spine and replay contract
- [`team-split.md`](team-split.md)
- [`distribution.md`](distribution.md)
- [`product-spec.md`](product-spec.md)
- [`technical-details-script.md`](technical-details-script.md)

## Codecs

- [`codecs/image.md`](codecs/image.md) — sole shipping image path; M1 target
- [`codecs/audio.md`](codecs/audio.md) — three routes (speech / soundscape / music); M2 target
- [`codecs/sensor.md`](codecs/sensor.md) — confirmation case (no L4 adapter); M3 target
- [`codecs/svg.md`](codecs/svg.md)
- [`codecs/video.md`](codecs/video.md) — 🔴 stub; awaits its own M-slot post-v0.3

## Research briefs

- [`research/briefs/README.md`](research/briefs/README.md) — index, status legend, four-station methodology
- [`research/briefs/A_vq_vlm_lineage_audit.md`](research/briefs/A_vq_vlm_lineage_audit.md) — VQ / VLM lineage 2026 refresh
- [`research/briefs/B_compression_vs_world_models.md`](research/briefs/B_compression_vs_world_models.md) — Ilya ↔ LeCun stance (critical-path)
- [`research/briefs/C_unproven_horizon.md`](research/briefs/C_unproven_horizon.md) — horizon scan (v0.3 roadmap input)
- [`research/briefs/D_cli_and_sdk_conventions.md`](research/briefs/D_cli_and_sdk_conventions.md) — CLI / SDK conventions
- [`research/briefs/E_benchmarks_v2.md`](research/briefs/E_benchmarks_v2.md) — per-modality quality benchmarks
- [`research/briefs/F_site_reconciliation.md`](research/briefs/F_site_reconciliation.md) — site ↔ repo reconciliation
- [`research/briefs/G_image_network_clues.md`](research/briefs/G_image_network_clues.md) — image decoder / data / packaging (M1 prerequisite)
- [`research/briefs/H_codec_engineering_prior_art.md`](research/briefs/H_codec_engineering_prior_art.md) — codec protocol prior art; F1/F2 RFC-0001 amendments (M1A prerequisite)
- [`research/briefs/I_audio_codec_landscape.md`](research/briefs/I_audio_codec_landscape.md) — M2 TTS decoder family selection + reproducibility verdict (feeds ADR-0015)
- [`research/briefs/J_audio_engineering_and_routes.md`](research/briefs/J_audio_engineering_and_routes.md) — M2 route shape, manifest rows, fixture strategy, and deprecation contract

## Long-form research notes (predate the briefs)

- [`research/compression-view-of-llms.md`](research/compression-view-of-llms.md)
- [`research/frozen-llm-multimodality.md`](research/frozen-llm-multimodality.md)
- [`research/neural-codec-references.md`](research/neural-codec-references.md)
- [`research/vq-tokens-as-interface.md`](research/vq-tokens-as-interface.md)

## RFCs

- [`rfcs/README.md`](rfcs/README.md) — RFC process and template
- [`rfcs/0001-codec-protocol-v2.md`](rfcs/0001-codec-protocol-v2.md) — Codec Protocol v2 (🟢 ratified by ADR-0008)
- [`rfcs/0002-cli-ergonomics.md`](rfcs/0002-cli-ergonomics.md) — CLI ergonomics (🟢 ratified by ADR-0009)
- [`rfcs/0003-naming-pass.md`](rfcs/0003-naming-pass.md) — ⛔ superseded by RFC-0005
- [`rfcs/0004-site-reconciliation.md`](rfcs/0004-site-reconciliation.md) — site rewrite plan
- [`rfcs/0005-naming-lock-v2.md`](rfcs/0005-naming-lock-v2.md) — naming v2 (🟢 ratified by ADR-0011)

## ADRs

- [`adrs/README.md`](adrs/README.md)
- 0001–0005 — pre-v0.2 record-keeping, monorepo, L1–L5 foundation, neural codec, decoder ≠ generator
- 0006 layered epistemology · 0007 Path C rejected · 0008 codec v2 adoption · 0009 CLI v2 · 0010 ⛔ superseded · 0011 naming v2 locked

## Execution plans

- [`exec-plans/README.md`](exec-plans/README.md)
- [`exec-plans/active/codec-v2-port.md`](exec-plans/active/codec-v2-port.md) — the live P6 plan (M0 → M5b)
- [`exec-plans/archive/README.md`](exec-plans/archive/README.md) — historical day-1 fragments
- [`reserve-paths.md`](reserve-paths.md) — design alternatives considered for a phase and shelved (📦 sealed, not on any active plan)

## Agent guides (prompt-ready execution briefs)

- [`agent-guides/README.md`](agent-guides/README.md)
- [`agent-guides/image-to-audio-port.md`](agent-guides/image-to-audio-port.md) — cross-line context (M0–M2)
- [`agent-guides/image-port.md`](agent-guides/image-port.md) — image line, M1A
- [`agent-guides/audio-port.md`](agent-guides/audio-port.md) — audio line, M2
- [`agent-guides/sensor-port.md`](agent-guides/sensor-port.md) — sensor line, M3

## Launch & benchmarks

- [`hackathon-launch.md`](hackathon-launch.md) — launch checklist and demo script
- [`benchmark-standards.md`](benchmark-standards.md) — quality bar and acceptance criteria
- [`modality-launch-surface.md`](modality-launch-surface.md) — per-modality external API surface
- [`implementation-status.md`](implementation-status.md) — what ships now vs typed stub

## Synthesis and alignment

- [`SYNTHESIS_v0.2.md`](SYNTHESIS_v0.2.md) — end-of-phase rollup
- [`v02-alignment-review.md`](v02-alignment-review.md) — first-pass drift review (2026-04-24)
- [`v02-final-audit.md`](v02-final-audit.md) — pre-lock audit ledger (2026-04-25)

## Extended primers (long-form)

- [`../packages/agent-contact-text/README.md`](../packages/agent-contact-text/README.md) — `00–03` agent context corpus
- [`references/README.md`](references/README.md)
- [`references/01_Build_Book.md`](references/01_Build_Book.md)
- [`references/02_AI_Execution_Context.md`](references/02_AI_Execution_Context.md)
- [`references/03_Research_Reference_Dossier.md`](references/03_Research_Reference_Dossier.md)
