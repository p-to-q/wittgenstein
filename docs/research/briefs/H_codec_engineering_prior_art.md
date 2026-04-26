# Brief H — Codec Protocol Engineering Prior Art

**Date:** 2026-04-26
**Status:** 🟡 Draft v0.1
**Author:** engineering (max.zhuang.yan@gmail.com)
**Question:** Which production-validated TypeScript projects have a shape analogous to `Codec<Req, Art>.produce(req, ctx) → Art + manifest rows`, and what concrete engineering practices should we transfer into M1A of the codec-v2 port before the first port lands?
**Feeds into:** `docs/agent-guides/image-port.md`, RFC-0001 addendum (2026-04-26), `docs/exec-plans/active/codec-v2-port.md` §M1.

> This brief is **prior-art research**, not a doctrine pressure-test. The four
> stations below are present because the briefs/ folder contract requires them,
> but the substance is "what to copy from libraries that already work" rather
> than "is the thesis correct." Verdict is short; Adopt/Reject lists in §Steelman
> are the operational deliverable.

---

## Context

RFC-0001 ratified `Codec<Req, Art>` as Wittgenstein's one codec primitive. M1A
of the codec-v2 port is the **first** time this protocol meets a real codec
port (`codec-image`). The protocol shape is internally consistent (the round-trip
test in RFC-0001 §Round-trip fits all 7 modalities under 20 lines) but has not
been pressure-tested against industrial protocols of similar shape.

Before the first port writes its first line of code, we did one focused research
sweep on production-validated TypeScript projects with the analogous shape:
**typed input → multi-stage pipeline → typed output + side-effect metadata**.
This brief captures the findings.

The candidate set was deliberately wide — small-surface validated libraries
across plugin systems, RPC frameworks, observability SDKs, and AI provider
adapters. The output is two operational lists (adopt / reject) plus two
findings on RFC-0001 surface itself.

---

## Steelman

The eight candidates below were investigated by direct source / docs reading.
Each paragraph covers shape, schema-at-boundary, side-effect channel, error
semantics, lifecycle, and one concrete transferable practice for M1A.

### 1. unified / remark / rehype

