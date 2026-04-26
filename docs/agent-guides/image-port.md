# Image Port Guide (M1A)

This guide is for a contributor or coding agent picking up the **image codec port**, the first port that meets the v2 protocol. It is the M1A line of `docs/exec-plans/active/codec-v2-port.md`.

It is deliberately narrow:

- **in scope:** porting `codec-image` to the v2 protocol shape; landing the eight engineering practices from Brief H; preserving v0.1 goldens for all three internal routes (svg, ascii-png, raster).
- **out of scope:** L4 adapter training (that is M1B and has its own forthcoming guide); audio / sensor / video; the streaming/parallel-compile decoder bridge beyond stub seams; doctrine relitigation.

Read `docs/agent-guides/image-to-audio-port.md` first for the cross-line context. This guide is the M1A specialization.

---

## 1. Mission

Port `codec-image` from the v0.1 surface to the Codec v2 protocol shape ratified by ADR-0008 and amended by RFC-0001 §Addendum 2026-04-26, while:

- preserving every shipping artifact's goldens for all three internal routes (svg, ascii-png, raster);
- proving the protocol holds on the **hardest** modality (only one with both a real L4 adapter slot and a non-trivial L5 packaging step);
- moving manifest authorship into the codec's `package` stage;
- landing the eight Brief H practices in their canonical home (`BaseCodec`, `Codec` interface, `HarnessCtx`) so M2 (audio) and M3 (sensor) inherit them rather than re-deriving them;
- adding a `palette` field to `ImageSceneSpec` (M1 idea 5a);
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

If M0 has already landed (types in `packages/core/src/codec/v2/`), read its merged diff — your changes extend it.

## 3. Why image first

Image has both a real L4 adapter and a non-trivial L5 packaging step. Audio has L4 collapsed into per-route inline calls; sensor has no L4 at all. If the protocol fits image, it fits everything. If it does not fit image, the protocol is wrong, and that finding belongs in M1A — not M2.

Concretely:

- if `ImageCodec.adapt` cannot be expressed in ≤20 lines of dispatch + a delegate to the existing `pipeline/adapter.ts`, the seam is wrong;
- if `ImageCodec.package` cannot author all manifest rows the v0.1 harness was overriding post-hoc, the manifest design is wrong;
- if any of the three internal routes (svg / ascii-png / raster) needs a special case in `harness.ts` after the port, the dispatch design is wrong.

## 4. M1A deliverables

In order:

1. **`BaseCodec<Req, Art>`** in `packages/core/src/codec/v2/base.ts` — abstract base implementing `produce` as the four-stage pipeline. Lands the eight Brief H practices (see §6 below).
2. **`HarnessCtx` fork helper** in `packages/core/src/codec/v2/ctx.ts` — `ctx.fork(phaseName: string): HarnessCtx` returns a child with fresh `runId` and `parentRunId` set. _(Brief H Practice 7)_
3. **`CodecWarning` type + lifecycle constants** in `packages/core/src/codec/v2/codec.ts` — per RFC-0001 §Addendum 2026-04-26 F2; constants `EXPAND`, `ADAPT`, `DECODE`, `PACKAGE`. _(F2; Practice 8)_
4. **`Codec.schema` typed as `StandardSchemaV1<unknown, Req>`** — the F1 amendment lands here; zod stays the canonical implementation.
5. **`ImageCodec extends BaseCodec<ImageRequest, ImageArtifact>`** in `packages/codec-image/src/codec.ts` — the actual port. Internal routes (svg / ascii-png / raster) move to `ImageCodec.route(req)`.
6. **`palette` field on `ImageSceneSpec`** in `packages/schemas/src/image.ts` — optional `string[]` of hex colors; codec's `expand` populates it; downstream consumers may use it for quantization. _(M1 idea 5a)_
7. **Streaming + parallel-compile stub seams** — `ImageCodec.decode` accepts an optional `onChunk` callback shape in its signature (callback is unused at M1A; lands as a no-op). The stub seam lives in `packages/codec-image/src/pipeline/decoder.ts` next to the existing decoder call. _(M1 idea 1, hook only — bridge lands at M1B)_
8. **Manifest authorship** moves into `ImageCodec.package` — the `quality.structural`, `quality.partial`, `metadata.warnings`, L4-hash and L5-hash rows are written here, not by the harness.
9. **Image branch deletion** in `packages/core/src/runtime/harness.ts` — image flows through generic dispatch.
10. **ADR-0005 addendum** — Brief A's "VQ decoder" → "LFQ-family discrete-token decoder" rename lands as a short addendum; the manifest decoder-slot string changes from `"VQ-decoder"` to `"LFQ-family-decoder"`.
11. **Migration tests** under `packages/codec-image/test/` — see §8.

