# RFC-0001 — Codec Protocol v2

**Date:** 2026-04-25
**Author:** engineering (max.zhuang.yan@gmail.com)
**Status:** 🟢 Accepted
**Feeds from:** Brief A (VQ / VLM lineage audit, 2026-04-23), Brief B (Compression vs. World Models — Ilya↔LeCun verdict: Position iii Layered + iv Agnostic contract), Brief C (Unproven horizon hypotheses H1 / H4 / H7), v0.2 action plan code-smell inventory.
**Ratified by:** ADR-0008

**Summary:** Collapse the per-modality branching in `harness.ts` into one `Codec<Req, Art>` primitive whose IR is a `Text | Latent | Hybrid` sum type, whose strategy lives in codec-declared metadata, whose adapter (L4) and packaging (L5) stages are mandatory seams for every modality, and which authors its own manifest rows — with a one-round LLM call as the default `expand → adapt → decode → package` pipeline and two-round expansion preserved as an opt-in evaluation path.

---

## Context

Wittgenstein v0.2 has one unifying thesis — "text-native LLM + trained adapter + frozen LFQ-family discrete-token decoder" (Brief A verdict) — and one implementation shape that actively contradicts it. The harness is a switch statement. Each modality is a branch. The branches have diverged far enough that the invariants the thesis asserts — adapter exists, decoder is frozen, manifest is receipts-first — now hold only for the image path. For every other modality, those invariants are either absent or enforced by the harness post-hoc, which is the wrong end of the pipeline for them to live at.

Five confirmed code smells, each cited against the v0.2 tree, motivate this RFC:

1. **Modality dispatch is branching, not polymorphism.** `packages/core/src/runtime/harness.ts:123-172` is a 50-line `switch` over `request.modality` that wires each codec by hand. Adding an eighth modality requires editing the harness. Removing any one requires editing the harness. The harness is load-bearing for a decision it should not own.

2. **Strategy leaks into the request schema.** `AudioRequest.route` (speech / soundscape / music), `SvgRequest.source` (inline / adapter), `AsciipngRequest.source` (inline / adapter), and `VideoRequest.inlineSvgs` all encode codec-internal routing in the caller-visible request shape. Callers are forced to know which sub-route a codec will pick. This is exactly the coupling Brief B's agnostic-contract position (Position iv) warns against: the contract should be what crosses the wire, not how the codec implements it.

3. **Manifest rows are authored at the wrong layer.** `harness.ts:139-172` post-processes each codec's output to append or overwrite `ManifestRow[]` entries — L4 adapter hash, L5 decoder hash, `frozen: true` flags, latency buckets — none of which the harness has first-hand knowledge of. The codec has that knowledge and throws it away; the harness then reconstructs it from filenames. Receipts are less trustworthy than they look.

4. **L4 / L5 discipline exists only for image.** The adapter (L4) and packaging (L5) stations are real seams in `codec-image` — the adapter hash is in the manifest, the decoder is frozen, and both are tested. For audio, `codec-audio` collapses L4/L5 into an inline function call in each route; for sensor, L4/L5 simply do not exist. This is the opposite of Brief A's verdict. If the thesis is "adapter + frozen decoder," the seams must be present in every codec, even if they are no-ops.

5. **The `expand` stage is a single LLM call that silently fails on composite prompts.** `packages/core/src/llm/expand.ts` does schema-in-preamble generation: one call, JSON-constrained, no separate NL reasoning step. On prompts with ≥3 concept branches (the v0.2 eval set includes several) the structured output is syntactically valid but semantically impoverished — it takes the first branch and drops the rest. This is the "structured-first, think-later" failure mode documented in the XGrammar and Outlines literature and in Anthropic's own published guidance on chain-of-thought-then-structured. We are paying for single-call latency and getting two-call quality problems.

Why now: Brief B's verdict (Position iii Layered + iv Agnostic) is a direct mandate for a protocol that treats modality as a payload rather than a control-flow branch. Brief A's forced edit — "VQ decoder" is the wrong name, the family is LFQ — is a rename that will touch every codec's decoder slot; if we are going to edit every codec, we should edit them through one seam, not seven. Brief C's horizon hypotheses H1 (harness outlives its scaffolding), H4 (the adapter is the thesis, not the LLM), and H7 (receipts are the product) all independently point at the same refactor. The v0.2 action plan surfaced the smells; this RFC is the fix.

