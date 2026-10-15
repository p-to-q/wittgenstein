---
date: 2026-10-16
status: research pass + closeout review feeding the manifest row-schema symmetry decision (implementation lands this session)
labels: [research-derived, m1-image, receipts, closeout, manifest]
tracks: [#267, #384, #402, #403, #435, #473]
---

# M1B delivery closeout review — issue assessment + manifest row-schema symmetry

## Why this note

- [#267](https://github.com/p-to-q/wittgenstein/issues/267) (closeout discipline)
  requires a final assessment per delivery lane: what changed, what was
  validated, what remains.
- The S7d comparables note
  ([`2026-10-16-bridge-replay-parity-comparables.md`](./2026-10-16-bridge-replay-parity-comparables.md),
  revision table) slated one open structural question for this review:
  **`image.decoder` / `image.adapter` rows are schema-undeclared (zod strips
  them on parse) while `audioRender` / `videoRender` are declared — decide
  schema symmetry with RFC-0007.**
- The advancement plan
  ([`2026-10-16-project-state-recovery-and-advancement.md`](./2026-10-16-project-state-recovery-and-advancement.md)
  §7 item 6) ends the delivery checklist with: "Remaining: canonical ONNX
  hosting decision (#435), then issue closeout review."
- Standing directive (2026-10-16): no slice lands without a comparables
  research pass. This note is that pass for the symmetry decision.

## Method

- Search surface: extension-channel design in receipt / provenance formats
  (OCI annotations, in-toto/SLSA, CloudEvents, GGUF, CycloneDX, protobuf
  JSON, Kubernetes API pruning), closeout practice (KEP graduation criteria),
  plus local reads of `RunManifestSchema`, the manifest write path
  (`manifest.ts`, `telemetry.writeJson`), the row fold (`harness.ts`), both
  row-emitting v2 codecs, replay / inspect raw-JSON reads, the #402/#403 test
  surface, and the tarball guard.
- Fact / interpretation / unknown are marked; claims cite a source or repo
  path.

## Part 1 — Closeout assessment (changed / validated / remains)

### #384 — replay verification (state: CLOSED 2026-05-13)

- **Changed:** S7d (`23f2055`) extended `wittgenstein replay` to the image
  lane: recorded-generation re-execution, decoder identity + decode-input
  digest + class-aware artifact parity, structured refusals.
- **Validated:** `packages/cli/test/replay.test.ts` (27 tests) incl. the
  poisoned-weights-URL no-network proof; suite green at HEAD.
- **Remains:** nothing on this lane. Follow-up S7e is tracked below.

### #402 — lazy weight fetch + sha256 verify (state: OPEN, `status/needs-decision`)

Acceptance vs reality (verified against the repo this session):

| #402 acceptance bullet                                                         | State | Evidence                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Manifest schema typed in `decoders/types.ts`                                   | Done  | `DecoderFamilyManifestSchema` + `DecoderWeightsManifestSchema`; `decoder-family-manifest.test.ts`, `llamagen-manifest.test.ts`                                                             |
| Loader replaces `LLAMAGEN_BRIDGE_NOT_IMPLEMENTED`                              | Done  | `397a0d1`; `loadLlamagenDecoderBridge` — cache-only default, evidence-pinned decode, typed failures                                                                                        |
| Tests: cache hit / miss, sha256 mismatch, license refusal, runtime unavailable | Done  | `decoder-weights.test.ts` (hit, miss, mismatched fetched bytes not cached, mismatched cached codebook, license), `decoder-bridge-contract.test.ts` (`DECODER_RUNTIME_UNAVAILABLE` details) |
| CI guard: npm tarball excludes weights                                         | Done  | `scripts/check-npm-publish-tarball.mjs`                                                                                                                                                    |

- **Remains (owner-gated, not more scaffolding):** (1) pin the canonical
  decoder-family manifest — the shipped ONNX is a derivative export with no
  canonical SHA-pinnable URL yet; (2) hosting decision (#435-class): where
  the blessed `.onnx` lives so `repoId` / `revision` / `weightsSha256` can be
  pinned; (3) wire `install` to a real fetch recipe once hosted. The
  cache-only default is the honest interim posture (`WEIGHTS_NOT_INSTALLED`
  fails before any runtime check).

### #403 — install / doctor tier surface (state: OPEN, `status/parked`)

- **Changed:** `2ce1812` — `wittgenstein install image` fetch lane,
  installed-tiers receipt, doctor tier readiness; GPU tier refuses up front;
  re-run idempotent; `runtimeVerified` records onnxruntime-node presence.
- **Validated:** `install.test.ts`, `install.flow.test.ts`,
  `install-fetch.test.ts`, `doctor.test.ts` — green at HEAD.
- **Remains:** the real fetch recipe is blocked behind the same hosting
  decision as #402; the known cosmetic defect (stray `undefined` printed on
  some CLI error paths) is pre-existing and not part of this lane's contract.

### #473 / S7e

- #473 stays the open gate-policy lane (unchanged by this review).
- S7e (record resolved `onnxruntime-node` version + execution provider on
  bridge receipts before any `byte-parity` family ships) stays slated behind
  hosting: it cannot be validated locally with weights absent. Under CR1–CR3
  below, its new fields extend the declared `image.decoder` value.

### Closeout verdict

The S7 delivery line is reduced to **one owner decision** (weights hosting +
pin) plus two follow-through slices that depend on it (install fetch recipe,
S7e). No delivery-line code debt remains that blocks the decision. #384 needs
nothing further; #402/#403 cannot close truthfully before hosting lands.

## Part 2 — Research: how receipt formats evolve without breaking (comparables)

### F1 — Extension channels are declared, namespaced, and lenient on read (fact)

- **OCI annotations:** "best practice is to namespace the keys"
  (reverse-domain), and "Consumers MUST NOT generate an error if they
  encounter an unknown annotation key."
  ([annotations spec](https://specs.opencontainers.org/image-spec/annotations/))
- **in-toto v1 parsing rules:** "Unrecognized fields: Consumers MUST ignore
  unrecognized fields unless otherwise noted in the predicate specification.
  This is to allow minor version upgrades and extension fields." +
  "Extension fields: Producers MAY add extension fields to any JSON object."
  ([in-toto/attestation spec](https://github.com/in-toto/attestation/blob/main/spec/v1/README.md))
- **CloudEvents:** extension context attributes are first-class, top-level,
  naming-constrained; the primer records why a nested `extensions` container
  was rejected — "only having one location in the serialization for unknown,
  or even new, properties" — so promotion never has to look in two places.
  ([primer](https://github.com/cloudevents/spec/blob/main/cloudevents/primer.md))
- **GGUF metadata:** community keys are namespaced ("`rustformers.` as a
  prefix"), and "If a particular community key is widely used, it may be
  promoted to a standardized key."
  ([gguf.md](https://github.com/ggml-org/ggml/blob/master/docs/gguf.md))
- **CycloneDX:** `properties` exists to "include data not officially
  supported in the standard without having to use additional namespaces or
  create extensions"; taxonomy registration is optional; promotion path
  documented. ([spec](https://cyclonedx.org/docs/1.6/json/))

### F2 — Silent dropping is a documented footgun (fact)

- **ProtoJSON "does not support unknown fields"** and is explicitly annotated
  with weaker schema-evolution guarantees than the binary wire format
  ("Removing fields is a breaking change that will trigger a parsing error").
  ([protobuf JSON guide](https://protobuf.dev/programming-guides/json/))
- **Kubernetes API pruning** drops unknown fields, but the non-default
  `Ignore` level is described as "dropping all unknown and duplicate fields
  and giving no indication it has done so"; the modern default is `Warn`, and
  CRDs have an explicit `x-kubernetes-preserve-unknown-fields` escape hatch.
  ([API concepts](https://kubernetes.io/docs/reference/using-api/api-concepts/))
- Local analogue: **zod strips unknown object keys by default** — the same
  silent-loss shape inside our own canonical parse path.

### F3 — Local interpretation (from F1 + F2)

For a receipt document, the honest split is: **write-side closes and
validates the extension set; read-side preserves everything the write side
can legitimately emit**; typing of extension _values_ is a promotion step,
not a prerequisite for declaration. One serialization location per fact;
promotion keeps the location and tightens the value (CloudEvents lesson).

### F4 — Closeout practice: graduation-criteria assessment (fact → local)

Kubernetes KEPs declare per-stage graduation criteria and reviewers assess
evidence against them rather than trusting narration
([KEP process](https://www.kubernetes.dev/blog/2022/08/11/enhancing-kubernetes-one-kep-at-a-time/)).
Local application: each lane above is assessed as evidence-vs-acceptance
before any closeout comment; parked lanes stay parked with named triggers
(hosting decision) instead of vague intent.

## Part 3 — Local application: the manifest row channel (decision)

Current local facts (verified this session):

- v2 codecs author rows; `foldManifestRows` accepts a closed set,
  `CODEC_MANIFEST_ROW_KEYS` (`packages/core/src/runtime/harness.ts`); unknown
  keys are refused (`MANIFEST_ROW_KEY_REJECTED`).
- Nine of the thirteen closed-set keys are **not declared** in
  `RunManifestSchema` (`route`, `renderPath`, `audioRender`, `audioPlan` are
  declared) — including every image receipt: `image.code`, `image.adapter`,
  `image.decoder`, `quality.structural`, `quality.partial`,
  `metadata.warnings`, `L4.adapterHash`, `L5.decoderHash`, dotted
  `artifact.sha256`. Under zod strip semantics a canonical parse **deletes
  them**; replay and `image --show-image-code` read raw JSON as the
  workaround (`packages/cli/src/commands/replay.ts`,
  `packages/cli/src/commands/image.ts`).
- The protocol comment on `ManifestRow.key`
  (`packages/schemas/src/codec/v2/codec.ts`) still describes an open
  namespaced channel, which the 2026-10-16 robustness slice's closed set
  superseded in practice — a doc/implementation split to reconcile.

**CR1 — Declare the closed set in `RunManifestSchema` (parse-preservation).**
Every `MANIFEST_ROW_KEYS` key gets an explicit optional declaration; values
stay `z.unknown()` until promoted. The manifest schema then describes the
persisted document one-to-one for everything the harness can write. Effect:
schema parses preserve rows; existing raw-JSON readers are unchanged; the
write-path check can now _see_ row values (prerequisite for value promotion).
Declared ≠ typed: today's move is declaration, not strictness.

**CR2 — Single source + typed producers.** Move the closed set to the
protocol package: `packages/schemas/src/codec/v2/manifest-rows.ts`
(`MANIFEST_ROW_KEYS`, `ManifestRowKey`, `isManifestRowKey`); core's fold
imports it; `ManifestRow.key` tightens to `ManifestRowKey` (compile-time for
typed callers, runtime guard kept for untyped ones). Promotion of a row
keeps its key and location (single-location rule).

**CR3 — Consumers + promotion policy.** No forced migration of replay /
inspect raw reads in this slice (they read both recorded baselines and
runtime objects uniformly); new consumers may rely on parse-preservation.
Value promotion = a typed schema at the same key, per row, when a consumer
depends on it. First scheduled promotions: `image.decoder` in S7e
(runtime-identity fields); the RFC-0007 "shape fired" receipt lands as a
field on the existing `image.code` / `image.decoder` rows when that RFC
activates — no new location.

**Recorded, deferred (explicitly not decided today):**

- A manifest `schemaVersion` field — every comparable format versions its
  document (in-toto TypeURI, CloudEvents `specversion`, CycloneDX
  `specVersion`); ours is implicitly versioned (git SHA + schema evolution).
  Candidate for a future manifest-semantics slice.
- `artifact.sha256` row duplicates the typed `artifactSha256` spine field
  (dual location). Tolerated for now: the golden row-set pin and replay's raw
  reads depend on the dotted key; revisit only with a manifest v2.
- Nested receipt restructuring (`manifest.image.*`) is explicitly not
  pursued: symmetry by declaration is the minimal move that keeps every
  existing pin.

## Sources

Web:

- OCI annotations: https://specs.opencontainers.org/image-spec/annotations/
- in-toto attestation spec v1 (parsing rules): https://github.com/in-toto/attestation/blob/main/spec/v1/README.md
- CloudEvents primer (extensions, single-location): https://github.com/cloudevents/spec/blob/main/cloudevents/primer.md
- CloudEvents spec (extension attributes): https://github.com/cloudevents/spec/blob/main/cloudevents/spec.md
- GGUF metadata (community keys, promotion): https://github.com/ggml-org/ggml/blob/master/docs/gguf.md
- CycloneDX 1.6 JSON (properties): https://cyclonedx.org/docs/1.6/json/
- ProtoJSON (unknown fields): https://protobuf.dev/programming-guides/json/
- Kubernetes API concepts (pruning + warning): https://kubernetes.io/docs/reference/using-api/api-concepts/
- KEP process: https://www.kubernetes.dev/blog/2022/08/11/enhancing-kubernetes-one-kep-at-a-time/

Local anchors:

- `packages/schemas/src/manifest.ts`, `packages/core/src/runtime/harness.ts`
- `packages/schemas/src/codec/v2/codec.ts` (`ManifestRow` comment)
- `packages/cli/src/commands/replay.ts`, `packages/cli/src/commands/image.ts`
- `packages/codec-image/test/{decoder-weights,decoder-bridge-contract,golden}.test.ts`
- `scripts/check-npm-publish-tarball.mjs`
- `docs/research/2026-10-16-bridge-replay-parity-comparables.md` (slate origin)