## 5. The eight Brief H practices, where they land

These are the operational practices for M1A. Each row is one practice from Brief H §"Practices to adopt"; the "where" column is the file you edit.

| #   | Practice                                                     | Where it lands                                                                             | How a reviewer greps for it                                |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | Output schema validation inside `produce`                    | `BaseCodec.produce` — runs `Codec.outputSchema['~standard'].validate(art)` before return   | grep `outputSchema` in `base.ts`                           |
| 2   | Typed `warnings: CodecWarning[]` on Art                      | `CodecWarning` in `codec/v2/codec.ts`; `metadata.warnings: CodecWarning[]` on every Art    | grep `CodecWarning` in `packages/codec-image/src/types.ts` |
| 3   | `messageId` dictionary per codec                             | `ImageCodec.warnings = { palette_overflow: "...", svg_truncated: "..." }` declared upfront | grep `warnings:` in `image/src/codec.ts`                   |
| 4   | `prepare(ctx) => { expand, adapt, decode, package }` factory | `BaseCodec.prepare(ctx)` returns the four phase functions; default impl exists             | grep `prepare(ctx)` in `base.ts`                           |
| 5   | Standard Schema typing                                       | `Codec.schema: StandardSchemaV1<unknown, Req>` (F1 amendment)                              | grep `StandardSchemaV1` in `codec/v2/codec.ts`             |
| 6   | VFile-style sidecar threaded through phases                  | `RunSidecar` in `codec/v2/sidecar.ts`; threaded as ctx field; drained in `package`         | grep `RunSidecar` in `base.ts`                             |
| 7   | Forkable `HarnessCtx` with `parentRunId`/`runId`             | `ctx.fork(phase)` helper in `codec/v2/ctx.ts`                                              | grep `ctx.fork` in `base.ts`                               |
| 8   | Named lifecycle phases as protocol-level constants           | `export const EXPAND = "expand" as const` etc. in `codec/v2/codec.ts`                      | grep `as const` in phase constants file                    |

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

- `artifacts/showcase/workflow-examples/image/` — 6 baseline tiles, all three internal routes represented.
- `artifacts/showcase/workflow-examples/samples/svg/` and `samples/asciipng/` — also pinned.

**Parity policy.** The decoder is deterministic at the L3/L5 seam; the LLM stage is not. Therefore:

- **byte-for-byte SHA-256** on artifacts where the LLM stage is bypassed (raster baseline tiles with cached LLM I/O replay).
- **structural parity** on artifacts where the LLM stage runs live: schema validity, palette membership, manifest-row presence, dimension constraints. Brief E thresholds apply (CLIPScore regression >10% triggers revert).

If a SHA changes on a cached-LLM run, you have a real bug. Bisect, do not regenerate.

## 8. Manifest invariants for image

The codec's `package` stage must write:

- `route` — one of `svg / ascii-png / raster` (the codec-internal route id).
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

- `parity-byte.test.ts` — SHA-256 against goldens for cached-LLM baseline tiles, all three routes.
- `parity-structural.test.ts` — Brief E structural metrics on live-LLM tiles.
- `round-trip.test.ts` — for each of {svg, ascii-png, raster}, build a fake `ImageRequest`, run `codec.produce(req, ctx)`, assert artifact + manifest match. Each route case ≤20 lines.
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

- All three internal routes pass byte-for-byte goldens on cached-LLM replay.
- `harness.ts` no longer branches on `request.modality === "image"`.
- `ImageCodec.package` writes every manifest row; harness writes none.
- Round-trip test for each route fits in ≤20 lines.
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
