---
date: 2026-05-31
status: issue #307 closeout
labels: [research-derived, second-pass, cross-check, closeout]
tracks: [#307, #304, #255, #283, #284, #302, #306, #309, #477, #478, #480, #402, #441, #263]
---

# Independent Second-Pass Cross-Check Closeout

## Purpose

This note closes #307. It is the durable second-pass cross-check artifact for
the four lanes named in that issue:

1. image tokenizer / decoder radar;
2. sensor algorithmic route and measurement gate;
3. skill / system prompt / schema-preamble split;
4. cross-modality code-layer framing.

It does not add doctrine, start training, choose a model family, or rewrite
runtime code. Its job is to compare prior research against current source,
recent closeout artifacts, and current issue routing, then say what changed.

## Acceptance Mapping

| #307 criterion                                        | Evidence in this closeout                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| At least two meaningful independent artifacts land.   | The image lane already has the May 13 per-candidate audit plus the May 31 architecture and reusable-module cross-checks. The cross-modality lane has the May 31 fixed-point closeout. The sensor lane has the post-#326 operator split plus the current sensor lineage doc. This note ties them together. |
| At least one existing claim is strengthened/narrowed. | MaskBit is narrowed by weights-license divergence; FSQ is narrowed from drop-in decoder candidate to training-owned primitive; patchGrammar is kept internal until measurement; fixed-point semantics are kept as a review lens rather than a shared helper.                                              |
| Output changes next-step decisions.                   | Image delivery routes through #402/#441/#399/#400, sensor work stays behind #263, release/review skills remain rejected, and cross-modality abstractions are parked until two production surfaces need the same shape.                                                                                    |

## Lane 1 - Image Tokenizer / Decoder Radar

### Sources checked

- `docs/research/2026-05-08-image-tokenizer-decoder-radar.md`
- `docs/research/2026-05-08-radar-audit-plan.md`
- `docs/research/2026-05-13-audit-vqgan-class.md`
- `docs/research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md`
- `docs/research/2026-05-31-architecture-benchmark-prior-art.md`
- `docs/research/2026-05-31-reusable-module-radar.md`
- `packages/codec-image/src/schema.ts`
- `packages/codec-image/src/decoders/{manifest,preflight,weights,llamagen}.ts`

### Agreement with first pass

The original radar's four-gate shape remains the right control plane:
license, weights, deterministic replay, and Node/ONNX/CPU feasibility. It also
correctly avoided treating the radar's rank ordering as doctrine. Current code
agrees with that caution: the LlamaGen bridge is still a typed
`LLAMAGEN_BRIDGE_NOT_IMPLEMENTED` boundary, while manifest/preflight/weights
logic handles cache lookup, SHA-256 verification, research-only opt-in, and
structured failures.

VQGAN-class remains the lowest-friction first decoder family because the
existing `seedCode` and decoder manifest shapes already fit a 2D codebook-grid
path. This is an implementation-priority statement, not proof that the decoder
is wired.

### Narrowed or downgraded claims

- FSQ should not be described as a drop-in frozen decoder candidate. It is a
  quantization primitive; using it seriously means training a surrounding
  tokenizer/decoder stack that Wittgenstein owns.
- TiTok remains promising for compact VSC, but it would trigger a schema
  discriminator decision before wiring because a 1D token sequence is not the
  same contract as the current 2D grid.
- MaskBit is lower priority than a code-license-only read suggested. Its
  pretrained weights carry a research-only carve-out, so even strong empirical
  gates would not automatically make it a redistributable M1B target.
- Typed bridge stubs and preflight manifests are useful architecture, but they
  are not decoder delivery proof.

### Missing from the first pass

The missing evidence is not more prose. It is concrete delivery pressure:

- accepted Gate C/D threshold policy;
- lazy fetch/cache behavior that keeps local SHA verification as truth;
- owner-reviewed training and tracker/data infrastructure before expensive
  training claims accumulate;
- direct fetch-time re-verification of model URLs, hashes, and license text
  when #402 wires a real bridge.

### Next action

Route image delivery through existing issues:

- #402 for lazy weight fetch, SHA-256 verification, cache layout, and optional
  ONNX Runtime wiring;
- #441 for training-stack/model-owner review;
- #399/#400 for tracker and data/sweep infrastructure;
- #331/#332 only as candidate-audit follow-through, not as bridge-blessing
  shortcuts.

No new image architecture issue is needed from #307.

## Lane 2 - Sensor Algorithmic Route And Measurement Gate

### Sources checked

- `docs/research/2026-05-08-sensor-algorithmic-research.md`
- `docs/research/2026-05-31-fixed-point-semantics-code-layers.md`
- `docs/codecs/sensor.md`
- `packages/codec-sensor/src/operators/`
- `packages/codec-sensor/test/codec.test.ts`
- #263 and #153 routing

### Agreement with first pass

The first-pass sensor conclusion still holds: sensor is the clean L3-only
counter-example to image. The LLM emits an algorithmic spec, TypeScript
operators expand it deterministically, and there is no learned bridge or model
runtime dependency.

The useful TimesFM lesson is the patching concept, not a runtime dependency.
The current `patchGrammar` shape keeps that concept local: patches are
deterministic, nested `patchGrammar` is rejected, and the lineage doc names the
measurement gate before promotion.

### Narrowed or downgraded claims

- `patchGrammar` should not be treated as doctrine just because it landed. It
  is a permitted internal operator awaiting measurement.
- Chaos, shapelet, and echo-state ideas remain concept imports. They do not
  justify new operators until a measurement gate shows value over the current
  flat catalog.
- The fixed-point lens does not mean sensor needs a generic recursive helper.
  The local explicit operator dispatch is clearer and better tested.

### Missing from the first pass

The open gap is empirical: run a measurement plan that compares the current
flat catalog against `patchGrammar` on named public signal families with a
defined metric. Until that exists, sensor research is framed, but not promoted.

### Next action

Keep #263 as the measurement and receipt lane. Keep #153 parked until
measurement makes new operators worth an RFC. Do not open a second sensor
architecture issue from #307.

## Lane 3 - Skill / System Prompt / Schema-Preamble Split

### Sources checked

- `docs/research/2026-05-08-agent-skill-surface.md`
- `packages/agent-contact-text/skills/image-visual-seed-code/SKILL.md`
- `packages/agent-contact-text/skills/image-visual-seed-code/references/`
- `packages/codec-image/src/schema.ts`
- `docs/THESIS.md`
- `docs/hard-constraints.md`
- `docs/engineering-discipline.md`

### Agreement with first pass

The placement table is still the right local split:

- locked vocabulary and hard constraints belong in short doctrine/reference
  docs;
- working rules belong in operating docs;
- per-codec emission shape belongs in `schemaPreamble()` and schemas;
- per-modality task routing belongs in a skill file;
- research rationale stays under `docs/research/` and is not auto-loaded by
  default.

The current image skill is scoped well: it activates for image VSC work and
explicitly rejects SVG, video, sensor, and audio. The image schema preamble is
also correctly codec-local; it tells the LLM what to emit for this codec rather
than smuggling global doctrine into every prompt.

### Narrowed or downgraded claims

- The May 8 external skill survey should stay a research note, not doctrine.
  The repo should not depend on a particular agent runtime's skill loader until
  a packaging issue needs that choice.
- A release skill or review skill would duplicate or bypass governance docs.
  That remains rejected.
- A sensor skill is still premature. If #263 proves `patchGrammar` value, a
  small sensor skill can become an implementation issue. Before that, the
  schema preamble and codec docs are enough.

### Missing from the first pass

There is still no automated skill-trigger test harness. That is acceptable
because the image skill is distribution-facing helper content, not product
runtime. The missing test should not block #307 closure.

### Next action

Do not add a skill runtime, Acontext dependency, or always-loaded prompt blob.
If recurring skill routing bugs appear, open a focused skill-trigger test issue.
Otherwise keep this lane parked.

## Lane 4 - Cross-Modality Code-Layer Framing

### Sources checked

- `docs/research/2026-05-31-fixed-point-semantics-code-layers.md`
- `docs/research/2026-05-31-horizontal-engineering-matrix.md`
- `docs/research/2026-05-31-local-optima-first-pass.md`
- `docs/research/2026-05-31-architecture-benchmark-prior-art.md`
- `docs/research/2026-05-31-retrospective-research-debt-ledger.md`
- `docs/architecture.md`
- `docs/adrs/0018-hybrid-image-code-and-visual-seed-token.md`

### Agreement with first pass

The code-layer framing remains useful if it stays concrete:

- image has VSC / latent-code layers and a frozen-decoder bridge;
- sensor has operator programs and patch-local composition;
- audio has route-specific future code layers rather than one universal token
  story;
- video has composition/render parameter separation and structural media
  receipts.

The shared principle is receipt-backed code layers, not a universal runtime
abstraction.

### Narrowed or downgraded claims

- Fixed-point semantics are review vocabulary, not an implementation target.
  Do not add `fix`, `untilStable`, graph solvers, or recursive helpers until
  two production modalities need the same bounded-stability contract.
- Architecture notes should not bless local stubs as capability. The image
  decoder seam remains unproven until bridge implementation and receipts land.
- Cross-machine media determinism is not byte-proven. #476 remains the owner of
  portability evidence.

### Missing from the first pass

The missing cross-modality work is mostly empirical or owner-gated: MP4
portability, training tracker/data receipts, decoder bridge fetch/cache, and
sensor measurement gates. None of those should be solved by a broad theory PR.

### Next action

Keep current local seams. Route concrete follow-through to #402, #476,
#399/#400, and #263. Park any shared cross-modality abstraction until a second
surface proves the same API and receipt semantics.

## Closeout

#307 can close. The four required lanes have been independently cross-checked,
we have more than two durable artifacts, several claims were strengthened or
narrowed, and every surviving action is routed to an existing issue or an
explicit park decision.

No training path, model weight, runtime dependency, doctrine file, or product
API changes in this closeout.
