# AGENTS.md

Wittgenstein is a harness-first multimodal repo. The LLM is the planner; the runtime in this repo is the operating system. Do not treat prompts as the source of truth when a contract can be written as code or docs.

## Thesis

Wittgenstein turns text-first LLMs into systems that emit real files through codecs:

- L1 Harness / Runtime: routing, schema injection, retry, budget, telemetry, sandbox, invariants.
- L2 IR / Codec: one structured IR per modality.
- L3 Renderer / Decoder: deterministic renderer or frozen decoder turns IR into a file.
- L4 Optional Adapter: a small learned translator when a decoder needs a latent-code bridge.
- L5 Packaging / Distribution: CLI, docs, install, agent primers, artifact conventions.

Read [`docs/architecture.md`](docs/architecture.md) before changing structure.

## Locked Constraints

- Image has exactly one shipping path: `LLM -> structured JSON scene -> adapter -> frozen decoder -> PNG`.
- There is no **raster image** fallback in this scaffold. No SVG-as-PNG, HTML, Canvas, or painter tier for the image codec.
- A separate **`svg` modality** (`packages/codec-svg`) targets vector output via a local grammar-constrained engine (`research/chat2svg-lora/`); it is not an image-path escape hatch.
- Decoder is not generator. Frozen pretrained decoders are allowed; diffusion and text-to-image generators are out of scope.
- Every run must be traceable in `artifacts/runs/<run-id>/`.
- Shared contracts live in `packages/schemas`; codec packages should depend on schemas, not on each other.

## Repo Map

- `packages/agent-contact-text/` — extended agent primers (`00_INDEX`, Build Book, execution context, research dossier); read [`packages/agent-contact-text/README.md`](packages/agent-contact-text/README.md) after this file when you need depth
- `packages/schemas/` — shared zod schemas, `WittgensteinCodec`, `RunManifest`
- `packages/core/` — registry, router, harness, config, retry, budget, seed, telemetry
- `packages/sandbox/` — reserved untrusted-code boundary
- `packages/codec-image/` — sole neural image codec
- `packages/codec-audio/` — speech / soundscape / music codec routes
- `packages/codec-video/` — video composition IR + HyperFrames wrapper stub
- `packages/codec-sensor/` — procedural signal IR + deterministic signal stubs
- `packages/codec-svg/` — SVG IR (`{"svg": "..."}`) + deterministic write; generation is delegated to the grammar engine HTTP contract
- `packages/cli/` — `wittgenstein` entrypoint and subcommands
- `apps/site/` — official site app
- `docs/` — system of record

## Working Rules

- Schema-first: every external boundary gets a zod schema.
- Fail loudly: use structured errors, not magic strings.
- Keep package boundaries clean: `schemas` has no runtime logic; codecs do not own harness code.
- If output semantics change, update docs and goldens together.
- Put future architectural choices in ADRs instead of burying them in PR text.
- When in doubt, prefer traceability over convenience.

## Read Order

<!-- prettier-ignore-start -->
**Start here for any task:**
0. [`PROMPT.md`](PROMPT.md) — public agent handoff prompt: what you are, where to find answers, how to work here
1. [`docs/engineering-discipline.md`](docs/engineering-discipline.md) — code style, robustness, testing, reporting standards

**Then context:**
2. [`docs/THESIS.md`](docs/THESIS.md) — smallest locked statement
3. [`docs/hard-constraints.md`](docs/hard-constraints.md) — what will not change
4. [`docs/build-philosophy.md`](docs/build-philosophy.md)
5. [`docs/codec-protocol.md`](docs/codec-protocol.md)
6. [`docs/reproducibility.md`](docs/reproducibility.md)

**Then decision records:**
7. [`docs/tracks.md`](docs/tracks.md)
8. [`docs/rfcs/README.md`](docs/rfcs/README.md)
9. [`docs/adrs/README.md`](docs/adrs/README.md)

**Then research and execution:**
10. [`docs/research/briefs/README.md`](docs/research/briefs/README.md)
11. [`docs/exec-plans/active/codec-v2-port.md`](docs/exec-plans/active/codec-v2-port.md) — the live P6 plan
12. [`docs/codecs/`](docs/codecs/) — per-modality docs (image.md, audio.md, sensor.md)
13. [`docs/agent-guides/`](docs/agent-guides/) — port recipes and implementation briefs
<!-- prettier-ignore-end -->

**Optional depth:**

- [`packages/agent-contact-text/README.md`](packages/agent-contact-text/README.md) + context corpus for long-form context
- [`docs/team-split.md`](docs/team-split.md)

## Do Not Do

- Do not add a second image path as a “temporary fallback”.
- Do not hide modality contracts in prompt prose only.
- Do not write artifacts outside `artifacts/` unless the CLI command explicitly asks for an output path.
- Do not bypass the manifest spine for “quick experiments”.

---

## Post-lock addendum — v0.2 doctrine deltas

