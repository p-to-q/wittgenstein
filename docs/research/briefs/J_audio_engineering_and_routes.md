# Brief J — Audio engineering and routes

**Date:** 2026-04-27
**Status:** 🟡 Draft v0.1
**Author:** engineering (Codex)
**Question:** Given Wittgenstein's current `codec-audio` surface, what engineering shape should M2 actually adopt for route dispatch, shared helpers, manifest rows, fixture classes, and `AudioRequest.route` deprecation?
**Feeds into:** `docs/agent-guides/audio-port.md`, `docs/exec-plans/active/codec-v2-port.md` §M2, future `ADR-0012`.

> This brief is the audio analog of Brief H, but it is intentionally narrower and more skeptical. The plan assumption that audio still hides an “80-line route copy-paste” was directionally useful, but the current repository has already partially collapsed the obvious duplication into `runtime.ts`. So the real question is not “how do we invent a grand audio abstraction?” — it is “what is the smallest honest M2 port that preserves route clarity, moves authorship into the codec, and does not overfit a premature `BaseAudioRoute`?”

---

## Context

M0 landed the Codec Protocol v2 surface in `packages/schemas/src/codec/v2/`. M1A landed image as the first real port and proved the four-stage seam is viable: `expand -> adapt -> decode -> package`. M2 is now the next active line, and audio is the first modality that tests whether the same seam can handle a **layered** codec rather than a single-route decoder.

The current `codec-audio` shape is already more disciplined than the plan's first-pass audit suggested:

- `packages/codec-audio/src/codec.ts` is still v0.1-style (`WittgensteinCodec.render(parsed, ctx)`), but it delegates to three small route implementations rather than a single giant renderer.
- `packages/codec-audio/src/routes/{speech,soundscape,music}/index.ts` are each short, but they still repeat five responsibilities: timing, ambient recommendation, route-specific render, artifact finalization, and metadata patching.
- `packages/codec-audio/src/runtime.ts` already centralizes the true shared render primitives: `finalizeAudioArtifact`, `generateAmbient`, `mixTracks`, `renderMacSpeech`, `synthSpeech`, `synthMusic`.
- `docs/agent-guides/audio-port.md` still talks about collapsing “~80-line copy-paste,” which is no longer literally true. The engineering problem has become more subtle: shared logic exists, but not all of it deserves a class boundary.

That subtlety matters. M2 is not “make audio elegant.” M2 is “port audio to Codec v2 without baking route-specific choices into shared doctrine.” This brief answers five engineering questions needed before code execution:

1. what multi-route pattern to borrow;
2. whether `BaseAudioRoute` is justified;
3. which audio-specific manifest rows are load-bearing;
4. which fixture classes should be byte-parity vs structural-parity;
5. how `AudioRequest.route` should deprecate.

---

## Steelman

### 1. Multi-route codec patterns: what to adopt and reject

The relevant prior art is not “audio framework” specific. It is any production system that multiplexes a small set of route-specific handlers inside one typed resource boundary.

**Express `Router` / Hono sub-apps** contribute the useful pattern: a flat dispatch surface with tiny handlers and shared middleware that is narrow enough to reason about locally. The transferable idea for M2 is not nested routers themselves, but a **codec-owned route table** where each route declares only `id + match + decode/package-local behavior`, and shared pre/post work lives outside the route file. This matches `Route<Req>` in `packages/schemas/src/codec/v2/codec.ts` almost exactly.

**Fastify nested plugins** are only partially relevant. Their strength is explicit encapsulation and decoration scoping, but their plugin lifecycle is too heavyweight for three route variants that all live inside one codec package. The insight worth copying is “route-local registration can be isolated,” not the plugin graph itself.

**tRPC sub-routers** are the cleanest fit for the _shape_ of the problem: one top-level surface, several typed sub-surfaces, shared context, and explicit composition. What transfers is the discipline that each route should own its input narrowing and output shape declaratively. What does **not** transfer is a proliferation of sub-router files or route-local middleware stacks. Audio does not need an RPC tree.

**Apollo subgraphs** are the wrong abstraction entirely. Their value comes from distributed ownership and federation. `codec-audio` has three sibling routes in one package; importing federation concepts would only blur the seam.

