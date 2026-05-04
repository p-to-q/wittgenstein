# Brief K — Agent orchestration prior art (Symphony / Trellis / Anthropic harness)

**Date:** 2026-05-05
**Status:** 🟡 Draft v0.1
**Question:** Which orchestration / harness / spec primitives from 2026 industry prior art (OpenAI Symphony, Mindfold Trellis, Anthropic harness-design + managed-agents) should Wittgenstein adopt to tighten human-agent collaboration without re-inventing or over-coupling?
**Feeds into:** ADR-0017 (orchestration adoption), `docs/handoff/`, possibly a `WORKFLOW.md` at repo root.
**Companion:** Brief D (CLI/SDK conventions), ADR-0014 (governance lane).

> This brief is the audio/image-codec analog at the **collaboration layer**: instead of asking "which decoder family?" it asks "which orchestration primitives?" Four 2026 references — three open-source, one architectural — converge on a small set of primitives. The brief surveys, classifies adopt / borrow / reject, and names what should land before v0.4.

---

## Stage and boundaries

This brief assumes M2 audio is in flight (Slice C2 Kokoro pending); doctrine governance lane is locked (ADR-0014); two-hat review is mechanized (ADR-0013). The brief does **not**:

- propose a new codec protocol or decoder choice (those live in Brief A / I);
- replace the existing Brief → RFC → ADR → exec-plan → code engineering chain;
- mandate a specific orchestrator product.

It does decide which **primitives** are worth importing as Wittgenstein-shaped equivalents and which are out-of-fit for our scale.

---

## The four sources

### S1 — OpenAI Symphony ([SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md))

Apache-2.0 spec released 2026-04-27. Issue tracker as control plane: every open ticket gets a coding agent; a stateless orchestrator reconciles, retries, and shepherds work to PR.

Core primitives:

- **`WORKFLOW.md`** — repo-root markdown with YAML front matter (tracker config, polling, workspace root, hooks, agent concurrency, codex command, prompt template).
- **State machine** — issue claim states (`Unclaimed → Claimed → Running → RetryQueued → Released`); per-attempt phases (`PreparingWorkspace → BuildingPrompt → LaunchingAgentProcess → InitializingSession → StreamingTurn → Finishing → terminal`).
- **Per-issue isolated workspace** — sanitized directory under workspace root; workspace path must stay inside root after normalization.
- **Reconciliation tick** — fixed interval; stall detection; exponential backoff retry capped at `max_retry_backoff_ms`.
- **Snapshot/monitoring API** — JSON shape: `{running, retrying, codex_totals}` for dashboards.
- **Boundary**: orchestrator does **not** mutate PRs. Ticket writes / PR transitions / CI watching are the agent's responsibility via tooling, not orchestrator business logic.

Reference implementation in Elixir; Codex re-implemented in TypeScript / Python / Rust to demonstrate spec portability.

### S2 — Mindfold Trellis ([docs.trytrellis.app](https://docs.trytrellis.app/))

"Training wheels for AI coding assistants." Auto-injects project standards into every agent session.

Core primitives:

- **Spec** — markdown coding standards in `.trellis/spec/`, modularly composed per task, injected before generation.
- **Workspace journal** — `.trellis/workspace/{name}/journal-N.md`, persistent session log enabling cross-session memory.
- **Task** — work unit bundling requirements + context config.
- **Skill** — auto-triggered workflow modules (brainstorm / check / verify).
- **Sub-agent** — specialized roles (research / implement / check variants).
- **Hook** — auto-triggered scripts at session boundaries.

Distribution: git-versioned spec libraries, team-shareable.

### S3 — Anthropic harness-design for long-running apps ([blog](https://www.anthropic.com/engineering/harness-design-long-running-apps))

Architectural recommendations grounded in operating-Claude-on-Claude-Code experience.

Key claims:

