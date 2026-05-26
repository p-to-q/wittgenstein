# RFC-0003 — Naming pass

**Date:** 2026-04-25
**Author:** engineering (@Jah-yee @Moapacha)
**Status:** ⛔ **Superseded by RFC-0005 (2026-04-24)** per `docs/v02-alignment-review.md` §2.2. Kept as a historical record of the naming-pass reasoning; the four proposed names (Loom / Transducer / Score / Handoff) are **not** adopted. See RFC-0005 for the actual locked vocabulary (Codec / IR / Spec / Adapter / Decoder), which matches the original PPT and the existing `AGENTS.md` §Architectural vocabulary.
**Feeds from:** RFC-0001 (Codec Protocol v2), Brief B (agnostic IR)
**Ratified by:** — (superseded before ratification; ADR-0010 also superseded by ADR-0011)

**Summary:** With the codec protocol frozen, we name the four concepts that have been walking around as placeholders — Loom, Transducer, Score, and Handoff — and retire "Parasoid" with prejudice.

---

## Context

This RFC exists because RFC-0001 locked the protocol and nothing else. A protocol can ship with ugly names; a vocabulary cannot. For the last two months the team has been writing docs, Slack messages, and whiteboard sketches using four placeholder terms that are either inherited from earlier drafts or invented ad hoc: "Parasoid" for the middleware layer, "adapter/decoder pair" for the two-sided transform, "Build Artifact" for the intermediate composition, and "IR" for the sum type `Text | Latent | Hybrid` out of Brief B. Each of these is a slot — a shape the architecture now unambiguously has — and each needs exactly one name.

Naming happens now, not earlier, and not later. Earlier was wrong because the protocol was still moving; we would have named abstractions that later fused or split. Later is wrong because the v0.2 action plan locks the thesis as "modality harness for text-first LLMs," and code generation against RFC-0001 begins at P6. If we let code land with `IR` in the type signatures, we will pay a rename cost across every package; if we let "Parasoid" persist into external comms, we inherit a word the inheritance-audit already flagged as retire-with-replacement (biological connotation, unpronounceable outside English, and a live branding risk).

Four hard constraints apply. **Grep-able:** each name must be a single token that survives `rg` without false positives across the monorepo. **Pronounceable in English and 中文:** the team is bilingual; names that require phonetic gymnastics in either language get rejected. **No collision with the incumbent industry vocabulary:** we explicitly avoid Anthropic's "harness," "agent," "tool," "skill" (except where we deliberately extend "harness"); OpenAI's "assistant," "thread"; and LangChain's "chain," "runnable." **Metaphor-coherent:** the chosen names should compose — a reader who learns one should find the others less surprising, not more.

## Proposal

One name per slot. Rejected candidates are listed with the single reason each was dropped; the point of this RFC is to ship, not to survey.

### Slot 1 — the middleware layer (replaces "Parasoid")

Candidates considered: **Conduit, Grafter, Loom, Harness-Extension, Codec-Stack, Bridge, Foyer.**

**Pick: Loom.**

A loom is the machine that weaves threads of one kind (text tokens) into an artifact of another kind (a finished cloth — in our case, a binary, a slide deck, a diff, a score). The metaphor is exact: the harness feeds text to the Loom; the Loom runs the weave; the result is an artifact the underlying model could not have emitted directly. The word is one syllable, pronounceable in both English and 中文 contexts (织机 maps cleanly), grep-unique across our dependency graph, and — crucially — not colonized by any current AI-infrastructure vendor. It carries connotation without being cute: looms are industrial, not whimsical.

- Reject **Parasoid** — biological connotation (parasitoid wasps), unpronounceable to non-English speakers, and already flagged by inheritance-audit.
- Reject **Conduit** — too generic; dozens of SaaS products already occupy this term.
- Reject **Harness-Extension** — redundant; "harness" is already our word, and compound names read as provisional.
- Reject **Grafter, Bridge, Foyer, Codec-Stack** — either wrong metaphor (grafting, foyers) or wrong shape (Codec-Stack describes an implementation, not a concept).

