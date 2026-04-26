# Research/System Audit — 2026-04

**Date:** 2026-04-27  
**Status:** Working note v0.1  
**Purpose:** Audit the repo's current research surfaces before Claude-side work resumes, focusing on three questions:

1. are `Research Note -> Brief / RFC / ADR` transitions clear in practice, or mostly clear in theory?
2. in current `audio / CLI / runtime` docs, which statements read like decisions even though they are still implementation hypotheses?
3. among older long-form research notes, which should be reclassified, archived, split, or left alone?

This note is an audit artifact, not doctrine and not an implementation brief.

---

## Stage and boundaries

This audit assumes the repo is in the post-`M0`, post-`M1A`-planning, pre-`M2`
implementation stage described by the current docs stack:

- `docs/THESIS.md`
- `docs/research/program.md`
- `docs/research/README.md`
- `docs/exec-plans/active/codec-v2-port.md`
- `docs/agent-guides/audio-port.md`
- `docs/research/briefs/D_cli_and_sdk_conventions.md`
- `docs/rfcs/0002-cli-ergonomics.md`

Out of scope for this audit:

- implementing `M2`
- reviewing or ratifying PR #72
- replacing Claude's blocked decoder/model-side research line
- normalizing or deleting local branches

The job here is to make the research/decision surface easier to trust, not to expand the
project's doctrine.

---

## Executive judgment

The repo's research system is now structurally reasonable, but it reached that state in
layers rather than all at once.

Two things are true at the same time:

1. the current model is mostly sound:
   - `brief -> RFC -> ADR -> exec-plan -> code` is a real operating pattern
   - `Research Note` now has a useful home and a promotion path
   - top-level research aggregation (`program.md`) exists and is coherent
2. there is still residual drift from the earlier phase:
   - some execution docs still phrase hypotheses as if they were settled decisions
   - some theory/reference files were still grouped as generic notes when they are
     actually different note subtypes
   - branch state is noisier than the docs state and should be treated as a later hygiene pass

Net: the system does **not** need a new layer. It needs light reclassification, better
distinction between hypothesis and ratified decision, and a later branch cleanup once
active reviews settle.

---

## 1. Conversion audit — how research actually becomes decisions

### Working conclusion

`docs/research/README.md` now captures the intended conversion chain correctly:

`finding -> research note -> brief / issue -> RFC -> ADR / exec-plan -> code`

But the repo's real history shows that the chain is often **compressed** rather than
walked literally. The important question is therefore not "did every item pass every
stage," but "is it still clear which surface currently owns the claim?"

### Concrete conversion examples