- **Context resets > compaction** — clearing the context window with structured handoff carrying the previous agent's state and next steps beats trying to compress everything into one window.
- **Three-agent decomposition**: planner (spec expansion), generator (implementation), evaluator (QA / verification). "Separating the agent doing the work from the agent judging it proves to be a strong lever" (anti self-eval bias).
- **Communication via files** — one agent writes a file, another reads + responds.
- **Sprint contracts** — agents negotiate "done" criteria _before_ implementation begins.
- **Concrete grading thresholds** — "if any one fell below it, the sprint failed and the generator got detailed feedback."
- **Anti-pattern: over-specification** — eliminates model flexibility; keep specs high-level.
- **Anti-pattern: self-evaluation bias** — models confidently praising mediocre work.
- **Anti-pattern: stale harness assumptions** — every component encodes "what the model can't do on its own"; audit regularly as models improve.

### S4 — Anthropic Managed Agents ([blog](https://www.anthropic.com/engineering/managed-agents))

Brain / Hands / Session split following operating-system principles ("virtualizing hardware into abstractions—process, file—general enough for programs that didn't exist yet").

- **Brain** — Claude model + harness (decision loop).
- **Hands** — sandboxes and tools, exposed via uniform `execute(name, input) → string`.
- **Session** — durable append-only event log.
- **Stateless harness** — `wake(sessionId)` after retrieving events; if a container fails it becomes a tool-call error Claude can retry, not a session loss.
- **Credential isolation** — tokens never reach the sandbox; OAuth in secure vault, proxy fetches on behalf.
- **API surface**: `getSession(id)`, `emitEvent(id, event)`, `getEvents()`, `provision({resources})`.

Reported: p50 time-to-first-token reduced ~60%, p95 >90% by decoupling.

---

## Steelman

### Hypothesis K.1 — Wittgenstein already has the durable-event-log primitive (Anthropic Session); just rename and document

**Claim.** The manifest spine (`artifacts/runs/<id>/manifest.json`) is functionally equivalent to Anthropic's "Session" event log: append-only, durable, reconstructable. We do not need to add a new primitive — we need to _recognize_ the manifest spine as the session contract and document it that way.

- **Supporting:** Manifest already records git SHA, lockfile hash, seed, full LLM I/O, artifact SHA-256. Failures still write a manifest (no silent fallback per `docs/hard-constraints.md`). Replay-from-manifest is already a stated capability. The Anthropic `wake(sessionId)` pattern maps directly: a fresh harness can rebuild state from the manifest spine.
- **Disconfirming:** Anthropic's session is _cross-run_ (one session can outlive multiple harness instances); ours is _per-run_ (one manifest per CLI invocation). For long-running multi-step agent workflows, we would need a parent-session concept linking related runs.
- **Implication if true.** No new code primitive at v0.3. A short addendum to `docs/reproducibility.md` reframes "manifest spine" as "Wittgenstein's session contract"; cross-run linkage (`parentRunId`) is a v0.4 enhancement, not a v0.3 blocker.
- **Confidence: 0.6** — manifest spine maps cleanly onto session-as-event-log; cross-run linkage is the only meaningful gap and it is small.
- **What would flip this.** A user-reported case where multi-run replay is needed but impossible (↑ to 0.3 priority for v0.3). Or evidence that the per-run shape obscures debugging in practice (↓ to 0.3 — we leave it alone).

### Hypothesis K.2 — Adopt Symphony's `WORKFLOW.md` as the orchestration spec; do not adopt Symphony as a runtime

**Claim.** A repo-root `WORKFLOW.md` (Symphony-shaped YAML front matter + prompt template) is the single highest-leverage import. It standardizes how Codex / Claude Code / any future orchestrator picks up open issues, isolates per-issue workspaces, and bounds retries — without taking on Symphony as a runtime dependency. The orchestrator can be Symphony, GitHub Actions, or a 200-line bash script; the _contract_ is the win.

