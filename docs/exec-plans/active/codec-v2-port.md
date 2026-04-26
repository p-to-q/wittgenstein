# Codec v2 Port — P6 execution plan

**Date opened:** 2026-04-25
**Last amended:** 2026-04-26 (M0/M1 landed; status + file-path drift corrected for the live plan)
**Feeds from:** ADR-0008 (Codec Protocol v2 adoption), ADR-0011 (naming v2), RFC-0001, Brief A (LFQ rename), Brief E (benchmarks v2 targets), `docs/v02-final-audit.md`
**Status:** 🟡 Active — M0 and M1 landed; M2 is the next execution line

## Purpose

This is the execution plan for the code port ratified by ADR-0008. It is deliberately
_outside_ the docs-phase sequence P1–P5: the restructuring phases lock decisions; this
plan lands the migration.

Scope: port Wittgenstein's existing 7 modality groups from the v0.1 harness surface to
the Codec v2 protocol (RFC-0001), in the order **image → audio → sensor → cleanup**,
while retiring the five confirmed code smells.

## Ordering rationale (image first, not sensor first)

The earlier draft ordered `sensor → audio → image`, reasoning that sensor was the
cheapest migration. That rationale fails on closer reading. `codec-sensor` has no L4
adapter and a near-trivial L5 — porting it first proves only that the `Codec<Req, Art>`
shape can absorb a simple case, which was never in doubt. The useful pressure test is
the hardest modality: `codec-image` is the only codec with both an L4 adapter slot and
a non-trivial L5 packaging step, and it is also the priority-one pipeline per
`docs/v02-alignment-review.md` §3 (LLM-to-image is the user's stated first target).
Port image first, and the protocol either fits or visibly breaks. Audio and sensor then
land as confirmations, not discoveries.

## Phase ordering (overview)

| Phase | Work                                                                                                                                                                                                                                                                                                                                                                       | Gate                                                                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0    | Introduce `Codec<Req, Art>`, `IR`, `Route`, `HarnessCtx` types in `packages/schemas` behind an `@experimental` tag. No call-site change.                                                                                                                                                                                                                                   | Types land; `pnpm typecheck` green.                                                                                                                         |
| M1    | Port `codec-image` (raster) first — only modality with both L4 adapter slot and non-trivial L5, so it stresses the protocol hardest. `codec-svg` and `codec-asciipng` are tracked as sibling follow-up ports, not internal image routes. Default pipeline stays one LLM round (schema-in-preamble). `--expand` flag opts into a round-1 expansion pass for A/B comparison. | Goldens preserve; manifest rows codec-authored; round-trip test ≤20 lines; Brief A's "LFQ-family discrete-token decoder" rename lands in ADR-0005 addendum. |
| M2    | Port `codec-audio` (speech, soundscape, music) — eliminates the 80-line route copy-paste.                                                                                                                                                                                                                                                                                  | Goldens preserve; `AudioRequest.route` deprecated with warning.                                                                                             |
| M3    | Port `codec-sensor` (ecg, gyro, temperature) — confirmation case (no L4), closes the modality sweep.                                                                                                                                                                                                                                                                       | Goldens preserve; `SensorRequest` surface unchanged from user side.                                                                                         |
| M4    | Retire `harness.ts:123-172` modality branching + `:139-172` manifest overrides. Remove `AudioRequest.route`, `SvgRequest.source`, `AsciipngRequest.source`, `VideoRequest.inlineSvgs`.                                                                                                                                                                                     | Harness is modality-blind; `codec-video` (🔴 stub) awaits its own M-slot.                                                                                   |
| M5a   | Land image benchmark bridge first (Brief E): VQAScore + CLIPScore fallback, wired into the default tier only.                                                                                                                                                                                                                                                              | Image metric runs locally; `quality_partial` invariant enforced.                                                                                            |
| M5b   | Land audio + sensor + video benchmark bridge next: UTMOS+WER / librosa / LAION-CLAP / NeuroKit2 / rule lists / clip-frame-drift, still default tier only.                                                                                                                                                                                                                  | Non-image metrics wired after M1–M4 are stable.                                                                                                             |

Kill date for pre-v2 surface: **v0.3.0**. Post v0.3.0 the old interfaces are compile
errors, not deprecation warnings.

---

## Cross-cutting contracts (apply to every M-phase)

These are the invariants that hold across the port. Any phase that violates one of them
fails its gate.

### Golden parity contract

The v0.1 artifact set under `artifacts/showcase/workflow-examples/` is the regression
baseline. For every modality, the port must preserve **byte-for-byte equality** of the
decoder output where the underlying decoder is deterministic, and **structural equality**
(shape, channels, duration, frame count) where the LLM stage is in the loop.

Concretely:

- For deterministic decoders (sensor signals, ascii-png raster, svg writer): SHA-256 of
  the artifact must match the recorded baseline. A diff is a regression.
- For LLM-driven decoders (image scene → frozen decoder, audio TTS, music): the
  artifact's `manifest.json` must show the same `route`, `seed`, `model_id`, and
  `quality.structural` keys; bytes may drift if and only if the LLM output drifts, and
  the drift must be flagged in the PR body.
- A new `pnpm test:goldens` script lives in `packages/core` and runs the parity check
  in CI. It must be green at every M-phase gate.

### Manifest invariants

Across the port, every codec must keep emitting:

- `run_id`, `git_sha`, `seed`, `model_id`, `route`, `latency_ms`, `cost_usd`,
- `artifact.sha256`, `artifact.bytes`, `artifact.path`,
- `quality.structural` (always present), `quality.partial` (when a metric is stubbed),
- `error` (structured, never silent fallback).

Codec authorship of manifest rows means `harness.ts` no longer overrides — the codec's
`package` stage is the sole writer for codec-owned fields. The harness still writes
runtime-owned fields (`run_id`, `git_sha`, `latency_ms`, `cost_usd`).

### Deprecation lifecycle

Each retired surface goes through three states:

1. **Soft-warn** (M1–M3): old field still works, emits a one-line `console.warn` with a
   pointer to the codec's new declaration site.
2. **Hard-warn** (M4): old field throws on import via a typed deprecation; tests catch.
3. **Removed** (v0.3.0 cut): field deleted, types are compile errors.

No field is removed before its codec has landed in the new shape.

### Two-hats checkpoint

Every M-phase PR must have both hats sign off in the PR description:

- **Researcher hat:** does this preserve Brief A / B / E verdicts and the IR sum-type
  caveat (`Latent` stays uninhabited unless an ADR amendment lands)?
- **Hacker hat:** can the next codec be ported in ≤20 lines using this PR's pattern?

A single dissent blocks the gate.

---

## Per-phase detail

### M0 — Protocol types land, no call-site change

**Files added:**

- `packages/schemas/src/codec/v2/*` — split protocol surface:
  `codec.ts`, `base.ts`, `ctx.ts`, `ir.ts`, `sidecar.ts`, `warning.ts`,
  `standard-schema.ts`, plus the barrel `index.ts`. Together they define
  `Codec<Req, Art>`, `IR = Text | Latent | Hybrid`, `Route`, `HarnessCtx`,
  `ManifestRow`, and the `BaseCodec` abstract class. Tagged `@experimental`.
- `packages/schemas/src/index.ts` — re-exports the v2 surface as
  `codecV2` from `./codec/v2/index.js`.

**Files unchanged:** every codec, every harness file, every CLI surface.

**Migration tests:**

- `pnpm typecheck` green across the workspace.
- `packages/schemas/test/codec-v2.test.ts` — smoke-tests the v2 protocol surface
  (`BaseCodec.produce`, warning folding, IR guards, `HarnessCtx.fork`).
- `packages/schemas/test/contract.test.ts` — keeps the locked schema exports honest
  (`Modality`, `RenderResultSchema`, `RunManifestSchema`).

**Rollback criteria:** revert is one PR. No runtime code depends on the new types yet,
so revert is safe at any time before M1.

**Gate:** types land; `pnpm typecheck` green; round-trip test compiles for all 7
modalities.

---

### M1 — Port `codec-image`

This is the pressure test. Image is the only codec with a non-trivial L4 adapter and a
non-trivial L5 packaging step. In the current repo, `codec-image` is the raster path;
`codec-svg` and `codec-asciipng` are sibling packages and follow as separate ports.

> **M1 splits into M1A (this row, protocol port) and M1B (L4 adapter training, separate
> plan).** M1A executes the protocol port + landings the eight Brief H engineering
> practices in their canonical homes. M1B is gated on its own forthcoming plan
> (decoder selection, synthetic-pair data, training infra, eval, manifest contract for
> trained weights). M1A does not block on M1B; the adapter slot ships as a stable
> stub-hash with `quality.partial: { reason: "adapter-stub" }`.
>
> **Engineering practices for M1A:** see [`docs/agent-guides/image-port.md`](../../agent-guides/image-port.md)
> (execution brief) and [`docs/research/briefs/H_codec_engineering_prior_art.md`](../../research/briefs/H_codec_engineering_prior_art.md)
> (prior-art survey). RFC-0001 §Addendum 2026-04-26 (F1 Standard Schema typing,
> F2 typed `warnings` channel) lands in the same PR as the protocol types.

**Files touched:**

- `packages/codec-image/src/codec.ts` — rewrite as `class ImageCodec extends BaseCodec<ImageRequest, ImageArtifact>`. Inherits `expand / adapt / decode / package` seams.
- `packages/codec-image/src/pipeline/expand.ts` — preserved as the default
  one-round expand. Gains a `{ rounds: 2 }` override path for `--expand`.
- `packages/codec-image/src/pipeline/adapter.ts` — moves into the codec's `adapt`
  override; signature unchanged.
- `packages/codec-image/src/pipeline/decoder.ts` — moves into the codec's `decode`
  override; frozen decoder stays.
- `packages/codec-image/src/pipeline/package.ts` — codec authors its own manifest rows.
  The `quality.structural` and `quality.partial` keys are written here.
- `packages/codec-image/src/index.ts` — exports the v2 codec; v1 export stays as a
  soft-deprecation re-export.
- `packages/core/src/codecs/image.ts` — thin shim that hands off to `ImageCodec`.
  Modality branching for image is removed from `harness.ts` — image now flows through
  the generic dispatch path.
- `packages/core/src/runtime/harness.ts:123-172` — image branch deleted. `codec-svg` and
  `codec-asciipng` keep their existing dispatch until their sibling ports land; they are
  not re-routed through `codec-image`.

**Route logic:** `codec-image` exposes a single raster route at v0.2. Route selection
still matters at the protocol level, but for image the `Route<Req>[]` shape currently
contains one matching route. `codec-svg` and `codec-asciipng` keep their own package-level
request and route logic until their follow-up ports land.

**Goldens:**

- `artifacts/showcase/workflow-examples/image/` — 6 baseline tiles. SHA-256 manifest
  recorded in `packages/codec-image/test/goldens.json` at PR open.
- `artifacts/showcase/workflow-examples/samples/svg/` and `asciipng/` — also pinned.

**Migration tests:**

- `packages/codec-image/test/round-trip.test.ts` — build a fake raster `ImageRequest`,
  run `codec.produce(req, ctx)`, assert artifact and manifest match the v0.1 baseline
  within tolerance.
- `packages/codec-image/test/expand-flag.test.ts` — with `{ rounds: 2 }`, the second
  round runs and the manifest records both LLM calls.
- `packages/core/test/harness-modality-blind.test.ts` — assert the harness no longer
  branches on `request.modality === "image"`. Greps the harness source for that
  pattern and fails if found.

**Rollback criteria:**

- If goldens drift in any direction the LLM stage cannot explain, revert the PR. The
  decoder is deterministic; drift means a real bug.
- If the raster round-trip test spills past 20 lines, the protocol shape is wrong —
  revert and reopen RFC-0001.
- If `pnpm test:goldens` shows a CLIPScore regression >10% on the curated tiles
  (Brief E threshold), revert and open a follow-up RFC.

**Gate:**

- Goldens preserve for raster (structural + manifest for live-LLM runs; byte-for-byte on
  cached-LLM replay where applicable).
- Manifest rows codec-authored (greppable: no `manifest.image.*` writes in `core/`).
- Raster round-trip test ≤20 lines.
- Brief A's "LFQ-family discrete-token decoder" rename lands in ADR-0005 addendum
  (separate doc PR; can ship in same train).

---

### M2 — Port `codec-audio`

Audio's win is collapsing the 80-line route copy-paste. Three sub-modalities (speech,
soundscape, music) each have their own route file in `codec-audio/src/routes/`.

