# Thesis

> **Wittgenstein is the modality harness for text-first models.**

This document is the smallest, most-linked page in the repo. Everything else — architecture, codecs, roadmap, RFCs — is downstream of what is locked here.

## Master statement (locked)

Wittgenstein is the modality harness for text-first models. It assumes the frontier model is, and will remain, a text-native planner. Modality capability — image, audio, video, sensor, … — is added *outside* the model, through a portable harness layer that the model does not need to be retrained to use.

## Extension form (locked wording; phrasing may evolve)

Harness as multi-modal middleware. Defer modality training to the portability layer. Use small post-training (adapters) plus rule-based codecs to give text-only LLMs multimodal output capability. The LLM plans in symbols; the codec turns symbols into files; the manifest makes every file replayable.

## Architectural bet (locked)

The five-layer foundation stands:

- **L1 Harness / runtime** — routing, retry, seed, budget, telemetry, sandbox, replayable run invariants.
- **L2 IR / codec** — typed schemas, prompt contracts, structured parse boundaries at every external edge.
- **L3 Renderer / decoder** — IR to bytes on disk. Frozen decoders are in-bounds; general generators are not the default path.
- **L4 Optional adapter** — small learned translators (e.g. scene-to-latent bridges), shipped beside codecs, not inside the base model.
- **L5 Packaging** — CLI, installation, shared schemas, docs, agent primers, distribution conventions.

What evolves is *generality* (L4/L5 discipline must carry across **all** modalities, not only image) and *naming* (deliberate pass, not back-filled).

## Reproducibility bet (locked)

Every artifact ships with a `RunManifest`: git SHA, lockfile hash, seed, LLM input/output, artifact SHA-256, cost, latency, error taxonomy. Determinism via seed + frozen decoder is a **product feature**, not an afterthought. If a run cannot be replayed bit-for-bit, it did not happen.

## What we do not pursue (Path rejections, locked)

- **Path C — Chameleon / LlamaGen-style full multimodal retrain.** Month-scale engineering, zero research novelty for us, directly violates the delay-training principle. Kept only as contrast class ("why we don't do this") in pitch material.
- **Diffusion in the core image path.** See [`docs/hard-constraints.md`](hard-constraints.md) and ADR-0005.
- **Silent fallbacks.** All failures return structured errors plus a manifest.
- **Cloud-API dependence as default.** Core path runs locally; provider adapters are optional.

## What is explicitly open (revisit by RFC)

- Naming of the middleware layer (informal "Parasoid" is not binding).
- Pipeline shape — one LLM round vs two (expansion then schema).
- Per-modality quality benchmarks beyond structural proxies.
- CLI ergonomics relative to `openai` / `kimi` / `gh` conventions.
- Public website ↔ repo reconciliation.
- Position on the Ilya (compression) ↔ LeCun (JEPA / world models) tension — open until the first research brief lands.

## Change policy

This page changes only through an ADR. Prose tweaks to phrasing are fine; altering a locked statement requires an ADR that supersedes the relevant prior ADR (0003–0005 and future 0006+).

---

**Dated:** 2026-04-23. **Next review:** after Phase P2 research briefs land.