- **Supporting:** We already have `docs/handoff/` (ad-hoc per-slice briefs). `WORKFLOW.md` would standardize what a handoff doc _must_ contain (tracker config, prompt template, agent concurrency, retry policy). Symphony's spec is Apache-2.0 and explicitly designed to be re-implemented; OpenAI itself reports Codex implemented it in three languages from the spec alone. The boundary "orchestrator does not mutate PRs" matches our existing discipline (Codex agents do PR work; the orchestrator just dispatches).
- **Disconfirming:** Wittgenstein has 16 open issues, not 1,600. Symphony's design assumptions (per-state concurrency caps, queue management, stall detection at scale) over-engineer for our cadence. The "every open issue gets an agent" model is wrong for `tracker` / `discussion` / `horizon-spike` issues that explicitly should NOT auto-run.
- **Implication if true.** Add `WORKFLOW.md` at repo root with: (a) which labels are agent-eligible (`enhancement` + `bug` only; exclude `tracker` / `discussion` / `horizon-spike`); (b) per-issue workspace path convention; (c) prompt template that loads `engineering-discipline.md` + `AGENTS.md`; (d) retry policy. **Do not** install Symphony itself; the contract is what we adopt.
- **Confidence: 0.6** — the spec format is portable, the boundary discipline maps to ours, but the runtime is over-spec for our scale.
- **What would flip this.** Issue volume crosses ~50 open simultaneously (↑ to 0.8, install Symphony itself). Or a contributor reports `WORKFLOW.md` adds friction without an orchestrator to consume it (↓ to 0.3, retire to a single example handoff brief).

### Hypothesis K.3 — Formalize the planner / generator / evaluator three-agent pattern as a Wittgenstein doctrine

**Claim.** Anthropic's three-agent pattern (planner / generator / evaluator) is a _doctrine_ upgrade to our two-hat (researcher / hacker) review model. The two-hat review is post-hoc; planner / generator / evaluator is _during_ execution and unblocks parallelism. Adopting it means: a slice has explicit planner output (the handoff brief), explicit generator output (the PR), explicit evaluator output (a structured review checklist that grades against the planner's done-when, not against vibes).

- **Supporting:** The current `docs/handoff/m2-slice-c2-kokoro.md` _is_ a planner output; the PR _is_ a generator output. What's missing is the evaluator-as-distinct-agent — currently the maintainer does both planner and evaluator passes, which is exactly the self-eval bias Anthropic flags. A separate "evaluator agent / pass" with a grading rubric (not just "looks good") would close the loop.
- **Disconfirming:** At our scale (2 maintainers, ~5 slices in flight) the three-role separation may add ceremony without buying much. The two-hat review already separates concerns at review time; the planner / evaluator distinction may be a v0.4 concern.
- **Implication if true.** Add an "Evaluator checklist" section to `docs/handoff/` template — concrete grading thresholds derived from done-when. Reviewer (human or agent) fills it before approve/request-changes.
- **Confidence: 0.3** — the principle is right; the _amount_ of formalization needed at our scale is uncertain. Defer to v0.4 unless self-eval bias bites in M2 audio reviews.
- **What would flip this.** A specific incident where a PR shipped because the author/reviewer couldn't see a flaw (↑ to 0.6). Or three sprints of clean reviews under the current two-hat model (↓ to 0.1, retire).

### Hypothesis K.4 — Trellis's "auto-inject specs at session start" maps to our doctrine-guardrail; nothing new to import

**Claim.** Trellis's core innovation (auto-load `.trellis/spec/*.md` into every agent session) is what `engineering-discipline.md` + `AGENTS.md` + `PROMPT.md` already do, with `.github/workflows/doctrine-guardrail.yml` as the auto-injection mechanism (it nudges agents who don't cite ADRs). Trellis's `Skill` and `Sub-agent` primitives are over-engineered for our scope — we have specialized agents (Codex / Claude Code) but not specialized _roles_ per session.