### Slot 2 — the Adapter/Decoder pair at the conceptual level

Candidates considered: **Transducer, Render-Pair, Weaver, L4L5.**

**Pick: Transducer.**

A transducer is, in signal processing, a device that converts signal in one physical form to signal in another. That is exactly what the Adapter/Decoder pair does: it converts a text-token signal into an artifact signal, and in the reverse direction converts artifact telemetry back into token-shaped feedback. "Transducer" covers both directions in a single word, which no other candidate did. It also sidesteps the adapter/adapter-in-PEFT overload — inside an ML codebase, "Adapter" already means a LoRA-style low-rank patch, and we do not want that semantic bleeding into our conceptual layer.

- Reject **Weaver** — collides with Loom; two weaving words in one architecture is one too many.
- Reject **Render-Pair** — hyphenated, and "render" implies one direction only.
- Reject **L4L5** — layer numbers are an implementation fact (cf. the L1–L5 table in `docs/architecture.md`), not a concept name; concept names should survive a layer renumber.

### Slot 3 — the middle "Build Artifact" primitive

Candidates considered: **Blueprint, Plan, Draft, Score (as in music), Cartoon.**

**Pick: Score.**

The Score sits between the Handoff and the final artifact: it is the fully-elaborated, not-yet-rendered composition — every note in place, nothing played. The musical-score metaphor is precise: a score is a complete specification of a performance that has not yet happened. The word is one syllable, already aligns with the user's 作品 (opus / work) framing that runs through the thesis, and extends naturally — "scoring pass," "scoreable," "re-score" are all usable verbs without drift. "Cartoon" (in the fresco sense) was the runner-up for the same metaphor but loses because most readers will think of Saturday-morning animation before Italian frescoes.

- Reject **Blueprint** — too architectural; implies building, not rendering.
- Reject **Plan** — collides with `docs/exec-plans/`, which is already a grep hotspot.
- Reject **Draft** — implies a revision cycle we do not have at this layer.
- Reject **Cartoon** — metaphor is correct but the common reading is wrong.

### Slot 4 — the IR sum type from Brief B (`Text | Latent | Hybrid`)

Candidates considered: **IR, Handoff, Token-Stream, Signal.**

**Pick: Handoff.**

The sum type describes what the LLM hands down to the codec — a packet that may be text tokens, a latent tensor, or a hybrid of both. "Handoff" captures the act of passing, the directionality (model → codec), and remains agnostic on the internal representation. It reads correctly in running prose ("the Loom receives the Handoff and emits a Score"), and it is distinct from the compiler term "IR," which would otherwise overload LLVM/MLIR terminology and make any future cross-team conversation about real IR painful.

- Reject **IR** — generic; collides with LLVM, MLIR, and roughly every compiler course on the internet.
- Reject **Signal** — collides with the sensor-modality sense of "signal" that appears in Brief B's own motivating examples.
- Reject **Token-Stream** — commits too hard to the text case and makes the latent/hybrid variants read as exceptions.

## Interface

The renames are concrete and, because the code hasn't landed yet, mostly cost-free.

**Code-level.** Every instance of `Parasoid` — across packages, Slack channels, internal docs, and commit messages going forward — becomes `Loom`. No current package exports the identifier, so this is a search-and-replace on prose, not a breaking API change. The `#parasoid-dev` Slack channel is archived with a pinned redirect to `#loom-dev`.

**Type-level.** The `IR` type declared in RFC-0001 is renamed `Handoff` at the source. Since RFC-0001 is not yet realized in code (P6 is upcoming), the rename is a one-line change in the RFC document itself and a note in the P6 execution plan:

```ts
// Was (RFC-0001 draft):
// type IR = TextIR | LatentIR | HybridIR;

// Now:
type Handoff =
  | { kind: "Text"; tokens: TokenStream }
  | { kind: "Latent"; tensor: LatentTensor }
  | { kind: "Hybrid"; tokens: TokenStream; tensor: LatentTensor };
```

The `Transducer` name lives at the conceptual layer; in code, the Adapter and Decoder remain distinct types (they have different signatures), but documentation and design discussions refer to the pair as a Transducer.