| Example                            | Observed chain in practice                                                                                                                                                                                                                                                        | Assessment                                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CLI/runtime surface                | `finding` from external CLI survey -> [Brief D](briefs/D_cli_and_sdk_conventions.md) -> [RFC-0002](../rfcs/0002-cli-ergonomics.md) -> [ADR-0009](../adrs/0009-cli-ergonomics-v2.md) -> [Issue #77](https://github.com/wittgenstein-cli/wittgenstein/issues/77) for implementation | Strong brief-to-RFC-to-ADR pattern; code follow-through is intentionally still open                                                      |
| Codec v2 engineering shape         | code-smell inventory + prior-art findings -> [Brief H](briefs/H_codec_engineering_prior_art.md) -> [RFC-0001](../rfcs/0001-codec-protocol-v2.md) -> [ADR-0008](../adrs/0008-codec-protocol-v2-adoption.md) -> `exec-plan` / `agent-guides` / code-port line                       | Strong decision ownership; the remaining risk is execution docs overstating particular implementation tactics                            |
| Site/repo narrative reconciliation | capture + repo drift -> [Brief F](briefs/F_site_reconciliation.md) -> [RFC-0004](../rfcs/0004-site-reconciliation.md) -> docs/site follow-through                                                                                                                                 | Good example of a reversible, ops-style RFC path that does **not** need an ADR                                                           |
| Naming lock                        | alignment review finding -> [RFC-0005](../rfcs/0005-naming-lock-v2.md) -> ADR-0011 (ratified) -> glossary / AGENTS / docs surface                                                                                                                                                 | Clear example that some claims can move directly from finding to RFC when they are interface/governance-heavy rather than research-heavy |

### Ambiguous or still-young boundaries

Two boundary zones are still not fully settled in practice:

1. **scope note vs object study vs theory note**
   - this is now understandable, but only because `program.md`, `current-stage-scope-2026-04.md`, and the Google object study were created very recently
   - before that, object research could too easily masquerade as stage scope

2. **prior-art brief vs execution hypothesis**
   - Brief H is correctly labeled as prior-art research, but parts of the downstream
     `audio-port.md` / `codec-v2-port.md` surfaces still sound more ratified than the evidence warrants

### Is `docs/research/README.md` sufficient?

**Judgment:** mostly yes, with one small clarification follow-up.

The overall policy is now strong enough, but it benefited from an added clarification:
top-level research notes are not one undifferentiated bucket. The distinction between
**scope notes**, **object studies**, **theory notes**, and **reference sheets** should be explicit.

That is a lightweight taxonomy clarification, not a new research layer.

---

## 2. Hypothesis-vs-decision audit — audio / CLI / runtime

### Classification rules used here

- **locked decision** — already ratified by ADR or clearly owned by an accepted RFC
- **current best hypothesis** — a plausible execution/default choice, but not yet a ratified policy
- **needs research before ratification** — important, but upstream evidence is still incomplete
- **drift / should be rewritten** — wording is stale or stronger than the repo's actual state

### Findings

| Surface                                                                      | Statement or pattern                                               | Classification                                          | Why                                                                                                                  |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `docs/agent-guides/audio-port.md`                                            | "collapsing the ~80-line route copy-paste"                         | drift / should be rewritten                             | the current repo reality no longer cleanly supports the exact framing; it overstates an older code-shape diagnosis   |
| `docs/agent-guides/audio-port.md`                                            | "`BaseAudioRoute` is the port's win"                               | drift / should be rewritten                             | current engineering prior art supports `helper functions first`; this reads more settled than the evidence justifies |
| `docs/agent-guides/audio-port.md`                                            | "route files should be ≤20 lines"                                  | current best hypothesis                                 | a good engineering budget, but not a ratified doctrine rule                                                          |
| `docs/agent-guides/audio-port.md`                                            | "`AudioRequest.route` soft-warn deprecation for one minor version" | current best hypothesis                                 | reasonable and likely, but still an execution contract rather than a locked governance rule                          |
| `docs/exec-plans/active/codec-v2-port.md`                                    | `Status: Plan ready — awaiting M0 kickoff`                         | drift / should be rewritten                             | the repo has moved past that framing; even if code/reviews are not fully closed, the status language is stale        |
| `docs/exec-plans/active/codec-v2-port.md`                                    | M2 framed as "eliminates the 80-line route copy-paste"             | drift / should be rewritten                             | same problem as the guide; too specific and too historical                                                           |
| `docs/exec-plans/active/codec-v2-port.md`                                    | `AudioRequest.route` deprecation gate                              | current best hypothesis                                 | a valid execution target, but still pending implementation and final M2 evidence                                     |
| `docs/research/briefs/D_cli_and_sdk_conventions.md`                          | `--json`, stderr discipline, config precedence, one-line install   | locked decision                                         | these have already been carried into RFC-0002 and ratified by ADR-0009                                               |
| `docs/research/briefs/D_cli_and_sdk_conventions.md`                          | no primary REPL, no user-facing `--model`                          | locked decision                                         | explicitly ratified by ADR-0009                                                                                      |
| `docs/rfcs/0002-cli-ergonomics.md` header (`Draft v0.1`, `ADR-0009 pending`) | drift / should be rewritten                                        | ADR-0009 is already accepted; the header is out of date |
| `docs/rfcs/0002-cli-ergonomics.md`                                           | `wittgenstein run --manifest <path>` replay surface                | locked decision, code pending                           | ratified direction, even though implementation is still incomplete                                                   |

### Audit conclusion for this group

The CLI/runtime side is structurally healthier than the audio execution side.

- The **CLI contract** has already crossed into ratified territory.
- The **audio/M2 execution shape** still contains a few sentences where a likely
  implementation tactic is written as if it were a settled architectural outcome.

That is a documentation hygiene issue, not a doctrine crisis.

---

## 3. Long-form note classification table

| Surface                       | Current role                         | Recommended action | Why                                                                                         |
| ----------------------------- | ------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------- |
| `compression-view-of-llms.md` | thesis-adjacent argument             | relabel            | strong conceptual note, but it behaves more like a theory note than a generic research note |
| `frozen-llm-multimodality.md` | thesis-adjacent argument             | relabel            | same pattern; conceptually important, not a broad scan                                      |
| `vq-tokens-as-interface.md`   | architecture/theory note             | relabel            | explains a specific interface argument; better typed as theory note                         |
| `neural-codec-references.md`  | annotated source sheet               | relabel            | already behaves like a reference sheet, not a normal note                                   |
| `www.aquin.app/*`             | capture / extraction scratch surface | relabel            | should be treated as captured research artifact, not compared directly to notes/briefs      |

### What does **not** need to happen yet

No old long-form note in this set clearly needs archive **right now**.

The stronger need is to make their roles explicit so they are not mistaken for:

- decision records
- active execution guides
- generic "miscellaneous research"

Promotion can happen later, but only if one of these theory/reference notes starts
driving a concrete RFC or brief.

---

## 4. Non-Google object shortlist — balance correction

This repo should not over-index on Google just because one object study landed first.

The following external objects are worth keeping in view, each with only one narrow
judgment for the current stage.

| Object                                              | Why it matters                                                                                                      | Bucket                            | Label           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------- |
| OpenAI runtime / Responses / background mode        | strong comparison object for file/tool/runtime surfaces and background execution posture                            | execution-serving                 | recommend now   |
| Anthropic / MCP / managed-agent surface             | important for future agent-runtime standards and managed-session framing, but not the current implementation center | horizon-only                      | keep for future |
| Meta / open-weight multimodal and tokenizer signals | useful for decoder/tokenizer horizon signals, not a near-term execution dependency                                  | horizon-only                      | keep for future |
| Piper / Coqui TTS / whisper.cpp                     | directly relevant to audio runtime and CLI/inference surface comparisons                                            | execution-serving                 | recommend now   |
| Fastify / Hono / tRPC / Express / Apollo Federation | high-value engineering-borrow set for route ownership, composition, and contrast cases                              | engineering-borrow                | recommend now   |
| TEN / Remotion / HyperFrames                        | useful media/runtime references, especially for future video/backend classification, but not current center-stage   | engineering-borrow / horizon-only | keep for future |

This is enough to de-skew the current-stage scope without turning the audit into a new
broad survey.

---

## 5. Branch convergence appendix (advisory only)

### Current headline

Local `main` is currently diverged:

- `ahead 2`
- `behind 16`

This is a real repo hygiene problem, but not one to solve during the audit while active
review surfaces are still open.

### Live review branches

These branches still correspond to active open PRs and should be treated as live:

- `codex/research-scope-google` -> PR #78
- `codex/two-review-discipline` -> PR #75
- `codex/brief-j-d-audio-sweep-clean` -> PR #74
- `codex/m1a-closeout` -> PR #72 (out of scope for this audit, but still live)

### Likely stale or superseded branches

These branches appear superseded, merged, or otherwise non-primary:

- `codex/brief-j-d-audio-sweep` — superseded by `codex/brief-j-d-audio-sweep-clean`
- `docs/m1-prep` — likely superseded by later M1A work
- `docs/promote-engineering-discipline` — likely superseded by later merged discipline/doc-surface work
- `docs/readme-prompt-upstream` — likely superseded by later merged prompt/readme stabilization
- `docs/brief-a-lineage-refresh` / `docs/brief-c-horizon-amendments` — appear merged already and remain as leftover local branches

### Special branch

- `codex/main-pre-linearize-backup` should be treated as a deliberate backup until a
  separate hygiene pass explicitly retires it.

### Recommendation

Do not converge or delete branches in this audit round.

Revisit branch cleanup only after:

- active PR review bottlenecks clear
- Claude-side blocked work resumes
- local `main` can be reconciled in a dedicated hygiene pass

---

## 6. Final conclusion

The repo's research system is now strong enough to support disciplined work, but it is
still carrying some residue from a faster, more improvisational phase.

The core pattern is healthy:

- research now has a top-level program map
- note/brief/RFC/ADR roles are clearer
- external object studies can live without pretending to be doctrine

The remaining work is lighter:

- soften a few audio/M2 doc claims that over-read as ratified
- keep top-level note subclasses explicit
- delay branch convergence until reviews settle

That is a manageable cleanup problem, not a structural reset.