**Files touched:**

- `packages/codec-audio/src/codec.ts` — rewrite as `class AudioCodec extends BaseCodec<AudioRequest, AudioArtifact>`. The codec's `route()` method dispatches to the
  appropriate sub-route.
- `packages/codec-audio/src/routes/{speech,soundscape,music}/index.ts` — refactor each into a
  `Route` object that the codec composes; shared logic moves into a `BaseAudioRoute`.
  The 80-line copy-paste collapses to ~20 lines per route.
- `packages/codec-audio/src/runtime.ts` — manifest authorship moves into the codec's
  `package` stage.
- `packages/core/src/codecs/audio.ts` — thin shim, same pattern as image.
- `packages/core/src/runtime/harness.ts` — audio branch deleted.

**Deprecation:**

- `AudioRequest.route` enters soft-warn (M2). Routing now lives inside the codec's
  `route()` method; the user-facing field stays for one minor version.

**Goldens:**

- `artifacts/showcase/workflow-examples/{tts,soundscape,music}/` — pinned at PR open.
- TTS bytes are LLM-stage-driven; structural parity is enforced (sample rate, channels,
  duration ±5%). Soundscape and music have deterministic synthesis paths where
  applicable; those get byte-for-byte parity.

**Migration tests:**

- `packages/codec-audio/test/route-collapse.test.ts` — count lines in each route file;
  fail if any spills past the 20-line round-trip budget.
