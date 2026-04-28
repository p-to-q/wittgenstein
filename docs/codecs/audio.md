# Audio Codec

Audio is the second-priority modality after image. It ships three internal routes — `speech`, `soundscape`, `music` — under a single `Codec<AudioRequest, AudioArtifact>` shape. The route decision is codec-internal; the harness does not branch on audio.

`LLM -> structured AudioPlan JSON -> per-route render -> WAV bytes -> manifest`

## Position

Audio is a _layered_ modality, not a single decoder. Each route picks its own L3:

- `speech` — `Kokoro-82M-family` local TTS render by default, with `Piper-family`
  fallback, plus optional ambient layer.
- `soundscape` — deterministic ambient texture render from a small operator library.
- `music` — tiny symbolic synthesizer (chords, melody, rhythm) plus optional ambient layer.

This means audio's "decoder" is per-route, not a single frozen artifact like image's
decoder. The ADR-0005 "decoder ≠ generator" line still holds: no path samples from a
learned distribution at inference time, and every route has an explicit reproducibility
contract. Procedural routes are byte-stable by construction; speech is byte-stable on
the pinned deterministic CPU backend and structural-only on GPU. There is no audio
diffusion in the core path.

At the v0.3 harness boundary there is also **no audio tokenizer**. The speech decoder
emits a waveform directly; the codec packages waveform bytes plus manifest rows without
an intermediate EnCodec / DAC / Mimi layer.

## CLI Surface

- `wittgenstein tts "launch line" --ambient rain --out out.wav`
- `wittgenstein audio "ambient score" --route music --out out.wav`

The legacy `--route` flag enters soft-warn deprecation at M2 of the codec-v2 port (see `docs/exec-plans/active/codec-v2-port.md`). Routing moves inside the codec; the user-facing flag survives one minor version for compatibility.

## What the LLM Emits — `AudioPlan`

The model emits a structured `AudioPlan`, not raw samples or waveform descriptions. Core fields:

- `route` — `"speech" | "soundscape" | "music"` (codec-internal post-M2)
- `script` — short spoken or guiding text (speech / soundscape)
- `ambient` — `"auto" | "silence" | "rain" | "wind" | "city" | "forest" | "electronic"`
- `timeline` — segment-level structure (start, end, intent)
- `music` — chord progression, key, tempo, instrument hint

The LLM does not emit raw audio, MIDI bytes, or sample arrays. It emits a _plan_ that the per-route renderer turns into bytes.

## Render Path

### Speech route

- `Kokoro-82M-family` decoder by default, with `Piper-family` as the fallback speech
  path if the deterministic CPU gate fails on Kokoro.
- Optional ambient layer mixed at a fixed gain.
- Output: 16-bit mono WAV at 22050 Hz (configurable via the AudioPlan).

### Soundscape route

- Deterministic ambient texture render from a small operator library (filtered noise, granular layers, periodic events).
- No LLM-driven sample generation at render time; the LLM's job is fully captured by the AudioPlan.
- Output: 16-bit stereo WAV.

### Music route

- Tiny symbolic synth: chord progression → instrument-tagged note events → additive synthesis.
- Optional ambient layer.
- Not a music-generation model. Quality is _structurally correct_, not _aesthetically frontier_. The thesis surface is "the LLM plans music; the synth renders the plan."

## Decoder Choices and Why

The v0.3 path picks render libraries on three constraints, in order: **license-clean,
on-device, deterministic.**

| Route      | v0.3 default                              | Why this and not X                                                                                                                                                                   |
| ---------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| speech     | Kokoro-82M-family default; Piper fallback | ElevenLabs / cloud TTS would violate "on-device deterministic." F5 / XTTS-class paths either fail the commercial-license bar or create a less reproducible inference story for v0.3. |
| soundscape | deterministic operator-library render     | No external sample packs (license risk); no neural soundscape model (not deterministic in the ADR-0005 sense).                                                                       |
| music      | symbolic synth (chord → note → sample)    | MusicLM / Riffusion are generators in the ADR-0005 sense — out of scope. MIDI rendering against a frozen soundfont is in-scope and on the v0.3 upgrade path.                         |

The v0.3+ upgrade path is named in `docs/exec-plans/active/codec-v2-port.md` M5b (audio benchmark bridge): UTMOS + Whisper-WER for speech, librosa spectral metrics for soundscape, LAION-CLAP for music.

## Adapter Role

Audio does not have a trained L4 adapter at v0.3. The route renders take the AudioPlan
directly. This is the same pattern as `codec-sensor`: when the LLM's structured output
is _already_ the renderer's input language, no L4 bridge is needed.

If a future audio decoder (e.g. a frozen mel-spectrogram-to-waveform vocoder) requires a
token-grid input, an L4 adapter slot is reserved in the codec's `adapt` stage. Until
then `adapt` is a pass-through (`BaseCodec.passthrough`) and the harness boundary stays
waveform-direct.

## Pipeline Stages (post-M2 shape)

- `expand` — LLM call(s) producing the AudioPlan; one round by default, two with `--expand`.
- `adapt` — pass-through at v0.3.
- `decode` — route-internal render: `speech.ts` / `soundscape.ts` / `music.ts`.
- `package` — codec authors its own manifest rows: `route`, `seed`, `model_id`, `quality.structural`, optional `quality.partial`.

## Failure Modes

- The LLM emits an AudioPlan with an out-of-range route — caught by zod parse, surfaced as a structured error.
- The TTS engine is unavailable on the host — codec writes `quality.partial: { reason: "tts_engine_missing" }` and a manifest row noting the failure; no silent fallback.
- The music plan specifies a key/tempo combination the synth cannot render — error surfaced to the user with the offending plan field; no down-tuning happens silently.
- An ambient layer file is missing — fall back to silence with a structured warning, never to a different ambient.

## Artifact

The current fast path emits 16-bit WAV. Sample rate and channel count are recorded in the manifest, not assumed.

## Goldens

`artifacts/showcase/workflow-examples/{tts,soundscape,music}/` are the preserved
`v0.1.0-alpha.1` hackathon receipt pack, still used as the current regression corpus until
the post-lock Codec v2 showcase refresh lands. For speech, the ratified contract is:

- **CPU deterministic backend:** byte-parity
- **GPU backend:** structural parity only (sample rate, channels, duration ±5%)

Soundscape and music synthesis stay deterministic and get byte-for-byte SHA-256 checks.

## Benchmark Case

See `tts-launch` and `audio-music` in `benchmarks/cases.json`. Quality bridges land at M5b per `docs/exec-plans/active/codec-v2-port.md`.

## Honest Risk Statement

Audio quality at v0.3 is _structurally honest_, not _aesthetically frontier_:

- Speech intelligibility from the Kokoro-82M-family default is strong for local TTS, but
  still not ElevenLabs-grade; the Piper fallback is slightly lower.
- Soundscape texture is recognizable but not field-recording-grade.
- Music is identifiable as music in the requested key but is not Suno / Udio quality.

The thesis surface is preserved: the LLM plans, the codec renders, the manifest records,
and the artifact reproduces from seed within its declared determinism class. Quality lift
remains a v0.3 concern via M5b benchmarks and a future frozen-vocoder integration.
