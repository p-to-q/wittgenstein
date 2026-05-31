---
date: 2026-05-31
status: issue #480 first-pass ledger
labels: [research-derived, retrospective-debt, governance]
tracks: [#480, #478, #477, #479, #435, #441, #473, #476]
---

# Retrospective Research-Debt Ledger

This note delivers the first pass for #480. It records historical decisions
that were reasonable under pressure but later proved under-researched,
over-broad, stale, or too easy to misread.

It does not rewrite doctrine. When an entry needs a rule change, engineering
change, or owner decision, the repair is routed to the existing governance,
research, or implementation lane.

## Status Buckets

- `repaired`: already handled by an ADR, RFC, PR, or issue closeout.
- `needs research`: evidence is still thin, but the next evidence source is
  named.
- `needs decision`: a maintainer, model owner, or doctrine owner must decide.
- `needs local-optimum study`: a concrete engineering seam should go through
  #478 or its successor, not this ledger.
- `needs cleanup`: a small doc or code correction is warranted.
- `no action`: researched and intentionally left alone.

## Ledger

### RDL-001 - Governance-lane drift before ADR-0014

- **Status:** `repaired`.
- **Decision or claim:** process and review doctrine could be added inline to
  operating docs as long as the content was directionally correct.
- **Where it entered:** doctrine-bearing PRs #72, #74, #75, #78, and #80; the
  affected surface named by ADR-0013 was `docs/engineering-discipline.md`.
- **Why it was under-supported:** ADR-0013 records a self-ratification loop:
  multiple doctrine sections landed in a 36-hour window without a Brief, RFC,
  or ADR pre-flight.
- **Current impact:** superseded. Future doctrine-bearing work has an explicit
  governance lane.
- **Existing repair evidence:** ADR-0013 requires independent ratification for
  doctrine-bearing PRs; ADR-0014 defines `(Governance Note ->) ADR -> inline
summary` for meta-process doctrine.
- **Required repair:** `no action`. Future violations should route through
  ADR-0013 / ADR-0014 rather than reopening this historical entry.
- **Owner/reviewer needed:** doctrine reviewer pair per ADR-0013.

### RDL-002 - Naming churn around RFC-0003, RFC-0005, and ADR-0011

- **Status:** `repaired`.
- **Decision or claim:** the architecture needed new names such as Loom,
  Transducer, Score, and Handoff.
- **Where it entered:** RFC-0003 proposed the vocabulary; RFC-0005 superseded
  it; ADR-0011 ratified the locked vocabulary.
- **Why it was under-supported:** RFC-0005 found that RFC-0003 invented names
  before checking the original PPT, `AGENTS.md`, and package names. The rename
  would have made the repo less legible with no code-surface gain.
- **Current impact:** superseded. ADR-0011 explicitly rejects the RFC-0003
  names and locks Harness, Codec, Spec, IR, Decoder, Adapter, and Packaging.
- **Existing repair evidence:** `docs/adrs/0011-naming-v2-locked.md` and
  `docs/rfcs/0005-naming-lock-v2.md`.
- **Required repair:** `no action`. Reopen only an individual term if a concrete
  package-level API becomes clearer under a different name.
- **Owner/reviewer needed:** architecture maintainer if a single-term reopen is
  proposed.

### RDL-003 - Image route over-centered on scene-spec JSON

- **Status:** `repaired`.
- **Decision or claim:** image generation could be described as
  `LLM -> structured JSON scene spec -> adapter -> frozen decoder -> PNG`.
- **Where it entered:** early image scaffold docs and schema language;
  RFC-0006 and ADR-0018 record the correction.
- **Why it was under-supported:** the scene-spec framing kept the route
  inspectable, but over time it risked reducing the thesis to a longer prompt
  for another image system. It underplayed decoder-facing visual code.
- **Current impact:** superseded. Semantic IR remains useful, but Visual Seed
  Code is now the primary image-side research object.
- **Existing repair evidence:** RFC-0006 and ADR-0018 ratify the hybrid Visual
  Seed Code path; the codec-v2 execution plan records the VSC follow-ups as
  landed.
- **Required repair:** `no action`. New image-route changes that alter the
  architecture should go through RFC/ADR, not inline doctrine edits.
- **Owner/reviewer needed:** image architecture reviewer and doctrine reviewer
  if the route changes again.

### RDL-004 - Audio route shape risked being flattened into one token story

- **Status:** `repaired`.
- **Decision or claim:** audio might need the same single VSC-like discrete
  token shape that image adopted.
- **Where it entered:** the open design question was commissioned in #260 and
  recorded in `docs/research/2026-05-08-audio-code-layer-design.md`.
- **Why it was under-supported:** speech, music, and soundscape have different
  natural code layers. A single EnCodec / DAC / Mimi token story would hide
  those route differences and add emission-validity risk before evidence.
- **Current impact:** active but bounded. `docs/codecs/audio.md` now says audio
  routes do not share a single token shape, and records the route-specific
  plan receipts.
- **Existing repair evidence:** PR #274 produced the research note; #261 closed
  the route-specific receipt and CLI gate lane; `docs/codecs/audio.md` carries
  the lineage receipt.
- **Required repair:** `no action` now. Optional SSML, MIDI-event-grid, or
  soundscape-operator expansions require focused RFCs before implementation.
- **Owner/reviewer needed:** audio maintainer plus RFC reviewer if a route
  enrichment is promoted.

### RDL-005 - HyperFrames dependency versus repo-owned video distillation

- **Status:** `needs research`.
- **Decision or claim:** the video codec could follow a HyperFrames-shaped
  backend without shipping upstream HyperFrames code.
- **Where it entered:** PR #277 recommended the HyperFrames-shaped lead path;
  #282 commissioned repo-owned distillation; `docs/codecs/video.md` documents
  the current renderer.
- **Why it was under-supported:** the initial research named a strong backend
  shape, but runtime dependency, license, Node version, browser, FFmpeg, and
  cross-machine determinism questions had to be separated from the design
  inspiration.
- **Current impact:** active. The implementation is repo-owned and defaulted to
  `distilled-internal`, but MP4 portability across hosts is still evidence-bound.
- **Existing repair evidence:** `docs/codecs/video.md` states
  "HyperFrames-shaped, not HyperFrames-vendored"; #359 closed the
  same-platform parity floor; #476 remains open for cross-machine structural
  parity and receipt portability.
- **Required repair:** `issue` #476. Do not reopen #359 for portability work.
- **Owner/reviewer needed:** video/rendering maintainer; no model-training
  owner required.

### RDL-006 - M1B audit scripts could be mistaken for empirical receipts

- **Status:** `needs decision`.
- **Decision or claim:** once scripts and fixture validators exist, M1B Gate
  C/D evidence is close enough to bless or close the decoder candidate.
- **Where it entered:** PR #457 made the audit delivery surface executable; #474
  tracked reconciliation of real lab receipts; #473 tracks acceptance policy.
- **Why it was under-supported:** a script proves that the repo can validate a
  receipt shape. It does not prove that real lab-produced artifacts exist, pass,
  or satisfy the eventual threshold policy.
- **Current impact:** active for M1B delivery. #329, #334, #335, and #474 are
  closed, but #473 and #402 still carry policy and delivery work.
- **Existing repair evidence:** #473 asks the hard Gate C/D threshold questions;
  #402 owns lazy weight fetch and SHA-256 verification; #435 and #441 remain the
  model-owner and training-stack review hubs.
- **Required repair:** `issue` #473 for threshold policy and `issue` #402 for
  decoder delivery. This ledger should not decide Gate C/D thresholds inline.
- **Owner/reviewer needed:** model/training owner and image bridge maintainer.

### RDL-007 - Training scaffold risked becoming an isolated research island

- **Status:** `needs decision`.
- **Decision or claim:** training surfaces could accumulate wherever the first
  working scripts landed, including `research/training/` and
  `python/image_adapter/`.
- **Where it entered:** the Phase-1 training skeleton, M1B image-adapter bridge
  work, and #519's placement question.
- **Why it was under-supported:** without a placement decision, "adapter
  training" could refer to a learned Phase-1 adapter or a narrow
  scene-spec-to-VQ-latent bridge. CI also did not exercise the NumPy path that
  claimed to be CI-friendly.
- **Current impact:** active but bounded. The directory placement is decided,
  but the broader stack and owner-review questions are still open.
- **Existing repair evidence:** PR #549 documents
  `research/training/` as the canonical Phase-1 GPU training home and
  `python/image_adapter/` as a narrow bridge. It also adds the NumPy contract
  smoke and CI scope. #435, #441, #399, and #400 remain open for owner review,
  stack audit, tracking, and data/sweep infrastructure.
- **Required repair:** `issue` #435 and `issue` #441 before substantial model
  work; `issue` #399 / #400 for tracker and data/sweep infrastructure.
- **Owner/reviewer needed:** model/training owner.

### RDL-008 - Publish-boundary guard looked broader than it was

- **Status:** `repaired`.
- **Decision or claim:** the npm publish-surface guard already blocked the
  non-runtime surfaces named by delivery doctrine.
- **Where it entered:** `scripts/check-npm-publish-tarball.mjs` and the
  delivery/componentization doctrine.
- **Why it was under-supported:** PR #518 found that `^bench/` did not match
  `benchmarks/`, and that `python/` plus `polyglot-mini/` were uncovered. That
  made the guard read as stronger than it was.
- **Current impact:** repaired. Current tarball checks block `research/`,
  `benchmarks/`, `examples/`, `python/`, `polyglot-mini/`, and model-weight
  extensions.
- **Existing repair evidence:** PR #518 fixed the guard; PR #549 aligned the
  guard with the `python/image_adapter/` placement decision and widened the
  package import guard.
- **Required repair:** `no action`. Future top-level research or training
  directories must update the publish and import guards in the same PR.
- **Owner/reviewer needed:** release/package maintainer.

### RDL-009 - Vercel status-check failure was easy to over-read

- **Status:** `repaired`.
- **Decision or claim:** a red `Vercel` status on PRs implied the PR failed a
  deploy or should not merge.
- **Where it entered:** PR check interpretation, later documented in
  `CONTRIBUTING.md`; #460 tracked the integration problem.
- **Why it was under-supported:** the failure was an authorization/status
  context problem, not a repo build failure. The signal ran even on doc-only PRs
  where the site path filter would otherwise skip work.
- **Current impact:** superseded. #460 is closed, and recent PRs report Vercel
  contexts as green or skipped as expected.
- **Existing repair evidence:** #460 closeout and the status-check taxonomy in
  `CONTRIBUTING.md`.
- **Required repair:** `no action`. If the explanatory `CONTRIBUTING.md` note
  becomes stale again, use a small cleanup PR rather than a doctrine change.
- **Owner/reviewer needed:** CI/release maintainer.

### RDL-010 - Historical local-engineering seams lacked a common triage path

- **Status:** `repaired`.
- **Decision or claim:** decoder bridge, receipt ownership, optional runtime,
  doctor/install, and renderer questions could be handled as broad research
  debt rather than concrete local seams.
- **Where it entered:** #477, #478, and #479 were opened to separate horizontal
  prior art, local optima, and focused spikes from this historical ledger.
- **Why it was under-supported:** without routing, old assumptions could turn
  into either doctrine churn or implementation drift. Local architecture seams
  need file-backed alternatives and falsifiers, not global essays.
- **Current impact:** repaired for the first pass. #477, #478, and #479 are
  closed with reusable notes under `docs/research/`.
- **Existing repair evidence:**
  `docs/research/2026-05-31-horizontal-engineering-matrix.md`,
  `docs/research/2026-05-31-local-optima-first-pass.md`, and
  `docs/research/2026-05-31-focused-spike-template.md`.
- **Required repair:** `handoff to #478` for any future entry that names a
  concrete engineering seam. Because #478 is closed, reopen it or open a
  successor issue instead of solving the seam inside #480.
- **Owner/reviewer needed:** seam owner plus reviewer named by the successor
  issue.

## Closeout

This first pass audits ten historical decisions, more than the five required by
#480. Actionable follow-ups are already routed to #473, #402, #435, #441, #399,
#400, and #476. The remaining repaired entries require no immediate action.

No model training, lab execution, or doctrine rewrite is required for this
ledger.