- Standard parity tests against goldens.

**Rollback criteria:**

- If route collapse loses any sub-route's behavior (e.g., music's BPM logic), revert
  and split the route as its own M-slot.
- If `AudioRequest.route` removal surfaces a downstream user (CLI flag, doc example),
  pause deprecation and document the migration in `docs/agent-guides/`.

**Gate:** goldens preserve; `AudioRequest.route` deprecated with warning; route files
each ≤20 lines of codec-specific logic.

---

### M3 — Port `codec-sensor`

The confirmation case. Sensor has no L4 adapter, a deterministic L5 (procedural signal
synthesis), and three sub-types (ecg, gyro, temperature). The point of this phase is
not to discover anything — it's to verify that the protocol absorbs a trivial case
without bloat.

**Files touched:**

- `packages/codec-sensor/src/codec.ts` — `class SensorCodec extends BaseCodec<SensorRequest, SensorArtifact>`. `adapt` is a pass-through (no L4); `decode` calls into
  `signals/`.
- `packages/codec-sensor/src/render.ts` — manifest authorship moves into `package`.
- `packages/core/src/codecs/sensor.ts` — shim; sensor branch removed from harness.

**Goldens:** `artifacts/showcase/workflow-examples/sensor/` — pinned, byte-for-byte
(sensor signals are fully deterministic).

