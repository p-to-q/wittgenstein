# Image Port Guide (M1A)

This guide is for a contributor or coding agent picking up the **image codec port**, the first port that meets the v2 protocol. It is the M1A line of `docs/exec-plans/active/codec-v2-port.md`.

It is deliberately narrow:

- **in scope:** porting `codec-image` (the **raster** modality only) to the v2 protocol shape; landing the eight engineering practices from Brief H; preserving v0.1 goldens for the raster baseline tiles.
- **out of scope:** L4 adapter training (that is M1B and has its own forthcoming guide); the `codec-svg` and `codec-asciipng` packages (those are sibling ports — see §0 below); audio / sensor / video; the streaming/parallel-compile decoder bridge beyond stub seams; doctrine relitigation.

Read `docs/agent-guides/image-to-audio-port.md` first for the cross-line context. This guide is the M1A specialization.

## 0. Plan-vs-reality findings (2026-04-26)

This guide originally framed M1A as "porting `codec-image` with three internal routes (svg, ascii-png, raster)." A read-before-write pass against the actual repo (per `docs/engineering-discipline.md` §"Read before you write") surfaced three corrections worth flagging up front. They do not invalidate the protocol or Brief H — they narrow the M1A blast radius.

1. **`codec-image` is single-route raster.** `codec-svg` and `codec-asciipng` are **separate packages** under `packages/`, not internal routes within `codec-image`. M1A ports the raster codec only; svg + asciipng are sibling ports tracked in the M1 row of `docs/exec-plans/active/codec-v2-port.md` and may land in their own follow-up PRs. The `Route<Req>[]` shape in the v2 protocol still applies — the image codec just exposes one route at v0.2.
2. **`RunManifest` is a single object per run, not `ManifestRow[]`.** RFC-0001's "codec authors its own manifest rows" remains the doctrine; the implementation lands as `Codec.manifestRows()` returning rows that the harness folds into the existing one-object `RunManifest` shape exported from `@wittgenstein/schemas`. Reshaping `RunManifest` itself is **not** an M1A change.
3. **LLM-call ownership transfers from harness to codec.** The v1 `WittgensteinCodec.render(parsed, ctx)` consumes pre-parsed JSON the harness obtained from the LLM. The v2 `Codec.produce(req, ctx)` owns the LLM call inside `expand()`. This is structurally bigger than "rename `render` to `produce`" — the M1A port absorbs the LLM client, prompt assembly, and JSON parsing currently living in `packages/core/src/runtime/harness.ts` lines 123–172.

These findings are reflected in §4 deliverables and §8 manifest invariants below.

---

## 1. Mission

Port `codec-image` (raster modality) from the v0.1 surface to the Codec v2 protocol shape ratified by ADR-0008 and amended by RFC-0001 §Addendum 2026-04-26, while:

