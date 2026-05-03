# M2 Slice C2 — Kokoro-82M Backend Wiring (Self-contained Handoff)

**Tracked:** Issue #116. **Phase:** v0.3 / Phase 2 (Audio codec v2).
**Predecessor slices (merged):** C1 schema (#95), B route helpers (#94), A codec-owned routing (#93), D soft-warn (#96), C3 parity goldens (#121).
**Successor slice:** Slice E sweep verification (#118).

---

## Goal

Replace `decoderId = procedural-audio-runtime` with a real `kokoro-82M:<weights-sha256>` path, gated behind `WITTGENSTEIN_AUDIO_BACKEND=kokoro`. The default backend stays `procedural`. Slice E (a separate issue) is the gate that flips the default once cross-platform determinism is verified.

## Why this exists

- **Brief I** picked Kokoro-82M as the v0.3 TTS decoder: Apache-2.0 code + weights + permissive training data, #1 TTS Arena Jan 2026, single-pass decoder-only architecture (the most determinism-friendly shape in the shortlist).
- **ADR-0015** ratified the choice.
- **Brief J §Verdict 3** locked the manifest field shape (`audioRender.decoderId`, `decoderHash`, `determinismClass`).
- **Slice C1** (#95) landed the schema with `procedural-audio-runtime` as honest placeholder.
- **Slice C3** (#121) added the parity-test fixtures.

This slice is the missing wiring step.

## Reads (in order, then stop)

1. `docs/research/briefs/I_audio_codec_landscape.md` §H I.1 + §Verdict — decoder rationale and kill criterion.
2. `docs/adrs/0015-audio-decoder-family.md` — ratification.
3. `docs/research/briefs/J_audio_engineering_and_routes.md` §Verdict 3 — manifest field shape.
4. `packages/codec-audio/src/codec.ts` — current procedural backend; the branching shape lives here.
5. `packages/codec-audio/test/parity-*.test.ts` — existing fixtures and assertion shape.

If you find yourself reading anything outside this list, stop and re-anchor on the goal.

## Files you will touch

- `packages/codec-audio/package.json` — add `onnxruntime-node` as a dependency.
- `packages/codec-audio/src/decoders/kokoro/index.ts` — **new**. ONNX runtime CPU inference; emits Float32 PCM at Kokoro's native rate (24 kHz); single-pass; no autoregressive sampling.
- `packages/codec-audio/src/decoders/kokoro/manifest.json` — **new**. Pin `weightsUrl`, `weightsSha256`, `voicesSha256`, `cacheDir = ~/.cache/wittgenstein/decoders/kokoro/`.
- `packages/codec-audio/src/codec.ts` — branch on `process.env.WITTGENSTEIN_AUDIO_BACKEND === "kokoro"`; default falls through to procedural.
- `packages/codec-audio/test/kokoro-determinism.test.ts` — **new**. Three back-to-back invocations with `--seed 7` produce byte-identical WAV. Skip in CI when weights are not available; the `kokoro` job is opt-in via env var.

## Done when

- `pnpm --filter @wittgenstein/codec-audio test` is green with both `WITTGENSTEIN_AUDIO_BACKEND=procedural` and `=kokoro` (the latter local-only is fine; CI's kokoro job stays opt-in until Slice E).
- `WITTGENSTEIN_AUDIO_BACKEND=kokoro pnpm cli tts "hello" --seed 7 --dry-run` writes a manifest with `audioRender.decoderId = kokoro-82M:<sha>` and `determinismClass: structural-parity`.
- Three back-to-back invocations of the line above produce byte-identical WAV on the same machine.
- `decoderId = procedural-audio-runtime` still appears as the default when the env var is unset. **Do not flip the default here**; Slice E is the gate that flips it once cross-platform determinism is verified.

## Out of scope

- GPU backend. CPU only at this slice; GPU is structural-parity by design (Brief I §H I.7).
- Voice cloning.
- New routes.
- Flipping the default backend (Slice E).
- Any change to `audioRender` schema (Slice C1 locked it).
- Re-litigating Brief I or ADR-0015.

## Hard constraints (non-negotiable; see AGENTS.md / PROMPT.md)

- Manifest spine: every run writes git SHA, lockfile hash, seed, full LLM I/O if any, artifact SHA-256.
- No silent fallbacks. If Kokoro fails to load weights, return a structured error with a populated manifest, not a procedural fallback that pretends to be Kokoro.
- Schema-first at every boundary; zod-parse on return.
- Codec packages depend on `@wittgenstein/schemas` only; no codec-X importing codec-Y.

## If the determinism probe fails

Stop. Do **not** ship the slice with a non-deterministic Kokoro path under the `kokoro` backend name. File the finding in Issue #116 with the exact platform / Node version / ONNX runtime version. Hand off to Slice E (#118), which decides whether Piper takes over (Brief I §H I.2) or full procedural fallback fires (Brief I sweep-level kill criterion).

The repo's reproducibility doctrine is not negotiable for the sake of shipping a slice.

## Open the PR

- Engineering lane (Brief → RFC → ADR → exec-plan → code; this slice is the code step).
- Reference Issue #116 in the PR body.
- Keep the diff small. No new doctrine. No new ADR.
- Per ADR-0013, the PR is doctrine-adjacent (touches `packages/codec-audio` which is a shared protocol contract surface) — it requires an independent second review pass before merge.