- **Supporting:** Engineering-discipline.md is exactly Trellis's "Spec." PROMPT.md is the auto-injection target (we tell agents "paste this in"). Doctrine-guardrail enforces ADR citation on doctrine-touching PRs. Trellis adds nothing we don't already have at this scale.
- **Disconfirming:** Trellis's `journal-N.md` (cross-session persistent memory) is a real gap for us. Currently each Codex session starts fresh; there is no "what did the previous Codex session learn that this one should know?" surface. The handoff briefs are _forward_ memory (what to do next); journals would be _backward_ memory (what was tried before).
- **Implication if true.** No new primitives at v0.3 except possibly a session journal (which folds naturally into K.1's manifest-spine extension — `parentRunId` + `priorRunNotes`).
- **Confidence: 0.6** — doctrine-guardrail + handoff briefs cover most of Trellis; the journal gap is real but small.
- **What would flip this.** A specific case where two Codex sessions made the same mistake because one didn't see the other's notes (↑ to 0.6, build the journal surface).

### Hypothesis K.5 — Credential isolation (Anthropic) is already a hard constraint; ADR-0016 covers it

**Claim.** Anthropic's "tokens never reach the sandbox" pattern is already locked in by ADR-0016 (untrusted-code-execution boundary) for `polyglot-mini`. The remaining gap — that we don't yet have an MCP-style proxy for orchestrator-launched Codex sessions — is a v0.4+ concern dependent on whether we adopt MCP at all.

- **Supporting:** ADR-0016 explicitly names the production path (`nsjail` / `bubblewrap` / Pyodide-WASM) and locks the current `subprocess + 20s timeout + safe globals` as research-grade. The credential-isolation primitive is implicit but ratified.
- **Disconfirming:** ADR-0016 is about untrusted _generated code_; Anthropic's pattern is about _trusted agent_ tool invocations. Different threat model. We should add a paragraph to ADR-0016 (or a follow-up ADR-0018) clarifying which boundary applies where.
- **Implication if true.** No new primitive needed; small clarification to ADR-0016 in a follow-up.
- **Confidence: 0.6** — covered for the surface that matters most (painter sandbox); orchestrator-credential isolation is a v0.4 question.

---

## Red team

The strongest objection is that **all four sources optimize for scale Wittgenstein does not have**. Symphony assumes hundreds of issues; Trellis assumes a team running multiple agent flavors; Anthropic's managed-agents reports performance numbers that only matter at production load. Importing primitives meant for those contexts could ossify Wittgenstein into structures it doesn't yet earn.

The mitigation: K.2 / K.3 / K.4 deliberately recommend importing the _contract_, not the _runtime_. `WORKFLOW.md` is a markdown file, not an Elixir process. Three-agent pattern is a checklist addition, not a separate package. Session journal is one new field in the manifest schema, not a new database. The evaluation criterion is: "would this still earn its keep if Wittgenstein never grows past 2 maintainers?" If yes, adopt; if no, reject.

The second objection is that **K.1 (manifest-spine = session) flatters our existing design too generously**. Anthropic's session has things ours doesn't: cross-run linkage, durable event ordering with a strict append-only contract enforced at the storage layer, `getEvents()` API. We have a JSON file. Calling them equivalent risks pretending we have a feature we don't.

The mitigation: explicitly add `parentRunId` (cross-run linkage) and an `events: []` array (append-only) to the manifest schema as a v0.4 enhancement; until then, the equivalence is _aspirational_ not _current_. Brief should call this out.

The third objection: **the planner / generator / evaluator pattern (K.3) might be the most valuable single import** and we are deferring it to v0.4 too quickly. M2 audio is exactly the kind of multi-slice work that benefits from explicit evaluator separation, and the staff audit (2026-05-03) flagged exactly the self-eval bias Anthropic warns about. Reasonable. We accept this as a tension and let M2 sweep verification (Slice E, #118) be the test case: if the evaluator-as-separate-agent shape helps Slice E, promote to doctrine in v0.4.

---

## Kill criteria

This brief should be considered wrong, and its recommendations rolled back, if any of the following:

1. **Adoption ceremony exceeds value.** Within one sprint of `WORKFLOW.md` landing, no orchestrator (Symphony, GitHub Actions, or otherwise) consumes it AND no contributor reports it helped them onboard. Then `WORKFLOW.md` was a doctrine-debt addition, retire it, log the lesson.
2. **Symphony itself outpaces hand-rolled.** A 2026-Q3 Symphony release adds enough features (e.g. native Linear-equivalent for GitHub Issues) that re-implementing the contract ourselves becomes obviously worse than installing Symphony. Then K.2's "spec-not-runtime" stance flips.
3. **Manifest-spine equivalence is exposed as fictional.** A specific debugging case requires `getEvents()`-style positional slicing across runs; we cannot satisfy it. Then K.1 was over-flattering and we need a real session implementation.
4. **Three-agent pattern is needed sooner.** A concrete M2 PR ships a defect that an evaluator-as-separate-agent would have caught. Then K.3 promotes to v0.3 doctrine, not v0.4.

---

## Verdict

1. **Adopt Symphony's `WORKFLOW.md` spec, not Symphony itself.** Add a repo-root `WORKFLOW.md` codifying agent-eligible labels, per-issue workspace path convention, prompt template (auto-loads `engineering-discipline.md` + `AGENTS.md` + relevant handoff brief), and retry/concurrency policy. The orchestrator stays unspecified — could be a 200-line bash script, GitHub Actions, or actual Symphony — but the contract is fixed.
2. **Reframe the manifest spine as Wittgenstein's "session contract."** Short addendum to `docs/reproducibility.md`. Cross-run linkage (`parentRunId`) and append-only `events[]` slots into the manifest schema deferred to v0.4.
3. **Defer planner / generator / evaluator formalization to v0.4.** Use M2 Slice E (#118) as the test case: if separate-evaluator-pass adds value there, promote to doctrine; otherwise let two-hat review remain canonical.
4. **No new primitive from Trellis.** `engineering-discipline.md` + `PROMPT.md` + `doctrine-guardrail.yml` cover the spec-injection role. Session journal (one new manifest field) is the only meaningful adoption candidate; folds into K.1's v0.4 enhancement.
5. **No new credential isolation work.** ADR-0016 covers the painter sandbox; orchestrator credential isolation is a v0.4 concern dependent on MCP adoption.

Net for v0.3: **`WORKFLOW.md` lands as the single new collaboration primitive.** Everything else is a documentation reframe of what already exists, or a v0.4 enhancement.

---

## What concretely lands in v0.3 (action items)

| Item                                                                                                           | Where                              | Issue                               | Owner-line      |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- | --------------- |
| Add `WORKFLOW.md` at repo root with agent-eligible labels, workspace convention, prompt template, retry policy | `WORKFLOW.md`                      | (this brief opens the issue)        | governance      |
| Reframe manifest spine as session contract; cite Anthropic Managed Agents                                      | `docs/reproducibility.md` addendum | (folded into the WORKFLOW.md issue) | reproducibility |
| Note Brief K verdict in agent-guides for cross-link                                                            | `docs/agent-guides/README.md`      | (small)                             | docs            |

Deferred to v0.4 (do not start in v0.3):

- `parentRunId` + `events[]` in manifest schema.
- Planner / generator / evaluator three-role formalization.
- Trellis-style session journal.
- MCP-based orchestrator credential proxy.

---

## References

- [openai/symphony](https://github.com/openai/symphony) + [SPEC.md](https://github.com/openai/symphony/blob/main/SPEC.md) — Apache-2.0 orchestration spec, 2026-04-27.
- [OpenAI announcement](https://openai.com/index/open-source-codex-orchestration-symphony/) — context and motivation.
- [Mindfold Trellis docs](https://docs.trytrellis.app/) — spec / workspace / task / skill / sub-agent / hook primitives.
- [Anthropic — Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps) — three-agent pattern, sprint contracts, anti-self-eval-bias.
- [Anthropic — Managed Agents](https://www.anthropic.com/engineering/managed-agents) — Brain / Hands / Session split, stateless harness, credential isolation.
- Brief D — CLI/SDK conventions (companion).
- ADR-0014 — governance lane (the chain this brief lands through).
- ADR-0016 — untrusted code execution boundary (the credential-isolation surface).
- `docs/reproducibility.md` — manifest spine = Wittgenstein's session contract (per K.1).