- preserving the v0.1 raster goldens byte-for-byte under cached-LLM replay;
- proving the protocol holds on the modality with both a real L4 adapter slot and a non-trivial L5 packaging step;
- absorbing the LLM call into the codec (per finding #3 in §0);
- moving manifest-row authorship into the codec via `manifestRows()`; the harness folds into the existing one-object `RunManifest` (per finding #2);
- landing the eight Brief H practices in their canonical home (`BaseCodec`, `Codec` interface, `HarnessCtx`) so M2 (audio), M3 (sensor), and the sibling svg / asciipng ports inherit them rather than re-deriving them;
- confirming the existing nested `style.palette` field on `ImageSceneSpec` is sufficient for the v2 `adapt` stage (M1 idea 5a is partially in tree already; M1A lifts a top-level `palette: string[]` on `ImageArtifact.metadata` only if a downstream consumer needs it);
- introducing **stub seams** for streaming + parallel compilation (M1 idea 1) — the hooks land at M1A; the streaming decoder bridge lives at M1B.

You are not allowed to:

- train the L4 adapter (that is M1B);
- swap the decoder for a generative model (ADR-0005 / ADR-0007);
- introduce a new modality or new route shape (RFC required);
- add a new public CLI flag except `--expand` (already specified in RFC-0001 §"One LLM call or two");
- relitigate the one-vs-two-round LLM doctrine (locked by RFC-0001 amendment 2026-04-24).

## 2. Read order

1. `AGENTS.md`
2. `docs/THESIS.md`
3. `docs/codecs/image.md` — the codec's locked surface and decoder rationale.
4. `docs/rfcs/0001-codec-protocol-v2.md` — protocol shape; **read the 2026-04-26 addendum carefully** (Standard Schema typing + warnings field).
5. `docs/research/briefs/H_codec_engineering_prior_art.md` — the eight adopt practices and four reject practices. This is your implementation checklist.
6. `docs/research/briefs/G_image_network_clues.md` — decoder / data / packaging form for image (G1 verdict frames the L3 seam).
7. `docs/exec-plans/active/codec-v2-port.md` §M1 — per-package diff and gate.
8. `docs/agent-guides/image-to-audio-port.md` §6 — cross-line image guidance.

M0 has landed: the v2 protocol types live under `packages/core/src/codec/v2/` and are exported under the `codecV2` namespace from `@wittgenstein/core`. Read that diff (and the smoke test at `packages/core/test/codec-v2.test.ts`) before extending — your M1A changes consume those types, they do not redefine them.

## 3. Why image first

Image has both a real L4 adapter slot and a non-trivial L5 packaging step. Audio has L4 collapsed into per-route inline calls; sensor has no L4 at all. If the protocol fits image (raster), it fits everything. If it does not fit image, the protocol is wrong, and that finding belongs in M1A — not M2.

Concretely:

- if `ImageCodec.adapt` cannot be expressed in ≤20 lines of dispatch + a delegate to the existing `pipeline/adapter.ts`, the seam is wrong;
- if `ImageCodec.manifestRows()` cannot author all rows the v0.1 harness was overriding post-hoc, the manifest design is wrong;
- if image still needs a special case in `harness.ts` after the port, the dispatch design is wrong.

The svg + asciipng sibling ports are deliberately NOT first — they are simpler (no L4, no LLM round-trip in the case of `--source local`) and would understate the protocol's load-bearing claims.

## 4. M1A deliverables

Items 1–4 already landed in M0 and are not your concern; they are listed for traceability so you know where to import from. Items 5–12 are the M1A delta.

| #   | Deliverable                                                                                                                                                                                                                                                                                                                                    | Status          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `BaseCodec<Req, Art>` in `packages/core/src/codec/v2/base.ts` — abstract base implementing `produce` as the four-stage pipeline; folds sidecar warnings into `Art.metadata.warnings` exactly once. Lands rejected-practices comment block (§6).                                                                                                | ✅ M0 (landed)  |
| 2   | `HarnessCtx` + `fork()` in `packages/core/src/codec/v2/ctx.ts` — child runs derive a fresh `runId` and set `parentRunId` to the current run. _(Brief H Practice 7)_                                                                                                                                                                            | ✅ M0 (landed)  |
| 3   | `CodecWarning` + `CodecPhase` constants in `packages/core/src/codec/v2/warning.ts` — per RFC-0001 §Addendum 2026-04-26 F2. _(F2; Practice 8)_                                                                                                                                                                                                  | ✅ M0 (landed)  |
| 4   | `Codec.schema: StandardSchemaV1<unknown, Req>` in `packages/core/src/codec/v2/codec.ts` — F1 amendment landed via inline minimal `StandardSchemaV1` interface. Zod stays the canonical implementation; codecs hand the harness `mySchema['~standard']`.                                                                                        | ✅ M0 (landed)  |
| 5   | `ImageCodec extends BaseCodec<ImageRequest, ImageArtifact>` in `packages/codec-image/src/codec.ts` — the actual raster port. Absorbs the LLM call (§0 finding 3): the existing `WittgensteinCodec.render` becomes the `decode + package` portion; new code in the codec replaces the harness's LLM call + `parse`.                             | M1A (your work) |
| 6   | Define `ImageArtifact extends BaseArtifact` with the bytes / outPath / mime / dimensions the existing `RenderResult` already exposes, plus the mandatory `metadata.warnings: CodecWarning[]` channel.                                                                                                                                          | M1A (your work) |
| 7   | A single `Route<ImageRequest>` registered on the codec (`{ id: "raster", match: () => true }`). The `Route<Req>[]` shape exists for codecs that need internal dispatch (audio); image does not, but the seam is still concrete.                                                                                                                | M1A (your work) |
| 8   | `manifestRows()` returns the codec-authored rows the v0.1 harness used to override post-hoc — `quality.structural`, `quality.partial`, `metadata.warnings`, `L4.adapterHash`, `L5.decoderHash`, `artifact.sha256`. The harness folds these into the existing one-object `RunManifest` (§0 finding 2). Do **not** reshape `RunManifest` itself. | M1A (your work) |
| 9   | Image-branch deletion in `packages/core/src/runtime/harness.ts` lines 123–172 — image dispatch goes through the generic `Codec.produce(req, ctx)` path. The post-hoc manifest-override block (lines 139–172) for image is removed in the same commit.                                                                                          | M1A (your work) |
| 10  | Streaming + parallel-compile stub seams: `ImageCodec.decode` accepts an optional `onChunk` callback shape in its signature (no-op at M1A). The seam lives in `packages/codec-image/src/pipeline/decoder.ts`. _(M1 idea 1, hook only — bridge lands at M1B)_                                                                                    | M1A (your work) |
| 11  | ADR-0005 addendum — Brief A's "VQ decoder" → "LFQ-family discrete-token decoder" rename lands as a short addendum; the manifest decoder-slot string changes from `"VQ-decoder"` to `"LFQ-family-decoder"`.                                                                                                                                     | M1A (your work) |
| 12  | Migration tests under `packages/codec-image/test/` — see §9.                                                                                                                                                                                                                                                                                   | M1A (your work) |

Note on idea 5a (`palette` on `ImageSceneSpec`): the schema **already** has `style.palette: string[]` nested inside `ImageSceneSpec`. M1A does not add a new top-level field unless `ImageCodec.adapt` finds it needs one — flag any change in the PR body if so.

## 5. The eight Brief H practices, where they land

These are the operational practices for M1A. Each row is one practice from Brief H §"Practices to adopt"; the "where" column is the file you edit.

| #   | Practice                                           | Where it lands                                                                                                                                                                                                                                                                                                              | How a reviewer greps for it                                                                    |
| --- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Input schema validation at the boundary            | `Codec.schema['~standard'].validate(req)` runs in the harness (or in `ImageCodec.produce` head) before any LLM call. There is no protocol-level output schema in v2 — LLM JSON parsing is internal to `expand()`.                                                                                                           | grep `schema['~standard'].validate` in `harness.ts` or `codec-image/src/codec.ts`              |
| 2   | Typed `warnings: CodecWarning[]` on Art            | `CodecWarning` in `codec/v2/warning.ts`; `BaseArtifactMetadata.warnings: CodecWarning[]` on every Art (already in M0)                                                                                                                                                                                                       | grep `CodecWarning` in `packages/codec-image/src/types.ts` (or wherever `ImageArtifact` lands) |
| 3   | `messageId` dictionary per codec                   | `ImageCodec.warnings = { palette_overflow: "image/palette-overflow", ... }` declared upfront as a `const` map; the codec emits via `ctx.sidecar.warnings.push({ code: this.warnings.palette_overflow, ... })`.                                                                                                              | grep `warnings = {` in `image/src/codec.ts`                                                    |
| 4   | Sidecar-driven phase factory                       | `BaseCodec.produce` already runs `expand → adapt → decode → package` in order via the four protected hooks; subclasses override the hooks rather than re-implementing the lifecycle. The "phases-as-functions" intent of Brief H Practice 4 is satisfied by the hook contract — no separate `prepare(ctx)` factory shipped. | grep `protected abstract expand` etc. in `base.ts`                                             |
| 5   | Standard Schema typing                             | `Codec.schema: StandardSchemaV1<unknown, Req>` (F1 amendment, M0)                                                                                                                                                                                                                                                           | grep `StandardSchemaV1` in `codec/v2/codec.ts`                                                 |
| 6   | VFile-style sidecar threaded through phases        | `RunSidecar` in `codec/v2/sidecar.ts`; on `ctx.sidecar`; drained in `BaseCodec.package` (M0)                                                                                                                                                                                                                                | grep `ctx.sidecar` in `base.ts`                                                                |
| 7   | Forkable `HarnessCtx` with `parentRunId`/`runId`   | `ctx.fork(childRunId)` on `HarnessCtx` (M0)                                                                                                                                                                                                                                                                                 | grep `fork:` in `codec/v2/ctx.ts`                                                              |
| 8   | Named lifecycle phases as protocol-level constants | `CodecPhase = { Expand, Adapt, Decode, Package } as const` in `codec/v2/warning.ts` (M0)                                                                                                                                                                                                                                    | grep `CodecPhase` in `codec/v2/warning.ts`                                                     |

A reviewer who cannot find every row in its declared place fails the PR.

## 6. The four reject practices (anti-pattern guard)

A comment block at the head of `BaseCodec` explicitly names what we refused. Future readers don't re-derive these:

```ts
// REJECTED PRACTICES (Brief H §"Practices to NOT adopt"):
//
// 1. Throw-based control flow for expected failures (LangChain Runnable).
//    Failures must be manifest rows, not exceptions. Use Result<Art, CodecError>.
//
// 2. Visitor-style mutation without explicit phase boundaries (PostCSS).
//    Our IR is a four-stage linear lowering, not a tree we walk repeatedly.
//
// 3. `isError: true` in-band response (MCP).
//    Success and failure are different result variants, not a boolean on a
//    shared shape. Manifest is the source of truth.
//
// 4. ctx-mutation middleware chains for accumulating output (tRPC).
//    `ctx` is harness-scoped (seed, budget, manifest writer); Art data
//    flows through return values, never ctx. We adopted the immutable-
//    forking idea (practice 7), refused the accumulation idea.
```

If you find yourself reaching for any of these in M1A, stop and re-read Brief H.

## 7. Goldens and parity

Pin the v0.1 baseline at PR-open:

- `artifacts/showcase/workflow-examples/image/` — raster baseline tiles (the M1A scope).
- `artifacts/showcase/workflow-examples/samples/svg/` and `samples/asciipng/` belong to the sibling `codec-svg` and `codec-asciipng` ports and are **not** in M1A scope.

**Parity policy.** The decoder is deterministic at the L3/L5 seam; the LLM stage is not. Therefore:

- **byte-for-byte SHA-256** on artifacts where the LLM stage is bypassed (raster baseline tiles with cached LLM I/O replay).
- **structural parity** on artifacts where the LLM stage runs live: schema validity, palette membership, manifest-row presence, dimension constraints. Brief E thresholds apply (CLIPScore regression >10% triggers revert).

If a SHA changes on a cached-LLM run, you have a real bug. Bisect, do not regenerate.

## 8. Manifest invariants for image

The codec's `package` stage must write:

- `route` — `"raster"` (the only route at v0.2; the field still ships so audio / sibling ports share the schema).
- `seed`, `model`, `prompt`, full LLM I/O for round 1 and (if `--expand`) round 2.
- `L4.adapterHash` — even if M1B has not trained a real adapter yet, a stable placeholder hash with `quality.partial: { reason: "adapter-stub" }` is required.
- `L5.decoderHash` with `frozen: true` and the new `LFQ-family-decoder` slot name (per ADR-0005 addendum).
- `artifact.sha256` for each emitted file.
- `metadata.warnings: CodecWarning[]` — empty array is valid; missing array is a bug. _(F2)_
- `quality.structural` — palette membership, route id, schema-validation pass.
- `quality.partial: { reason }` — set whenever a stub seam is exercised (adapter-stub, decoder-stub, streaming-stub).

The harness must NOT touch any of these post-hoc. If you see manifest-row mutation in `harness.ts` after this port, the PR has a bug.

## 9. Migration tests

Under `packages/codec-image/test/`:

- `parity-byte.test.ts` — SHA-256 against raster goldens for cached-LLM baseline tiles.
- `parity-structural.test.ts` — Brief E structural metrics on live-LLM tiles.
- `round-trip.test.ts` — build a fake `ImageRequest`, run `codec.produce(req, ctx)`, assert artifact + manifest rows match. ≤20 lines.
- `expand-flag.test.ts` — with `{ rounds: 2 }`, the second round runs and the manifest records both LLM calls.
- `output-validation.test.ts` — assert `BaseCodec.produce` runs the output schema validation. Practice 1 invariant.
- `warnings-channel.test.ts` — synthesize a palette-overflow case; assert `metadata.warnings` carries the declared `palette_overflow` messageId. Practice 2 + 3 invariant.
- `harness-modality-blind.test.ts` (in `packages/core/test/`) — greps `harness.ts` source for `request.modality === "image"` and fails if found.

## 10. Two hats checklist for this line

### Researcher hat

- Brief A's LFQ rename landed in ADR-0005 addendum (not just in code).
- Brief H's eight practices are individually greppable in their declared homes.
- F1 + F2 amendments to RFC-0001 are referenced in PR body.
- No new doctrine claim was introduced — this is a port + practice-landing, not a new RFC.

### Hacker hat

- The raster baseline tiles pass byte-for-byte goldens on cached-LLM replay.
- `harness.ts` no longer branches on `request.modality === "image"` (and the post-hoc manifest-override block for image is gone).
- `ImageCodec.manifestRows()` returns every row the harness used to override; the harness folds them in without modification.
- Round-trip test fits in ≤20 lines.
- The four reject-practice comment block exists at the head of `BaseCodec`.
- ADR-0005 addendum is merged in the same PR as the manifest slot rename.

## 11. Exit condition

M1A is done when:

- `pnpm lint && pnpm typecheck && pnpm test` is green;
- All goldens preserved (byte for cached-LLM, structural for live-LLM);
- The `harness-modality-blind.test.ts` greppable invariant holds;
- The PR body cites Brief H + RFC-0001 §Addendum 2026-04-26 and lists which practice landed where (table-form, mirroring §5 above);
- A follow-up issue exists for M1B (L4 adapter training plan), referenced in the PR.

When M1A is done you stop. M1B is its own line.

## 12. Prompt block for an implementation agent

> You are porting `codec-image` to the Codec v2 protocol. You have read
> `docs/agent-guides/image-port.md`, `docs/research/briefs/H_codec_engineering_prior_art.md`,
> `docs/rfcs/0001-codec-protocol-v2.md` (including the 2026-04-26 addendum), and
> `docs/exec-plans/active/codec-v2-port.md` §M1.
>
> You will land the eight Brief H adopt-practices in their declared homes per
> §5 of the agent guide, plus the F1 (Standard Schema) and F2 (warnings) RFC
> amendments. You will preserve goldens per §7. You will not train the L4
> adapter (that is M1B). You will add the four reject-practice comment block
> at the head of `BaseCodec`. You will commit the ADR-0005 addendum
> (LFQ rename) in the same PR as the manifest slot rename.
>
> When you finish, you report what / why / how validated / risks under 150 words,
> per `docs/engineering-discipline.md` §Reporting.