**Migration tests:** standard parity. Plus a test that asserts `SensorCodec.adapt` is
the base-class no-op (greppable as `adapt = BaseCodec.passthrough`).

**Rollback criteria:** byte drift on any sensor artifact is a real regression — revert
immediately. Sensor has no LLM stage to blame.

**Gate:** goldens preserve byte-for-byte; `SensorRequest` surface unchanged from user
side; sensor branch in harness deleted.

---

### M4 — Cleanup pass

By M3 every shipping codec has its v2 implementation. M4 is the consolidation phase:
the harness becomes modality-blind, deprecated request fields move from soft-warn to
hard-warn, and `codec-video` (which is a 🔴 stub) gets its own future M-slot opened.

**Files touched:**

- `packages/core/src/runtime/harness.ts` — delete `:123-172` modality branching block
  entirely; delete `:139-172` manifest override block. Harness reduces to: dispatch to
  `codec.produce(req, ctx)`, write runtime-owned manifest fields, return.
- `packages/schemas/src/*.ts` — flip `AudioRequest.route`, `SvgRequest.source`,
  `AsciipngRequest.source`, `VideoRequest.inlineSvgs` from soft-warn to hard-warn (typed
  deprecation; throws at import).
- `packages/codec-video/` — left as-is. Mark the package's `README.md` with a "🔴 awaits
  M-slot post-v0.3" banner. Video's port is the next exec plan, not this one.