**Verdict for Q1:** adopt the **flat route-table + thin route objects** pattern; borrow selective compositional discipline from tRPC and Hono; reject Fastify-style nested plugin lifecycle and reject Apollo-style composition.

### 2. `BaseAudioRoute`: premature or load-bearing?

The repository's current code is the decisive signal here.

The three route files are not identical copies:

- `speech` is the only route with host-specific TTS probing (`renderMacSpeech`) and WAV decoding.
- `soundscape` is the only route whose render body is almost entirely “ambient category + deterministic operator render.”
- `music` is the only route that mixes symbolic synth output with ambient.

What _is_ shared today is smaller and more mechanical:

- derive or normalize the ambient category;
- compute a duration constant or duration heuristic;
- call a route-specific render primitive;
- call `finalizeAudioArtifact`;
- stamp route-local metadata such as `durationMs`.

That is real duplication, but not class-worthy duplication. A `BaseAudioRoute` class at this moment would mostly be a place to hide five helper methods and three protected hooks. It would increase ceremony before the decoder-family verdict exists, and it would create a new inheritance surface exactly when M2 should be converging toward the already-accepted `BaseCodec` seam, not inventing a second one.

The better shape is:

- keep the real abstract lifecycle in `BaseCodec`;
- add a small `audio-route-helpers.ts` or equivalent module for shared helper functions;
- if, after the decoder-family verdict lands, all three routes converge on the same route-local lifecycle, re-evaluate a `BaseAudioRoute` in a follow-up.

**Verdict for Q2:** **no base class yet; helper functions now.** `BaseAudioRoute` is premature at current code size and decoder uncertainty.

### 3. Audio-specific manifest fields

Audio needs more explicit structural metadata than image because “a WAV exists” is not enough to describe its reproducible shape. The current runtime already knows the minimum facts needed to describe the artifact honestly, and M2 should elevate those to codec-authored manifest rows.

At minimum, M2 should introduce one codec-authored row keyed as `audio.render` with:

- `sampleRateHz`
- `channels`
- `durationSec`
- `container` (`wav` today)
- `bitDepth` (`16` today)
- `determinismClass` (`byte-parity` or `structural-parity`)
- `decoderId` when a neural or host TTS engine participates
- `decoderHash` when a pinned neural decoder or weights artifact exists

This should sit alongside the generic artifact row rather than trying to overload `artifact.*`. The artifact row answers “what file was written?” The audio row answers “what acoustic structure did we intend to produce?”

For route-specific quality receipts:

- `speech` should emit `quality.partial.reason` when the host TTS engine is missing or when only structural parity can be asserted.
- `soundscape` and `music` should explicitly mark themselves `byte-parity` while they remain deterministic operator/symbolic synthesis paths.

**Verdict for Q3:** add a dedicated `audio.render` manifest row; do not rely on generic artifact metadata alone.

### 4. Test fixture strategy by route

The correct fixture split follows determinism, not modality:

**Speech** is structurally reproducible but not byte-stable across hosts once `renderMacSpeech()` is allowed to participate. Even with fixed seed, the host engine and platform can change waveform bytes while preserving intelligibility and duration. So speech should gate on:

- exact sample rate
- exact channel count
- duration within a narrow tolerance band
- a stable `quality.partial` or `determinismClass` declaration

If a future neural TTS decoder is chosen and only CPU inference is deterministic, the same structural class still applies unless the decoder family can prove byte-stable replay on the supported path.

**Soundscape** is currently a pure operator-library render keyed off seed and category. That is exactly the kind of path that should stay byte-for-byte. If SHA-256 drifts, it is a real regression.

**Music** is currently a tiny symbolic synth plus ambient mix. It is just as deterministic as soundscape under the present runtime and should also remain byte-for-byte. If M2 later introduces a decoder-backed music route, this verdict must be revisited.

**Verdict for Q4:** speech = structural parity; soundscape = byte parity; music = byte parity.

### 5. Soft-deprecation contract for `AudioRequest.route`

The repo doctrine is already explicit: strategy lives on the codec, not on the request. M2 should therefore not normalize `req.route` as a permanent user-controlled truth; it should keep it only as a compatibility hint for one minor version.

