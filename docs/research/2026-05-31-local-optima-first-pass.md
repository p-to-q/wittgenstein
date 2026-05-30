---
date: 2026-05-31
status: local-optima first pass
labels: [research-derived, local-optima, architecture]
tracks: [#478, #480, #477, #475, #402, #435, #441, #476, #543]
---

# Local architecture optima first pass

## Purpose

This note closes the first pass for #478: choose the cleanest local engineering
shape for concrete seams that already exist in the repository, without changing
locked doctrine and without running model training. The goal is narrower than a
global architecture review. Each packet answers:

- what shape exists now;
- why the seam is worth revisiting;
- which local alternatives are plausible;
- what is locked by current docs, tests, and receipts;
- what recommendation should guide the next PR.

## Method

The pass reviewed current files rather than abstract preferences:

- decoder bridge and M1B receipt surfaces:
  `packages/codec-image/src/decoders/manifest.ts`,
  `packages/codec-image/src/decoders/preflight.ts`,
  `packages/cli/src/commands/{decoder-manifest,install,doctor}.ts`,
  `packages/codec-image/test/{decoder-family-manifest,decoder-preflight}.test.ts`,
  `docs/research/2026-05-26-m1b-audit-delivery-review-pack.md`, and
  `docs/acceptance/m1b-image.md`;
- optional runtime and doctor surfaces:
  `packages/codec-image/src/decoders/runtime.ts`,
  `packages/codec-video/src/mp4-renderer-runtime.ts`,
  `packages/codec-video/src/mp4-renderer.ts`,
  `packages/cli/src/commands/doctor.ts`,
  `packages/process-runner/src/index.ts`, and
  `packages/cli/test/doctor.test.ts`;
- manifest and receipt ownership surfaces:
  `packages/schemas/src/manifest.ts`,
  `packages/schemas/src/training-manifest.ts`,
  `research/training/_shared/manifest.py`,
  `research/validation/fixtures/m1b-audit/`,
  `research/validation/video_mp4_renderer_validate.ts`, and
  `docs/research/2026-05-31-research-presentation-audit.md`;
- prior local architecture research:
  `docs/research/briefs/H_codec_engineering_prior_art.md` and
  `docs/research/briefs/J_audio_engineering_and_routes.md`.

None of the packets below came from an untriaged historical-debt ledger entry in
#480. They are current local seams found while reviewing #475/#478-era code.

## Packet 1 - M1B decoder bridge contract

### Current shape

The bridge contract is currently codec-owned:

- `packages/codec-image/src/decoders/manifest.ts` owns decoder-family manifests,
  Gate C/D receipt validation, hard pass checks, candidate matching, and blessed
  manifest rules.
- `packages/codec-image/src/decoders/preflight.ts` owns readiness ordering:
  manifest selected, manifest valid, blessed status, Gate C/D receipts, weights,
  and optional runtime.
- `packages/cli/src/commands/decoder-manifest.ts` only selects and loads the
  manifest plus declared receipts.
- `packages/cli/src/commands/install.ts` and `doctor.ts` present the preflight
  result to humans and JSON callers.

### Pressure

The same facts need to be visible in several places: install, doctor, manifest
tests, M1B review packs, and future bridge wiring. That creates pressure to move
validation upward into `packages/schemas` or outward into CLI helpers.

### Local alternatives

1. Keep the current codec-owned manifest and preflight contract; keep CLI as a
   selection and presentation layer.
2. Move decoder-family manifests into `packages/schemas` immediately.
3. Let CLI own manifest and readiness checks because install/doctor are the
   user-visible surfaces.
4. Defer checks to runtime loaders and bridge construction.

### Locked constraints

- `docs/hard-constraints.md` requires no silent fallback and codec-owned
  manifest rows.
- `docs/acceptance/m1b-image.md` requires manifest/provenance checks, structured
  license refusal, runtime-unavailable behavior, and lab receipt comparison.
- `docs/research/2026-05-31-research-presentation-audit.md` requires fixture
  and lab evidence to stay separate.
- Current tests prove the important order: invalid manifest and audit receipt
  failures block before weights/runtime work.

### Recommendation

`keep current`.

The local optimum is the current split: domain validation lives with
`@wittgenstein/codec-image`, while CLI code selects files and reports shaped
receipts. Moving image-specific Gate C/D semantics into `packages/schemas` would
make the shared package carry a candidate-specific research policy before the
policy is owner-approved. Moving checks into CLI would duplicate the contract
for future SDK/non-CLI callers. Deferring to runtime loaders would discover
license and audit blockers too late.

### Falsifier

Reopen this if a second non-image decoder family needs the exact same Gate C/D
receipt schema and hard pass policy, or if CLI/SDK callers need duplicated
preflight implementations. That would be evidence for promoting a narrow shared
decoder-readiness schema rather than the whole M1B manifest.

## Packet 2 - Optional runtime probes and doctor receipts

### Current shape

Optional runtime loading is intentionally codec-local:

- image decoder loading uses `ensureOnnxRuntime()` and a structured
  `DECODER_RUNTIME_UNAVAILABLE` error;
- video MP4 loading uses `ensurePuppeteerCore()` and a structured
  `MP4_RENDERER_PUPPETEER_UNAVAILABLE` error;
- doctor probes Node peers, HyperFrames CLI, FFmpeg, and Chrome with local
  `DoctorCheck` objects and shared process/version helpers.

This keeps Tier 0 lightweight and prevents optional peers from becoming install
requirements.

### Pressure

The next optional runtime will likely copy the same status vocabulary:
`ok`, `missing`, `invalid`, `skipped`, plus version/path/message/install hint.
The runtime loaders should stay domain-specific, but the doctor/probe receipt
shape is now broad enough to benefit from one small shared type.

### Local alternatives

1. Keep everything per-surface.
2. Extract a shared doctor/probe receipt shape and helper, while leaving
   codec-local runtime loaders alone.
3. Create a generic optional-runtime loader that every codec uses.
4. Promote optional peers into hard dependencies to simplify checks.

### Locked constraints

- Tier 0 install must not pull ONNX, Puppeteer, Chrome, or FFmpeg.
- `doctor` must not require MP4 dependencies unless MP4 rendering is enabled.
- Runtime loader errors must stay precise enough to name the codec tier and
  install hint.
- `packages/process-runner` already owns shared subprocess and version-probe
  policy; it is the natural lower-level helper boundary.

### Recommendation

`implement now`: #543.

Extract only the doctor/probe receipt shape, not the runtime loaders. A focused
PR should normalize `DoctorCheck`-style output behind a shared type/helper
without changing install behavior or creating package cycles. The generic shape
should describe probe facts; domain loaders should still decide what a missing
runtime means for image decode or video MP4 render.

### Falsifier

If the shared probe helper starts needing codec-specific branches or install
semantics, it is too high-level. Revert to per-surface probe assembly and keep
only `spawnVersionCheck` / `firstOutputLine` as the shared primitive.

## Packet 3 - Receipt schema ownership

### Current shape

The repository now has three receipt strata:

- shared product receipts in `packages/schemas`, including `RunManifestSchema`,
  `VideoRenderManifestSchema`, `AudioRenderManifestSchema`, and the canonical
  `TrainingRunManifestSchema`;
- codec-local bridge receipts in `packages/codec-image/src/decoders/manifest.ts`,
  where M1B-specific Gate C/D semantics live;
- research and operator receipts in `research/validation/fixtures/m1b-audit/`,
  `research/validation/video_mp4_renderer_validate.ts`, and
  `research/training/_shared/manifest.py`.

### Pressure

Receipts are the repo's proof surface. If every receipt moves into
`packages/schemas`, the shared package becomes a dumping ground for research
experiments. If too many receipts stay local, reviewers cannot tell which
surface is canonical.

### Local alternatives

1. Promote every receipt schema to `packages/schemas`.
2. Keep product run/training manifests in `packages/schemas`; keep
   candidate-specific bridge and validation receipts local until consumed by a
   product manifest.
3. Keep all research receipts under `research/validation` until a release.
4. Use prose-only docs for research receipts and validate later.

### Locked constraints

- `scripts/check-no-research-imports.mjs` forbids package code from importing
  `research/`.
- `docs/research/2026-05-31-research-presentation-audit.md` requires
  machine-readable receipts or fixtures where claims need falsification.
- M1B Gate C/D thresholds still have owner-decision follow-ups (#473/#474), so
  shared promotion would overstate policy maturity.
- `packages/schemas/src/training-manifest.ts` is already the canonical TypeScript
  training manifest schema; Python training helpers are research-side emitters,
  not shared product schema.

### Recommendation

`keep current`.

Use a promote-on-consumption rule: a receipt belongs in `packages/schemas` only
when package/runtime code or public manifest validation needs it. Candidate
bridge and lab receipts can stay codec-local or research-local while their
thresholds remain research policy. This is why `VideoRenderManifestSchema` and
`TrainingRunManifestSchema` belong in `packages/schemas`, while M1B Gate C/D
receipt hard checks currently belong with `@wittgenstein/codec-image`.

### Falsifier

Revisit if a research-local receipt becomes a public CLI input, a published
artifact manifest field, or a cross-package dependency. At that point, promote
the narrow schema and add fixture round-trip tests.

## Packet 4 - Training manifest smoke surface

### Current shape

There are two relevant training-manifest surfaces:

- `packages/schemas/src/training-manifest.ts` defines the canonical
  `witt.training.run-manifest/v0.1` schema and fixture round-trip tests.
- `research/training/_shared/manifest.py` is a Python research helper with an
  older dataclass shape and a docstring that describes the training receipt
  spine.

### Pressure

Training is active, and the repository must not disturb live experiments. At
the same time, two manifest shapes can confuse future reviewers about which one
is canonical.

### Local alternatives

1. Rewrite the Python helper immediately to emit the canonical TypeScript schema.
2. Treat the Python helper as a legacy research emitter and document the
   canonical schema boundary.
3. Move the Python helper under package-owned schema generation.
4. Delete the Python helper until training code needs it again.

### Locked constraints

- Do not interrupt current model training.
- #519 already tracks the broader owner decision about training-code homes.
- #441 keeps training/research review in ML-specialist scope.
- The TypeScript schema and fixture tests already provide the canonical shared
  contract.

### Recommendation

`needs owner decision`: #519.

Do not rewrite the Python emitter as part of #478. The local optimum is to keep
the canonical schema in `packages/schemas` and route Python helper alignment
through the training-home decision. A focused follow-up can later either mark
the Python helper legacy or make it emit `witt.training.run-manifest/v0.1`, but
that choice should not be made while live training work is dirty.

### Falsifier

If a training run intended for owner review emits the Python helper shape rather
than the canonical TypeScript schema, this becomes an implementation blocker
rather than a documentation decision.

## Summary table

| Seam                                        | Source                                             | Recommendation         | Next action                                                                                                      |
| ------------------------------------------- | -------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| M1B decoder bridge contract                 | Current #475/#478 review, not #480 historical debt | `keep current`         | Use codec-owned manifest/preflight as the local optimum until another decoder family proves promotion is needed. |
| Optional runtime probes and doctor receipts | Current #478 review, not #480 historical debt      | `implement now`        | #543 extracts shared doctor/probe receipt shape without changing codec-local runtime loaders.                    |
| Receipt schema ownership                    | Current #475/#478 review, not #480 historical debt | `keep current`         | Promote schemas only when package/runtime code consumes them.                                                    |
| Training manifest smoke surface             | Current #478 review plus #519 decision boundary    | `needs owner decision` | Route Python helper alignment through #519 and ML-owner review.                                                  |

## Reviewer checklist

- Confirm this note analyzes at least two concrete local seams.
- Confirm every packet cites real files or issue references.
- Confirm no doctrine doc is changed inline.
- Confirm #543 is small enough to become a focused implementation PR.
- Confirm #519 remains the right owner-decision tracker for training helper
  alignment.
