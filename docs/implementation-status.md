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
> Last updated: 2026-05-31. "Ships" = produces real output today. "Stub" = typed interface,
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

The TS monorepo is the **production harness layer** (L1–L5). Core, schemas, CLI, sensor, audio, and
video HTML codecs ship; image codec is ⚠️ Partial pending M1B trained projector, and the video MP4
encode path is an opt-in repo-owned renderer (Chrome/Chromium + FFmpeg).

### @wittgenstein/schemas

| Export                                          | Status   | Notes                                           |
| ----------------------------------------------- | -------- | ----------------------------------------------- |
| `WittgensteinCodec<Req,Parsed>` interface       | ✅ Ships | Full type contract                              |
| `RenderResult`, `RenderCtx`, `RunManifest`      | ✅ Ships |                                                 |
| `Modality` enum                                 | ✅ Ships | image / audio / video / sensor / svg / asciipng |
| `SensorRequest`, `AudioRequest`, `ImageRequest` | ✅ Ships | Zod schemas                                     |

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

| Component                                     | Status         | Notes                                                                                                                                                   |
| --------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema + Zod image-code contract              | ✅ Ships       | Visual Seed Code contract now supports `seedCode`, optional `semantic`, optional `coarseVq`, and `providerLatents`                                      |
| `expand.ts` — prompt → image code             | ⚠️ Partial     | LLM-driven; dry-run emits deterministic `witt-dry-run` seed tokens, while real prompt-stack quality remains a follow-up                                 |
| `adapter.ts` — seed / semantic → latent codes | ⚠️ Partial     | Priority order now ships as `providerLatents -> coarseVq -> seedCode -> semantic fallback -> placeholder`; trained expander TBD                         |
| Image-code manifest receipts                  | ✅ Ships       | `metadata.imageCode` / manifest `image.code` records intent; `renderPath` and `image.adapter` record fired tier, fallback reasons, and seed-expander id |
| `decoder.ts` — latent codes → raster          | ⚠️ Partial     | `renderSky()` / `renderTerrain()` functional; `tryDecodeReferenceLandscape()` fires when reference weights present                                      |
| `package.ts` — raster → PNG                   | ✅ Ships       |                                                                                                                                                         |
| `decoders/llamagen.ts`                        | 🔴 Stub        | Throws `NotImplementedError` — bridge to LlamaGen VQ-VAE decoder, not yet wired                                                                         |
| `decoders/seed.ts`                            | 🔴 Stub        | Throws `NotImplementedError` — bridge to SEED decoder                                                                                                   |
| `training/`                                   | 📋 Recipe only | Seed-expansion training direction is locked; concrete tokenizer family, dataset, and weights remain open                                                |

### @wittgenstein/codec-video

| Component                 | Status    | Notes                                                                                                 |
| ------------------------- | --------- | ----------------------------------------------------------------------------------------------------- |
| Schema + Zod              | ✅ Ships  | Validates `VideoComposition`                                                                          |
| HTML composition renderer | ✅ Ships  | Emits self-contained HyperFrames-shaped HTML via `scene-card` / `svg-slide` compositions              |
| Distilled MP4 renderer    | ⚠️ Opt-in | Default MP4 backend with `WITTGENSTEIN_HYPERFRAMES_RENDER=1`; local Chrome/Chromium + FFmpeg required |
| Upstream CLI backend      | ⚠️ Opt-in | `WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli` keeps an explicit parity / experiment path                 |
| `videoRender` receipts    | ✅ Ships  | Records backend, FPS, quality, dimensions, frame count / duration, output kind, tool versions         |

### @wittgenstein/codec-svg

| Component                        | Status    | Notes                                                                |
| -------------------------------- | --------- | -------------------------------------------------------------------- |
| Schema + Zod validation          | ✅ Ships  | Validates `SvgRequest` and SVG artifact output                       |
| Local deterministic renderer     | ✅ Ships  | `source: "local"` emits vector art without network calls             |
| Grammar engine HTTP source       | ⚠️ Opt-in | `source: "engine"` delegates to the research grammar engine contract |
| SVG artifact + manifest receipts | ✅ Ships  | Writes SVG bytes and deterministic local receipts                    |

