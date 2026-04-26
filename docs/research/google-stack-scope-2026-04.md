# Google Stack Research Scope — 2026-04

**Date:** 2026-04-27  
**Status:** Working note v0.1  
**Purpose:** Define a tight research program for the repo's current stage, then record the first Google/Gemini-specific findings that are relevant to Wittgenstein's execution and future architecture.

---

## Why this note exists

Wittgenstein is no longer in the "what even is this repo?" stage. The doctrine is
locked enough that broad research should now serve execution instead of replacing it.

That changes how research should be organized:

- not everything needs a four-station brief immediately
- not everything should be turned into an RFC
- but we still need a place to capture broad scans, external engineering references,
  and "where should we look next?" decisions

This note is that place for the current stage.

It is **not** doctrine. It is a scoped research program plus an initial set of
Google/Gemini findings that are worth keeping in the repo.

---

## Current stage and constraints

This note assumes the repo is at the following stage:

- `M0` protocol adoption is the executed baseline
- `M1A` image protocol port is the hardest-case precedent
- `M2` audio is the next execution line, but is **not** to be implemented from this note
- current work should improve the quality of the next decision or port, not silently
  reopen doctrine

Before extending this note, re-read these repo-local baselines first:

- `docs/THESIS.md`
- `docs/engineering-discipline.md`
- `docs/exec-plans/active/codec-v2-port.md`
- `docs/agent-guides/audio-port.md`
- `docs/research/briefs/D_cli_and_sdk_conventions.md`
- `docs/research/briefs/H_codec_engineering_prior_art.md`

The relevant hard boundaries are:

- image keeps one shipping raster path
- decoder is not generator
- `Codec<Req, Art>.produce()` remains the protocol center
- manifest spine stays non-negotiable
- research may widen scope, but doctrine changes still require the normal chain

---

## Research scope framework

This round is intentionally split into three layers.

### P0 — Research that directly serves the next execution line

Use this layer when the output should feed an issue, an exec-plan amendment, a brief,
or a port guide within the next one or two phases.

Current P0 topics:

1. `audio` runtime and decoder-family landscape
2. `audio` route / CLI / config / provenance engineering
3. request-surface cleanup (`--route`, auth, doctor, output contracts)

### P1 — Engineering-borrow research

Use this layer for existing projects whose structure, interfaces, or workflows are
worth copying in shape, even if their code is not imported directly.

Current P1 topics:

1. route composition and sub-router ownership
2. CLI / auth / config surface conventions
3. artifact, evaluation, and observability surfaces

### P2 — Broad but relevant horizon scan

Use this layer when the result is not for the immediate next PR, but may change the
v0.3–v0.4 roadmap or influence what future briefs should exist.

Current P2 topics:

1. discrete audio tokenizers and latent bridges
2. deterministic neural decoding in audio and video
3. agent runtime / interactions standards
4. evaluation and observability primitives for multimodal systems

---

## What should land where

The output of a research pass should not be guessed at PR time. Route it deliberately.

| If the result is…                              | Land it as…                      |
| ---------------------------------------------- | -------------------------------- |
| a concrete claim that can be pressure-tested   | a **brief**                      |
| a protocol or UX proposal                      | an **RFC**                       |
| a settled, ratified design rule                | an **ADR**                       |
| a follow-up task with bounded engineering work | an **issue**                     |
| a still-fuzzy direction or broad scan          | a **working note** like this one |

Use these labels when concluding a research pass:

- `recommend now`
- `keep for future`
- `reject for current stage`
- `needs RFC`
- `needs prototype`
- `not now`

---

## External project shortlist for this round

These are the most relevant external engineering references for the current stage.

### Route / composition references

- **Express Router** — flat, explicit route ownership
- **Hono** — thin child surfaces and lightweight route composition
- **Fastify** — plugin encapsulation and scope control
- **tRPC** — router ownership and caller-facing clarity
- **Apollo Federation** — useful contrast case for what _not_ to over-import into a
  small codec system

### Media / AI tool surface references

- **Gemini CLI** — auth, configuration, structured output, local project context,
  command surface
- **Piper** — local TTS posture and low-friction file output
- **Coqui TTS** — model-family and inference-surface reference
- **whisper.cpp** — file-first CLI ergonomics and native-ish deployment posture
- **Remotion** — programmatic media composition and packaging posture

### Google-specific references

- **Google AI Studio** — fast-path prototyping and Build mode
- **Gemini Developer API** — standard / streaming / live / file endpoints
- **Interactions API** — emerging model + agent interface
- **ADK** — agent framework surface and multi-agent runtime ideas
- **Genkit** — multi-provider app framework, local devtools, and evaluation surface

---

## Initial findings: Google as a research object

Google is worth studying here, but not because the repo should become "Google-native."
It is worth studying because Google now exposes a **stack**, not just models:

