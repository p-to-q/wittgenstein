# Agent contact text

This package holds **extended narrative context** for coding agents and human operators. It does **not** replace the short, normative docs at the monorepo root—those stay authoritative for implementation decisions.

## Canonical vs. extended

| Tier                        | Where                                                                                                                                                                                                                        | Role                                                                                                     |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Primary**                 | [`AGENTS.md`](../../AGENTS.md), [`docs/engineering-discipline.md`](../../docs/engineering-discipline.md), [`docs/architecture.md`](../../docs/architecture.md), [`docs/hard-constraints.md`](../../docs/hard-constraints.md) | Locked rules, edit discipline, repo map, where code must live                                            |
| **System of record**        | [`docs/`](../../docs/)                                                                                                                                                                                                       | ADRs, codec contracts, reproducibility, exec plans                                                       |
| **Extended (this package)** | `00_INDEX.md` … `03_*.md`                                                                                                                                                                                                    | Build book, execution mindset, research dossier—depth for agents that need project history and rationale |

When instructions conflict, **trust `AGENTS.md`, `docs/engineering-discipline.md`, and `docs/` first**.

## Architecture (coding-agent view)

Wittgenstein is a **five-layer modality harness**: the LLM plans in text; the repo runtime turns structured IR into **real files** (PNG, audio, video, sensor JSON) via codecs and deterministic or frozen decoders.

1. **L1 Harness / Runtime** — `packages/core`, `packages/sandbox`: routing, config, retry, budget, manifests, telemetry. Every run should leave traces under `artifacts/runs/<run-id>/`.
2. **L2 IR / Codec** — `packages/schemas`, `packages/codec-*`: zod-validated IR per modality; codecs implement `WittgensteinCodec`.
3. **L3 Renderer / Decoder** — pipelines inside each codec package turn IR into bytes on disk (image path: scene JSON → adapter → frozen decoder → PNG).
4. **L4 Adapter (optional)** — small learned bridges when a decoder needs latent alignment (`codec-image` adapter pipeline).
5. **L5 Packaging** — `packages/cli` (`wittgenstein` CLI), `apps/site`, install scripts, **this package** for long-form agent primers.

**Non-negotiables (scan before refactors):** single image pipeline (no SVG/HTML Canvas “fallback” in this scaffold), decoder allowed / generator posture per ADRs, schema-first boundaries, manifests on success and failure.

## Contents of this package

| File                                                                     | Purpose                                              |
| ------------------------------------------------------------------------ | ---------------------------------------------------- |
| [`00_INDEX.md`](./00_INDEX.md)                                           | Delivery index / map of the reference set            |
| [`01_Build_Book.md`](./01_Build_Book.md)                                 | Full build book (product and technical narrative)    |
| [`01_Build_Book.docx`](./01_Build_Book.docx)                             | Same as Word source (optional)                       |
| [`02_AI_Execution_Context.md`](./02_AI_Execution_Context.md)             | How agents should behave in this codebase day to day |
| [`03_Research_Reference_Dossier.md`](./03_Research_Reference_Dossier.md) | Research-backed reference notes                      |

Shorter mirrors of some reference material also exist under [`docs/references/`](../../docs/references/) for inline reading next to implementation docs; the **00–03 set here is the bundled “agent contact” corpus**.

## Suggested read order (agent)

1. [`AGENTS.md`](../../AGENTS.md) — rules and repo map (short).
2. [`docs/engineering-discipline.md`](../../docs/engineering-discipline.md) — how to inspect, change, validate, and report here.
3. [`docs/architecture.md`](../../docs/architecture.md) — layer table and dataflow.
4. This package: `02_AI_Execution_Context.md` → `00_INDEX.md` → skim `01_*` / `03_*` as needed for depth.
