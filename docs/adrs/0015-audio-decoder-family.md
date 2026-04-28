# 0015 Audio Decoder Family

## Status

Accepted (ratifies Brief I).

## Context

Audio is the next execution line after M1A. `Brief J` already pinned the smallest honest
M2 engineering shape for route collapse, manifest authorship, fixtures, and
`AudioRequest.route` deprecation. What remained unratified was the decoder-family
decision itself.

`docs/codecs/audio.md` still carried a Piper-centered v0.2 demo description even after
`Brief I` concluded that the calibrated v0.3 speech path should be:

- **Kokoro-82M-family decoder** as the default speech decoder family;
- **Piper-family** as the named fallback if the M2 parity test rejects Kokoro on the
  pinned deterministic backend;
- **no audio tokenizer** at the v0.3 harness boundary;
- **procedural soundscape and procedural/symbolic music** through v0.3;
- **CPU byte-parity / GPU structural-parity** as the reproducibility contract for neural
  TTS.

M2 should not open while those facts exist only as a research-brief verdict. The
canonical audio docs, port guide, and exec-plan must all point at the same ratified
decoder-family decision before implementation starts.

## Decision

1. **Speech decoder family**
   - Wittgenstein names **Kokoro-82M-family decoder** as the default speech decoder family
     for v0.3 audio.
   - **Piper-family** is the explicit fallback if Kokoro fails the pinned M2
     reproducibility gate on the deterministic backend.

2. **Tokenizer boundary**
   - Wittgenstein does **not** add an audio tokenizer at the v0.3 harness boundary.
   - The audio codec consumes waveform output directly from the speech decoder family.
   - `IR` remains `Text`-inhabited only at v0.3; `Latent` and `Hybrid` stay reserved for
     future bidirectional audio work.

3. **Soundscape and music**
   - `soundscape` remains procedural through v0.3.
   - `music` remains procedural / symbolic through v0.3.
   - No neural soundscape or neural music decoder is part of the M2 execution line.

4. **Reproducibility contract**
   - Neural TTS is ratified as a **two-tier** contract:
     - **CPU deterministic backend:** byte-parity
     - **GPU backend:** structural-parity only
   - The codec's `package` stage must write the determinism class into the manifest so
     downstream users can tell whether a speech artifact's SHA is expected to replay
     bit-exactly.
   - This ADR ratifies the evidence requirement, not the exact manifest serialization
     key. The M2 implementation PR and its implementation memo pin that schema-level
     key.

5. **Boundary with M2 implementation**
   - This ADR ratifies the decoder family and the reproducibility contract.
   - It does **not** ratify a local route-collapse framework. The helper-first route
     collapse remains an execution hypothesis governed by the M2 port guide and exec
     plan.

## Consequence

- `docs/codecs/audio.md` becomes canonical for:
  - Kokoro default / Piper fallback,
  - no tokenizer at the harness boundary,
  - procedural soundscape/music through v0.3,
  - CPU byte-parity / GPU structural-parity for speech.
- `docs/agent-guides/audio-port.md` may name the speech decoder family and parity
  contract explicitly, while continuing to treat helper extraction / `BaseAudioRoute`
  questions as execution hypotheses rather than doctrine.
- `docs/exec-plans/active/codec-v2-port.md` may reference the ratified speech decoder
  family and parity contract in M2, but should not silently promote route-collapse
  tactics into doctrine.
- If both Kokoro and Piper fail the deterministic CPU gate during M2, reopen this ADR
  and fall back to procedural OS speech (`say` / `espeak-ng`) per Brief I's kill
  criterion.
