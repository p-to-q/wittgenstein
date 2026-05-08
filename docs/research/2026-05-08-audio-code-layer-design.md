---
date: 2026-05-08
status: research note
labels: [research-derived, m2-audio]
tracks: [#260, #255]
---

# Audio code-layer design — speech / music / soundscape

> **Status:** research note (not doctrine, not active execution guidance).
> Surveys what each audio route should ask the LLM to emit, why those shapes differ from image VSC, and which neural audio codec families are worth tracking without becoming runtime dependencies. Pins nothing as doctrine; commits no implementation.
> _Tracker: [#260](https://github.com/p-to-q/wittgenstein/issues/260) under [#255](https://github.com/p-to-q/wittgenstein/issues/255). M2 audio gate is closed; this note is design-forward, not slice work._

## Why this note exists

Audio at v0.3 ships three internal routes — `speech`, `soundscape`, `music` — under a single `Codec<AudioRequest, AudioArtifact>` shape (`docs/codecs/audio.md`). The route decision is codec-internal; the LLM emits an `AudioPlan` JSON. Two things are *not* explicit in the current docs:

1. **What the LLM should emit *per route***. The `AudioPlan` schema admits `script` / `ambient` / `timeline` / `music` fields, but each route has a natural code shape — phoneme/prosody for speech, score/event-grid for music, operator graph for soundscape — that the schema treats uniformly. A future contributor reading the schema can't tell whether `script: "Hello world"` is the LLM's full job for speech or a placeholder for richer planning.
2. **Whether audio should adopt VSC-style discrete tokens**. Image is moving to Visual Seed Code (compact discrete codes). Audio could in principle adopt the same shape via EnCodec / DAC / Mimi / SoundStream codes. This note surveys whether that's a good idea per route.

The user explicitly named audio as needing further design work (paraphrasing the kickoff message: *"audio and audio routes still need further design ... Claude is better at this kind of investigation"*). This note is the broad-and-narrow research the user requested.

## Per-route survey

### Speech

#### Status today
The current `procedural-audio-runtime` is the v0.3 default; Kokoro-82M-family is opt-in per `WITTGENSTEIN_AUDIO_BACKEND=kokoro` (Slice E found Kokoro is same-platform deterministic but not byte-identical across macOS arm64 vs Linux x64). Piper-family is the ratified-but-not-wired fallback target.

The LLM today is asked for `script` (the spoken text). That's the only meaningful field for the speech route — the per-route renderer handles voice / sample rate / prosody internally based on the configured backend.

#### Code-layer candidates beyond plain script

| Code shape | What it adds | Cost |
|---|---|---|
| **Plain text script** (today) | Nothing beyond what's already there | Trivial, but ceiling is "TTS quality of the chosen backend" |
| **SSML-flavored script** | Prosody hints (rate, pitch, emphasis, breaks, sub-substitutions) | Backend must support SSML; both Kokoro and Piper have varying SSML compliance |
| **IPA-augmented script** | Per-word phonetic guidance for hard-to-pronounce names | Most backends accept IPA at the word level; a structured `ipaOverrides` map could attach to plain script |
| **Phoneme + prosody event grid** | Per-phoneme timing + pitch contour | Closer to what Tacotron / FastSpeech / Kokoro consume internally; would let the LLM control prosody fully |
| **Discrete neural codec tokens** (EnCodec / DAC / Mimi) | Compresses waveform to ~75-300 tokens/sec; LLM-friendly | Requires a frozen decoder for that codec family + LLM emission of valid token sequences (untested for frozen LLMs) |

#### Citations / verify-status

- **SSML 1.1**: W3C Recommendation, 2010. Public spec at w3.org/TR/speech-synthesis11. No arXiv. Browser/TTS-engine support varies.
- **IPA**: International Phonetic Association standard chart (1989, revised 2020). No paper citation; widely adopted standard.
- **Tacotron 2**: Shen et al., ICASSP 2018, arXiv:1712.05884. Phoneme-input + mel-spectrogram-output baseline.
- **FastSpeech 2**: Ren et al., ICLR 2021, arXiv:2006.04558. Non-autoregressive phoneme-to-mel; faster + parallel.
- **Kokoro-82M**: `hexgrad/Kokoro-82M` on HuggingFace. License: Apache-2.0 per HF model card (verify-locally before any commitment).
- **Piper**: `rhasspy/piper` GitHub. License: MIT per repo (verify-locally).
- **EnCodec**: Défossez et al., Meta, 2022 — arXiv:2210.13438. Discrete neural codec for general audio. License: MIT per `facebookresearch/encodec` repo (verify-locally).
- **DAC (Descript Audio Codec)**: Kumar et al., NeurIPS 2023 — arXiv:2306.06546. Higher-quality general-audio codec. License: MIT per `descriptinc/descript-audio-codec` (verify-locally).
- **VALL-E**: Wang et al., Microsoft, 2023 — arXiv:2301.02111. LLM-shaped TTS over discrete codec tokens; no public weights at time of survey.
- **Mimi**: Défossez et al., 2024, in the Moshi paper — arXiv:2410.00037. 12.5 Hz codec used inside Moshi's full-duplex speech LLM.

#### Recommendation for speech

Stay with plain text `script` as the v0.3 default; backend-specific prosody happens server-side. Add SSML as an *optional* enrichment for Kokoro-class backends that support it, gated behind a `script.ssml: boolean` flag — small extension, no schema break.

**Do not adopt EnCodec / DAC tokens as the primary speech code shape at this stage.** Reasoning:
- Frozen-LLM emission of valid neural codec sequences is untested; the same prediction-1-falsification risk that the image VSC theoretical anchor (`docs/research/2026-05-08-vsc-as-compression-prior.md`) flags applies double here, because audio token alphabets are larger and audio determinism windows are tighter.
- Replacing TTS with codec tokens trades a working sound for a bet on LLM emission quality.
- The receipt story (Kokoro structural-parity vs Piper/procedural byte-parity) is already harder than image; adding a token layer compounds it.

**Watch:** if a public, MIT-or-Apache, frozen, byte-deterministic audio-codec decoder *with* a published frozen-LLM-emission validation lands, re-evaluate. Mimi-class 12.5 Hz codecs are the right token-rate frontier to track.

### Music

#### Status today
Music route is a "tiny symbolic synth: chord progression → instrument-tagged note events → additive synthesis" (`docs/codecs/audio.md` §"Music route"). The LLM is asked for `music: { chord progression, key, tempo, instrument hint }`. Quality is "structurally correct, not aesthetically frontier" — explicitly honest.

#### Code-layer candidates

| Code shape | What it adds | Cost |
|---|---|---|
| **Today's chord/key/tempo/instrument hint** | Lowest-friction LLM-emittable musical plan | Bounded by the additive synth's expressiveness |
| **MIDI-style event grid** | `[time, pitch, velocity, duration, instrument]` rows; ~50-200 events for a 30s clip | LLM has to emit time-ordered structured rows; backend renders against a soundfont |
| **MusicXML / ABC notation** | Score-level structure with bars, time signatures, key changes | Heavier than MIDI; more useful for composition than rendering |
| **MIDI bytes** | Raw MIDI-1.0 file content | LLM-emittable in principle; lossy beyond what Wittgenstein needs at v0.3 |
| **Discrete neural music tokens** (MusicGen, AudioLM-music) | Direct waveform compression for music | Same emission-validity concern as speech codecs |

#### Citations

- **General MIDI 1.0**: MMA spec, 1991. Public; no arXiv.
- **MIDI 2.0**: MMA spec, 2020. Public; supports per-note articulations / pitch bends.
- **MusicXML**: W3C community group; current major version 4.0 (2021).
- **ABC notation**: Public format (`abcnotation.com`), Steve Allen et al., 1991.
- **MusicGen**: Copet et al., NeurIPS 2023 — arXiv:2306.05284. Conditional music generation over EnCodec-quantized tokens. License: MIT per `facebookresearch/audiocraft` (verify-locally).
- **AudioLM**: Borsos et al., 2022 — arXiv:2209.03143. Hierarchical audio-token language model.
- **Suno / Udio**: closed-source music generators; explicitly out-of-scope for Wittgenstein per ADR-0005.

#### Recommendation for music

Promote a **MIDI-event-grid sub-shape** as an optional enrichment to `music.events: Array<{timeSec, pitch, velocity, durationSec, instrument}>`. Schema extension is small; the existing additive synth would need a per-event renderer (replaces today's chord-progression-to-events expansion). This gives the LLM tighter control over the output without leaving the deterministic-render envelope.

**Do not promote MIDI bytes or MusicXML as primary**: byte-level MIDI is brittle in JSON; MusicXML is verbose. The event-grid sub-shape captures the useful subset.

**Do not adopt MusicGen tokens.** Same emission-validity concern as speech; additionally MusicGen is a generator (samples from a learned distribution at inference) — explicitly out-of-scope per ADR-0005.

### Soundscape

#### Status today
Soundscape is a "deterministic ambient texture render from a small operator library (filtered noise, granular layers, periodic events)" (`docs/codecs/audio.md` §"Soundscape route"). The LLM emits `script` (intent description) + `ambient` (preset name like `rain` / `forest`) + `timeline`.

#### Code-layer candidates

| Code shape | What it adds |
|---|---|
| **Today: preset name + intent** | Lowest-friction; bounded by preset library size |
| **Operator graph** | Mirror sensor's `operators[]` — sound-domain operators (noise, filter, granulator, envelope) composed into a deterministic texture |
| **Event timeline + scene graph** | Discrete sound events at timestamps + an ambient bed |
| **Discrete neural codec tokens** | Same as speech / music |

#### Recommendation for soundscape

**Promote the operator graph shape**, mirroring sensor's existing `operators[]` discipline (oscillator / drift / noise / pulse / step / ecgTemplate). This is structurally clean — soundscape is the audio-side analogue of sensor: deterministic operator expansion over time, no learned bridge needed. The new operators would be (illustratively):

- `noiseLayer { color, gain, hipass?, lopass? }`
- `granulator { sourceFile?, density, grainSizeMs, jitter }`
- `eventStream { rateHz, eventClipName, jitter, gain }`
- `ambientBed { presetName }` — backwards compatible with today's preset

Each is deterministic given seed + parameters. The schema extension follows sensor's pattern exactly. **Concrete next step:** if this lane is ratified, open a small RFC scoping the soundscape operator library.

**No neural soundscape generation.** Same out-of-scope reasoning as MusicGen.

## Cross-route summary

| Route | Today's LLM-emit | Recommended next (this note) | Rejected (this note) |
|---|---|---|---|
| **Speech** | `script` (text) | + optional SSML enrichment + structured `ipaOverrides` | EnCodec / DAC tokens as primary; VALL-E-class direct token emission |
| **Music** | `chord/key/tempo/instrument` | + optional `music.events: MIDI-style grid` | MIDI bytes; MusicXML as primary; MusicGen tokens |
| **Soundscape** | `script + ambient preset + timeline` | + sensor-style `operators[]` graph (RFC-gated) | Neural soundscape generation |

The unifying claim: **audio routes do NOT share a single VSC-style token shape**, and that's correct, not a gap. Speech is text-shaped; music is event-grid-shaped; soundscape is operator-graph-shaped. Forcing them under one VQ-tokenizer story would re-introduce the very category error the image-route correction (#233-#239) just fixed by separating image from the other modalities.

The shared *shape* is `Codec<AudioRequest, AudioArtifact>` — that's at L2, the codec contract level. The route-specific *code* is below that, at the per-route render layer.

## Future neural audio tokens (parallel watch, NOT primary)

Tracked here so the radar exists when license/determinism/empirical-emission gates trip later:

| Family | Paper | License (per source) | Status |
|---|---|---|---|
| EnCodec | arXiv:2210.13438 | MIT (verify-locally) | Watch — most-adopted neural audio codec; well-understood |
| DAC | arXiv:2306.06546 | MIT (verify-locally) | Watch — higher-quality successor |
| SoundStream | arXiv:2107.03312 | per Google (verify) | Watch — Google's contribution; less open than EnCodec |
| Mimi | arXiv:2410.00037 (Moshi) | per Kyutai (verify) | Watch — 12.5 Hz codec; LLM-friendly token rate |
| MusicGen | arXiv:2306.05284 | MIT (verify-locally) | Generator, out-of-scope for primary; useful as a token-shape reference |
| AudioLM | arXiv:2209.03143 | per Google (verify) | Watch — hierarchical token shape |
| VALL-E | arXiv:2301.02111 | unclear (Microsoft) | No public weights; theoretical interest only |

**Common pattern across all of these:** they pair an audio-token codec with a language-model-shaped sequence model that *generates* tokens. Wittgenstein's bet is on the *codec half* (deterministic decode-from-tokens), not the *generation half* (LLM emits tokens by sampling from a learned distribution). Today no public, MIT-or-Apache, frozen, byte-deterministic audio codec ships with both verified license + a published frozen-LLM-emission validation. When that happens, this radar gets re-evaluated.

## What this note predicts (testable consequences)

1. **SSML enrichment to speech `script` should improve TTS prosody when emitted by frozen LLMs**, on backends that support SSML (Kokoro at minimum). Testable by A/B comparison: same input prompt, with and without SSML enrichment, evaluated on a UTMOS-like metric.
2. **MIDI-event-grid music should be more controllable than today's chord-progression-only**. Testable: did the rendered output match the LLM-specified note timings within ±10ms? Today's chord-progression interface can't even ask that question.
3. **Operator-graph soundscape should produce deterministic byte-stable output across runs at fixed seed**, the same way sensor's operator graph already does. Testable trivially: same spec + same seed → same SHA-256.
4. **Audio routes should NOT cross-pollinate code shapes.** If a maintainer ever writes a "unified audio token spec," they will discover that speech / music / soundscape cannot share the same shape without quality cliffs. The opposite-direction prediction is the test.

## What this note does NOT do

- Does NOT propose schema changes. Each "promote X sub-shape" recommendation would land as its own RFC.
- Does NOT pick a neural audio codec. The radar above is parallel watch, not primary.
- Does NOT modify `docs/codecs/audio.md`. That doc is solid; the recommendations here would attach to it after RFC ratification.
- Does NOT reopen Kokoro/Piper backend decisions (Slice E gate is closed).
- Does NOT close M2 — M2 audio gate stays closed; this is design-forward research.
- Does NOT promote any audio-codec dependency.

## Cross-references

- `docs/codecs/audio.md` — current audio doc; the recommendations here would attach there.
- ADR-0015 — Kokoro-82M-family default target for speech (ratified but not wired as default at v0.3 due to cross-platform byte-identity).
- ADR-0005 — decoder ≠ generator (the line audio honors).
- `docs/research/2026-05-08-vsc-as-compression-prior.md` — image's theoretical anchor; useful contrast (audio's per-route-different-shape vs image's family-agnostic VSC).
- `docs/research/2026-05-07-sensor-patch-grammar.md` — operator-graph discipline this note recommends importing for soundscape.
- `docs/codecs/sensor.md` §"Higher-order operator: `patchGrammar`" — exemplar of the operator-graph framing.
- #260 — this note's commission.
- #261 — audio implementation slices (downstream from this note's recommendations).
- #255 — umbrella stewardship.

## Suggested follow-ups

If the recommendations are ratified:

1. **Speech SSML enrichment RFC** — small RFC scoping `script.ssml` + per-backend SSML support matrix.
2. **Music MIDI-event-grid RFC** — schema extension for `music.events`; existing additive synth needs a per-event renderer.
3. **Soundscape operator-graph RFC** — mirrors sensor's operator discipline; the largest of the three but architecturally clean.
4. **Audio code-layer eval matrix** — analogous to #254 r2 / #258 radar, populated once SSML / MIDI / operator candidates have local evidence.

These are deferred until this research note is ratified. Three RFCs is a lot if launched simultaneously; the right order is probably soundscape first (cleanest schema mirror), MIDI grid second (incremental gain over today), SSML last (depends on backend audit).