The deprecation needs to be machine-copyable and stable. Proposed warning text:

> `AudioRequest.route` is deprecated and will be removed after one minor version. Audio routing now lives inside `AudioCodec.route()`; keep `--route` only for compatibility while migrating callers to modality-level intent.

Preconditions for actual removal:

1. CLI help and examples no longer advertise `--route` as the primary interface.
2. `docs/codecs/audio.md` and `docs/agent-guides/audio-port.md` both describe route selection as codec-internal.
3. No tests, examples, or apps under `apps/` depend on request-side route selection as the only way to express intent.
4. The codec has a stable default intent mapping for speech / soundscape / music so removing the field does not silently collapse user intent.

The warning should live at the codec boundary, not in the harness and not in every route file.

**Verdict for Q5:** one-minor-version soft deprecation with the exact warning string above; remove only after docs/examples/app callers are clean.

---

## Red team

The strongest objection is that this brief is overfitting a transient implementation. If Brief I picks a neural decoder family with its own tokenizer, some of today's helper-level decisions may become obsolete. That is true, but it cuts in favor of _smaller_ abstractions, not larger ones. A premature `BaseAudioRoute` would fossilize the current operator-library shape just when the decoder family is still open.

The second objection is that a dedicated `audio.render` manifest row may duplicate generic artifact metadata. Also true, but duplication is cheaper than ambiguity here. Image can get away with one structural story because the shipping path is a single raster file. Audio has route-level determinism differences that need to be visible at a glance if M5b is to compare parity honestly.

The third objection is that the plan explicitly asked for `BaseAudioRoute`, so deviating from it could look like ignoring process. I think the right reading is the opposite: the plan asked for the engineering verdict, not blind obedience. The current codebase no longer supports the stronger “80-line copy-paste” premise, so the honest answer is to dial the abstraction down.

---

## Kill criteria

The engineering recommendations in this brief should be considered wrong, and therefore not promoted into the code port, if any of the following happens during M2:

1. A helper-functions-only port leaves any route file with >30 lines of true shared-mechanical logic duplicated across siblings. At that point, the “no `BaseAudioRoute`” verdict is too conservative and should flip.
2. The proposed `audio.render` row fails to cleanly encode one route's reproducibility story without leaking route-specific hacks into generic manifest fields. If that happens, the manifest schema needs a second iteration before the port lands.
3. Speech proves byte-stable on all supported hosts for the chosen decoder path. In that case, the structural-parity verdict is too loose and should be tightened.
4. Removing `AudioRequest.route` from real downstream callers requires more than one minor version of migration. If that signal appears, extend the deprecation window rather than force a breaking cleanup into M2.

---

## Verdict

1. **Multi-route pattern:** use a flat codec-owned route table with thin route objects; reject nested plugin and federation patterns.
2. **`BaseAudioRoute`:** do not introduce it in M2; use helper functions first and revisit only if duplication remains >30 lines after the port.
3. **Manifest fields:** add a dedicated `audio.render` row with `sampleRateHz`, `channels`, `durationSec`, `container`, `bitDepth`, `determinismClass`, and optional decoder identity/hash.
4. **Fixture classes:** speech gets structural parity; soundscape and music get byte-for-byte parity.
5. **`AudioRequest.route` deprecation:** soft-warn for one minor version with a fixed message, and remove only after docs/examples/apps no longer depend on it as the canonical intent surface.

Net: M2 should be a **small-shape port**, not a local framework invention. The engineering win is moving authorship into the codec and clarifying route determinism, not proving how many abstractions TypeScript can hold.

## References

- Wittgenstein repo (2026). `packages/codec-audio/src/codec.ts`, `packages/codec-audio/src/routes/{speech,soundscape,music}/index.ts`, `packages/codec-audio/src/runtime.ts`, `docs/agent-guides/audio-port.md`, `docs/exec-plans/active/codec-v2-port.md`.
- Brief H — `docs/research/briefs/H_codec_engineering_prior_art.md`
- RFC-0001 — `docs/rfcs/0001-codec-protocol-v2.md`
