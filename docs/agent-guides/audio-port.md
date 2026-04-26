# Audio Port Guide (M2)

This guide is for a contributor or coding agent picking up the **audio codec port** as a standalone line, after M0 (protocol types) lands and while or after M1 (image) is in flight.

It is deliberately narrow:

- **in scope:** porting `codec-audio` to the v2 protocol shape; tightening the remaining shared-mechanical route logic; writing the audio benchmark bridge stub for M5b.
- **out of scope:** image, sensor, video, site, CLI ergonomics, doctrine relitigation, picking a new TTS engine.

Read `docs/agent-guides/image-to-audio-port.md` first for the cross-line context. This guide is the audio specialization.

---

## 1. Mission

Port `codec-audio` from the v0.1 surface to the Codec v2 protocol shape ratified by ADR-0008, while:

- collapsing the remaining shared-mechanical route duplication across `speech / soundscape / music`;
- preserving every shipping artifact's structural manifest (sample rate, channels, duration);
- moving manifest authorship into the codec's `package` stage;
- soft-deprecating `AudioRequest.route` (one minor version of warning before hard-deprecation at M4).

You are not allowed to:

- swap the TTS engine for something with a different license profile (see `docs/codecs/audio.md` decoder constraints);
- introduce a fourth route;
- change user-facing CLI flags except `--route` deprecation;
- reopen one-vs-two-round LLM doctrine (locked by ADR-0008 amendment).

## 2. Read order

1. `AGENTS.md`
2. `docs/THESIS.md`
3. `docs/codecs/audio.md` — the codec's locked surface and decoder rationale.
4. `docs/exec-plans/active/codec-v2-port.md` §M2 — the per-package diff and gate.
5. `docs/rfcs/0001-codec-protocol-v2.md` — protocol shape.
6. `docs/research/briefs/E_benchmarks_v2.md` — quality-bridge picks for audio.
7. `docs/agent-guides/image-to-audio-port.md` §6 — the port-recipe pattern image already lays down.

If M1 image has already landed, also read its merged PR diff — your changes mirror its shape.

## 3. The remaining shared route logic

`packages/codec-audio/src/routes/{speech,soundscape,music}.ts` are already smaller than the first-pass plan assumed, because `runtime.ts` now owns the real render primitives. What remains duplicated is the lighter-weight route-local scaffolding around those primitives:

- duration / timing normalization,
- ambient recommendation plumbing,
- route-specific render invocation,
- artifact finalization,
- route-local metadata patching.

The port's win is **not** inventing a new local framework. The win is moving the shared-mechanical bits into helper functions or a tiny shared module, while leaving each route file as a thin, readable declaration of route-specific behavior. If the port still leaves obvious duplicated scaffolding across siblings, the helper-first collapse failed. If helper extraction still leaves >30 lines of genuinely shared-mechanical duplication, only then should a `BaseAudioRoute` be reconsidered in a follow-up.

## 4. M2 deliverables

In order:

1. **`AudioCodec extends BaseCodec<AudioRequest, AudioArtifact>`** in `packages/codec-audio/src/codec.ts`. The codec's `route(req)` method dispatches to the appropriate sub-route.
2. **Shared audio route helpers** carrying the mechanical pieces that do not belong in each route file independently.
3. **Three thin route files** (`speech.ts`, `soundscape.ts`, `music.ts`) that read as route-specific logic first, with shared scaffolding pulled down into helpers where honest.
4. **`package` stage authors manifest rows** — `route`, `seed`, `model_id`, `quality.structural` (sample rate, channels, duration), `quality.partial` if a metric is unavailable.
5. **`AudioRequest.route` soft-warn deprecation** — emits a one-line `console.warn` pointing to the codec's new `route()` declaration.
6. **`packages/core/src/codecs/audio.ts`** is now a thin shim that delegates to `AudioCodec.produce`. The audio branch in `packages/core/src/runtime/harness.ts` is deleted.
7. **Migration tests** under `packages/codec-audio/test/`:
   - `route-collapse.test.ts` — fails if helper extraction leaves obvious sibling duplication beyond the accepted threshold.
   - `parity-tts.test.ts` — TTS structural parity (sample rate, channels, duration ±5%) against the recorded golden manifest.
   - `parity-soundscape.test.ts` and `parity-music.test.ts` — byte-for-byte SHA-256 against goldens (deterministic synthesis).

