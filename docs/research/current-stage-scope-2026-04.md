# Current-Stage Research Scope — 2026-04

**Date:** 2026-04-27  
**Status:** Working note v0.1  
**Purpose:** Define the research scope for the repo's current stage, separate the main
research buckets, and name the concrete external objects worth studying next.

---

## Why this note exists

Wittgenstein now has enough structure that research needs an explicit near-term scope.

Without that, two bad things happen:

- broad research turns into loose inspiration with no route back into the repo
- a single object study gets mistaken for the whole research program

This note solves that by defining:

- what this stage is actually trying to learn
- how wide the current research boundary should be
- which sub-directions are central
- which external systems are objects of study, not the main story

This note is a **scope map**, not doctrine.

---

## Current stage

This note assumes:

- `M0` protocol adoption is the executed baseline
- `M1A` image is the hardest-case precedent already landed
- `M2` audio is the next execution line
- implementation should **not** start from this note
- current research should sharpen the next decisions, not relitigate the base thesis

Before extending this note, re-read:

- `docs/THESIS.md`
- `docs/engineering-discipline.md`
- `docs/research/program.md`
- `docs/research/README.md`
- `docs/exec-plans/active/codec-v2-port.md`
- `docs/agent-guides/audio-port.md`
- `docs/research/briefs/D_cli_and_sdk_conventions.md`
- `docs/research/briefs/H_codec_engineering_prior_art.md`

---

## Hard boundaries for this scope

This research round should not:

- reopen locked doctrine casually
- start `M2` implementation
- treat one vendor stack as the repo's strategic center
- confuse a promising object study with a final decision
- silently promote exploratory notes into policy

The goal is not "research everything." The goal is "research the next useful things with
clean boundaries."

---

## Scope architecture

This stage is best split into four buckets.

### S1 — Execution-serving research

Research that should directly improve the next execution line.

Current `S1` targets:

1. `audio` runtime / decoder-family landscape
2. `audio` route / CLI / config / provenance engineering
3. request-surface cleanup (`--route`, auth, doctor, output contracts)

### S2 — Engineering-borrow research

Research that studies existing projects for structure, interface shape, and packaging
rather than for model quality alone.

Current `S2` targets:

1. route composition and ownership
2. CLI / auth / config conventions
3. artifact, packaging, observability, and evaluation surfaces
4. external dependency vs vendored-source policy cues

### S3 — Model / runtime object studies

Research that studies major labs, frameworks, or stacks as **objects**, not as the
repo's identity.

Current `S3` objects:

- Google / Gemini / Genkit / ADK
- OpenAI Responses / tools / background mode
- Anthropic / MCP / managed-agent surfaces
- Meta / open-weight multimodal and tokenizer signals
- open-source speech and media runtimes (Piper, Coqui TTS, whisper.cpp, Remotion,
  TEN, HyperFrames)

### S4 — Horizon scans

Research that is relevant to the next 6–18 months but should not dominate near-term
implementation.

Current `S4` targets:

1. discrete audio tokenizers and latent bridges
2. deterministic neural decoding in audio and video
3. agent runtime / interactions standards
4. benchmark evolution beyond structural proxies

---

## The sub-directions that matter most

### A. Audio execution and ownership

This is still the most important immediate research line because it directly shapes
`M2`.

Questions:

- which speech path is the right engineering baseline?
- where should route ownership, helper extraction, and manifest authorship sit?
- what should deprecate, and how?

### B. CLI / config / doctor / auth

This is a close second because it controls the real human/agent surface of the system.

Questions:

- what config and auth shape should we borrow?
- what belongs in `doctor`?
- what should stay artifact-first vs become sessionful?

### C. External object studies

This is where Google belongs: important, but as an object of study.

Questions:

- what parts of the Google stack are engineering references?
- what parts are merely fast prototyping surfaces?
- which ideas are worth watching but not importing?

### D. Future benchmark and runtime evolution

This line is important, but should not outrun `M2`.

Questions:

- how should audio evaluation mature?
- how should multimodal agent/runtime standards be tracked?
- when does a working note become a brief or RFC?

---

## External object shortlist

These are the main objects worth studying in this stage.

### Model / vendor stacks

- **Google DeepMind / Gemini** — strong multimodal model stack plus CLI / Genkit /
  AI Studio / ADK ecosystem
- **OpenAI** — Responses API, tools, background execution, file/search/code surfaces
- **Anthropic** — MCP, managed agents, agent-runtime shaping
- **Meta / open-weight lineage** — tokenizer and multimodal training signals

### Engineering frameworks and CLIs

- **Gemini CLI**
- **OpenAI CLI / Responses tooling**
- **MCP ecosystem**
- **Fastify**
- **Hono**
- **tRPC**
- **Express Router**
- **Apollo Federation** as a contrast case

### Media and runtime references

- **Piper**
- **Coqui TTS**
- **whisper.cpp**
- **Remotion**
- **TEN framework**
- **HyperFrames**

These should be used as comparison objects, not default adoption targets.

---

## What should come out of this scope

This stage should produce:

- better `brief` inputs for audio and CLI/runtime questions
- more precise issue framing for bounded engineering work
- clearer `recommend now / keep for future / not now` judgments
- object studies that can be cited later without rerunning the same scan

This stage does **not** need to produce:

- a final paper narrative
- a new doctrine layer
- a full platform rewrite
- immediate implementation commitments for every object studied

---

## Immediate next notes that fit this scope

The next working notes or appendices that would fit cleanly are:

1. **Gemini CLI comparison appendix**
2. **Genkit comparison appendix**
3. **OpenAI Responses / background mode comparison appendix**
4. **MCP and managed-agent standards note**
5. **Video backend classification note** if the video line heats up again

These are all valid under the current scope without forcing a doctrine change.

---

## Relationship to the rest of the research surface

Use this file for the top-level current scope.

Use these companion files for the other layers:

- `docs/research/program.md` — the larger research architecture / track map
- `docs/research/README.md` — what counts as note vs brief vs RFC/ADR follow-through
- `docs/research/briefs/README.md` — claim-bearing brief surface
- `docs/research/google-stack-object-study-2026-04.md` — one example object study

If this file ever starts to read like doctrine, it should be cut back.
