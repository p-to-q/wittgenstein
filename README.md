<img width="6009" height="2240" alt="image" src="https://github.com/user-attachments/assets/e8c49072-36b4-408f-9f95-0580b6cc96c3" />

# Wittgenstein

**The modality harness for text-first LLMs.**

[![CI](https://img.shields.io/github/actions/workflow/status/p-to-q/wittgenstein/ci.yml?branch=main&label=CI)](./.github/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/p-to-q/wittgenstein?include_prereleases&label=release)](https://github.com/p-to-q/wittgenstein/releases)
[![Status](https://img.shields.io/badge/status-early--stage-orange)](./docs/implementation-status.md)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen)](./.nvmrc)
[![pnpm](https://img.shields.io/badge/pnpm-%3E%3D9.0-f69220)](./package.json)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)](./tsconfig.base.json)
[![Python](https://img.shields.io/badge/Python-3.10%2B-3776ab)](./polyglot-mini/requirements.txt)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](./CONTRIBUTING.md)

> _Die Grenzen meiner Sprache bedeuten die Grenzen meiner Welt._ — Tractatus 5.6

The limits of a language model's expression are the limits of what a harness built on top
of it can plan. Wittgenstein's response is to extend what the model can **express as structured
files** — schemas, codec IR, latent codes — rather than what it can **say in tokens**. The
expressive contract lives in code, not prompt copy.

Give a text LLM a prompt and Wittgenstein turns the structured plan into real files:
`.png`, `.wav`, `.csv`, or `.mp4`, with run manifests that record the seed,
artifact hash, and model I/O.

The shape is uniform across modalities:

```
text-first LLM
  → modality-specific code contract
  → deterministic renderer / frozen decoder
  → real artifact + manifest receipt
```

| Modality | LLM-facing code layer | Local execution layer | Artifact |
| --- | --- | --- | --- |
| 🖼️ Image | Visual Seed Code (primary) + optional `Semantic IR` | Seed expander → frozen VQ decoder | PNG |
| 🔊 Audio | Route-specific audio code (speech / soundscape / music) | Procedural synth (default) + opt-in Kokoro speech | WAV |
| 📡 Sensor | Operator program (with `patchGrammar` for local-context composition) | Deterministic signal expansion | CSV + interactive HTML |
| 🎞️ Video | Composition spec | HyperFrames-shaped local render (M4 stub today; ratified lead path) | MP4 / HTML |

Image, audio, and sensor produce real artifacts today; video is post-v0.3 work. Per-modality maturity is in [`docs/implementation-status.md`](docs/implementation-status.md); the full five-layer mapping is in the [Architecture](#architecture-five-layers) section below; the [30-second sensor quickstart](#quickstart-30-seconds-no-api-key) is the smallest no-API-key proof.

The image codec's split between **Visual Seed Code** (primary, decoder-facing) and **`Semantic IR`** (support: concept activation, user inspection, optional conditioning) is a doctrine correction ratified by [ADR-0018](docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md). `Semantic IR` is important support — pure seed output can be opaque, brittle, or hard to diagnose — but it is not the main image research object.

> **🧪 Project status — early-stage, doctrine-locked, v0.3 prerelease.**
> Wittgenstein is a prerelease (`v0.3.0-alpha.2`) with a working Python
> surface, a production-shaped TypeScript harness, and a few intentionally
> unfinished surfaces clearly flagged with ⚠️ or 🔴 in
> [`docs/implementation-status.md`](docs/implementation-status.md). The v0.2
> cut locks the thesis, vocabulary, and codec protocol (RFC-0001 / ADR-0008);
> **M0, M1A, M2 audio, and M3 sensor have landed**, and the image doctrine
> has been reframed around Visual Seed Code ([ADR-0018](docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md)).
> v0.3 is packaged against
> [`docs/exec-plans/active/codec-v2-port.md`](docs/exec-plans/active/codec-v2-port.md);
> the **current mainline blocker is M1B** (image trained projector), gated
> on per-candidate radar audits in
> [#283](https://github.com/p-to-q/wittgenstein/issues/283).
> Breaking changes are still possible before a stable release. **We are
> actively looking for early adopters and contributors** — see
> [How to help](#how-to-help) below.

> **First time here? Pick your route.**
>
> - 👤 **For Human contributor** — start with [`docs/THESIS.md`](docs/THESIS.md) (the
>   one-page lock), then [`docs/contributor-map.md`](docs/contributor-map.md) for
>   the onboarding tour and [`CONTRIBUTING.md`](CONTRIBUTING.md) for the branch
>   workflow. Going to write code? Read
>   [`docs/engineering-discipline.md`](docs/engineering-discipline.md) once — it
>   is the canonical, intentionally-sharp operating manual for this repo.
> - 🤖 **For Agent contributor** (or human running an agent as your primary dev tool)
>   — paste [`PROMPT.md`](PROMPT.md) into your agent. It is a self-contained,
>   vendor-neutral prompt (Claude Code, Codex, Cursor, custom harnesses) that
>   gives the smallest correct briefing for landing a PR in this repo. For
>   reference depth, [`AGENTS.md`](AGENTS.md) is the longer primer.

---

## Why this exists

Most multimodal stacks buy capability at the model layer: larger fused models,
modality-specific pretraining, expensive adapter training, or paid cloud APIs. That path
works, but it makes artifact generation hard to inspect, replay, and extend outside the
model vendor's boundary.

Wittgenstein explores a different allocation of labor. The text-first LLM remains the
planner: it emits typed structure and, for image, increasingly explicit visual code. The
repo supplies the modality machinery: schemas, codecs, deterministic renderers, frozen
decoders, seed expanders / adapters where needed, and a manifest spine that records what happened.

The hypothesis is not that text-first LLMs secretly contain every modality as pixels or
waveforms. It is that they compress enough world structure to plan across modalities, so
some multimodal generation work can move from model-scale pretraining into typed runtime
interfaces.

Wittgenstein makes three architectural bets instead:

- **Text LLMs, not fused multimodal giants.** The base model stays text-only. Modality-specific
  work lives in codec layers. Cross-modal grounding is already inside the LLM; for image,
  Visual Seed Code is the main decoder-facing output, with `Semantic IR` available to activate
  and organize concepts, expose intent, and condition the seed-expansion path. The adapter
  teaches the interface, not the knowledge. ([research/frozen-llm-multimodality.md](docs/research/frozen-llm-multimodality.md))
- **Decoder, not generator.** Frozen VQ decoders over diffusion samplers. Reproducibility is
  structural — same IR + same seed → same bytes — not a policy bolt-on. ([research/vq-tokens-as-interface.md](docs/research/vq-tokens-as-interface.md))
- **Traceable by construction.** Every run writes a manifest with git SHA, lockfile hash,
  seed, full LLM input/output, and artifact SHA-256. Runs replay bit-exactly. ([reproducibility.md](docs/reproducibility.md))

---

## Receipts (not claims)

Three byte-precise CI gates. Every row is reproducible from a clean checkout via the command in the **Verify** column, and CI fails if any of them drifts. Single-run hackathon-phase numbers (training loss, manual spot checks, illustrative ratios) used to live here; they are not receipts and have been removed in favor of these three.

| What                                       | Number                                                  | Verify (CI gate)                                                                                                                                                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sensor parity (ECG / temperature / gyro)   | <strong>3 / 3 routes byte-for-byte</strong>             | `pnpm test:golden` against [`fixtures/golden/sensor/manifest.json`](fixtures/golden/sensor/manifest.json) (SHA-256 pinned per signal; landed in [PR #125](https://github.com/p-to-q/wittgenstein/pull/125))                                                         |
| Audio parity (speech / soundscape / music) | <strong>3 / 3 routes byte + structural</strong>         | `pnpm --filter @wittgenstein/codec-audio test` exercises [`packages/codec-audio/test/parity.test.ts`](packages/codec-audio/test/parity.test.ts) (procedural backend SHA-256 pinned; landed in [PR #121](https://github.com/p-to-q/wittgenstein/pull/121))           |
| Training-data lock                         | <strong>SHA-256 over selection + output sealed</strong> | `python -m unittest discover -s polyglot-mini/train` against [`polyglot-mini/train/data_manifest.json`](polyglot-mini/train/data_manifest.json) (caption-set hash + `data.jsonl` hash pinned; landed in [PR #130](https://github.com/p-to-q/wittgenstein/pull/130)) |

The receipt set is intentionally narrow. Adding a row requires a script + a CI gate, not a number in a slide.

### Engineering

- Workspace gates from a clean checkout: `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:golden`, and `pnpm smoke:cli` all pass. Verified 2026-05-06 in [`docs/research/2026-05-06-v0.3-cold-checkout-rerun.md`](docs/research/2026-05-06-v0.3-cold-checkout-rerun.md).
- Codec independence: `pnpm lint:deps` enforces no cross-codec imports across 6 codec packages ([PR #126](https://github.com/p-to-q/wittgenstein/pull/126)).
- Self-contained loupe HTML dashboard: ~ 117 KB, zero external CDN dependencies (run the [Quickstart](#quickstart-30-seconds-no-api-key) below, then `wc -c /tmp/ecg.html`).

---

## Showcase — 35 real artifacts you can open right now

Numbers are cheap; files are not. The pack below was generated end-to-end through the
harness — every artifact has a matching run manifest under `artifacts/runs/<run-id>/`.
This showcase is a preserved snapshot from the `v0.1.0-alpha.1` hackathon phase: the
first 35-file pack we used to prove the workflow could emit real artifacts across image,
audio, and sensor routes.

It is intentionally kept as a historical receipt, not a claim that every artifact already
matches the post-lock `v0.2` architecture one-for-one. As the codec-v2 port, decoder
contracts, and manifest spine continue to harden, this showcase pack will be refreshed
with newer curated outputs rather than silently rewritten in place.
Treat it as a human-browsable artifact gallery, not as the active execution brief for
agents; current implementation guidance lives in the codec-v2 plan and agent guides.

**One click per modality (curated `samples/` picks):**

| Modality         | Sample              | Open                                                                                                                                  |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 🖼️ Image         | `02-forest`         | [`samples/image/02-forest.png`](artifacts/showcase/workflow-examples/samples/image/02-forest.png)                                     |
| 🖼️ Image 2       | `03-forest-alt`     | [`samples/image/03-forest-alt.png`](artifacts/showcase/workflow-examples/samples/image/03-forest-alt.png)                             |
| 🎙️ TTS           | `02-harness`        | [`samples/tts/02-harness.wav`](artifacts/showcase/workflow-examples/samples/tts/02-harness.wav)                                       |
| 🎵 Music         | `01-launch-minimal` | [`samples/music/01-launch-minimal.wav`](artifacts/showcase/workflow-examples/samples/music/01-launch-minimal.wav)                     |
| 🌧️ Soundscape    | `02-forest-morning` | [`samples/soundscape/02-forest-morning.wav`](artifacts/showcase/workflow-examples/samples/soundscape/02-forest-morning.wav)           |
| ❤️ Sensor / ECG  | `05-clinical`       | [`samples/sensor-ecg/05-clinical.html`](artifacts/showcase/workflow-examples/samples/sensor-ecg/05-clinical.html)                     |
| 🌡️ Sensor / Temp | `02-greenhouse`     | [`samples/sensor-temperature/02-greenhouse.html`](artifacts/showcase/workflow-examples/samples/sensor-temperature/02-greenhouse.html) |
| 🎛️ Sensor / Gyro | `02-hover`          | [`samples/sensor-gyro/02-hover.html`](artifacts/showcase/workflow-examples/samples/sensor-gyro/02-hover.html)                         |

- **Full pack (5 per group, 35 artifacts):** [`artifacts/showcase/workflow-examples/`](artifacts/showcase/workflow-examples/)
- **Hand-picked samples folder:** [`artifacts/showcase/workflow-examples/samples/`](artifacts/showcase/workflow-examples/samples/)
- **Rendered gallery:** [`SHOWCASE.md`](SHOWCASE.md)

---

## Architecture (Five Layers)

```
 User prompt + system / skill context
      │
      │               system / skill context injects the codec contract:
      │               output Visual Seed Code first; Semantic IR is optional support
      │
      ▼
  L1 HARNESS          routing · retry · budget · manifest · seed
      │
      ▼
  L2 CODEC / SPEC     LLM → structured Spec / Visual Seed Code contract
      │   ▲           image: Visual Seed Code (VSC) primary; Semantic IR / VQ hints optional
      │               audio: AudioPlan / route spec
      │               sensor: SignalSpec / operator spec
      │               contracts may carry text / code / hybrid sections by modality
      │   └── schema preamble + codec playbook injected before the LLM call
      ▼
  L3 DECODER          code-bearing Spec/IR → real file (deterministic; never generative)
      │               image:  frozen VQ decoder     → PNG
      │               audio:  WAV synth + ambient   → WAV / M4A
      │               sensor: operator expand       → CSV + loupe HTML
      ▼
  L4 ADAPTER          VSC / VQ hint expansion → decoder-native latent code
      │               (image only; small bridge between L2 and L3)
      ▼
  L5 PACKAGING        CLI · npm · AGENTS.md · artifacts/runs/<id>/manifest.json
```

Every layer has a named home in the repo; no layer is "implied in prompts." Vocabulary
is locked in [`docs/glossary.md`](docs/glossary.md); the full layer mapping lives in
[`docs/architecture.md`](docs/architecture.md); the codec contract is
[`docs/codec-protocol.md`](docs/codec-protocol.md) (ratified by ADR-0008).

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

| Surface                | Lives at         | Best for                                                     |
| ---------------------- | ---------------- | ------------------------------------------------------------ |
| **Python prototype**   | `polyglot-mini/` | Rapid iteration, demos, adapter training, hackathon velocity |
| **TypeScript harness** | `packages/*`     | Typed contracts, strict CI gates, production distribution    |

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
pnpm --filter @wittgenstein/cli exec wittgenstein audio   "short launch audio artifact" --dry-run
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

- [`docs/THESIS.md`](docs/THESIS.md) — the smallest locked statement page in the repo
- [`docs/contributor-map.md`](docs/contributor-map.md) — onboarding map for humans and agents
- [`docs/glossary.md`](docs/glossary.md) — locked vocabulary (Harness / Codec / Spec / IR / Decoder / Adapter / Packaging)
- [`docs/tracks.md`](docs/tracks.md) — Researcher / Hacker dual-track contract
- [`docs/inheritance-audit.md`](docs/inheritance-audit.md) — what survives, what gets promoted, what gets retired
- [`docs/SYNTHESIS_v0.2.md`](docs/SYNTHESIS_v0.2.md) — branch-level merge brief and human/agent handoff
- [`docs/v02-final-audit.md`](docs/v02-final-audit.md) — pre-lock decision ledger + handoff sign-off
- [`docs/architecture.md`](docs/architecture.md) — five-layer system, dataflow, package layout
- [`docs/codec-protocol.md`](docs/codec-protocol.md) — the `WittgensteinCodec` contract every codec obeys
- [`docs/reproducibility.md`](docs/reproducibility.md) — manifest spine and seed rules
- [`docs/implementation-status.md`](docs/implementation-status.md) — Ships / Partial / Stub matrix
- [`docs/hard-constraints.md`](docs/hard-constraints.md) — what will not change

### For maintainers and contributing agents

- [`docs/engineering-discipline.md`](docs/engineering-discipline.md) — the sharp working standard for how to inspect, change, validate, and report in this repo
- [`docs/archive-policy.md`](docs/archive-policy.md) — how this repo decides delete vs archive vs refresh when old surfaces drift
- [`docs/exec-plans/active/codec-v2-port.md`](docs/exec-plans/active/codec-v2-port.md) — the live P6 plan (M0 → M5b) for porting all codecs to Codec Protocol v2
- [`docs/agent-guides/README.md`](docs/agent-guides/README.md) — index of prompt-ready execution briefs
- [`docs/agent-guides/image-to-audio-port.md`](docs/agent-guides/image-to-audio-port.md) — cross-line context (M0–M2)
- [`docs/agent-guides/audio-port.md`](docs/agent-guides/audio-port.md) — audio line, M2 (route collapse, soft-deprecation)
- [`docs/agent-guides/sensor-port.md`](docs/agent-guides/sensor-port.md) — sensor line, M3 (no-L4 confirmation case)
- [`docs/rfcs/README.md`](docs/rfcs/README.md) — engineering decisions (RFCs 0001 codec v2, 0002 CLI, 0004 site, 0005 naming)
- [`docs/adrs/README.md`](docs/adrs/README.md) — ratified decisions (engineering lane: ADRs 0006 layered IR, 0007 Path C rejected, 0008 codec v2, 0009 CLI v2, 0011 naming v2; governance lane: ADRs 0012 labels, 0013 independent ratification, 0014 governance lane itself)
- [`docs/labels.md`](docs/labels.md) — canonical issue / PR label taxonomy (ratified by ADR-0012)

### For hackers

- [`SHOWCASE.md`](SHOWCASE.md) — historical `v0.1.0-alpha.1` hackathon artifact gallery (35 files across 7 modality groups)
- [`docs/quickstart.md`](docs/quickstart.md) — 30 seconds to a real file
- [`docs/engineering-discipline.md`](docs/engineering-discipline.md) — how to make sharp, minimal, evidence-backed changes without fighting the repo
- [`polyglot-mini/README.md`](polyglot-mini/README.md) — Python surface deep-dive
- [`docs/extending.md`](docs/extending.md) — add a codec, train an adapter, plug in a provider
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — branch workflow, first-PR paths
- [`SUPPORT.md`](SUPPORT.md) — where to ask what, how to file an effective issue

### For researchers

- [`docs/research/vq-tokens-as-interface.md`](docs/research/vq-tokens-as-interface.md) — why discrete VQ tokens as the LLM–decoder bridge
- [`docs/research/compression-view-of-llms.md`](docs/research/compression-view-of-llms.md) — LLMs as neural compressors; why structured IR beats pixel emission
- [`docs/research/frozen-llm-multimodality.md`](docs/research/frozen-llm-multimodality.md) — frozen backbone + adapter vs. end-to-end multimodal giants
- [`docs/research/neural-codec-references.md`](docs/research/neural-codec-references.md) — annotated lineage: VQ-VAE → VQGAN → DALL-E 1 → LlamaGen → SEED → TiTok
- [`docs/research/briefs/README.md`](docs/research/briefs/README.md) — research briefs A–H: lineage, Ilya↔LeCun stance, horizon, CLI, benchmarks, site, image-network clues, codec prior art
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
git clone https://github.com/p-to-q/wittgenstein.git
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

**What's next.** Doctrine is locked; the active workstream is the Codec Protocol v2 port
across all modalities, sequenced in [`docs/exec-plans/active/codec-v2-port.md`](docs/exec-plans/active/codec-v2-port.md)
(`M0` and `M1A` are landed; `M2 audio` is next; `M1B image depth` is tracked separately).

Roadmap: [`ROADMAP.md`](ROADMAP.md). Changelog: [`CHANGELOG.md`](CHANGELOG.md).
Security: [`SECURITY.md`](SECURITY.md).

---

## Experimental surfaces (⚠️ honest disclosure)

These are intentionally unfinished. They're part of the current release so the contract
is visible, but **do not depend on them in production** until the status matrix says
✅ Ships.

| Surface                                       | State             | What works today                                                                      | What's missing                                                                 |
| --------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| TS `codec-image` adapter + decoder            | ⚠️ Partial        | Scene JSON, placeholder latents, MLP loader, `renderSky` / `renderTerrain` primitives | Frozen VQ decoder bridge (LlamaGen / SEED); trained adapter weights            |
| TS `codec-video`                              | 🔴 Stub           | Schema + typed interface                                                              | HyperFrames integration, MP4 encoder                                           |
| Benchmark quality scores                      | ⚠️ Proxy          | Structural smoke checks, cost/latency timing                                          | CLIPScore, Whisper WER, UTMOS, discriminative score runners                    |
| `polyglot-mini` image code-as-painter sandbox | ⚠️ Research-grade | `subprocess` with 20 s timeout + safe globals                                         | Kernel-level isolation for multi-tenant use (see [`SECURITY.md`](SECURITY.md)) |

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
2. **Pick a `good first issue` on [GitHub Issues](https://github.com/p-to-q/wittgenstein/issues).**
   Labelled entries are scoped small. Docs, CI, and typings are all fair game.
3. **Own a surface.** If you want to land the VQ decoder bridge, train a better adapter,
   or port a codec, say so in an issue and we'll pair. See
   [`docs/extending.md`](docs/extending.md) for the concrete recipes.

Before sending a PR, skim [`CONTRIBUTING.md`](CONTRIBUTING.md) — the branch workflow is
worth two minutes and prevents the usual fork-and-merge pain.

Questions before you start? [`SUPPORT.md`](SUPPORT.md) shows where to ask what.

---

## Locked constraints

These are the contracts the v0.2 doctrine lock made non-negotiable. Full pack with
sources: [`docs/hard-constraints.md`](docs/hard-constraints.md).

- **Five layers, locked vocabulary** — Harness · Codec · Spec · IR · Decoder · Adapter ·
  Packaging. No alternative naming, no shadow layers. ([`docs/glossary.md`](docs/glossary.md))
- **Codec Protocol v2 is the only codec contract** — every codec implements
  `Codec<Req, Art>.produce`. The harness does not branch on modality. (RFC-0001 / ADR-0008)
- **Decoder ≠ generator** — decoders are deterministic functions of (Spec, seed,
  lockfile). No diffusion samplers in the core image path. (ADR-0005)
- **Path C rejected through v0.4** — no Chameleon/LlamaGen-style fused multimodal retrain;
  the base model stays text-only. (ADR-0007)
- **IR is a typed internal-representation layer** — different modalities may carry
  text, code-bearing, or hybrid sections inside one contract. New IR shapes still
  require the normal RFC/ADR path; image's Visual Seed Code route is the current
  ratified example. (ADR-0011 / ADR-0018)
- **Schema at every LLM boundary** — preamble injected, zod-parsed on return, no free-form
  prose accepted as structured output.
- **Manifest spine, no exceptions** — every run writes git SHA, lockfile hash, seed, full
  LLM I/O, and artifact SHA-256 under `artifacts/runs/<id>/`. No silent fallbacks.
- **Shared contracts live in `@wittgenstein/schemas`** — codec packages depend on schemas,
  not on each other.

---

## Contributors

<a href="https://github.com/p-to-q/wittgenstein/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=p-to-q/wittgenstein" alt="Image with all contributors" />
</a>

---

## Star History

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=p-to-q/wittgenstein&type=Date&theme=dark" />
  <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=p-to-q/wittgenstein&type=Date" />
  <img alt="Star History Chart" src="https://api.star-history.com/image?repos=p-to-q/wittgenstein&type=Date" />
</picture>

---

## License

Apache 2.0. See [`LICENSE`](LICENSE).