## 5. Goldens and parity

Pin the v0.1 baseline at PR-open in `packages/codec-audio/test/goldens.json`:

- `artifacts/showcase/workflow-examples/tts/` — speech route. **Structural parity only** (LLM stage drift is in the loop).
- `artifacts/showcase/workflow-examples/soundscape/` — deterministic synthesis. **Byte-for-byte SHA-256**.
- `artifacts/showcase/workflow-examples/music/` — deterministic synthesis. **Byte-for-byte SHA-256**.

If a deterministic golden drifts, do not retire it — that is a real regression. Investigate before regenerating.

If TTS bytes drift but structural fields match, document the drift in your PR body and link to the AudioPlan diff that caused it. Do not regenerate the golden manifest without two-hats sign-off.

## 6. Manifest invariants for audio

The codec's `package` stage must write:

- `route` — the route the codec internally chose.
- `seed`, `model_id`, `latency_ms`, `cost_usd` — runtime-owned, but the codec must not overwrite them.
- `artifact.sha256`, `artifact.bytes`, `artifact.path`.
- `quality.structural` — `{ sampleRateHz, channels, durationSec }`.
- `quality.partial: { reason }` — when a benchmark bridge is unavailable; never silent.
- `error` — structured if the run failed; never a generic string.

If you find yourself writing manifest rows from anywhere outside the codec's `package` stage, you are violating the v2 contract. Fix it in the PR.

## 7. Two-hats checklist for this port

### Researcher hat

- Are the route picks (Piper-class TTS, deterministic operator-library soundscape, symbolic-synth music) still consistent with `docs/codecs/audio.md`?
- Does the port preserve the ADR-0005 boundary (decoder ≠ generator)? Specifically, no MusicLM-class generator slipping in via "convenience"?
- Does Brief E's metric pick (UTMOS + WER for speech, librosa for soundscape, LAION-CLAP for music) survive without changes? If you modify them, M5b breaks.

### Hacker hat

- Do the route files read as thin route-specific declarations, without obvious shared-mechanical scaffolding copied across siblings?
- Is the harness still modality-blind for audio after the port?
- Can the next codec (sensor, M3) be ported in the same shape using this PR's diff as a template?

If any answer is no, the gate is not met.

## 8. Failure modes you will hit

- **TTS engine not installed on CI** — the `quality.partial: { reason: "tts_engine_missing" }` invariant must trigger; the build must not fail silently. Add a CI check that asserts the partial reason is recorded for that case.
- **AudioPlan zod parse fails on a real LLM output** — surface the structured error to the user; the codec must not "fix up" the plan silently. If a recurring parse failure appears, the right move is to tighten the prompt preamble, not to loosen the schema.
- **Soundscape SHA-256 drifts after a refactor** — the synthesis runtime is deterministic by contract. Drift means a real bug; bisect.
- **`AudioRequest.route` removal breaks a downstream user** — pause M2's hard-warn on that field; document the migration in `docs/agent-guides/`. Do not revert the codec collapse.

## 9. Prompt block for an implementation agent

> You are implementing the Wittgenstein v0.2 audio codec port (M2).
> Stay inside the locked doctrine: three routes (speech / soundscape / music), no TTS-engine swap, no fourth route, decoder ≠ generator, manifest spine preserved, modality branching moves out of the harness.
> Read `AGENTS.md`, `docs/THESIS.md`, `docs/codecs/audio.md`, `docs/exec-plans/active/codec-v2-port.md` §M2, and `docs/rfcs/0001-codec-protocol-v2.md` first.
> Your task is to land M2: collapse the remaining shared route scaffolding, move manifest authorship into the codec, soft-deprecate `AudioRequest.route`, and pass the three parity tests.
> Do not relitigate doctrine. Do not introduce a music generator. Do not widen scope to image, sensor, or benchmarks-heavy work.
> Prefer small diffs, structural parity over byte parity for LLM-driven outputs, and receipt-preserving behavior.

## 10. Exit condition

This guide has done its job when:

- the port lands the M2 gate in `docs/exec-plans/active/codec-v2-port.md`;
- a sensor-port contributor (M3) can read this guide as a template and write the parallel port;
- the codec catalog has audio at v2 parity with image, with the same testing shape and the same manifest authorship pattern.