> Everything above this line is the original hackathon-era agent primer and is preserved for continuity. The notes below are the deltas from the v0.2 doctrine lock (`v0.2.0-alpha.1`, 2026-04-25). When the two disagree, **this section wins** — but check both, because most of the original guidance is still correct.

### Locked vocabulary (ADR-0011 — supersedes the L1–L5 names above)

| Term          | Layer | Meaning                                                                                            |
| ------------- | ----- | -------------------------------------------------------------------------------------------------- |
| **Harness**   | L1    | Routing, retry, seed, validate, budget, record                                                     |
| **Codec**     | L2    | Modality implementation (owns schema + render)                                                     |
| **Spec**      | L2    | Structured artifact (`ImageSceneSpec`, `AudioPlan`, …)                                             |
| **IR**        | L3    | Internal representation; sum type `Text \| Latent \| Hybrid`; **only `Text` is inhabited at v0.2** |
| **Decoder**   | L3    | IR → bytes; frozen, deterministic, never generative (ADR-0005)                                     |
| **Adapter**   | L4    | Learned bridge (Spec → latent); optional, image only today                                         |
| **Packaging** | L5    | CLI · npm · manifests · install (was “Distribution” above)                                         |

The RFC-0003 alternatives (Loom / Transducer / Score / Handoff) were rejected. Use the table above. Full reference: [`docs/glossary.md`](docs/glossary.md).

### Constraint deltas (additions to the "Locked Constraints" section above)

- **Codec Protocol v2 is the only codec contract.** Every codec implements `Codec<Req, Art>.produce`. The harness does **not** branch on modality. Source: [`docs/rfcs/0001-codec-protocol-v2.md`](docs/rfcs/0001-codec-protocol-v2.md), ratified by [ADR-0008](docs/adrs/0008-codec-protocol-v2-adoption.md).
- **Path C rejected through v0.4.** No Chameleon / LlamaGen-style fused multimodal retrain. Base model stays text-only. ([ADR-0007](docs/adrs/0007-path-c-rejected.md))
- **The "no raster fallback" rule above applies to the TS `codec-image` core path only.** The `polyglot-mini` Python image code-as-painter sandbox is a documented ⚠️ Research-grade surface (see `README.md` "Experimental surfaces" + [`SECURITY.md`](SECURITY.md)). It is not a TS escape hatch and does not contradict the rule.
- **Manifest spine is non-negotiable.** Every run writes git SHA, lockfile hash, seed, full LLM I/O, and artifact SHA-256. No silent fallbacks; failures return structured errors with a manifest. Canonical: [`docs/hard-constraints.md`](docs/hard-constraints.md).

### Repo Map deltas

- `packages/codec-asciipng/` — ASCII-PNG codec (added after the original map was written)
- `apps/presentation/` — slide deck app (Hackathon launch + v0.2 narrative)
- `apps/wittgenstein-kimi/` — Kimi-flavored agent demo
- `docs/exec-plans/active/` — live execution plans (M0 → M5b lives here)
- `docs/agent-guides/` — per-port execution briefs (audio, sensor, image-to-audio)
- `docs/rfcs/` and `docs/adrs/` — engineering decisions and ratified records
- `docs/research/briefs/` — four-station research briefs (A–H)

### Read Order — v0.2 supplement

The original Read Order is still valid as a depth path. Before that, an agent landing on this repo cold should read these **first**, in order:

1. [`docs/THESIS.md`](docs/THESIS.md) — the smallest locked statement page
2. [`docs/glossary.md`](docs/glossary.md) — locked vocabulary (the table above)
3. [`docs/contributor-map.md`](docs/contributor-map.md) — onboarding map (humans + agents)
4. [`docs/hard-constraints.md`](docs/hard-constraints.md) — what will not change (canonical, supersedes the bullets above)
5. [`docs/exec-plans/active/codec-v2-port.md`](docs/exec-plans/active/codec-v2-port.md) — the live P6 plan; M0 is the active migration target
6. [`docs/inheritance-audit.md`](docs/inheritance-audit.md) — what survived / was promoted / was retired in the v0.2 lock
7. [`docs/SYNTHESIS_v0.2.md`](docs/SYNTHESIS_v0.2.md) — branch-level merge brief
8. [`docs/v02-final-audit.md`](docs/v02-final-audit.md) — pre-lock decision ledger

Then return to the original Read Order above for engineering discipline, codec protocol, and per-modality depth.

### What's currently active

- **Doctrine:** locked at v0.2.0-alpha.1.
- **Code:** Codec Protocol v2 port — sequenced **M0 image → M1 image refinement → M2 audio → M3 sensor → M4 video stub → M5a/b benchmarks**. M0 is the first migration target.
- **Out of scope until M5b:** new modalities, diffusion samplers, trained model weights, website rewrite, RFC-0003 renaming.

### Claude-specific style and working rules

This file is vendor-neutral. `PROMPT.md` is the public, repo-tracked agent entrypoint. If you are running under Claude Code and a local `.claude/AGENT_PROMPT.md` overlay exists in your checkout, layer it on top for Claude-specific working rules and reporting preferences.
