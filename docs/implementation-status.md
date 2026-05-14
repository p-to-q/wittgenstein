# Implementation Status

> **Status:** mixed ledger. This page is a practical status matrix across the TypeScript
> harness and the legacy / demo-oriented `polyglot-mini` surface, but it is **not** the
> sole source of truth for the active Codec v2 migration order.
>
> For current execution priority and gates, use:
>
> - `docs/exec-plans/active/codec-v2-port.md`
> - `docs/agent-guides/`
> - `docs/archive-policy.md` if a row here starts to drift into historical-only status
>
> Last updated: 2026-05-07. "Ships" = produces real output today. "Stub" = typed interface,
> throws `NotImplementedError`, waiting for a renderer. "Partial" = some routes work.

---

## polyglot-mini (Python · primary demo surface)

Everything below runs with `python3 -m polyglot.cli <cmd>`.

| Component                          | Status                | Notes                                                                                                                                                                                                                     |
| ---------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Image — LLM code-as-painter**    | ✅ Ships              | LLM → Python PIL/NumPy/SciPy → sandboxed subprocess → PNG                                                                                                                                                                 |
| **Image — MLP fallback painter**   | ✅ Ships              | text → hashed-BoW embed → MLP → palette+layout → procedural PNG                                                                                                                                                           |
| **Image — COCO training pipeline** | ✅ Ships              | `train/build_dataset_coco.py` + `train/train.py`; 781 examples, 9 s                                                                                                                                                       |
| **TTS — speech**                   | ✅ Ships (macOS-only) | macOS `say` → AIFF → `afconvert` → M4A (zero deps). Linux / Windows have no fallback in this surface; cross-platform speech is in the TS `@wittgenstein/codec-audio` codec via the Kokoro backend (Issue #116 / PR #158). |
| **TTS — procedural ambient**       | ✅ Ships              | AudioMLP classifier → rain/wind/city/forest/electronic/white_noise → NumPy+SciPy synth → mixed M4A                                                                                                                        |
| **Audio adapter training**         | ✅ Ships              | `train/train_audio.py`; 369 examples, < 5 s                                                                                                                                                                               |
| **Sensor — dry-run expand**        | ✅ Ships              | Built-in ECG/accelerometer/temperature specs → numpy arrays → CSV + PNG                                                                                                                                                   |
| **Sensor — LLM expand**            | ✅ Ships              | LLM → operator-spec JSON → same expand path                                                                                                                                                                               |
| **Sensor — Loupe HTML dashboard**  | ✅ Ships              | CSV → `loupe.py` → self-contained interactive HTML                                                                                                                                                                        |
| **LLM provider routing**           | ✅ Ships              | Kimi K2 / MiniMax / OpenAI-compat / Anthropic via env vars                                                                                                                                                                |
| **Dry-run / no-LLM modes**         | ✅ Ships              | All three commands work without an API key                                                                                                                                                                                |

---

## @wittgenstein/\* TypeScript packages

The TS monorepo is the **production harness layer** (L1–L5). Core, schemas, CLI, and sensor/audio
codecs are wired. Image and video codecs are typed stubs — intentional until training is complete.

### @wittgenstein/schemas

| Export                                          | Status   | Notes                          |
| ----------------------------------------------- | -------- | ------------------------------ |
| `WittgensteinCodec<Req,Parsed>` interface       | ✅ Ships | Full type contract             |
| `RenderResult`, `RenderCtx`, `RunManifest`      | ✅ Ships |                                |
| `Modality` enum                                 | ✅ Ships | image / audio / video / sensor |
| `SensorRequest`, `AudioRequest`, `ImageRequest` | ✅ Ships | Zod schemas                    |

### @wittgenstein/core

| Component                            | Status   | Notes                                              |
| ------------------------------------ | -------- | -------------------------------------------------- |
| `harness.ts` — `Wittgenstein` class  | ✅ Ships | render(), route dispatching, manifest write        |
| `registry.ts` — codec registry       | ✅ Ships |                                                    |
| `router.ts` — modality routing       | ✅ Ships |                                                    |
| `manifest.ts` — run manifest emitter | ✅ Ships | writes `artifacts/runs/<id>/manifest.json`         |
| `telemetry.ts` — artifact logger     | ✅ Ships |                                                    |
| `budget.ts` — token/cost tracker     | ✅ Ships |                                                    |
| `retry.ts` — retry policy            | ✅ Ships |                                                    |
| `seed.ts` — deterministic RNG        | ✅ Ships |                                                    |
| `errors.ts` — error taxonomy         | ✅ Ships | `NotImplementedError`, `BudgetExceededError`, etc. |
| `config.ts` — config loader          | ✅ Ships | `polyglot.config.ts` + env vars                    |
| `llm/openai-compatible.ts`           | ✅ Ships | Moonshot/MiniMax/DeepSeek/Qwen/OpenAI              |
| `llm/anthropic.ts`                   | ✅ Ships | Claude via `x-api-key`                             |

### @wittgenstein/codec-sensor

| Component                                                             | Status   | Notes                                     |
| --------------------------------------------------------------------- | -------- | ----------------------------------------- |
| Schema + Zod validation                                               | ✅ Ships |                                           |
| Signal expander (oscillator, noise, drift, pulse, step, ECG template) | ✅ Ships | Pure TypeScript, deterministic            |
| Loupe HTML dashboard integration                                      | ✅ Ships | searches 3 candidate paths for `loupe.py` |
| JSON + CSV sidecar output                                             | ✅ Ships |                                           |
| LLM operator-spec route                                               | ✅ Ships |                                           |

### @wittgenstein/codec-audio

| Component                                  | Status   | Notes                        |
| ------------------------------------------ | -------- | ---------------------------- |
| Schema + Zod validation                    | ✅ Ships |                              |
| Speech route (`renderSpeechRoute`)         | ✅ Ships | WAV via stdlib encoder       |
| Soundscape route (`renderSoundscapeRoute`) | ✅ Ships | Procedural ambient synthesis |
| Music route (`renderMusicRoute`)           | ✅ Ships | Symbolic → synth             |
| Ambient adapter (`ambient-adapter.ts`)     | ✅ Ships | BoW → category heuristic     |
| WAV encoding runtime                       | ✅ Ships | `runtime.ts`, zero deps      |

### @wittgenstein/codec-image

| Component                                     | Status         | Notes                                                                                                                           |
| --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Schema + Zod image-code contract              | ✅ Ships       | Visual Seed Code contract now supports `seedCode`, optional `semantic`, optional `coarseVq`, and `providerLatents`              |
| `expand.ts` — prompt → image code             | ⚠️ Partial     | LLM-driven; dry-run emits deterministic `witt-dry-run` seed tokens, while real prompt-stack quality remains a follow-up         |
| `adapter.ts` — seed / semantic → latent codes | ⚠️ Partial     | Priority order now ships as `providerLatents -> coarseVq -> seedCode -> semantic fallback -> placeholder`; trained expander TBD |
| Image-code manifest receipts                  | ✅ Ships       | `metadata.imageCode` / manifest `image.code` records fired path, semantic source, seed family/mode/length, and VQ grids         |
| `decoder.ts` — latent codes → raster          | ⚠️ Partial     | `renderSky()` / `renderTerrain()` functional; `tryDecodeReferenceLandscape()` fires when reference weights present              |
| `package.ts` — raster → PNG                   | ✅ Ships       |                                                                                                                                 |
| `decoders/llamagen.ts`                        | 🔴 Stub        | Throws `NotImplementedError` — bridge to LlamaGen VQ-VAE decoder, not yet wired                                                 |
| `decoders/seed.ts`                            | 🔴 Stub        | Throws `NotImplementedError` — bridge to SEED decoder                                                                           |
| `training/`                                   | 📋 Recipe only | Seed-expansion training direction is locked; concrete tokenizer family, dataset, and weights remain open                        |

### @wittgenstein/codec-video

| Component                | Status   | Notes                                                     |
| ------------------------ | -------- | --------------------------------------------------------- |
| Schema + Zod             | ✅ Ships |                                                           |
| `hyperframes-wrapper.ts` | 🔴 Stub  | Throws `NotImplementedError` — HyperFrames not yet forked |

### @wittgenstein/cli

| Command               | Status   | Notes                                                     |
| --------------------- | -------- | --------------------------------------------------------- |
| `wittgenstein image`  | ✅ Ships | Calls codec-image; renders with available adapter/decoder |
| `wittgenstein audio`  | ✅ Ships | Full speech + soundscape + music routes                   |
| `wittgenstein sensor` | ✅ Ships | Full signal expand + Loupe dashboard                      |
| `wittgenstein video`  | 🔴 Stub  | Codec throws `NotImplementedError`                        |
| `wittgenstein doctor` | ✅ Ships | Checks node, pnpm, env vars, package links                |

### @wittgenstein/sandbox

| Component                             | Status                    |
| ------------------------------------- | ------------------------- |
| `exec.ts` — `execProgram()` interface | ✅ Ships (typed boundary) |

---

## Loupe dashboard renderer

| Component                                  | Status   | Notes                                                                              |
| ------------------------------------------ | -------- | ---------------------------------------------------------------------------------- |
| CSV / JSON → self-contained HTML dashboard | ✅ Ships | `packages/codec-sensor/loupe.py`; 117 KB HTML, zero external deps, dark/light mode |

---

## What is intentionally **not** implemented

These are explicit scope decisions, not omissions:

- **LlamaGen / SEED VQ-VAE decoder weights** — neural image codec requires a trained adapter;
  stubs are typed and ready to wire. See `docs/codecs/image.md`.
- **HyperFrames video integration** — reserved post-hackathon. Schema and codec interface are locked.
- **Real LLM fine-tuning** — the only trained models are the two tiny MLPs (image style adapter +
  audio ambient classifier). No fine-tuning of base models.
- **Cloud render APIs** — no DALL·E, ElevenLabs, or Runway calls anywhere in the stack.
- **Stable Diffusion / diffusion models** — explicitly excluded by `docs/hard-constraints.md`.
