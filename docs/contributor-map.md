# Contributor Map

This is the shortest useful onboarding file for a maintainer or contributor entering the repo after the v0.2 restructuring. It is written for both humans and agents.

## 1. Mental model

Wittgenstein is not "a bunch of prompts." It is a harness-first multimodal system with a fixed doctrine:

- the LLM is the planner;
- the repo runtime is the operating system;
- modality capability lives in codecs and decoders;
- every meaningful run leaves receipts.

If you keep that frame, the repo reads cleanly.

## 2. Read this first

1. `AGENTS.md`
2. `docs/engineering-discipline.md`
3. `docs/THESIS.md`
4. `docs/tracks.md`
5. `docs/inheritance-audit.md`
6. `docs/rfcs/README.md`
7. `docs/adrs/README.md`
8. `docs/research/briefs/README.md`
9. `docs/exec-plans/active/codec-v2-port.md`

That order gets you from doctrine → review model → decisions → execution.

One extra rule now applies across all doctrine-bearing work: the author does not count as the sole reviewer. If a PR changes doctrine, exec plans, shared contracts, or codec-shape assumptions, it needs a second independent review pass before merge.

## 3. Repo shape

### System of record

- `docs/THESIS.md` — smallest locked statement
- `docs/tracks.md` — Researcher track ↔ Hacker track contract
- `docs/inheritance-audit.md` — what is keep / promote / revise / retire
- `docs/rfcs/` — proposal layer
- `docs/adrs/` — ratified decisions
- `docs/exec-plans/` — phase-by-phase execution

### Runtime and contracts

- `packages/schemas/` — zod schemas and shared types
- `packages/core/` — harness runtime
- `packages/codec-*` — modality implementations
- `packages/cli/` — user-facing entrypoint

### Extended context

- `packages/agent-contact-text/` — long-form context for humans and agents
- `docs/research/briefs/` — research pressure tests
- `docs/agent-guides/` — prompt-ready implementation guides for agents
- `docs/engineering-discipline.md` — the sharp house style for reading before writing, minimal diffs, and evidence-backed validation

## 4. Two contributing lines

There are two explicit lines in the repo now. They should stay separate in review even when they touch nearby files.

### Line A — doctrine / maintenance / structure

This line is for people co-maintaining the repo itself.

Typical work:

- tighten wording in `THESIS.md`
- add or amend briefs / RFCs / ADRs
- improve agent-readability
- keep CONTRIBUTING / AGENTS / docs index surfaces coherent
- audit drift before large implementation work lands

Success criterion:

- a new contributor can orient themselves without chat history.
- they also know the repo's engineering tone before they touch code.

### Line B — image → audio execution

This line is for the first concrete protocol port sequence.

Order is fixed:

1. image
2. audio
3. sensor
4. cleanup
5. benchmark bridge

Why:

- image is the hardest and most thesis-defining case;
- audio follows once the protocol survives image;
- sensor is the confirmation case, not the discovery case.

Success criterion:

- the image path proves the protocol shape;
- audio inherits it cleanly without re-opening doctrine.

## 5. How to add a new thing

### New research claim

Write a brief first.

Required headings:

- `Steelman`
- `Red team`
- `Kill criteria`
- `Verdict`

### New engineering decision

Write or amend an RFC first, then ratify in an ADR.

### New implementation phase

Put it in an exec plan. Do not bury sequencing in a PR body.

### New modality or route

Do not bypass the doctrine files. Check:

- `AGENTS.md`
- `docs/hard-constraints.md`
- `docs/rfcs/0001-codec-protocol-v2.md`
- the active exec plan

## 6. How to review a PR

Every substantial PR gets two hats:

- **Researcher hat:** is the claim still consistent with the relevant brief / ADR?
- **Hacker hat:** can an agent implement or extend this without guessing?

And for doctrine-bearing PRs, those hats must be worn by at least two independent passes. The author can prepare and validate the PR, but should not count their own pass as the ratification step.

If either answer is no, the PR is not ready.

The shortest companion to this review section is `docs/engineering-discipline.md`; it is the file that turns "be careful" into actual edit discipline.

## 7. What not to do

- do not add a second raster image path "temporarily"
- do not reintroduce Loom / Transducer / Score / Handoff
- do not make the harness modality-branch again
- do not treat `polyglot-mini` experiments as doctrine automatically
- do not hide a design decision inside a PR description instead of an RFC / ADR

## 8. When in doubt

Prefer:

- fewer concepts
- more receipts
- clearer route boundaries
- image-first pressure testing
- agent-readable docs over clever prose