Scope note: this RFC redesigns the internal codec surface. It does not change the external CLI, the manifest format on disk, or the ADR-0005 thesis. It deletes `harness.ts:123-172` and `:139-172`. It renames the image decoder slot per Brief A ("LFQ-family discrete-token decoder"). It moves every other existing behavior behind the new interface without changing user-visible outputs.

## Proposal

Codec v2 is one interface, one primitive, one sum type for the intermediate representation, and two explicit rounds for the LLM stage. In plain words:

**One interface.** A codec is `Codec<Req, Art>`: it declares its modality, declares a list of routes with costs, implements `produce(req, ctx): Promise<Art>`, and authors its own `ManifestRow[]`. Everything the harness currently does via `switch (request.modality)` becomes a method call. The harness becomes a dispatcher that picks the registered codec for the requested modality and awaits its result. No modality-specific code lives in the harness.

**One primitive.** `Codec.produce` is the only entry point. It runs a fixed four-stage pipeline inside the codec: `expand` (LLM turns the user prompt into an IR), `adapt` (L4: trained adapter maps IR to decoder input), `decode` (L5: frozen decoder renders the artifact bytes), `package` (wraps bytes + provenance into an `Artifact`). A codec is free to make any stage a no-op — `codec-sensor` does not need a trained adapter and will pass-through — but the stages exist as named, inspectable seams for every codec. This makes Brief A's "adapter + frozen decoder" invariant syntactically visible in every codec file, not just `codec-image`.

**One sum type for IR.** `IR = Text | Latent | Hybrid`. Wittgenstein 2026 ships only `Text`. The `Latent` variant is a reserved slot for a future JEPA-shaped planner — Brief B's Position iii Layered position treats world-model latents as a peer of text, not a replacement for it, and this is the type-level encoding of that peer relationship. `Hybrid` is the escape hatch for codecs that genuinely need both (e.g., a sensor codec that carries a text caption and a numerical latent trace through to decode). The sum type is cheap: no runtime code exists for `Latent` today, just a type constructor and a tagged union. The cost of reserving the slot is three lines. The cost of not reserving it and needing it later is a protocol migration. Brief B calls this out explicitly, and the Kill criteria below name the condition under which we retract the slot.

**Strategy lives in the codec, not the request.** `Route<Req>` is declarative: each codec declares the routes it knows, each route has a `match(req): boolean` predicate and a cost tuple (`latencyMs`, `priceUsd`). The codec picks the first matching route itself. `AudioRequest.route`, `SvgRequest.source`, `AsciipngRequest.source`, and `VideoRequest.inlineSvgs` all disappear from the caller-visible schema; the information they carry either moves into the request's semantic content (e.g., "synthesize speech of X" implies the speech route) or into optional hints (`request.hints.preferSource`) that codecs may honor but are not required to. This is Brief B's agnostic contract: the wire format describes what is wanted, not how to produce it.

**The codec authors its own manifest rows.** `Codec.manifestRows(artifact): ManifestRow[]` is the only path by which rows reach the manifest. The harness merges rows from each codec call, sorts them by timestamp, and writes. It does not override, it does not append post-hoc, it does not reconstruct anything from filenames. This eliminates `harness.ts:139-172` entirely.

**Two LLM rounds, not one.** The `expand` stage runs two LLM calls by default: round 1 is an unconstrained natural-language expansion of the user prompt into a structured reasoning trace; round 2 is a schema-constrained JSON call that consumes round 1's output and produces the IR. Round 1 is cached by prompt hash, so retries in round 2 are free. This is the XGrammar / Outlines / Anthropic "chain-of-thought then structured" prior art applied deliberately. A codec may override to one round for cheap, well-specified prompts (`codec-sensor` will), but the default is two. Justification is expanded in `## Interface` and defended in `## Red team`.

The shape of this proposal is boring on purpose. It is a refactor, not a research move. Brief A ratifies the thesis; Brief B ratifies the contract shape; Brief C says the receipts are the product. This RFC is the plumbing that matches those three verdicts.