**Migration tests:**

- `packages/core/test/harness-shape.test.ts` — assert `harness.ts` is under 200 lines and
  contains no `switch (req.modality)` or `if (req.modality === ...)`. This is the
  invariant that M4 enforces forever.
- A grep test that fails the build if any of the four retired fields is referenced
  outside its deprecation shim file.

**Rollback criteria:** if any downstream user (in `apps/` or `examples/`) breaks under
hard-warn, demote that one field back to soft-warn for one minor version, but do not
revert the harness collapse — the harness shape is the load-bearing win.

**Gate:** harness is modality-blind (greppable); four retired fields throw on import;
`codec-video` stub is documented as out-of-scope for this plan.

---

### M5a — Image benchmark bridge

Brief E specifies VQAScore + CLIPScore as the v0.2 default-tier image metrics. M5a wires
them into the codec's `quality` block. Heavy-tier metrics stay deferred per Brief E.

**Files touched:**

- `packages/codec-image/src/quality.ts` (new) — VQAScore primary, CLIPScore fallback.
  Both run locally via the bridges Brief E names. If neither runs (no GPU, missing
  model), the codec writes `quality.partial: { reason: "metric_unavailable" }` —
  never silent.
- `packages/codec-image/src/pipeline/package.ts` — call into `quality.ts` and write
  the result into the manifest's `quality` block.

**Goldens:** the existing image goldens get a `quality.json` companion file recording
the baseline metric values. Future drift is measured against these.

**Migration tests:**

- `packages/codec-image/test/quality-bridge.test.ts` — run the bridge on a fixed seed
  - fixed prompt, assert metric value within ±5% of recorded baseline.
- `packages/codec-image/test/quality-partial.test.ts` — when the metric model is absent,
  assert `quality.partial` is written and the run does not silently succeed.

**Rollback criteria:** if VQAScore inference cost balloons past Brief E's budget on the
v0.2 eval set, fall back to CLIPScore-only and document in the M5a PR. Do not revert
the bridge — partial metric is better than no metric.

**Gate:** image metric runs locally; `quality_partial` invariant enforced; CI green.

---

### M5b — Audio + sensor + video benchmark bridge

The follow-up phase. Same shape as M5a, applied to the remaining modalities. Per
Brief E:

- **Audio (speech):** UTMOS + WER (Whisper-based).
- **Audio (soundscape):** librosa spectral-centroid + roughness match.
- **Audio (music):** LAION-CLAP score.
- **Sensor (ecg):** NeuroKit2 clinical-plausibility check.
- **Sensor (gyro / temperature):** rule-list checks (signal range, derivative bounds).
- **Video:** clip-frame-drift; only relevant once `codec-video` ports. M5b scaffolds
  the field but leaves the runtime path stubbed until video's M-slot.

**Files touched:** parallel to M5a, one `quality.ts` per codec.

**Migration tests:** parallel to M5a, with each codec's own baselines.

**Rollback criteria:** per-modality. If any one bridge fails its budget, fall back to
its `quality.partial` reason — do not block the whole phase on one bridge.

**Gate:** non-image metrics wired; M1–M4 stable; CI green.

---

## Out of scope (explicit)

- Two-round LLM default — the single-call `expand → decoder` pipeline stays the default. Two-round is opt-in via `--expand` and gated on Brief E showing a measured quality delta. See ADR-0008 §Decision amendment, and [`docs/reserve-paths.md`](../../reserve-paths.md) RP-001 for the sealed full two-round path.
- Image-with-text composition at L5 — sealed as RP-002 in [`docs/reserve-paths.md`](../../reserve-paths.md). Not part of v0.2 image goals.
- JEPA / `IR.Latent` implementation — gated on Brief B kill criterion 1 (JEPA multimodal parity by Q3 2026). Until then `Latent` stays uninhabited.
- Site rewrite (RFC-0004) — tracked as a separate PR against the site repo.
- CLI ergonomics port (RFC-0002 / ADR-0009) — adjacent execution plan, can parallelize with M2–M5.
- New modalities beyond the current 7 — post-M5.
- `codec-video` port — its own M-slot post-v0.3 (the package is a 🔴 stub at v0.2).
- Path C code (ADR-0007 — rejected).
- Heavy-tier benchmarks (`--quality=heavy`) — deferred to v0.3+ per `docs/v02-final-audit.md` §4.2.

## Risk register

| Risk                                                        | Phase  | Mitigation                                                                                        |
| ----------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------- |
| Round-trip test spills past 20 lines on raster image        | M1     | Protocol shape is wrong; revert and reopen RFC-0001 §Interface.                                   |
| LLM-stage drift swamps the parity test on TTS               | M2     | Pin model_id + seed; structural parity only for LLM-driven outputs; flag drift in PR body.        |
| `harness.ts` cleanup breaks an undocumented downstream user | M4     | Soft-warn → hard-warn lifecycle catches it; demote one field, do not revert harness collapse.     |
| VQAScore model unavailable at metric eval                   | M5a    | `quality.partial` invariant; CLIPScore fallback documented in same PR.                            |
| Brief G stays a stub when M1 begins                         | pre-M1 | Audit Tier 3 blocker — promote Brief G to draft before M1 kickoff. See `docs/v02-final-audit.md`. |
| Two-hats review becomes box-checking                        | every  | If both hats sign off but the next phase still surprises, treat the prior sign-off as a defect.   |

## Review

Two hats at every phase boundary:

- **Researcher hat:** does this migration preserve the verdicts of Brief A, Brief B, Brief E?
- **Hacker hat:** can the resulting `Codec<Req, Art>` absorb an 8th modality in ≤20 lines, as RFC-0001's round-trip test requires?

## Pre-flight checklist (before M0 kickoff)

- [ ] Brief G promoted from 🔴 stub to 🟡 draft with a concrete G1 verdict (audit Tier 3).
- [ ] `docs/v02-final-audit.md` Tier 1 + Tier 2 patches landed (PR #38 or successor).
- [ ] `docs/agent-guides/image-to-audio-port.md` exists and is current (PR #38).
- [ ] `pnpm test:goldens` script committed and green on `main`.
- [ ] M0 PR opened against the v0.2-locked `main`, not a stale branch.

When every box is checked, M0 is unblocked.
