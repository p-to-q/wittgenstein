# Research Surface

This folder holds research material that is useful to Wittgenstein but does not all
play the same role.

If you want the top-level aggregation first, start with:

- [`program.md`](program.md)

The most important distinction is:

- a **Research Note** is a scoped working note or broad scan
- a **Brief** is a pressure-tested claim with a verdict shape
- an **RFC / ADR** is where a claim becomes a decision

If you do not keep those roles separate, research either turns into noise or gets
mistaken for doctrine too early.

---

## The four research surfaces

### 1. `briefs/` — claim-bearing research

Use `docs/research/briefs/` when the work is trying to answer a concrete question that
can survive a proper pressure test.

A brief is expected to have:

- `## Steelman`
- `## Red team`
- `## Kill criteria`
- `## Verdict`

If the work cannot yet support that shape, it is probably not a brief yet.

Canonical index:

- [`briefs/README.md`](briefs/README.md)

### 2. top-level `docs/research/*.md` — research notes and long-form references

Use the top level of `docs/research/` for material that is useful, but not yet ready to
behave like a brief.

This includes:

- scoped research programs
- broad scans
- long-form literature synthesis
- engineering-borrow notes
- future-watch notes

Examples:

- [`current-stage-scope-2026-04.md`](current-stage-scope-2026-04.md)
- [`google-stack-object-study-2026-04.md`](google-stack-object-study-2026-04.md)
- [`compression-view-of-llms.md`](compression-view-of-llms.md)
- [`frozen-llm-multimodality.md`](frozen-llm-multimodality.md)

These files are allowed to be exploratory. They are **not** ratified decisions.

### 3. subfolders like `www.aquin.app/` — captured research artifacts

Use a subfolder when the research includes files, scripts, captures, or scraped
surfaces that would clutter a plain note.

Example:

- [`www.aquin.app/`](www.aquin.app/)

These are not doctrine and are usually not meant to be read like briefs. They exist so
the provenance of a research pass is preserved.

### 4. RFC / ADR follow-through

Research leaves this folder when it becomes either:

- an **RFC** — proposal, interface, migration, or design decision under discussion
- an **ADR** — ratified decision

That is the point where the repo is no longer just "thinking about" something.

---

## The conversion chain

The normal chain is:

`finding -> research note -> brief / issue -> RFC -> ADR / exec-plan -> code`

Not every item travels the whole chain.

### Typical routes

- **finding -> note -> issue**
  - when the result is a bounded follow-up task
- **finding -> note -> brief**
  - when the result is becoming a real claim
- **finding -> note -> RFC**
  - when the result is primarily about interface or migration shape
- **finding -> note -> nowhere**
  - when the note is still useful as a watchlist, but not yet mature enough to promote

The mistake to avoid is forcing every note into a decision artifact too early.

---

## Promotion rules

Promote a research note to a brief when it has:

- one clear question
- enough evidence for a serious steelman and red-team pass
- a kill criterion that can actually fail
- a verdict that means something for the repo

Promote a note to an RFC when its main output is:

- interface shape
- migration shape
- CLI / config / UX proposal
- protocol / ownership split

Create an issue instead when the outcome is:

- a bounded audit
- a cleanup task
- a concrete implementation follow-up

Leave the note in place when it is:

- a broad scan
- a watchlist
- a source of external engineering references
- useful context that is not yet decision-grade

---

## Internal rule of thumb

Use these labels when closing out any research pass:

- `recommend now`
- `keep for future`
- `reject for current stage`
- `needs RFC`
- `needs prototype`
- `not now`

Those labels are lightweight, but they stop research from dissolving into vague prose.

---

## What this folder should not become

- not a second doctrine surface
- not a graveyard of random markdown
- not a substitute for RFCs or ADRs
- not a place to hide decisions that should be explicit elsewhere

If a file here is being cited like policy, promote it or rewrite it.
