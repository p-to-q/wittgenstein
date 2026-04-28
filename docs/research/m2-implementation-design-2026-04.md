# M2 Implementation Design Memo (2026-04)

**Classification:** implementation memo, non-doctrine surface  
**Status:** implementation-facing research note  
**Stage:** post-`#87`, post-`#88`, pre-M2 code execution  
**Purpose:** remove remaining execution ambiguity before the audio port opens

This memo is not a new doctrine surface. It translates the now-ratified audio decisions
into a decision-complete implementation shape for M2.

## Dependency note

This memo assumes the following docs are merged first and should be read as subordinate
to them:

- `#87` — preflight drift cleanup and route-deprecation inventory
- `#88` — `ADR-0015` ratification of the audio decoder family

If either PR is still open, this memo should be treated as implementation preparation
only, not as a source of standalone doctrine.

Locked inputs:

- `ADR-0008` — Codec Protocol v2
- `ADR-0015` — audio decoder family and reproducibility contract
- `docs/agent-guides/audio-port.md`
- `docs/exec-plans/active/codec-v2-port.md` §M2
- `docs/research/briefs/M2-route-deprecation-inventory.md`

Non-goals:

- no new decoder-family research
- no CLI ergonomics rewrite beyond the already-accepted `--route` compatibility window
- no soundscape/music neuralization
- no `M1B`, `#77`, or horizon-spike work

## 1. Current code reality

The current v0.1 audio surface already narrowed the problem:

- `packages/codec-audio/src/codec.ts` is still a v0.1 `WittgensteinCodec`, but it
  already delegates to small route files instead of one giant renderer.
- `packages/codec-audio/src/runtime.ts` already owns the real shared primitives:
  artifact finalization, ambient generation, mixing, fallback speech synthesis, and
  symbolic music synthesis.
- The remaining duplication in the route files is mostly **shared-mechanical
  scaffolding**, not duplicated render math.
- `packages/core/src/runtime/router.ts` is already modality-only; the real M2 harness
  work sits in `packages/core/src/runtime/harness.ts`, which still carries the v1 audio
  branch.
- `packages/cli/src/commands/audio.ts` and `packages/cli/src/commands/tts.ts` still
  construct request-side route information; `#87` inventories those callers.

That means M2 should be implemented as a narrow port, not a local framework invention.

## 2. Route-collapse cut line

### Keep route-local

The following logic stays in the route files even after helper extraction:

- **Speech**
  - speech duration inference from script length
  - decoder invocation and fallback ordering
  - WAV-to-float decode if the speech backend writes a file
- **Soundscape**
  - route-specific category normalization (`silence -> forest` fallback if preserved)
  - direct ambient render path
- **Music**
  - motif/BPM/key interpretation
  - symbolic synth invocation
  - route-specific ambient gain choice

### Move into shared-mechanical helpers

The following logic should become helpers or a tiny shared module:

- `resolveAmbientCategory(plan, hintText)`
  - handles `auto` vs explicit category
  - accepts route-specific hint text so speech can use `plan.script`, while music and
    soundscape can use `plan.script + motif`
- `finalizeRouteRender(ctx, route, samples, startedAt)`
  - wraps `finalizeAudioArtifact()`
  - stamps `durationMs`
  - preserves route-specific `metadata.route`
- `mixAmbientLayer(baseSamples, ambientCategory, durationSec, ambientLevel, seed)`
  - for the two routes that truly mix a foreground with ambient (`speech`, `music`)

### Explicitly do not abstract in M2

Do **not** introduce any of the following in M2:

- `BaseAudioRoute`
- route-local inheritance tree
- plugin or middleware lifecycle inside `codec-audio`

### Threshold for future `BaseAudioRoute`

Only open a follow-up for `BaseAudioRoute` if, after honest helper extraction:

- at least **two** route files still duplicate the same route lifecycle,
- the duplicated sequence is still **>30 lines** of shared-mechanical code per route,
- and the duplication is not decoder-specific logic.

If those three conditions are not all true, helper functions remain the correct answer.

## 3. Speech runtime contract

### Canonical decode path

The canonical M2 speech path is:

- **default:** `Kokoro-82M-family` local CPU decode path
- **fallback:** `Piper-family`

The current `renderMacSpeech()` path is **not** part of the ratified v0.3 speech
contract. It may remain temporarily as a legacy/demo fallback only if it is clearly
outside the parity contract and never presented as the canonical decoder path.

### Pinned deterministic backend

The pinned deterministic backend for M2 is:

- local CPU inference only
- deterministic flags enabled
- fixed decoder version / weights identifier
- no host-TTS shortcut in the parity path

In practice, the implementation should ensure that the parity test path never depends on
`say` / host audio services.

### Fallback trigger

Piper fallback should trigger only when the Kokoro path is unavailable or fails the
deterministic CPU gate, not merely because GPU is unavailable.

Recommended split:

- **Kokoro available + CPU deterministic path healthy:** use Kokoro
- **Kokoro missing / cannot initialize / fails pinned deterministic CPU gate:** fall back
  to Piper