### @wittgenstein/codec-asciipng

| Component                         | Status    | Notes                                                                 |
| --------------------------------- | --------- | --------------------------------------------------------------------- |
| Schema + Zod validation           | ✅ Ships  | Validates grid size, cell size, and source                            |
| Local character-grid PNG renderer | ✅ Ships  | Deterministic text-to-grid raster path, no image generator dependency |
| Minimax text post-process source  | ⚠️ Opt-in | Calls text chat, normalizes lines, then rasterizes local PNG bytes    |
| PNG artifact + manifest receipts  | ✅ Ships  | Deterministic local source covered by golden tests                    |

### @wittgenstein/cli

| Command                     | Status     | Notes                                                                    |
| --------------------------- | ---------- | ------------------------------------------------------------------------ |
| `wittgenstein init`         | ✅ Ships   | Writes starter project config                                            |
| `wittgenstein image`        | ✅ Ships   | Calls codec-image; renders with available adapter/decoder                |
| `wittgenstein audio`        | ✅ Ships   | Full speech + soundscape + music routes                                  |
| `wittgenstein tts`          | ✅ Ships   | Convenience alias for the audio codec's speech route                     |
| `wittgenstein sensor`       | ✅ Ships   | Full signal expand + Loupe dashboard                                     |
| `wittgenstein svg`          | ✅ Ships   | Local deterministic SVG; grammar-engine source is opt-in                 |
| `wittgenstein asciipng`     | ✅ Ships   | Local text-grid PNG; Minimax text source is opt-in                       |
| `wittgenstein video`        | ⚠️ Partial | Emits HTML by default; MP4 encode is repo-owned local renderer opt-in    |
| `wittgenstein animate-html` | ✅ Ships   | Builds self-contained slideshow HTML from SVG inputs                     |
| `wittgenstein replay`       | ⚠️ Partial | Byte-parity replay for sensor, svg-local, and asciipng-local routes      |
| `wittgenstein doctor`       | ✅ Ships   | Checks node, pnpm, env vars, package links, and runtime tier readiness   |
| `wittgenstein install`      | ⚠️ Partial | Dry-run tier plans ship; real image install preflights blessed manifests |

### @wittgenstein/process-runner

| Component                      | Status   | Notes                                                       |
| ------------------------------ | -------- | ----------------------------------------------------------- |
| `runProcess()`                 | ✅ Ships | Generic subprocess timeout + bounded stdout/stderr capture  |
| Optional-runtime probe helpers | ✅ Ships | Shared `--version` probing and doctor receipt normalization |

### @wittgenstein/sandbox

| Component                             | Status  | Notes                                                       |
| ------------------------------------- | ------- | ----------------------------------------------------------- |
| `exec.ts` — `execProgram()` interface | 🔴 Stub | Typed production boundary; throws `SANDBOX_NOT_IMPLEMENTED` |

---

## Loupe dashboard renderer

| Component                                  | Status   | Notes                                                                                      |
| ------------------------------------------ | -------- | ------------------------------------------------------------------------------------------ |
| CSV / JSON → self-contained HTML dashboard | ✅ Ships | `packages/codec-sensor/loupe.py`; self-contained HTML, zero external deps, dark/light mode |

---

## What is intentionally **not** implemented

These are explicit scope decisions, not omissions:

- **LlamaGen / SEED VQ-VAE decoder weights** — neural image codec requires a trained adapter;
  stubs are typed and ready to wire. See `docs/codecs/image.md`.
- **Video quality metrics** — the HyperFrames-shaped renderer now emits HTML by default
  and opt-in MP4 via repo-owned Chrome + FFmpeg code, but M5b scoring (clip-frame-drift,
  FVD / Video-Bench-style heavy paths) remains downstream.
- **Real LLM fine-tuning** — the only trained models are the two tiny MLPs (image style adapter +
  audio ambient classifier). No fine-tuning of base models.
- **Cloud render APIs** — no DALL·E, ElevenLabs, or Runway calls anywhere in the stack.
- **Stable Diffusion / diffusion models** — explicitly excluded by `docs/hard-constraints.md`.
