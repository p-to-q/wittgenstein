# `onnxruntime-node` runtime-identity probe (S7e basis)

**Date:** 2026-10-16 · **Landed as:** S7e-a `32f7a7c` (capture + receipt
plumbing) · S7e-b `8288bda` (typed row + replay evidence)

## Why this probe exists

S7e records the resolved runtime identity on decoder bridge receipts
*before any `byte-parity` decoder family ships* (#473 / closeout review).
A receipt must state exactly what the runtime can see — no more. This note
fixes that scope by probing `onnxruntime-node` across its declared peer
range (`^1.18.0` in `packages/codec-image`) and by reading the ORT session
options handling for the execution-provider question. Conclusions are
persisted here; the probe itself ran **outside the repo** (scratch envs
under `/private/tmp`, per the environment-hygiene rule) and the scratch
numbers are not committed.

## Method

- Two probe envs: `onnxruntime-node@1.30.0` (current) and `@1.18.0`
  (declared peer floor).
- A minimal probe model (single `Add`, opset 17) built with `onnx` 1.23.
  Note: `onnx.save` from 1.23 writes IR 14, which the probed ORT builds
  refuse (max IR 13) — the probe model therefore sets `ir_version=10`; the
  OpenMAGVIT2 export (IR 8, opset 17) loads unmoved.
- Node scripts read the module surface, `env.versions`,
  `listSupportedBackends()`, and a created session's `executionProviders`;
  a CJS-bundle simulation checked dynamic-import resolution from different
  cwds.
- Provider-selection semantics were confirmed against ORT's
  `session_options_helper.cc` (append loop over the user's EP entries).

## Findings (facts)

- **F1 — version source.** `env.versions = { common, node }`; no top-level
  `version`. `env.versions.node` equals the installed npm package version —
  verified equal at **1.18.0** (peer floor) *and* **1.30.0**, so the whole
  declared range reports a usable version.
- **F2 — no executed-provider introspection.** After session creation,
  `session.executionProviders` is `undefined` (1.30.0). ORT exposes no
  per-node "which provider executed" answer; a receipt can only honestly
  record the **configured** provider list from the session options.
- **F3 — an empty list is not a contract.** With absent/empty
  `executionProviders`, ORT appends nothing and the native default (CPU)
  holds — by implementation accident, not documented behavior. Pinning
  `["cpu"]` explicitly is therefore meaningful, not redundant: it makes the
  intent reviewable and the receipt a scoped claim.
- **F4 — backend inventory (informational).** On macOS,
  `listSupportedBackends()` = `cpu` / `webgpu` / `coreml` (all bundled).
- **F5 — dynamic-import resolution (informational).** The
  `new Function("id", "return import(id)")` pattern used by
  `ensureOnnxRuntime` resolves the module **file-relative**, not
  cwd-relative: it resolves under the project cwd, under `/`, and inside a
  CJS-bundle simulation (relevant to the optional-peer packaging story).

## Decisions encoded (S7e)

- Capture at **bridge load** (`ensureOnnxRuntime` →
  `captureOnnxRuntimeIdentity`, `packages/codec-image/src/decoders/runtime.ts`):
  `env.versions.node` with `env.versions.common` fallback; configured
  providers pinned as `EXECUTION_PROVIDERS = ["cpu"]`
  (`packages/codec-image/src/decoders/llamagen.ts:82`).
- Receipt / `image.decoder` value =
  `{ name: "onnxruntime-node", version, executionProviders }` — the
  *configured* list is the scoped determinism claim
  (`packages/schemas/src/codec/v2/image-decoder.ts`).
- No reportable version ⇒ identity omitted + an
  `image/decoder-runtime-identity-missing` decode warning — never invented,
  never a placeholder value.
- `runtime` stays optional on the receipt: pre-S7e receipts keep parsing
  (schemas 71/71 incl. the boundary test; replay's `runtimeParity` is `null`
  when either side recorded none).
- Replay reports `baselineRuntime` / `replayRuntime` / advisory
  `runtimeParity` (S7e-b) — drift is evidence, not a violation; the
  artifact comparison remains the verdict.

## What this probe does NOT claim

- No cross-device `byte-parity` claim for any family (still #473's gate).
- No guarantee that the *configured* provider equals the *executed* one
  (F2) — the receipt wording stays scoped to "configured".