- **Neither Kokoro nor Piper available:** return a structured partial/failure path, do
  not silently fall back to host TTS

### Manifest identity fields

The speech route should write enough identity to distinguish decoder family, concrete
build, and reproducibility class.

Recommended fields:

- `route` — `speech`
- `audioRender` — object stored via codec-authored manifest row
  - `sampleRateHz`
  - `channels`
  - `durationSec`
  - `container`
  - `bitDepth`
  - `determinismClass`
  - `decoderId`
  - optional `decoderHash`

Recommended decoder identifiers:

- `kokoro-82m:<weights-id-or-tag>`
- `piper:<voice-id>:<voice-hash-or-version>`

## 4. Manifest / schema alignment

The current v2 surface exposes `ManifestRow`, but `foldManifestRows()` still just splats
flat keys into the one-object `RunManifest`. M2 should take the smallest clean step
needed for audio:

- add an optional `audioRender` object to `RunManifestSchema`
- keep the one-object manifest shape
- make the codec return one manifest row whose key maps to that object cleanly

Recommended implementation shape:

- manifest row key: `audioRender`
- manifest row value:
  - `sampleRateHz`
  - `channels`
  - `durationSec`
  - `container`
  - `bitDepth`
  - `determinismClass`
  - `decoderId`
  - optional `decoderHash`

This is better than inventing dotted pseudo-keys like `audio.render` and letting them
float untyped in the manifest object.

Keep the existing special-case bridge behavior for:

- `route`
- `artifact.sha256`

Do not reshape the whole manifest beyond the single `audioRender` addition in M2.

## 5. Parity contract execution

### Speech parity

`parity-tts.test.ts` should test two distinct classes, not one blended notion of
"deterministic enough":

#### CPU deterministic backend

Assert:

- fixed prompt + seed + backend selection
- same `decoderId`
- same `determinismClass = "byte-parity"`
- same output SHA across at least 3 reruns
- exact `sampleRateHz`, `channels`, `durationSec`

#### GPU backend

Assert:

- fixed prompt + seed + backend selection
- same `decoderId`
- `determinismClass = "structural-parity"`
- **do not** assert artifact SHA equality
- do assert exact `sampleRateHz`, `channels`
- do assert `durationSec` within the existing narrow tolerance band

### Missing speech backend behavior

If neither Kokoro nor Piper is available, the speech path should not silently fall back
to an undocumented host path. It should record the same partial reason already used in
existing docs:

- `quality.partial.reason = "tts_engine_missing"`

If a stronger future taxonomy is desired, that should happen in a separate follow-up, not
inside M2.

### Soundscape and music parity

Soundscape and music remain byte-for-byte deterministic in M2:

- same seed
- same route
- same output SHA
- same `determinismClass = "byte-parity"`

If either route stops being byte-stable after helper extraction, treat that as a real
regression.

## 6. Caller migration shape

### Keep `wittgenstein tts`

`wittgenstein tts` stays as a first-class convenience entrypoint.

Its internal request construction can change in M2, but the command itself should remain
stable. It should not be presented as a temporary alias.

### Keep `wittgenstein audio --route ...` as compatibility-only

`wittgenstein audio --route ...` stays for one minor version as a compatibility hint with
warning.

Use Brief J's fixed wording:

> `AudioRequest.route` is deprecated and will be removed after one minor version. Audio routing now lives inside `AudioCodec.route()`; keep `--route` only for compatibility while migrating callers to modality-level intent.

The warning belongs at the codec boundary, not in the harness and not in the CLI.

### Docs/examples to update in Slice C

Update these only when the M2 implementation lands, not before:

- `README.md`
- `packages/cli/README.md`
- `docs/codecs/audio.md`
- `docs/modality-launch-surface.md`
- `docs/quickstart.md`
- `docs/technical-details-script.md`

The post-M2 canonical example should be intent-first:

```text
wittgenstein audio "soft launch music with a slow synthetic pulse" --out out.wav
```

Any remaining route-first example must be marked transitional.

## 7. Recommended M2 slice boundaries

### Slice A — codec-owned routing and harness thinning

Includes:

- `AudioCodec extends BaseCodec<AudioRequest, AudioArtifact>`
- codec-owned route dispatch
- thin `packages/core/src/codecs/audio.ts`
- harness audio branch removal

Excludes:

- manifest schema expansion
- parity tests beyond keeping the system alive
- public docs/example migration

### Slice B — helper extraction and thin route files

Includes:

- shared helper extraction
- thin route files
- no base class

Excludes:

- decoder-family relitigation
- manifest contract expansion

### Slice C — manifest authorship, warning, parity, and public examples

Includes:

- `audioRender` manifest object
- `determinismClass` recording
- `AudioRequest.route` soft-warn
- speech CPU/GPU parity split
- soundscape/music byte parity
- public example updates

This slice is where the user-visible compatibility story completes.

## 8. Done when

This memo has done its job when an implementer can begin M2 without making new decisions
about:

- helper vs route-local ownership
- Kokoro vs Piper runtime behavior
- manifest naming for audio determinism
- parity semantics by backend
- `tts` vs `audio --route` migration posture
