# Roadmap

> **Status:** high-level release / product roadmap. For the active execution order and
> migration gates, use `docs/exec-plans/active/codec-v2-port.md`.
>
> As of 2026-04-26:
>
> - `M0` is landed
> - `M1A` is landed (`PR #68`)
> - `M2 audio` is the next execution line
> - `M1B image depth` is tracked separately as a follow-up line (`Issue #70`)

Wittgenstein is built in phases. Each phase is self-contained and shippable — the repo
should be useful (and honest) at every phase boundary, not only at the end.

For per-component status see [`docs/implementation-status.md`](docs/implementation-status.md).
For architectural decisions see [`docs/adrs/`](docs/adrs/).

---

## Phase 0 — Foundation ✅ (shipped 2026-04)

The scaffold and the Python proving ground.

- pnpm TypeScript monorepo with strict types and project references
- Five-layer architecture explicit in the repo structure
- `polyglot-mini` Python surface: image (code-as-painter), TTS + ambient, sensor + loupe
- Image style MLP and audio ambient classifier trained on real data
- CI (lint, typecheck, test) green on push and PR
- Research notes, benchmark standards, implementation status, quickstart

## Phase 1 — Image neural codec real 🚧 (in progress)

Move the image path from "protocol port landed" to "real frozen decoder + trained adapter in".

Already landed:

- Codec v2 protocol port for raster image (`M1A`)
- codec-owned packaging + manifest rows
- image branch removed from the harness
- single-route raster `ImageCodec extends BaseCodec<...>`

- [ ] Wire a frozen pretrained VQ decoder (LlamaGen or TiTok candidate)
- [ ] Train the scene-to-latent adapter on a caption subset (CC12M or LAION-COCO slice)
- [ ] Report CLIPScore on 100-prompt benchmark set
- [ ] First golden fixture in `fixtures/golden/image/`
- [ ] Adapter training recipe documented in `packages/codec-image/src/training/README.md`

## Phase 2 — Audio codec v2 + quality upgrade

Move audio from the legacy surface to the Codec v2 shape, then improve quality on top of that.

First:

- [ ] Port `codec-audio` to Codec v2 (`M2`)
- [ ] Collapse duplicated route logic
- [ ] Soft-deprecate `AudioRequest.route`
- [ ] Move manifest authorship fully into the codec

Then:

- [ ] Integrate Kokoro-82M-family as the default speech decoder, with Piper-family fallback
- [ ] Keep host TTS (`say` / platform speech) out of the canonical v0.3 fallback path
- [ ] Add UTMOS + Whisper-WER scoring to the benchmark harness
- [ ] Extend procedural soundscape categories and symbolic music quality without adding a neural music decoder

## Phase 3 — Video codec real

- [ ] Integrate HyperFrames (composition IR → MP4)
- [ ] Add FVD scoring hook
- [ ] Golden fixture + CI check

## Phase 4 — Benchmark suite landing

Move benchmarks from "structural smoke proxy" to "standard metrics alongside the proxy".

- [ ] CLIPScore runner for image (`benchmarks/tools/clipscore.py`)
- [ ] Whisper WER runner for TTS (`benchmarks/tools/wer.py`)
- [ ] Discriminative-score classifier for sensor
- [ ] 10 prompts per modality; results committed per release tag
- [ ] Chart generator producing `artifacts/benchmarks/<tag>.png`

## Phase 5 — Distribution

Make the CLI genuinely one-line installable.

- [ ] Publish `@wittgenstein/cli` to npm under a release tag
- [ ] `curl | sh` install script producing a working local env
- [ ] Skill-ready AGENTS.md surface for agent harnesses
- [ ] Homebrew formula (macOS) and pipx package for the Python surface

## Phase 6 — Site and launch content

- [ ] Architecture diagram rendered as image
- [ ] Demo gallery with real artifacts
- [ ] Install instructions and minimal tutorial on `apps/site/`
- [ ] Release notes page

---

## Explicit non-goals

These are stable decisions, not "not yet":

- **No diffusion in the core image path.** Frozen VQ decoders only. If you need a diffusion generator, use a separate tool.
- **No fine-tuning of frontier LLMs.** Adapters and codec layers carry the modality work. The base LLM stays frozen and text-first.
- **No cloud render APIs in the default path.** `--live` may call a hosted LLM for planning; the renderer always runs locally.
- **No silent fallbacks for image.** If the neural codec fails, the CLI returns a structured error. No SVG or canvas "temporary fallback."

---

## How roadmap changes land

1. A phase is considered closed when its items ship, CI is green on the new metric, and `CHANGELOG.md` has an entry.
2. Phase reordering goes through an ADR in `docs/adrs/`.
3. Major scope changes update this file and the opening section of `README.md` in the same commit.