1. **Google AI Studio** is the fast path for trying Gemini models and prototyping with
   the Gemini Developer API. Google explicitly positions AI Studio as the quickest way
   for developers, students, and researchers to get started, while Vertex AI is the
   scale-up path for enterprise deployment.  
   Source: Google Cloud's Gemini overview and AI Studio docs.

2. **Gemini API** exposes several interaction shapes that are relevant to our own
   thinking about modality and runtime boundaries:
   - standard request/response
   - streaming response
   - real-time bidirectional Live API
   - batch mode
   - file upload / token counting utility endpoints  
     This is useful to Wittgenstein not because we should mirror the API, but because it
     shows a clean separation between generation modes and utility surfaces.  
     Source: Gemini API reference.

3. **Google AI Studio Build mode** is a strong reference for _research velocity_ and
   _prototype acceleration_, but not a good canonical workflow for this repo. Google
   now documents Build mode as a full-stack app generator with server-side runtime, npm
   support, code export, and GitHub push. It is useful to us as a prototyping object
   and as evidence that "research tool" and "code generator" have converged. It is not
   a replacement for our docs / RFC / ADR / manifest discipline.  
   Source: AI Studio Build docs.

4. **Interactions API** matters because Google is explicitly trying to unify "model
   calls" and "agent calls" behind one interface. That is conceptually adjacent to our
   own harness concerns. But Google also says the Interactions API is public beta and
   that `generateContent` remains the primary production path for standard workloads.
   So this is a **watch closely**, not a **mirror now**.  
   Source: Google developer blog post on Interactions API.

5. **ADK** is relevant as a production-agent reference, not as a direct template for
   Wittgenstein. The key takeaways are:
   - multi-language support
   - explicit agent / workflow / team framing
   - "build production agents, not prototypes"
   - deployment and observability posture  
     This is helpful for how we think about agent contributors and future runtime
     layering, but it is not the next code move for this repo.  
     Source: ADK docs.

6. **Genkit** is currently the strongest Google-owned engineering reference for our
   near-term work, because it already combines:
   - multi-provider support
   - local CLI and developer UI
   - flows and structured generation
   - evaluation surfaces
   - production observability  
     This makes Genkit more relevant to Wittgenstein's medium-term packaging and eval
     questions than AI Studio itself.  
     Source: Genkit overview and evaluation docs.

7. **Gemini CLI** is useful as a modern CLI reference, especially around:
   - auth paths (Google account / API key / Vertex)
   - environment + settings-based configuration
   - project-scoped session behavior
   - structured output and automation surfaces
   - tool and MCP integrations  
     This is directly relevant to our CLI / doctor / auth line and should be treated as
     a first-class comparison object in future CLI work.  
     Source: Gemini CLI docs and repo docs.

---

## Initial verdicts

### Recommend now

- Study **Gemini CLI** as a living CLI/auth/config reference.
- Study **Genkit** for evaluation, local devtools, and multi-provider app posture.
- Treat **Google AI Studio** as a prototyping and research-velocity reference, not as
  a canonical repo workflow.

### Keep for future

- **ADK** as a future reference if the repo's agent/runtime surface becomes more
  explicit after the current port line.
- **Interactions API** as a watch-list item for model-vs-agent interface evolution.

### Reject for current stage

- Reorienting the repo around AI Studio Build mode.
- Adopting Google-specific cloud/runtime assumptions into the core doctrine.
- Letting "agent platform" ideas outrun the current `M2 -> M3` execution sequence.

### Needs RFC or prototype later

- Any move from our current CLI shape toward a richer interactive / sessionful surface.
- Any deeper alignment with agent-runtime standards beyond local contributor guidance.
- Any serious evaluation surface inspired by Genkit's built-in evaluators and devtools.

---

## Practical guidance for the next passes

If we continue this research line, the next useful passes are:

1. a **Gemini CLI comparison appendix** inside the CLI / SDK brief line
2. a **Genkit comparison appendix** inside the benchmark / evaluation line
3. a **Google stack vs repo-stage** note that explicitly maps:
   - AI Studio → prototype velocity
   - Gemini API → provider/runtime reference
   - Interactions API → future watch
   - ADK → future agent-system watch
   - Genkit → strongest packaging/eval reference

None of these require code changes first.

---

## Sources used in this note

- Google AI Studio / Gemini Developer API docs:
  - `https://ai.google.dev/api`
  - `https://ai.google.dev/gemini-api/docs/aistudio-build-mode`
- Google developer / product pages:
  - `https://cloud.google.com/ai/gemini`
  - `https://blog.google/innovation-and-ai/technology/developers-tools/interactions-api/`
- Google-owned framework / tooling docs:
  - `https://adk.dev/`
  - `https://genkit.dev/docs/js/overview/`
  - `https://genkit.dev/docs/go/evaluation/`
  - `https://google-gemini.github.io/gemini-cli/docs/`
  - `https://github.com/google-gemini/gemini-cli/blob/main/docs/get-started/index.md`
  - `https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md`
