# Google Stack Object Study — 2026-04

**Date:** 2026-04-27  
**Status:** Working note v0.1  
**Purpose:** Record one concrete object study inside the broader current-stage research
scope: the Google / Gemini / Genkit / ADK stack.

---

## Why Google is worth studying

Google matters here for two reasons:

1. it has unusually broad multimodal model capability and research depth
2. it exposes not just models, but a full developer stack:
   - API
   - prototyping surface
   - CLI
   - app framework
   - agent framework

That makes Google a good object study for Wittgenstein.

It does **not** make Google the umbrella of our research program.

---

## What this object study is trying to answer

For the current repo stage, the useful question is not:

> "Should Wittgenstein become Google-shaped?"

The useful questions are:

- what can we borrow from Google's tool and runtime surfaces?
- what should we watch because it may matter later?
- what should we explicitly reject for the current stage?

---

## The Google stack, split by role

### 1. Google DeepMind / Gemini models

Google is one of the strongest current examples of a lab pushing fully multimodal base
models. This matters to Wittgenstein as an upper-bound comparison object:

- native multimodal capability
- strong audio work
- strong image/video understanding and generation
- evidence that the frontier continues to reward broad multimodal training

This is strategically important context, but it does **not** directly overturn the
repo's text-first harness thesis for the current stage.

### 2. Google AI Studio

AI Studio is a fast prototyping and developer onboarding surface.

Useful to us as:

- a reference for research velocity
- a reference for prototype acceleration
- a reminder that code generation, model testing, and API experimentation are
  converging

Not useful as:

- a canonical repo workflow
- a substitute for our own manifest / RFC / ADR discipline

### 3. Gemini Developer API

Useful because it exposes several interaction shapes cleanly:

- standard request/response
- streaming
- real-time audio/video interaction
- files and utility endpoints

This is a good runtime reference and a good comparison object for our own interface and
provider thinking.

### 4. Gemini CLI

This is the most immediately useful Google object for the repo.

Why:

- auth and settings surface
- project-scoped behavior
- structured output posture
- command vocabulary
- tool / MCP integration stance

Gemini CLI should be treated as a first-class comparison object for:

- CLI ergonomics
- auth
- doctor / config / provenance design

### 5. Genkit

Genkit is likely the most directly relevant Google-owned engineering reference for the
repo's near-term and medium-term work.

Why:

- multi-provider posture
- local developer tooling
- flow-oriented app structure
- evaluation primitives
- observability

This makes Genkit especially relevant to:

- future evaluation work
- runtime/devtool shape
- how we think about packaging and developer experience

### 6. ADK

ADK matters as a future-facing agent-system reference.

It is useful for:

- agent/workflow/team framing
- deployment posture
- observability and operations thinking

It is **not** currently a direct implementation target for this repo.

### 7. Interactions API

This is a watch-list object.

It matters because it hints at a possible convergence between:

- model calls
- agent calls
- tool/runtime orchestration

But at the current stage, it is still a "watch" item, not something to mirror.

---

## What Google suggests, and what it does not

### Suggests

- multimodal capability continues to move toward deeper model integration at the
  frontier
- audio is becoming a first-class capability, not an add-on
- tool/runtime/developer surfaces are increasingly part of the platform story
- developer UX now matters almost as much as model quality

### Does not suggest

- that our repo should abandon the text-first harness thesis now
- that AI Studio should become our canonical workflow
- that we should center current implementation around Google-specific products

---

## Current verdict

### Recommend now

- use **Gemini CLI** as a comparison object for CLI/auth/config design
- use **Genkit** as a comparison object for evaluation, devtools, and app/runtime
  posture
- keep **Gemini API** in the runtime/provider comparison set

### Keep for future

- **ADK**
- **Interactions API**
- broader DeepMind multimodal research as a continuing horizon signal

### Reject for current stage

- making Google the umbrella of the repo's research scope
- treating AI Studio as a replacement for our internal research surfaces
- importing Google-specific cloud/runtime assumptions into doctrine

---

## Follow-up hooks

If this object study is continued, the next useful follow-ups are:

1. Gemini CLI comparison appendix
2. Genkit comparison appendix
3. Google multimodal / native audio comparison note against the repo's audio and
   harness thesis

This note should stay one object study among several, not the whole research frame.

---

## Sources used in this note

- Google Gemini API / AI Studio docs:
  - `https://ai.google.dev/api`
  - `https://ai.google.dev/gemini-api/docs/aistudio-build-mode`
- Google Cloud / Google blogs:
  - `https://cloud.google.com/ai/gemini`
  - `https://blog.google/technology/google-deepmind/gemini-2-5-native-audio`
  - `https://blog.google/innovation-and-ai/models-and-research/google-deepmind/google-gemini-updates-io-2025/`
  - `https://blog.google/innovation-and-ai/technology/developers-tools/interactions-api/`
- Google ecosystem tooling:
  - `https://adk.dev/`
  - `https://genkit.dev/docs/`
  - `https://github.com/google-gemini/gemini-cli`
