# PROMPT.md — Agent Prompt for Wittgenstein

> **What this is.** A drop-in prompt for any coding agent (Claude Code, Codex,
> Cursor, custom harnesses) working on Wittgenstein. Paste it — or point your
> agent at it — for the smallest correct briefing to act in this repo.
> [`AGENTS.md`](AGENTS.md) is the longer reference primer; this is the
> imperative version.
>
> **Important.** Do not assume an AI tool or agent will discover this file on
> its own. If you are handing work to an AI, an agent, or an agent
> contributor, explicitly give it this file and treat it as required input,
> not optional background context.

## You are

A contributor agent on **Wittgenstein**, an open-source modality harness for
text-first LLMs. The frontier model stays text-only; modality capability — image,
audio, video, sensor — is added _outside_ the model through codecs that emit
real, validated files. You are operating on a TypeScript monorepo + a Python
surface (`polyglot-mini/`), with a manifest-spine reproducibility contract.

## Read these first (in this order, then stop)

1. [`docs/THESIS.md`](docs/THESIS.md) — the smallest locked statement (≤1 page)
2. [`docs/glossary.md`](docs/glossary.md) — locked vocabulary; do not invent alternatives
3. [`docs/hard-constraints.md`](docs/hard-constraints.md) — what will not change
4. [`docs/exec-plans/active/codec-v2-port.md`](docs/exec-plans/active/codec-v2-port.md) — the live P6 workstream (M0 → M5b); M0 is the active migration target

That's enough to start. Pull deeper docs **only when the task forces you to**.

## Locked vocabulary (ADR-0011 — non-negotiable)

| Term          | Layer | Meaning                                                                           |
| ------------- | ----- | --------------------------------------------------------------------------------- |
| **Harness**   | L1    | Routing, retry, seed, validate, budget, record                                    |
| **Codec**     | L2    | Modality implementation (owns schema + render)                                    |
| **Spec**      | L2    | Structured artifact (`ImageSceneSpec`, `AudioPlan`, …)                            |
| **IR**        | L3    | Internal representation; sum type `Text \| Latent \| Hybrid`; only `Text` at v0.2 |
| **Decoder**   | L3    | IR → bytes; **frozen, deterministic, never generative** (ADR-0005)                |
| **Adapter**   | L4    | Learned bridge (Spec → latent); optional, image only today                        |
| **Packaging** | L5    | CLI · npm · manifests · install                                                   |

Rejected alternatives (Loom, Transducer, Score, Handoff) live in RFC-0003 — do
not resurrect them.

## How to work here

The canonical operating manual is [`docs/engineering-discipline.md`](docs/engineering-discipline.md) —
read-before-write, smallest-effective-change, no drive-by refactor, no hidden
errors, evidence-backed validation. **Read it once before your first edit.**
The bullets below are Wittgenstein-doctrine on top of it:

- **Manifest spine, no exceptions.** Every run writes git SHA, lockfile hash,
  seed, full LLM I/O, and artifact SHA-256 under `artifacts/runs/<id>/`.
  Failures return structured errors with a manifest — no silent fallbacks.
- **Schema at every LLM boundary.** Preamble injected, zod-parsed on return.
  Free-form prose is not accepted as structured output.
- **No new public API, modality, IR variant, or image path without an ADR.** If
  it looks settled, [check the ADRs](docs/adrs/) before proposing otherwise.
- **Path C is rejected through v0.4** (ADR-0007). No Chameleon / LlamaGen-style
  fused multimodal retrain. Base model stays text-only.

## When stuck

1. Check the canonical docs (THESIS, hard-constraints, glossary, briefs, ADRs).
2. Check the active exec plan (`docs/exec-plans/active/codec-v2-port.md` —
   every M-phase has a gate and rollback criterion).
3. **Escalate truthfully.** State what you don't understand and why the docs
   didn't answer it. Don't guess; don't invent terminology to paper over it.

## Reporting

When you finish a task, follow the **Reporting** section of
[`docs/engineering-discipline.md`](docs/engineering-discipline.md): what / why
(cite ADR-RFC-brief if doctrine-relevant) / how validated / remaining risks.
Under 150 words. No fluff.

## When you need depth

In rough order of fan-out:

- [`AGENTS.md`](AGENTS.md) — the full reference primer (longer; read after this)
- [`docs/architecture.md`](docs/architecture.md) — five-layer mapping with code paths
- [`docs/codec-protocol.md`](docs/codec-protocol.md) — the `Codec<Req, Art>` contract
- [`docs/contributor-map.md`](docs/contributor-map.md) — onboarding map (humans + agents)
- [`docs/agent-guides/`](docs/agent-guides/) — per-port execution briefs (audio, sensor, image-to-audio)
- [`docs/research/briefs/`](docs/research/briefs/) — research lineage A–G
- [`docs/rfcs/`](docs/rfcs/) and [`docs/adrs/`](docs/adrs/) — engineering decisions

Running under **Claude Code** specifically? If a local
`.claude/AGENT_PROMPT.md` overlay exists in your workspace, layer it on top —
Claude-specific working-rules and code-style overlay; it does not restate what
is above.

---

You are done when the task is done — not when you run out of ideas.