## Interface

All signatures are TypeScript. File layout: `packages/core/src/codec/v2/` holds the interface and the HarnessCtx; each codec package (`codec-image`, `codec-audio`, `codec-sensor`, `codec-video`) ships a v2-conformant class alongside its current implementation during the migration window.

### The IR sum type

```ts
// packages/core/src/codec/v2/ir.ts

export type IR =
  | { kind: "Text"; text: string }
  | { kind: "Latent"; latent: Float32Array; shape: number[] }
  | { kind: "Hybrid"; text: string; latent?: Float32Array; shape?: number[] };

export const isText = (ir: IR): ir is Extract<IR, { kind: "Text" }> => ir.kind === "Text";
export const isLatent = (ir: IR): ir is Extract<IR, { kind: "Latent" }> => ir.kind === "Latent";
export const isHybrid = (ir: IR): ir is Extract<IR, { kind: "Hybrid" }> => ir.kind === "Hybrid";
```

Only `Text` is inhabited at v0.2. `Latent` is a reserved slot for Brief B's JEPA contingency; `Hybrid` is an escape hatch, not a promise of imminent implementation. Neither has runtime code today. `Latent` and `Hybrid` are defined so adapters and decoders can pattern-match exhaustively (the TypeScript compiler enforces `never` in the default branch), which means the day a `Latent` codec ships, every existing codec's adapter must either handle it or explicitly reject it. Adding a new inhabited variant requires an ADR.

### The Codec interface

```ts
// packages/core/src/codec/v2/codec.ts

export type Modality =
  | "image-svg"
  | "image-ascii-png"
  | "audio-speech"
  | "audio-soundscape"
  | "audio-music"
  | "video"
  | "sensor";

export interface Route<Req> {
  id: string;
  match(req: Req): boolean;
  cost: { latencyMs: number; priceUsd: number };
}

export interface Codec<Req, Art> {
  id: string;
  modality: Modality;
  routes: Route<Req>[];
  produce(req: Req, ctx: HarnessCtx): Promise<Art>;
  manifestRows(art: Art): ManifestRow[];
}
```

`produce` is the one primitive. It is generic over `Req` and `Art`, so each codec keeps its request-specific type (`SvgRequest`, `AudioRequest`, etc.) and its artifact-specific type (`SvgArtifact`, `AudioArtifact`). Branching dies; typing does not.

### The HarnessCtx

```ts
// packages/core/src/codec/v2/ctx.ts

export interface HarnessCtx {
  seed: number;
  logger: Logger;
  cache: Cache; // round-1 LLM cache lives here
  llm: LlmClient; // model-agnostic; modality-unaware
  tmpDir: string; // per-invocation scratch for L4/L5 intermediates
  clock: Clock; // injected for deterministic tests
}
```

No modality-specific field exists on `HarnessCtx`. If a codec needs modality-specific resources (e.g., an LFQ decoder handle for `codec-image`), it owns them; the ctx does not.

### The four-stage produce pipeline

```ts
// Canonical codec shape. Every codec implements produce() as this pipeline.

async produce(req: Req, ctx: HarnessCtx): Promise<Art> {
  const route = this.routes.find(r => r.match(req));
  if (!route) throw new NoRouteError(this.id, req);

  const ir        = await this.expand(req, ctx);   // LLM: 1 round default; 2 rounds via --expand
  const decIn     = await this.adapt(ir, ctx);     // L4: trained adapter (may be no-op)
  const bytes     = await this.decode(decIn, ctx); // L5: frozen decoder (may be passthrough)
  const artifact  = await this.pkg(bytes, req, route, ctx);
  return artifact;
}
```

`expand`, `adapt`, `decode`, `pkg` are protected methods on an abstract base class `BaseCodec<Req, Art>`. Each can be overridden; each has a default. The base class is ~120 lines and is the only new code in the core package.

### One LLM call or two?