**Doc-level.** `docs/architecture.md` gains a "Conceptual name" column on the L1–L5 table:

| Layer | Implementation name | Conceptual name        |
| ----- | ------------------- | ---------------------- |
| L1    | Harness             | Harness                |
| L2    | Codec               | Codec                  |
| L3    | Decoder             | Transducer (pair half) |
| L4    | Adapter             | Transducer (pair half) |
| L5    | Packaging           | Packaging              |

L3 and L4 are jointly referred to as the **Transducer** when the pair is the object of discussion.

**Filename-level.** No filenames currently contain "parasoid," so there are no file renames. New files under the Loom concept should live at `packages/loom/` when that package is created in P6.

## Migration

Phased, but the phases are short — this is a docs-only change until P6.

- **M1 (this week).** Land RFC-0003 and open ADR-0010 for ratification. Update `docs/THESIS.md` so the extension-form paragraph uses "Loom" in place of "middleware layer." Update the v0.2 action plan's glossary footnote.
- **M2 (single sweep PR, within 7 days of M1).** Rewrite all existing docs that reference "Parasoid," "IR" (in the Brief-B sense), "Build Artifact," or "adapter/decoder pair" to use the new vocabulary. One PR, one reviewer pass, low-risk because nothing executable is touched. Include a `grep -r Parasoid` check in CI to prevent regressions.
- **M3 (at P6, when RFC-0001 lands in code).** The type is born as `Handoff`, not renamed into it. Zero rename cost because the identifier never existed in code as `IR`.
- **M4 (within 14 days of M1).** Create `docs/glossary.md` with the four names, one paragraph each, in English and 中文. The glossary is the canonical disambiguation page and the first thing a new contributor is pointed at.

**Kill date.** RFC-0001 M1 — the PR that introduces the protocol interface in code — MUST land with `Handoff` as the type name. If that PR is merged with `IR` in the signature, this RFC has failed its primary job and must be revised before any further code lands against the protocol.

## Red team

**"This is bikeshedding before code ships."** It would be, if the alternative were cheap. It is not: every week we delay, more prose accumulates under the placeholder names, and the rename cost grows linearly. Naming before code is the shape of the trade — cheap now, expensive later. We are explicitly choosing cheap.

**"'Loom' is whimsical; industry prefers boring names like Gateway, Bridge, Router."** Those names are colonized. Every one of them lives in dozens of namespaces already — search any of them and you get noise, not signal. Distinctiveness is a feature here: "Loom" is grep-unique, the weaving metaphor matches the harness framing, and it reads as a proper-noun concept rather than a generic piece of plumbing. Boring names are a luxury for architectures that already own their vocabulary.

**"'Transducer' already means something specific in Clojure and in signal processing; users will be confused."** The signal-processing meaning _is_ our meaning — text signal in, artifact signal out. Clojure's transducers are a different community with a different context; in a Wittgenstein code review or design doc, the meaning resolves from context without ambiguity. If this does cause confusion, the glossary handles it in one sentence.

## Kill criteria

Any of the following forces a revisit:

- **Discovery failure.** If more than one external contributor in the first 90 days post-adoption asks "what is a Loom" in a way that indicates they could not intuit it from context, the name has failed discovery and will be replaced.
- **2 a.m. agent-call test.** If, six months in, an on-call engineer cannot use any of the four names unambiguously in a high-pressure debugging conversation — i.e. has to stop and say "I mean the middleware thing" — that name has failed and is replaced.
- **Industry collision.** If a major vendor (Anthropic, OpenAI, Google, Meta) ships a public product that claims one of these four terms in a colliding sense, we reassess that one name within 30 days.
- **Metaphor collapse.** If the architecture evolves such that Loom no longer weaves, or Score no longer precedes performance, the metaphor has broken and the name must follow the concept out.

If none of these fires within a year, the vocabulary is genuinely settled and this RFC is closed as effective.

## Decision record

- **Accepted by:** ADR-0010 (pending)
- **Superseded by:** —