**Shape:** `unified(): Processor`, with `processor.use(plugin, opts)` chaining
and a fixed parse → run → stringify lifecycle.
**Schema-at-boundary:** structural — plugins assert tree node types via
`unist`/`hast` interfaces, not runtime validation.
**Side-effect channel:** `VFile`. Every plugin receives `(tree, file)` and
attaches `file.messages` (each `VFileMessage` carries `reason`, `source`,
`ruleId`, `place`); messages survive the run and are read by the host after
`processor.run` resolves.
**Error semantics:** thrown (fatal) or pushed onto `file.messages` with
`fatal: true|false|null` — partial-success is first-class.
**Lifecycle hooks:** parse → transformers → compile, exactly the three phases
above.
**M1A transferable practice:** carry a `VFile`-style sidecar through `produce`
so `expand → adapt → decode → package` can each append non-fatal warnings
(palette quantization loss, oversize asset) without aborting, with the
manifest writer draining the sidecar exactly once at packaging — preserves
"no silent fallback" while admitting "noisy success."
**Source:** [unifiedjs/unified](https://github.com/unifiedjs/unified)

### 2. tRPC procedures

**Shape:** `t.procedure.input(zodSchema).output(zodSchema).use(mw).query(({ ctx, input }) => ...)`.
Immutable builder — every chain step returns a new procedure type, and the
resolver receives a fully-narrowed `ctx`.
**Schema-at-boundary:** bidirectional. Input is parsed with `safeParse`
before the resolver runs; output is **also** parsed against `.output()`
before serialization.
**Side-effect channel:** `ctx` mutations propagated by middleware via
`next({ ctx: { ...newFields } })` — typed accumulation, no global state.
**Error semantics:** single class `TRPCError({ code, message, cause })` with a
closed enum of codes; framework converts to typed wire error. No partial
success — strictly success-or-`TRPCError`.
**Lifecycle hooks:** middleware chain → resolver; pre/post hooks via middleware.
**M1A transferable practice:** validate `Art` against an output zod schema
**inside** `produce` before returning (tRPC's `.output()` discipline). Catches
codec authors who forget to populate `metadata.sha256` better than any test,
and is cheap because it only runs once per request.
**Source:** [trpc.io/docs/server/procedures](https://trpc.io/docs/server/procedures)

### 3. LangChain.js Runnable

**Shape:** `abstract class Runnable<RunInput, RunOutput, CallOptions extends RunnableConfig>`
with `invoke(input, options?)`, plus `batch`, `stream`, `withConfig`,
`withRetry`, `withFallbacks`. `RunnableConfig` carries `callbacks`, `tags`,
`metadata`, `runName`, `configurable`, `recursionLimit`. Tags/metadata
propagate down through every nested `invoke` automatically.
**Schema-at-boundary:** none enforced; relies on TypeScript types.
**Side-effect channel:** `CallbackManager` / `RunTree` events
(`handleLLMStart`, `handleChainEnd`, etc.) emitted at known points; LangSmith
subscribes to build the trace tree.
**Error semantics:** plain throws; `withFallbacks` and `withRetry` wrap them.
No structured error type.
**Lifecycle hooks:** implicit (`onStart`, `onEnd`, `onError`).
**M1A transferable practice:** make `HarnessCtx` immutably forkable — every
sub-step (expand/adapt/decode/package) gets a child ctx with a fresh
`runId`/`parentRunId` pair, matching how `RunTree` builds nested spans.
Manifests trivially join on `parentRunId`; sets us up for codec composition.
**Source:** [Runnable API](https://api.js.langchain.com/classes/_langchain_core.runnables.Runnable.html)

### 4. @modelcontextprotocol/sdk (TypeScript)

**Shape:** `server.registerTool(name, { description, inputSchema, outputSchema }, async (input) => ({ content: [...], isError? }))`.
**Schema-at-boundary:** SDK adopted **Standard Schema** so any
zod/valibot/arktype works; SDK runs `~standard.validate` before calling the
handler.
**Side-effect channel:** content-block arrays
(`{ type: 'text' | 'image' | 'resource', ... }`) returned from the handler.
**Error semantics:** thrown exceptions (transport-level) or successful response
with `isError: true` (handler-level expected failure).
**Lifecycle hooks:** minimal — `server.connect(transport)`, `onclose`, `onerror`.
**M1A transferable practice:** adopt **Standard Schema** for `Codec.input`
rather than hard-coding `z.ZodType`. Costs almost nothing today, lets us swap
to valibot/arktype later, and is the only "future-proofing" decision that's
actually free. Concretely: type `Codec<Req, Art>` to take
`StandardSchemaV1<unknown, Req>` rather than `ZodType<Req>`.
**Source:** [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)

### 5. Vercel AI SDK provider spec (`@ai-sdk/provider`)

**Shape:** providers implement
`doGenerate(options) => Promise<{ content, finishReason, usage, warnings, providerMetadata, request, response }>`.
**Schema-at-boundary:** at the AI SDK layer, not the provider layer; providers
receive already-normalized prompts.
**Side-effect channel:** crucial design choice — `warnings: LanguageModelV1CallWarning[]`
field on every provider call. Every degradation ("setting X not supported,
ignored") is a structured entry on the result. `usage` (`promptTokens`,
`completionTokens`) is mandatory; `providerMetadata` is a free-form bag the
provider owns.
**Error semantics:** typed classes — `APICallError`, `InvalidPromptError`,
`NoContentGeneratedError`.
**Lifecycle hooks:** `doGenerate` is a single method; streaming via
`doStream`.
**M1A transferable practice:** mandate a `warnings: CodecWarning[]` field on
`Art` (or on the manifest row) at the type level, alongside `metadata.usage`.
Forces codec authors to declare losses (color depth, sample rate, lossy
compression) instead of swallowing them. Perfect fit for "decoder ≠ generator"
doctrine since every degradation is a deterministic property of the codec.
**Source:** [ai-sdk.dev providers](https://ai-sdk.dev/docs/foundations/providers-and-models)

### 6. unplugin

**Shape:** `UnpluginFactory<Options> = (options, meta) => UnpluginOptions | UnpluginOptions[]`,
exposed as `UnpluginInstance` with `.rollup() / .vite() / .webpack() / .esbuild()`
adapters.
**Schema-at-boundary:** none — the layer is unityped.
**Side-effect channel:** `this` context: `UnpluginBuildContext`
(`addWatchFile`, `emitFile`, `parse`) merged with `UnpluginContext` (`error`,
`warn`). `meta` carries `framework` and `version`.
**Error semantics:** `this.error(msg)` (fatal) or `this.warn(msg)` (non-fatal).
**Lifecycle hooks:** normalized across bundlers — `buildStart`, `resolveId`,
`load`, `transform`, `buildEnd`, `writeBundle`, `watchChange`. `enforce: 'pre' | 'post'`
controls ordering.
**M1A transferable practice:** the `(options, meta) => hooks` factory shape
is exactly the right registration shape for codecs in a registry — separates
**codec definition** (pure) from **codec instance** (bound to ctx), which keeps
`produce` testable without standing up a full harness.
**Source:** [unjs/unplugin/src/types.ts](https://github.com/unjs/unplugin/blob/main/src/types.ts)

### 7. PostCSS plugins

**Shape:** `{ postcssPlugin: string, prepare(result) { return { Once, OnceExit, Declaration, Rule, AtRule } } }`.
**Schema-at-boundary:** structural (CSS AST node types).
**Side-effect channel:** warnings via `node.warn(result, msg, { word, index })`
or `result.warn()`; read off `result.warnings()` post-run.
**Error semantics:** returned objects, not thrown — `CssSyntaxError` exposes
`.line`, `.column`, `.source`.
**Lifecycle hooks:** `prepare(result)` factory pattern allocates per-run state
at start and closes over `result`; visitor methods (`Once`, `Rule`, etc.) are
called by the core walker in tree order.
**M1A transferable practice:** the `prepare(ctx) => handlers` per-run closure
pattern. For our codec:
`defineCodec<Req, Art>({ schema, prepare(ctx) { return { expand, adapt, decode, package } } })`.
Makes the four phases first-class, gives each a typed handle to `ctx` and a
per-run scratch object, matches PostCSS's proven separation of registration
from execution.
**Source:** [postcss.org/api](https://postcss.org/api/)

### 8. ESLint Rule API

**Shape:** `module.exports = { meta: { type, docs, messages, schema, fixable }, create(context) { return { CallExpression(node) { context.report({ node, messageId, data, fix }) } } } }`.
**Schema-at-boundary:** `meta.schema` is JSON Schema validating **rule options**
(not the AST — that's structural).
**Side-effect channel:** `context.report(descriptor)` — node, messageId,
interpolation `data`, optional `fix(fixer)`.
**Error semantics:** no exception path for rule failures; everything is a
structured report. Multiple reports per run = first-class partial diagnosis.
**Lifecycle hooks:** visitor methods on AST node types; `meta.messages`
dictionary forces all diagnostics to be declared upfront.
**M1A transferable practice:** the `messages` dictionary pattern. Codecs should
declare `errors: { palette_overflow: '...', dimension_mismatch: '...' }` in
their definition and emit by id. Manifest stays grep-stable; test fixtures
stable across copy edits.
**Source:** [eslint custom rules](https://eslint.org/docs/latest/extend/custom-rules)

---

## Practices to adopt at M1A (≤8)

In implementation order — earlier items unblock later ones:

1. **Output schema validation inside `produce`** — run `Art` through a zod /
   Standard Schema check before return, mirroring tRPC's `.output()`. Catches
   manifest-field omissions structurally. _(tRPC)_
2. **Typed `warnings: CodecWarning[]` channel on every `Art`** — mandatory
   field, structured `{ code: string, message: string, detail?: unknown }`.
   Surfaces lossy-but-successful runs without ambiguity. _(Vercel AI SDK)_
3. **`messageId` dictionary per codec** — `errors`/`warnings` declared upfront
   in the codec definition; emit by id, not by string. Manifest grep-stable.
   _(ESLint)_
4. **`prepare(ctx) => { expand, adapt, decode, package }` factory** — separate
   registration (pure, testable) from execution (bound to ctx). The four
   phases become first-class object keys, not internal function calls.
   _(PostCSS, unplugin)_
5. **Standard Schema, not `ZodType`, in `Codec<Req, Art>` types** — type the
   codec against `StandardSchemaV1`. Free interop, no runtime cost. _(MCP SDK)_
6. **VFile-style sidecar threaded through phases** — one mutable `RunSidecar`
   (warnings, intermediate hashes, debug breadcrumbs) accumulates across
   `expand → adapt → decode → package`, drained exactly once by `package` into
   the manifest row. Avoids passing a dozen return tuples. _(unified)_
7. **Forkable `HarnessCtx` with `parentRunId` / `runId`** — every phase gets a
   child ctx; manifest rows join on parent for free, sets us up for codec
   composition without a re-design. _(LangChain Runnable)_
8. **Named lifecycle phases as protocol-level constants** —
   `expand` / `adapt` / `decode` / `package` are **the** hook names, not
   internal. Test harnesses, golden fixtures, and budget accounting all key
   off these names. _(Rollup/unplugin: `buildStart`/`transform` as a stable
   vocabulary)_

---

## Practices to NOT adopt (≤4)

1. **Throw-based control flow for expected failures** _(LangChain Runnable
   style)._ Runnable leans on plain `throw` + `withFallbacks`. We have a
   manifest spine; failures must be **rows**, not exceptions. Keep structured
   `Result<Art, CodecError>` or equivalent — refuse the throw-and-wrap pattern.
2. **Visitor-style mutation without explicit phase boundaries** _(PostCSS
   `Once`/`Rule`/`Declaration` callbacks fired by a walker)._ Tempting, but
   our IR isn't a tree we walk repeatedly — it's a four-stage linear lowering.
   A walker would obscure that.
3. **`isError: true` in-band response** _(MCP)._ MCP returns "successful"
   responses carrying an error flag because its transport conflates protocol
   and application errors. Our manifest is the source of truth; success and
   failure must be distinguishable at the type level (different result
   variants), not via a boolean on a shared shape.
4. **`ctx`-mutation middleware chains for accumulating output** _(tRPC
   `next({ ctx })` style accumulation)._ Elegant for HTTP context narrowing
   but encourages stuffing **artifact data** into ctx. Our `ctx` is
   harness-scoped (seed, budget, manifest writer); `Art` data must flow
   through return values, never ctx. **Adopt the immutable-forking idea
   (practice 7), reject the accumulation idea.**

---

## Findings touching RFC-0001 protocol surface

Two non-blocking suggestions worth deciding on **before M1A code lands** rather
than after. Both land as a short addendum to RFC-0001.

### Finding F1 — Type the codec input as `StandardSchemaV1`, not `ZodType`

RFC-0001 §Interface is silent on which schema library is part of the contract.
The implicit assumption (zod) is fine in practice but is leak from
implementation into protocol. Standard Schema (the spec
[modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk)
adopted, [standardschema.dev](https://standardschema.dev)) is a 30-line
TypeScript interface that zod/valibot/arktype all implement. Cost is one type
import; benefit is the protocol no longer pins a vendor.

**Recommendation:** RFC-0001 addendum types `Codec.input` as
`StandardSchemaV1<unknown, Req>`. Zod stays the canonical implementation. If
declined, do it as an explicit "we are zod-only" decision so the question
doesn't re-open.

### Finding F2 — Promote `warnings: CodecWarning[]` to a typed field on `Art` (or its `metadata`)

RFC-0001 currently has no place for "successful but degraded" results.
Practice 2 above (Vercel AI SDK precedent) wants this surfaced at the type
level so it cannot be silently dropped. Two placements:

- **(a)** `Art.warnings: CodecWarning[]` — peer of `bytes` and `metadata`.
- **(b)** `Art.metadata.warnings: CodecWarning[]` — nested under metadata.

**Recommendation:** placement (b). Keeps `Art` shape minimal, pins warnings
under metadata where every codec already writes structural data, and lets the
manifest pick up warnings as a metadata sub-field without a separate row type.

Neither finding is a "your protocol is wrong" claim. Both are typing /
placement nits with concrete ergonomic value. Both are one-line changes in the
RFC interface.

---

## Red team

**"Eight practices is a lot to land in M1A. The protocol is supposed to be
boring."** — Practices 1, 4, 5, 6 are protocol-shape concerns: they need to
land in `BaseCodec` and `HarnessCtx` definitions before the first port
codecs against them, otherwise M2 (audio) and M3 (sensor) re-do the work.
Practices 2, 3, 7, 8 are implementation conventions that can land
incrementally — practice 2 (warnings) is mandatory because it's a type-level
contract; 3 (messageId) and 8 (lifecycle naming) ride along on the BaseCodec
shape; 7 (forkable ctx) can defer to M2 if needed but is cheap to land in M1A.

**"Standard Schema is overkill — we will be zod-only forever."** — The
addendum is one type import. The cost of "lock to zod" is invisible until we
need to swap (e.g., a polyglot Python/TS schema like `arktype` becomes
relevant for the polyglot-mini surface) and at that point the swap is a
protocol migration. Reserving `StandardSchemaV1` is ADR-0011-style cheap
optionality — same shape of decision as the IR `Latent` slot in RFC-0001.

**"`warnings` on Art will get spammed; codecs will dump every internal
hiccup."** — Practice 3 (messageId dictionary) caps it: codecs declare their
warning ids upfront. If the dictionary grows past ~8 entries per codec, the
codec is too coarse-grained or is leaking implementation detail. M5b
benchmark gates can include "warning-id count per codec" as a structural
linter check.

---

## Kill criteria

Practice-level retraction triggers. If any fires, the corresponding practice
goes back to the bench:

1. **Practice 1 (output schema validation) doubles per-request latency in
   benchmark.** Standard Schema validation is ~µs-scale; if profiling shows
   it on the hot path of a codec at >1% of total `produce` time, switch to
   dev-only validation gated by `NODE_ENV`.
2. **Practice 6 (sidecar) collects warnings nobody reads.** If after M3 (all
   ports landed) the manifest-warning fields are uniformly empty across the
   eval set, the channel was speculative. Fold warnings back into the
   manifest row directly and delete the sidecar.
3. **Practice 7 (forkable ctx) requires a parent-run cleanup pass.** If
   `parentRunId` rows in manifests leak across runs (orphaned children), the
   immutable-forking story has a bug — either fix the lifecycle or revert to
   single-ctx-per-`produce`.
4. **Findings F1 / F2 do not survive RFC-0001 review.** If either is rejected
   in addendum review, this brief's recommendation is overruled and the
   adopted practices that depend on the rejected finding (Practice 2 for F2;
   Practice 5 for F1) are pulled.

---

## Verdict

**Land all 8 adopt practices and both protocol-surface findings (F1, F2) at
M1A.** The deliverables split:

- Practices 1, 4, 5, 6 → `packages/schemas/src/codec/v2/base.ts` (BaseCodec) and
  `packages/schemas/src/codec/v2/codec.ts` (Codec interface).
- Practice 2 → `packages/schemas/src/codec/v2/codec.ts` (CodecWarning type) +
  ImageArtifact metadata in `packages/codec-image/src/types.ts`.
- Practice 3 → per-codec `errors`/`warnings` dictionary in codec definitions.
- Practice 7 → `packages/schemas/src/codec/v2/ctx.ts` (HarnessCtx fork helper).
- Practice 8 → constants exported from `packages/schemas/src/codec/v2/index.ts`.
- Findings F1, F2 → RFC-0001 addendum (separate doc, lands first).

The four reject practices land as a "we considered and refused" comment block
at the head of `BaseCodec`, so future readers don't re-derive them.

Execution lives in `docs/agent-guides/image-port.md` (M1A specifics) and
`docs/exec-plans/active/codec-v2-port.md` §M1 (gate criteria unchanged; this
brief informs HOW to hit the gate, not WHEN).

---

## Companion docs

- [`docs/rfcs/0001-codec-protocol-v2.md`](../../rfcs/0001-codec-protocol-v2.md) — protocol shape (with addendum landing 2026-04-26)
- [`docs/agent-guides/image-port.md`](../../agent-guides/image-port.md) — M1A execution brief
- [`docs/exec-plans/active/codec-v2-port.md`](../../exec-plans/active/codec-v2-port.md) §M1 — phase gate
- [`docs/research/briefs/G_image_network_clues.md`](G_image_network_clues.md) — decoder / data / packaging form for image