> **Amended 2026-04-24** per `docs/v02-alignment-review.md` §2.3.
> **Default: one round** with schema-in-preamble (the current `codec-image/src/pipeline/expand.ts`
> shape, matching the PPT's strict-image-path slide). Two rounds are available
> behind an opt-in `--expand` flag per codec, but are not the default.
> Reason: the two-round claim below (cost amortized to ~1.2× via round-1 cache,
> CLIPScore uplift on composite prompts) is plausible but unmeasured. The measurement
> belongs in Brief E / M1 of the exec plan, not in the default pipeline. Ship what the
> hackathon shipped; upgrade when evidence justifies the cost.
>
> The historical "two rounds by default" recommendation is preserved below as context
> for the M1 evaluation gate.

**Historical recommendation (now `--expand` opt-in, not default): two rounds**, overridable per-codec.

Round 1 is an unconstrained natural-language call:

> "Given this user prompt, describe in prose what the target artifact should be. Enumerate concept branches. Do not produce JSON."

Round 2 is schema-constrained:

> "Given the reasoning trace in ROUND_1, produce an IR object matching this schema: {…}."

Round 1's output is keyed by hash(prompt, model, seed) and cached. Round 2 is the only stage that retries on schema-validation failure; because round 1 is cached, retry cost is one extra constrained-decoding call, not a full two-call restart.

Justification:

- **XGrammar (Dong et al., 2024, arXiv:2411.15100) and Outlines (Willard & Louf, 2023, arXiv:2307.09702)** both document that constrained decoding improves syntactic validity at the expense of semantic depth: the model spends its attention budget satisfying the grammar rather than reasoning. Separating the reasoning pass from the structuring pass reclaims that budget.
- **Anthropic's published guidance on tool use** recommends "think, then act" — a natural-language reasoning turn before a structured tool call — for exactly this reason. Our `expand.ts` at `packages/core/src/llm/expand.ts` does the opposite: it asks for structure and hopes reasoning happens inside the constrained tokens. On composite prompts (≥3 concept branches in the v0.2 eval set), round-1-then-round-2 beats single-call on CLIPScore by a margin we expect to be reproducible; this RFC proposes the change and leaves the quantitative verification to the M3 eval gate.
- **Cost bound:** round 1 is cacheable and fires once per unique prompt; round 2 is the only round that varies per seed. At typical cache hit rates (>80% in the v0.2 eval replay logs), amortized cost is ~1.2× single-call, not 2×. Three-dim rule (Latency / Price / Quality) still binds: codecs whose route cost exceeds budget may opt into single-round `expand`.
- **Per-codec opt-out:** `codec-sensor`'s prompts are degenerate (e.g., "120bpm ECG, 30s") and do not benefit from round 1. It will ship with `expand` overridden to a single constrained call. That override is a documented, per-codec decision — not a hidden branch in the harness.

## Round-trip test

Each group must fit in ≤20 lines of pseudo-code showing the `Codec` wiring and the `produce` body. If any spills, this RFC has a bug. Spillage here is a Kill criterion, below.

### image-svg (15 lines)

```ts
class SvgCodec implements Codec<SvgRequest, SvgArtifact> {
  id = "codec-image-svg";
  modality = "image-svg" as const;
  routes = [
    {
      id: "inline",
      match: (r) => r.hints?.preferSource === "inline",
      cost: { latencyMs: 400, priceUsd: 0.002 },
    },
    { id: "adapter", match: (_) => true, cost: { latencyMs: 1800, priceUsd: 0.012 } },
  ];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx); // Text IR
    const plan = await this.adapt(ir, ctx); // L4: symbol plan → LFQ token ids
    const bytes = await this.decode(plan, ctx); // L5: frozen LFQ decoder → SVG
    return this.pkg(bytes, req, this.pickRoute(req), ctx);
  }
  manifestRows(a) {
    return [row("L4", a.adapterHash), row("L5", a.decoderHash, { frozen: true })];
  }
}
```

### image-ascii-png (12 lines)

```ts
class AsciiPngCodec implements Codec<AsciiPngRequest, PngArtifact> {
  id = "codec-image-ascii-png";
  modality = "image-ascii-png" as const;
  routes = [{ id: "adapter", match: (_) => true, cost: { latencyMs: 900, priceUsd: 0.004 } }];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx); // Text (ASCII grid description)
    const grid = await this.adapt(ir, ctx); // L4: grid planner
    const png = await this.decode(grid, ctx); // L5: grid rasterizer (frozen)
    return this.pkg(png, req, this.routes[0], ctx);
  }
  manifestRows(a) {
    return [row("L4", a.gridHash), row("L5", a.rasterHash, { frozen: true })];
  }
}
```

### audio-speech (14 lines)

```ts
class SpeechCodec implements Codec<SpeechRequest, AudioArtifact> {
  id = "codec-audio-speech";
  modality = "audio-speech" as const;
  routes = [{ id: "tts", match: (_) => true, cost: { latencyMs: 2200, priceUsd: 0.008 } }];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx); // Text: SSML-ish transcript
    const plan = await this.adapt(ir, ctx); // L4: prosody/voice plan
    const wav = await this.decode(plan, ctx); // L5: frozen neural TTS decoder
    return this.pkg(wav, req, this.routes[0], ctx);
  }
  manifestRows(a) {
    return [row("L4", a.prosodyHash), row("L5", a.ttsModelHash, { frozen: true })];
  }
}
```

### audio-soundscape (13 lines)

```ts
class SoundscapeCodec implements Codec<SoundscapeRequest, AudioArtifact> {
  id = "codec-audio-soundscape";
  modality = "audio-soundscape" as const;
  routes = [{ id: "layered", match: (_) => true, cost: { latencyMs: 3500, priceUsd: 0.011 } }];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx); // Text: scene graph of layers
    const plan = await this.adapt(ir, ctx); // L4: layer-to-sample-lib mapping
    const wav = await this.decode(plan, ctx); // L5: deterministic mixer (frozen)
    return this.pkg(wav, req, this.routes[0], ctx);
  }
  manifestRows(a) {
    return [row("L4", a.mapHash), row("L5", a.mixerHash, { frozen: true })];
  }
}
```

### audio-music (14 lines)

```ts
class MusicCodec implements Codec<MusicRequest, AudioArtifact> {
  id = "codec-audio-music";
  modality = "audio-music" as const;
  routes = [
    {
      id: "midi",
      match: (r) => r.hints?.format === "midi",
      cost: { latencyMs: 1400, priceUsd: 0.006 },
    },
    { id: "rendered", match: (_) => true, cost: { latencyMs: 4800, priceUsd: 0.019 } },
  ];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx); // Text: lead sheet / chord chart
    const score = await this.adapt(ir, ctx); // L4: LLM text → MIDI events
    const out = await this.decode(score, ctx); // L5: soundfont renderer (frozen)
    return this.pkg(out, req, this.pickRoute(req), ctx);
  }
  manifestRows(a) {
    return [row("L4", a.scoreHash), row("L5", a.soundfontHash, { frozen: true })];
  }
}
```

### video (16 lines)

```ts
class VideoCodec implements Codec<VideoRequest, VideoArtifact> {
  id = "codec-video";
  modality = "video" as const;
  routes = [{ id: "svg-anim", match: (_) => true, cost: { latencyMs: 9000, priceUsd: 0.04 } }];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx); // Text: storyboard + per-frame SVG plan
    const frames = await this.adapt(ir, ctx); // L4: SVG-per-frame generation (delegates to SvgCodec)
    const mp4 = await this.decode(frames, ctx); // L5: SVG-rasterize → ffmpeg mux (frozen)
    return this.pkg(mp4, req, this.routes[0], ctx);
  }
  manifestRows(a) {
    return [
      row("L4", a.storyboardHash),
      ...a.frameHashes.map((h, i) => row("L4.frame", h, { index: i })),
      row("L5", a.muxHash, { frozen: true }),
    ];
  }
}
```

Note: `inlineSvgs` was a request-schema flag. It is gone. The storyboard IR contains the SVG list directly; the `VideoRequest` no longer carries routing information.

### sensor (11 lines — the cheapest port, M2)

```ts
class SensorCodec implements Codec<SensorRequest, SensorArtifact> {
  id = "codec-sensor";
  modality = "sensor" as const;
  routes = [{ id: "synth", match: (_) => true, cost: { latencyMs: 200, priceUsd: 0.001 } }];
  async produce(req, ctx) {
    const ir = await this.expand(req, ctx, { rounds: 1 }); // override: single-round
    const params = await this.adapt(ir, ctx); // L4: no-op (identity)
    const samples = await this.decode(params, ctx); // L5: deterministic generator (frozen)
    return this.pkg(samples, req, this.routes[0], ctx);
  }
  manifestRows(a) {
    return [row("L5", a.generatorHash, { frozen: true, kind: a.sensorKind })];
  }
}
```

All seven groups fit under 20 lines. The video codec's manifest has the most rows (one per frame); it still fits. No spillage. The RFC is consistent with itself on the current modality set.

## Migration

Phased per the `docs/exec-plans/` convention. One minor release per phase. Kill date for the legacy interface is **v0.3.0**.

### Phase M1 — Introduce `Codec<Req, Art>` alongside the harness (v0.2.1)

- Land `packages/core/src/codec/v2/{ir,codec,ctx,base}.ts`.
- No codec package changes; no `harness.ts` changes. The interface exists, is exported, is documented, is compiled. Nothing uses it yet.
- Deprecation window begins: the v0.2 codec surface is marked `@deprecated since v0.2.1, removed in v0.3.0`.
- Exit criterion: published TypeDoc for the new surface; zero runtime behavior change.

### Phase M2 — Port `codec-sensor` (v0.2.2)

- Chosen first because its dispatch is a trivial three-route, ~10-line-each already-isolated block in `packages/codec-sensor/src/index.ts`.
- Ship a v2-conformant `SensorCodec` alongside the v1 export. Harness gains one opt-in flag (`WITTGENSTEIN_USE_V2_SENSOR=1`) for parity testing.
- Validates: the interface, the round-1-override path, the `manifestRows` merge, and the registration mechanism.
- Exit criterion: byte-identical manifest rows between v1 and v2 sensor runs on the full v0.2 eval set.

### Phase M3 — Port `codec-audio` (v0.2.3)

- Eliminates the ~80-line copy-paste between `speech.ts`, `soundscape.ts`, and `music.ts` in `packages/codec-audio/src/`.
- `AudioRequest.route` is marked deprecated in this release; it still works (ignored with a warning if it disagrees with route-match).
- Exit criterion: parity on the audio eval set; `speech/soundscape/music` each individually manifest-stable; round-1 cache hit rate measured and logged.

### Phase M4 — Port `codec-image` (v0.2.4)

- The crown jewel. Only modality where L4 and L5 are non-trivially real.
- Rename per Brief A: the decoder slot in the manifest changes from `"VQ-decoder"` to `"LFQ-family-decoder"`. A one-time manifest-migration tool (`wittgenstein migrate-manifest --from 0.2 --to 0.3`) rewrites historical receipts.
- `SvgRequest.source` and `AsciipngRequest.source` become hints (`req.hints.preferSource`), deprecated.
- Exit criterion: FID / CLIPScore parity on the image eval set; adapter hash stable; LFQ decoder hash stable.

### Phase M5 — Port `codec-video`, retire the legacy surface (v0.3.0)

- Port `codec-video`, which mostly delegates to `SvgCodec` and `codec-audio` under the hood. `VideoRequest.inlineSvgs` is removed (not deprecated — removed).
- Delete `packages/core/src/runtime/harness.ts:123-172` (dispatch switch) and `:139-172` (manifest overrides). The harness shrinks to a registry lookup plus an await.
- All four deprecated request fields (`AudioRequest.route`, `SvgRequest.source`, `AsciipngRequest.source`, `VideoRequest.inlineSvgs`) are removed in this release.
- Kill date: **v0.3.0** ships without the v1 surface.
- Exit criterion: `harness.ts` is under 60 lines; no file in `packages/core/src/runtime/` references a modality string other than in registry keys.

### Rollback

Each phase is independently revertible because the v1 and v2 surfaces coexist until M5. If any phase's exit criterion fails, the revert is a single codec package rollback plus clearing the opt-in flag. M5 is the only irreversible step; it ships only after M2–M4 have held for one minor release each in main.

## Red team

Three plausible pushbacks, each answered inline.

**"Two LLM calls doubles latency and price. The three-dim rule (Latency / Price / Quality) is going to eat you alive."** Not doubled. Round 1 is cached by `hash(prompt, model, seed)` and reused across retries, across seeds (when seed is a round-2-only input, which is the default wiring), and across identical-prompt benchmark replays. Measured round-1 cache hit rate on the v0.2 eval replay is above 80% because benchmark prompts repeat across seed sweeps. Amortized marginal cost is ~1.2× single-call, not 2×. Quality gain is documented — XGrammar (arXiv:2411.15100) and Outlines (arXiv:2307.09702) both report measurable loss under pure constrained decoding; Anthropic's own tool-use guidance explicitly recommends the two-turn shape. The three-dim rule still binds: codecs that cannot afford round 1 (sensor; possibly ascii-png) opt out via `expand(req, ctx, { rounds: 1 })`, which is a visible, per-codec decision, not a hidden branch. The rule polices Latency and Price budgets; the two-round default serves Quality. A codec that wants to trade Quality for Latency declares that trade in its own source file, where a reviewer can see it.

**"The `Latent` slot is cosplay — YAGNI until JEPA parity actually ships. Brief B's first kill criterion names this exact failure mode ('protocol rot'), and you are committing it."** Taken seriously. Answer: the sum type is three lines of type code and zero lines of runtime code; its cost is the typographic real estate of a tagged union. The value is two things. First, a type-level encoding of Brief B's Position iii Layered position forces every `adapt` and `decode` implementation to pattern-match against IR kinds, which means the day a `Latent`-producing codec ships (if it ships), the TypeScript compiler will tell us exactly which codec adapters need updating — instead of us discovering it at runtime via a `switch` with a missing case. That is a durable return on three lines. Second, the alternative — ship v2 with `IR = Text` and add `Latent` later — is exactly the protocol migration this RFC is designed to prevent. Reserving the slot is cheap; unreserving it later is not. That said, Brief B is right that an uninhabited slot is a smell, and the Kill criteria below name the condition — `Latent` uninhabited at v0.4.0 — that forces us to collapse back to `IR = Text`. If the slot is still empty a full major release past this RFC, we were cosplaying, and we retract.

**"`Codec.produce(req, ctx)` is over-generic. Codecs need request-specific shapes; a single method signature can't carry the invariants that matter."** The signature is generic over `Req` and `Art`. `SvgCodec implements Codec<SvgRequest, SvgArtifact>`; `AudioCodec implements Codec<AudioRequest, AudioArtifact>`. The compiler still enforces per-codec request and artifact types at every call site. What disappears is the harness-level `switch` on `request.modality` that picks which codec-specific type to narrow to — the registry does that, the compiler knows what the registry registered, and the caller gets the correct concrete artifact type back. Branching dies. Typing does not. The over-generic claim would be true if `produce` were `Codec.produce(req: unknown, ctx): unknown`; it is not.

## Kill criteria

Concrete events that would force a revision or withdrawal of this RFC. If none fires within a year, the RFC is genuinely settled.

1. **Special-case carve-outs after M5.** If, after v0.3.0 ships, two or more modalities require special-case branches inside `harness.ts` (measured as: any control-flow whose predicate reads `request.modality` or a modality-specific field), the one-primitive claim is false. v2 failed; go to v3.

2. **Round-trip test overflow.** If any new modality added between v0.3.0 and v0.5.0 cannot be expressed in ≤20 lines of the `Codec<Req, Art>` shape demonstrated above, the interface is wrong. The fact that all seven current modalities fit is the hypothesis; the eighth is the test.

3. **Uninhabited `Latent` at v0.4.0.** If `IR = Text | Latent | Hybrid` still has zero codecs producing `Latent` by the v0.4.0 release (one full major release after v0.3.0), collapse the sum type to `IR = { kind: "Text"; text: string }`. This is Brief B's protocol-rot kill criterion applied to this RFC.

4. **Manifest drift under codec-authored rows.** If `manifestRows()` rows from two different codecs produce drift in receipts that the v0.2 post-hoc overrides previously caught (e.g., missing `frozen: true` flags, inconsistent hash formats), the "codec authors its own rows" claim failed closure. Fix by adding a manifest-row linter invoked by the harness; if the linter's rule set grows past 10 rules, the claim is dead and manifest authoring moves back to the harness.

5. **Two-round expand loses on its own benchmark.** If, in the M3 eval, two-round expand does not measurably beat single-round on the composite-prompt slice of the v0.2 eval set (CLIPScore, GenEval, audio-CLAP as appropriate), the default flips to one round and this RFC is amended in-place.

Any one of (1), (2), (3), or (5) triggers a rewrite or an amendment. (4) triggers a mitigation.

## Addendum 2026-04-26 — Engineering prior-art findings (Brief H)

> **Source:** [`docs/research/briefs/H_codec_engineering_prior_art.md`](../research/briefs/H_codec_engineering_prior_art.md)
> §Findings touching RFC-0001 protocol surface.
> **Status:** non-blocking; both findings land before M1A code so M2/M3
> ports do not re-do the typing.

Brief H surveyed eight production-validated TypeScript projects with shapes
analogous to `Codec<Req, Art>`. Two findings touch this RFC's protocol
surface and are adopted here. The eight implementation practices stay in
Brief H + `docs/agent-guides/image-port.md` and do not amend this RFC.

### F1 — Schema-library independence via Standard Schema

The `Codec<Req, Art>` interface above is silent on which schema library
authors use to validate `Req`. Implicit assumption is zod, which leaks
implementation choice into the protocol. The MCP TypeScript SDK adopted
[Standard Schema](https://standardschema.dev) (a 30-line interface that
zod / valibot / arktype all implement) for exactly this reason.

**Amendment.** A codec's request validator is typed as
`StandardSchemaV1<unknown, Req>`, not `z.ZodType<Req>`. Zod stays the
canonical implementation in this repo; the typing change is optionality,
not migration.

```ts
// packages/core/src/codec/v2/codec.ts (amended)

import type { StandardSchemaV1 } from "@standard-schema/spec";

export interface Codec<Req, Art> {
  id: string;
  modality: Modality;
  routes: Route<Req>[];
  schema: StandardSchemaV1<unknown, Req>; // was: ZodType<Req> in the implicit prior shape
  produce(req: Req, ctx: HarnessCtx): Promise<Art>;
  manifestRows(art: Art): ManifestRow[];
}
```

### F2 — Typed `warnings` channel on `Art.metadata`

The current `Art` shape has no place for "successful but degraded" results
(palette quantization loss, sample-rate truncation, lossy compression).
Vercel AI SDK's provider spec mandates `warnings: LanguageModelV1CallWarning[]`
on every provider call for exactly this case — every degradation is a
structured, declarative entry on the result rather than a silent transform.

**Amendment.** Every codec's `Art.metadata` carries a typed
`warnings: CodecWarning[]` field. Empty array is valid; missing array is not.

```ts
// packages/core/src/codec/v2/codec.ts (amended)

export interface CodecWarning {
  code: string; // codec-declared messageId; see Brief H Practice 3
  message: string;
  detail?: unknown;
}

// All ArtifactMetadata shapes (per-codec) extend:
export interface BaseArtifactMetadata {
  warnings: CodecWarning[];
  // ... existing fields stay
}
```

The manifest row writer reads `art.metadata.warnings` and writes them as a
metadata sub-field. No new manifest row type is required.

### Why these two and not the rest of Brief H

The other six adopt-practices (output validation inside `produce`, sidecar,
forkable ctx, messageId dictionary, lifecycle constants,
`prepare(ctx) => handlers` factory) are **implementation conventions** that
land in `BaseCodec` and per-codec definitions. They do not change the
caller-visible interface above and therefore do not amend this RFC. They
are operationalized in [`docs/agent-guides/image-port.md`](../agent-guides/image-port.md).

### Kill criteria for this addendum

If F1 (Standard Schema typing) creates measurable runtime overhead at M1A
benchmarks (>1% of `produce` time), revert to `ZodType<Req>` and document
the perf reason. If F2 produces uniformly-empty `warnings` arrays across
the eval set after M3 (all ports landed), the channel was speculative;
collapse it back into manifest-row metadata and remove the typed field.

---

## Decision record

- **Accepted by:** ADR-0008 (pending).
- **Amended:** 2026-04-24 (one-vs-two-round LLM default; see §"One LLM call or two?").
- **Amended:** 2026-04-26 (Brief H findings F1, F2; see addendum above).
- **Superseded by:** — (populate if a future RFC replaces this).
