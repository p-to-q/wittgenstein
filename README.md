<img width="6009" height="2240" alt="image" src="https://github.com/user-attachments/assets/e8c49072-36b4-408f-9f95-0580b6cc96c3" />

# Wittgenstein

**The modality harness for text-first models.**

[![CI](https://img.shields.io/github/actions/workflow/status/Moapacha/wittgenstein/ci.yml?branch=main&label=CI)](./.github/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Moapacha/wittgenstein?include_prereleases&label=release)](https://github.com/Moapacha/wittgenstein/releases)
[![Status](https://img.shields.io/badge/status-early--stage-orange)](./docs/implementation-status.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0-f69220)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.base.json)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab)](./polyglot-mini/requirements.txt)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](./CONTRIBUTING.md)

> *Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt.* — Tractatus 5.6

The limits of a language model's expression are the limits of what a harness built on top
of it can plan. Wittgenstein's response is to extend what the model can **express as structured
files** — schemas, codec IR, latent codes — rather than what it can **say in tokens**. The
expressive contract lives in code, not prompt copy.

> **🧪 Project status — early-stage, post-hackathon.** Wittgenstein is a prerelease
> (`v0.1.0-alpha.2`) with a working Python surface, a production-shaped TypeScript
> harness, and a few intentionally unfinished surfaces clearly flagged with ⚠️ or 🔴 in
> [`docs/implementation-status.md`](docs/implementation-status.md). Breaking changes are
> possible before `0.1.0`. **We are actively looking for early adopters and
> contributors** — see [How to help](#how-to-help) below.

---

## Why this exists

Most "multimodal AI" stacks hide the hard parts in a fused frontier model, a paid cloud
API, or the slide deck. None of those are portable, inspectable, or reproducible.

Wittgenstein makes three architectural bets instead:

- **Text LLMs, not fused multimodal giants.** The base model stays text-only. Modality-specific
  work lives in codec layers. Cross-modal grounding is already inside the LLM — the adapter
  teaches the interface, not the knowledge. ([research/frozen-llm-multimodality.md](docs/research/frozen-llm-multimodality.md))
- **Decoder, not generator.** Frozen VQ decoders over diffusion samplers. Reproducibility is
  structural — same IR + same seed → same bytes — not a policy bolt-on. ([research/vq-tokens-as-interface.md](docs/research/vq-tokens-as-interface.md))
- **Traceable by construction.** Every run writes a manifest with git SHA, lockfile hash,
  seed, full LLM input/output, and artifact SHA-256. Runs replay bit-exactly. ([reproducibility.md](docs/reproducibility.md))

---

## Receipts (not claims)

| What | Number | How |
|---|---|---|
| Image style MLP validation loss | **0.7698 BCE** | 781 COCO captions, 9 s on CPU, 600 epochs |
| Audio ambient classifier accuracy | **5 / 5 spot checks** | 369 examples, < 5 s on CPU, keyword + MLP hybrid |
| LLM token cost: scene JSON vs raw pixels | **~ 52,000× less** | 60 tokens vs 1024×1024×3 pixel values |
| Sensor expand latency | **< 2 ms** | Pure numpy, 250 Hz × 10 s ECG with operator spec |
| Loupe HTML dashboard size | **~ 117 KB** | Zero external dependencies, single self-contained file |
| Full typecheck + lint | **10 / 10 packages green** | Strict TS, ESLint, pnpm workspaces |

Adapter training stats are from real runs; see [`docs/benchmark-standards.md`](docs/benchmark-standards.md)
for the full measurement protocol.

---

## Showcase — 35 real artifacts you can open right now

Numbers are cheap; files are not. The pack below was generated end-to-end through the
harness — every artifact has a matching run manifest under `artifacts/runs/<run-id>/`.

**One click per modality:**

| Modality | Sample | Open |
|---|---|---|
| 🖼️ Image | `02-forest` | [`image/02-forest.png`](artifacts/showcase/workflow-examples/image/02-forest.png) |
| 🎙️ TTS | `02-harness` | [`tts/02-harness.wav`](artifacts/showcase/workflow-examples/tts/02-harness.wav) |
| 🎵 Music | `01-launch-minimal` | [`music/01-launch-minimal.wav`](artifacts/showcase/workflow-examples/music/01-launch-minimal.wav) |
| 🌧️ Soundscape | `02-forest-morning` | [`soundscape/02-forest-morning.wav`](artifacts/showcase/workflow-examples/soundscape/02-forest-morning.wav) |
| ❤️ Sensor / ECG | `05-clinical` | [`sensor/ecg/05-clinical.html`](artifacts/showcase/workflow-examples/sensor/ecg/05-clinical.html) |
| 🌡️ Sensor / Temp | `02-greenhouse` | [`sensor/temperature/02-greenhouse.html`](artifacts/showcase/workflow-examples/sensor/temperature/02-greenhouse.html) |
| 🎛️ Sensor / Gyro | `02-hover` | [`sensor/gyro/02-hover.html`](artifacts/showcase/workflow-examples/sensor/gyro/02-hover.html) |

- **Full pack (5 per group, 35 artifacts):** [`artifacts/showcase/workflow-examples/`](artifacts/showcase/workflow-examples/)
- **Hand-picked samples folder:** [`artifacts/showcase/workflow-examples/samples/`](artifacts/showcase/workflow-examples/samples/)
- **Rendered gallery:** [`SHOWCASE.md`](SHOWCASE.md)

---

## Architecture (Five Layers)

```
 User prompt
      │
      ▼
  L1 HARNESS          routing · retry · budget · manifest · seed
      │
      ▼
  L2 IR / CODEC       LLM → structured JSON (scene spec / audio plan / signal spec)
      │   ▲
      │   └── schema preamble injected before the LLM call
      ▼
  L3 RENDERER         JSON → real file
      │               image:  frozen VQ decoder     → PNG
      │               audio:  WAV synth + ambient   → WAV / M4A
      │               sensor: operator expand       → CSV + loupe HTML
      ▼
  L4 ADAPTER          text embedding → latent code alignment (image only; tiny MLP)
      │               (fires between L2 and L3; no adapter for audio/sensor today)
      ▼
  L5 DIST             CLI · npm · AGENTS.md · artifacts/runs/<id>/manifest.json
```

Every layer has a named home in the repo; no layer is "implied in prompts." See
[`docs/architecture.md`](docs/architecture.md) for the full mapping.

---

## Quickstart (30 seconds, no API key)

```bash
cd polyglot-mini
pip install -r requirements.txt
python3 -m polyglot.cli sensor "ECG 72 bpm resting" --dry-run --out /tmp/ecg.json
open /tmp/ecg.html    # self-contained interactive dashboard, zero deps
```

What you get:

```
/tmp/
├── ecg.json    operator spec + 2,500 samples
├── ecg.csv     timeSec,value
├── ecg.png     matplotlib chart
└── ecg.html    117 KB interactive loupe dashboard
```

Full tour: [`docs/quickstart.md`](docs/quickstart.md).

---

## Two surfaces, one architecture

| Surface | Lives at | Best for |
|---|---|---|
| **Python prototype** | `polyglot-mini/` | Rapid iteration, demos, adapter training, hackathon velocity |
| **TypeScript harness** | `packages/*` | Typed contracts, strict CI gates, production distribution |

Both implement the same five layers. Start on the Python side, graduate to TypeScript when
the codec design is stable. See [`docs/extending.md`](docs/extending.md) for the porting recipe.

---

## CLI

```bash
# Python surface — full end-to-end, works today
python3 -m polyglot.cli image  "stormy ocean at midnight"      --out ocean.png
python3 -m polyglot.cli tts    "Cozy rainy afternoon."         --out voice.m4a
python3 -m polyglot.cli sensor "ECG 72 bpm resting" --dry-run  --out ecg.json

# TypeScript surface — typed harness, manifest spine, CI-backed
pnpm --filter @wittgenstein/cli exec wittgenstein sensor  "stable ECG" --dry-run --out artifacts/demo/ecg.json
pnpm --filter @wittgenstein/cli exec wittgenstein audio   "soft launch music" --route music --dry-run
pnpm --filter @wittgenstein/cli exec wittgenstein doctor
```

---

## Reproducibility

Every run leaves an artifact trail:

```
artifacts/runs/2026-04-20T14-52-33_a3f9b2/
├── manifest.json      # git SHA, lockfile hash, seed, costs, artifact SHA-256
├── llm-input.txt      # full prompt with preamble
├── llm-output.txt     # raw model output
└── artifact.{png,wav,json,html}
```

Same inputs + same seed + same lockfile → identical artifact bytes. Diffusion sampling
cannot offer this; frozen VQ decoding does. See [`docs/reproducibility.md`](docs/reproducibility.md).

---

## Docs map

### For engineers
- [`docs/architecture.md`](docs/architecture.md) — five-layer system, dataflow, package layout
- [`docs/codec-protocol.md`](docs/codec-protocol.md) — the `WittgensteinCodec` contract every codec obeys
- [`docs/reproducibility.md`](docs/reproducibility.md) — manifest spine and seed rules
- [`docs/implementation-status.md`](docs/implementation-status.md) — Ships / Partial / Stub matrix
- [`docs/hard-constraints.md`](docs/hard-constraints.md) — what will not change

### For hackers
- [`SHOWCASE.md`](SHOWCASE.md) — 35 real artifacts across 7 modality groups, click to open
- [`docs/quickstart.md`](docs/quickstart.md) — 30 seconds to a real file
- [`polyglot-mini/README.md`](polyglot-mini/README.md) — Python surface deep-dive
- [`docs/extending.md`](docs/extending.md) — add a codec, train an adapter, plug in a provider
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch workflow, first-PR paths
- [`SUPPORT.md`](SUPPORT.md) — where to ask what, how to file an effective issue

### For researchers
- [`docs/research/vq-tokens-as-interface.md`](docs/research/vq-tokens-as-interface.md) — why discrete VQ tokens as the LLM–decoder bridge
- [`docs/research/compression-view-of-llms.md`](docs/research/compression-view-of-llms.md) — LLMs as neural compressors; why structured IR beats pixel emission
- [`docs/research/frozen-llm-multimodality.md`](docs/research/frozen-llm-multimodality.md) — frozen backbone + adapter vs. end-to-end multimodal giants
- [`docs/research/neural-codec-references.md`](docs/research/neural-codec-references.md) — annotated lineage: VQ-VAE → VQGAN → DALL-E 1 → LlamaGen → SEED → TiTok
- [`docs/benchmark-standards.md`](docs/benchmark-standards.md) — FID / CLIPScore / WER / UTMOS / discriminative-score protocol
- [`docs/adrs/`](docs/adrs/) — architecture decision records

---

## Extensibility

Two surfaces, one contract. Adding a modality takes six steps on either side. See
[`docs/extending.md`](docs/extending.md) for concrete recipes covering:

- A new codec (TypeScript and Python)
- A new LLM provider
- A new trained adapter
- A new benchmark case
- Non-negotiable rules (decoder ≠ generator, no silent fallbacks, schema at every boundary)

---

## Install

```bash
git clone https://github.com/Moapacha/wittgenstein.git
cd wittgenstein

# TypeScript harness
nvm use && corepack enable && pnpm install && pnpm typecheck

# Python surface
cd polyglot-mini && pip install -r requirements.txt
```

Requirements: Node ≥ 20.11, pnpm ≥ 9.0, Python ≥ 3.10. See [`CONTRIBUTING.md`](CONTRIBUTING.md)
for the full developer setup.

---

## Status

See [`docs/implementation-status.md`](docs/implementation-status.md) for component-level detail.
Summary: sensor, audio, polyglot-mini image fallback, and the Python image code-as-painter
path all ship today; the TS neural image codec has real scene + adapter + placeholder
latents and is waiting on a frozen VQ decoder bridge; video is a typed stub.

Roadmap: [`ROADMAP.md`](ROADMAP.md). Changelog: [`CHANGELOG.md`](CHANGELOG.md).
Security: [`SECURITY.md`](SECURITY.md).

---

## Experimental surfaces (⚠️ honest disclosure)

These are intentionally unfinished. They're part of the current release so the contract
is visible, but **do not depend on them in production** until the status matrix says
✅ Ships.

| Surface | State | What works today | What's missing |
|---|---|---|---|
| TS `codec-image` adapter + decoder | ⚠️ Partial | Scene JSON, placeholder latents, MLP loader, `renderSky` / `renderTerrain` primitives | Frozen VQ decoder bridge (LlamaGen / SEED); trained adapter weights |
| TS `codec-video` | 🔴 Stub | Schema + typed interface | HyperFrames integration, MP4 encoder |
| Benchmark quality scores | ⚠️ Proxy | Structural smoke checks, cost/latency timing | CLIPScore, Whisper WER, UTMOS, discriminative score runners |
| `polyglot-mini` image code-as-painter sandbox | ⚠️ Research-grade | `subprocess` with 20 s timeout + safe globals | Kernel-level isolation for multi-tenant use (see [`SECURITY.md`](SECURITY.md)) |

If you hit a rough edge in one of these, file an
[Experimental feedback issue](.github/ISSUE_TEMPLATE/experimental-feedback.md) — that's
the signal we most want right now.

---

## How to help

Wittgenstein was open-sourced straight out of a hackathon and we want early adopters to
land softly. Three paths, in order of effort:

1. **Try the 30-second quickstart above and tell us how it felt.** Broken step? Confusing
   docs? File a [`[q]` question](.github/ISSUE_TEMPLATE/question.md) or a docs PR — we
   treat "should have been documented" as the same priority as a bug.
2. **Pick a `good first issue` on [GitHub Issues](https://github.com/Moapacha/wittgenstein/issues).**
   Labelled entries are scoped small. Docs, CI, and typings are all fair game.
3. **Own a surface.** If you want to land the VQ decoder bridge, train a better adapter,
   or port a codec, say so in an issue and we'll pair. See
   [`docs/extending.md`](docs/extending.md) for the concrete recipes.

Before sending a PR, skim [`CONTRIBUTING.md`](CONTRIBUTING.md) — the branch workflow is
worth two minutes and prevents the usual fork-and-merge pain.

Questions before you start? [`SUPPORT.md`](SUPPORT.md) shows where to ask what.

---

## Locked constraints

- Image has exactly one shipping path: LLM → JSON scene spec → adapter → frozen decoder → PNG
- No diffusion generators in the core image path
- No silent fallbacks — failures return structured errors with a manifest
- Every run is traceable under `artifacts/runs/`
- Shared contracts live in `@wittgenstein/schemas`; codec packages depend on schemas, not each other

---

## License

Apache 2.0. See [`LICENSE`](LICENSE).
