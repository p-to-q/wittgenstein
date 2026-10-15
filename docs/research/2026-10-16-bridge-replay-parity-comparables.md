---
date: 2026-10-16
status: research pass feeding S7d (bridge-lane replay verification)
labels: [research-derived, m1-image, replay, receipts, verification]
tracks: [#384, #473, #402, #435, #441]
---

# Bridge replay & parity comparables — S7d pre-read

## Why this note

Standing user directive (2026-10-16): no slice lands without a comparables
research pass (peer repos, official docs, engineering write-ups) that
determines the best architecture / engineering practice **and the most
appropriate local application**; research missed earlier is being made up and
may revise already-landed structure.

This pass covers the pre-scoped replay × bridge-lane verification gap:

- `wittgenstein replay` (#384) re-runs recorded `manifest.request` in dry-run
  and asserts artifact byte-parity for `sensor` / `svg-local` /
  `asciipng-local`; image was refused outright while M1B was pending.
- S7b/S7c (2026-10-16) added the injected-bridge lane, the `image.decoder`
  manifest row, and the CLI `--decoder` opt-in. The S7b brief promised
  replay could "verify a bridge run reproduced with the same decoder hash" —
  but the mechanism was never specified, and **no `decoderHash` parity check
  exists anywhere today** (fact: `packages/cli/src/commands/replay.ts` refuses
  the image route before reading any receipt).

The pass also records related structure-review findings (receipts, manifest
schema symmetry) and sets the follow-up slices where the evidence says more
work is owed.

## Method

- Search surface: ONNX Runtime determinism/issue tracker, PyTorch
  reproducibility docs, Hugging Face Hub revision pinning + file metadata,
  diffusers reproducibility docs, llama.cpp backend-comparison testing, DVC
  `repro` semantics, SLSA provenance, reproducible-builds practice,
  record/replay testing patterns (VCR), image-diff tolerance practice.
- Local evidence: full reads of `replay.ts`, `replay.test.ts`, the decoder
  family manifest schema + #473 policy note, `ImageCodec` expand/adapt/decode,
  `pipeline/adapter.ts`, `pipeline/decoder.ts`, `decoders/llamagen.ts`,
  `decoders/runtime.ts`, weights loader, CLI `image.ts`, harness `services`
  folding, and the pinned receipt tests.
- Fact / interpretation / unknown are marked. All claims cite a source or a
  repo path.

## Findings

### F1 — Runtime determinism is scoped, never assumed (fact)

- ONNX Runtime has no documented bit-reproducibility contract. Real reports
  span the exact regimes we care about:
  - **Apple Silicon CPU**: "Identical SGEMM input becomes nondeterministic
    with KleidiAI in ONNX Runtime 1.27.0" (issue #31569) — same input, same
    machine, run-to-run drift. Our target worker is an Apple Silicon MacBook
    and `packages/codec-image/package.json` declares
    `onnxruntime-node: ^1.18.0` (optional peer), so the resolved version can
    be >= 1.27 on user machines.
  - **OS-specific nondeterminism**: issue #22818 ("non-deterministic on
    Windows, deterministic on Linux").
  - **Cross-runtime**: issue #28609 ("very different results on different
    runtimes"); execution-provider differences #33146, #33314.
  - Randomness and expectations threads: #27771, #12086.
  - Thread-count configuration is a first-class execution knob (ORT
    "Thread management" doc), i.e. a determinism-relevant input.
- PyTorch's reproducibility note scopes determinism to same input + same
  software/hardware and warns `use_deterministic_algorithms` may switch
  algorithms or raise when a deterministic kernel is unavailable (already
  cited by the #473 policy note).
- diffusers' reproducibility docs center the guidance on controlling and
  recording versions/seeds; same seed across devices or library versions is
  treated as *not* expected to reproduce bit-for-bit.

Interpretation: any "byte parity" claim must name its scope (runtime version,
provider, platform). A cross-device claim can only honestly be
**structural**. This is exactly the two-axis vocabulary #473 already landed
(`capabilities.determinismClass: byte-parity | structural-parity` ×
`gateC.acceptance.crossDeviceParity: byte-identical | token-identical |
structural-only`; LlamaGen = `structural-parity` / `structural-only`).

### F2 — Artifact identity = content hash + revision, checked before use (fact)

- Hugging Face Hub practice: pin `revision=<commit hash>` for reproducibility
  (download docs; hub release v1.26 hardening "resolve revisions only once";
  lerobot PR #4191 "pin pretrained artifacts to one commit"); file metadata
  exposes an etag/sha-type digest (`HfFileMetadata`) that can be verified
  after download. Model-verification write-ups and tools (e.g. modelvet-style
  "verify before load" scanners, ollama digest manifests) apply the same
  rule: **verify the digest you resolved against the digest you expected,
  before the artifact participates in a run.**
- Local precedent mirrors this: the waffle-cache layout
  `~/.cache/wittgenstein/decoders/<family>/<sha256>/...` is hash-addressed
  like the HF cache, and `resolveDecoderWeights` sha256-verifies fetched
  bytes before atomic promotion.

Interpretation: a replay verifier must treat the recorded `decoderHash` as a
**hard precondition** — resolve the same decoder locally (cache-only) and
refuse to compare artifacts when the identity does not match. Never "compare
anyway" and never download to make a check pass.

### F3 — Verification surfaces compare at declared classes, with reported tolerances (fact → interpretation)

- llama.cpp compares non-CPU backends against a CPU reference in
  `test-backend-ops` and community discussions about intermediate-state
  comparison ("Compare inference results and intermediate states from
  different backends", discussion #10253) — cross-backend equality is
  first-class but tolerance-based, not byte-based.
- Visual-regression practice: jest-image-snapshot ships a configurable
  failure threshold (default 1% of pixels); egui added explicit image-
  comparison guidelines; commercial snapshot tools expose named mismatch
  thresholds. The pattern across all of them: **advisory by default,
  hard only at a declared threshold**.
- reproducible-builds.org separates bit-for-bit from functional
  reproducibility and uses structural diff tools (diffoscope) where
  bit-exactness is impossible.
- DVC `repro` semantics: a locked pipeline records dependency/output hashes
  and re-execution verifies against the lock.

Interpretation: our replay should (a) verify the claim **at the declared
class**, (b) carry an explicit structural checker for structural classes
(dimensions/format), and (c) report byte-parity as evidence but require it
only for `byte-parity` decoders. Advisory-by-default matches both #473 and
industry practice.

### F4 — Record/replay of non-deterministic stages means freezing recorded I/O and re-executing the deterministic suffix (fact → interpretation)

- VCR-style testing (VCR.py cassettes; pytest-recording) intercepts
  non-deterministic I/O, replays the recorded response, and lets the rest of
  the pipeline execute for real. DVC re-executes stages whose inputs are
  pinned; it does not "re-call the world".

Interpretation (this is the load-bearing design change for S7d): the image
pipeline is `request → LLM (scene spec) → adapter (seed expansion) →
decoder`. Re-running with `dryRun: true` executes the **dry-run stub scene**,
not the recorded run's scene. For a `structural-parity` decoder the decode
output of a *different* scene still has the same dimensions, so a naive
whole-pipeline replay would report green while verifying nothing about the
recorded run (false green). The honest replay is:

> re-parse the recorded `manifest.llmOutputRaw`, re-execute spec → adapter →
> decode with the recorded decoder, and compare at the declared class.

This does not "replay the LLM" (still out of scope, no spend, no network);
the LLM stage is *recorded*, exactly like a VCR cassette.

### F5 — LlamaGen / peers: license and claims (fact)

- LlamaGen is MIT (repo `LICENSE`); the weights README/model card
  (`FoundationVision/vq-ds16-c2i`) publishes checkpoints without any
  determinism guarantee. Nothing upstream supports a byte-parity claim; the
  Gate C/D evidence (2026-05-27) is ours, scoped same-device.

## Local application — S7d design (decisions)

- **D1 Replay semantics (recorded-generation replay).** For the image
  bridge lane, replay re-runs the recorded request with
  `services.recordedGeneration = { llmOutputRaw }` (new codec-owned service
  seam, S7d) so `ImageCodec.expand()` re-parses the recorded generation
  instead of calling an LLM or the dry-run stub. Priority: recorded >
  dry-run > live LLM. A recorded run whose LLM output cannot be re-parsed
  fails as a typed error; there is no stub fallback.
- **D2 Verification chain (all hard unless stated).**
  1. Decoder identity: resolved bridge must match the recorded
     `image.decoder` receipt (`decoderId`, `decoderHash`,
     `determinismClass`).
  2. Decode-input identity: the adapter receipt now carries
     **`latentsSha256`** — a SHA-256 over the canonical latents
     serialization (schema version, family, codebook, codebook version,
     grid, tokens). Baseline vs replay digests must match. Without this,
     a structural-parity decode of *different* latents with the same
     dimensions could pass.
  3. Artifact: `byte-parity` ⇒ SHA-256 equality required. `structural-
     parity` ⇒ PNG structure (signature + IHDR dimensions) must match;
     byte parity is reported as advisory evidence (`byteParity` in the
     replay payload), never required.
- **D3 Refusals (no silent greens).** Placeholder-lane image manifests (no
  `image.decoder` row) remain refused (`REPLAY_UNSUPPORTED_ROUTE`, updated
  message). Bridge-lane manifests that predate the S7d receipts contract
  (no `latentsSha256`) are refused with "re-run the original command"
  guidance — same precedent as `MANIFEST_MISSING_REQUEST`.
- **D4 Decoder resolution.** Replay resolves the decoder **cache-only**
  through the same `loadLlamagenDecoderBridge` path the CLI uses; a cache
  miss is `REPLAY_DECODER_UNAVAILABLE` with the loader's `installHint`.
  Unknown `decoderId`s are refused (`REPLAY_DECODER_UNSUPPORTED`). No
  network fetch is ever attempted by replay.
- **D5 Reporter codes.** `REPLAY_OK` (byte parity achieved),
  `REPLAY_STRUCTURAL_OK` (structural class, structure verified, bytes
  differ — exit 0), `REPLAY_HASH_MISMATCH`, `REPLAY_STRUCTURE_MISMATCH`,
  `REPLAY_DECODER_ID_MISMATCH` / `_HASH_MISMATCH` /
  `_CLASS_MISMATCH` (determinism class), `REPLAY_LATENTS_MISMATCH`,
  `REPLAY_DECODER_UNSUPPORTED`, `REPLAY_DECODER_UNAVAILABLE`,
  `REPLAY_ARTIFACT_READ_FAILED`, `MANIFEST_MISSING_LATENTS_DIGEST`,
  `MANIFEST_MISSING_LLM_OUTPUT`, `MANIFEST_IMAGE_DECODER_INVALID`.

## Revisions to prior structure (explicit)

| Prior decision | Evidence | Revision |
| --- | --- | --- |
| S7b brief: "replay can verify a bridge run reproduced with the same decoder hash" (mechanism unspecified) | F2, F4 | Specified + extended: recorded-generation replay + decoder identity + latents digest + class-aware artifact parity (S7d, landed this session). |
| #384 replay doctrine: byte-parity assertion | F1, F3 | Image lane verifies **at the decoder's declared class**; byte parity for `structural-parity` decoders is reported, not required. Byte-parity routes are unchanged. |
| `ImageAdapterReceipt` had no decode-input digest | F2, F4 | **Landed:** `latentsSha256` added; it is the join point that makes structural-class verification meaningful. |
| Receipts carried no runtime identity | F1 (KleidiAI case is Apple-Silicon CPU, ORT 1.27.x), diffusers version guidance | **Slated (S7e):** record the resolved `onnxruntime-node` version (and execution provider) on bridge receipts before any `byte-parity` decoder family ships; replay then reports it. Cannot be validated locally until weights land (#435), so it is not blindly added now. |
| `image.decoder` / `image.adapter` rows are schema-undeclared (zod strips them on parse) while `audioRender` / `videoRender` are declared | F2 (self-describing receipts), local asymmetry | **Landed (closeout review, `c2ca18e`):** closed set single-sourced in `packages/schemas` (`MANIFEST_ROW_KEYS`); all keys declared in `RunManifestSchema` (parse-preservation); `ManifestRow.key` typed by the union; value promotion policy defined (first: `image.decoder` in S7e). See `2026-10-16-m1b-delivery-closeout-review.md` (CR1–CR3). |
| `REPLAY_SUPPORTED_ROUTES` = local deterministic routes only | F4 | Image bridge lane joins as a **conditionally supported route** (bridge-lane manifests only); message + docs updated. |

## Open unknowns

- Whether `onnxruntime-node >= 1.27` actually produces run-to-run drift for
  *our* exported graph on Apple Silicon is untestable locally (weights
  absent, #435). The S7d defaults are insensitive to this by construction;
  a `byte-parity` family must land S7e first.
- Whether to add a numeric tolerance channel (rtol/atol-style) for future
  non-structural decoders. Deferred; no shipped family needs it and #473's
  vocabulary already covers the current classes.
- Re-encode token Hamming parity stays out of replay scope (no encoder
  side); unchanged #473 advisory policy.

## Sources

Runtime determinism:
- ORT issue #31569 (KleidiAI / Apple Silicon, 1.27.0): https://github.com/microsoft/onnxruntime/issues/31569
- ORT issue #22818 (Windows-vs-Linux): https://github.com/microsoft/onnxruntime/issues/22818
- ORT issue #28609 (different runtimes): https://github.com/microsoft/onnxruntime/issues/28609
- ORT issues #33146 / #33314 (execution-provider differences): https://github.com/microsoft/onnxruntime/issues/33146 , https://github.com/microsoft/onnxruntime/issues/33314
- ORT issue #12086 ("What level of reproducability is expected?"): https://github.com/microsoft/onnxruntime/issues/12086
- ORT threading doc: https://onnxruntime.ai/docs/performance/tune-performance/threading.html
- PyTorch reproducibility notes: https://docs.pytorch.org/docs/stable/notes/randomness.html
- PyTorch `use_deterministic_algorithms`: https://docs.pytorch.org/docs/2.12/generated/torch.use_deterministic_algorithms.html
- diffusers reproducibility docs: https://huggingface.co/docs/diffusers/en/using-diffusers/reusing_seeds

Pinning / identity:
- HF file download docs (revision pinning, HfFileMetadata): https://huggingface.co/docs/huggingface_hub/v2.1.1/en/package_reference/file_download
- huggingface_hub v1.26.0 release notes ("resolve revisions only once"): https://newreleases.io/project/pypi/huggingface-hub/release/1.26.0
- lerobot PR #4191 ("pin pretrained artifacts to one commit"): https://github.com/huggingface/lerobot/pull/4191
- Local precedent: `packages/codec-image/src/decoders/weights.ts` (hash-addressed cache + sha256-before-promotion)

Verification / tolerance practice:
- llama.cpp discussion #10253 (compare backends / intermediate states): https://github.com/ggml-org/llama.cpp/discussions/10253
- ggml backend-ops test harness (CPU reference): https://rdrr.io/cran/ggmlR/man/ggml_test_backend_ops.html
- jest-image-snapshot (configurable failure threshold): https://www.npmjs.com/package/jest-image-snapshot
- egui image-comparison guidelines (PR #5714): https://github.com/emilk/egui/pull/5714
- LambdaTest SmartUI mismatch thresholds: https://www.lambdatest.com/support/docs/smartui-mismatch-thresholds/
- reproducible-builds presentations (bit-for-bit vs functional): https://reproducible-builds.org/
- diffoscope: https://pypi.org/project/diffoscope/
- DVC `repro` (lock hashes): https://doc.dvc.org/command-reference/repro
- VCR.py record/replay: https://vcrpy.readthedocs.io/

Provenance / model cards:
- SLSA provenance explainer: https://safeguard.sh/resources/blog/what-is-binary-provenance
- LlamaGen (MIT): https://github.com/FoundationVision/LlamaGen ; weights card: https://huggingface.co/FoundationVision/vq-ds16-c2i
- Verify-before-load practice: https://intelligibberish.com/articles/safely-download-and-verify-open-source-llms/ , https://github.com/signerless/llm-checker

Local anchors:
- `docs/research/2026-05-31-m1b-gate-acceptance-policy.md` (#473 policy)
- `docs/exec-plans/active/m1b-image-implementation-slices.md` (S7b/S7c records)
- `packages/cli/src/commands/replay.ts`, `packages/codec-image/src/pipeline/{adapter,decoder}.ts`
