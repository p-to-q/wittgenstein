# Engineering Discipline

This document establishes the working principles for Wittgenstein development, adapting proven patterns from Jah-yee's cursor-rules and specializing them for this repository.

---

## Core Engineering: Read Before Write

The foundational directive is to **inspect the relevant code, tests, config, and nearby patterns before editing.**

This means:

- Understanding existing implementation patterns before adding to them
- Knowing what tests already exist and what they cover
- Seeing how the build, lint, and type-check systems are configured
- Learning how neighboring code solves similar problems

Then: make the smallest effective change that solves your problem.

## Change Discipline

**Make the smallest effective change.** This is not a preference; it's a discipline.

- Preserve existing behavior unless your change requires modifying it
- Do not bundle unrelated cleanup with your fix
- Prefer editing existing files over creating new ones
- Don't invent new public APIs without explicit requirements
- If you find a second thing worth fixing, file it as a separate issue — don't sneak it into this PR

### Constraints for Wittgenstein specifically

Because Wittgenstein's doctrine is load-bearing:

- Do not invent terminology that contradicts `docs/THESIS.md` §Architectural vocabulary (use Harness / Codec / Spec / IR / Decoder / Adapter / Packaging)
- Do not relitigate decisions that live in ADRs (0006–0011); if something looks settled, check the ADR first
- Do not add a second image path, a new operator, or a new modality without an RFC
- Do not make the harness modality-branch again (M4 cleanup is scheduled; don't jump it early)

### Documentation surface discipline

Not every document in this repo serves the same role. Before editing, classify the surface you are touching:

- **Active guidance** — current execution guidance (`AGENTS.md`, active exec-plans, current agent guides)
- **Locked doctrine** — thesis / ADR / hard constraints / naming decisions
- **Historical receipts** — archived plans, prior showcase packs, benchmark snapshots, past handoff context

Do not casually upgrade a historical receipt into active guidance, and do not quietly smuggle a new doctrine decision into an execution guide. If a surface changes role, say so explicitly in the diff.

## Code Standards

Target minimal diffs, clear structure, robust behavior, correct logic, and consistency with surrounding code.

### Planning for complex tasks

Before you code:

1. Summarize the engineering problem
2. Identify the root cause or implementation path
3. List constraints
4. Propose the smallest valid solution

Avoid broad rewrites or speculative architecture. If you find the problem is bigger than expected, escalate — don't just make it work anyway.

## Architecture: Composition Over Proliferation

**Simple and explicit design.** Composition over inheritance unless local architecture dictates otherwise.

**Reuse existing patterns** before inventing new ones. Don't create utility modules without clear justification.

**Avoid premature abstraction.** Every abstraction must solve a real _present_ problem. Direct implementations are preferable when they're easier to understand and maintain.

**Extend existing code paths** over building parallel systems. Make data flow and side effects explicit and visible. Enable local reasoning rather than creating distributed indirection.

### Wittgenstein specifics

- The harness routes to `Codec<Req, Art>.produce()` — don't work around this primitive
- Codec manifest authorship is now codec-owned (not harness-overridden) — respect this split
- The `quality.partial` invariant protects against silent fallbacks — use it
- Goldens are the regression baseline — byte-for-byte for deterministic, structural for LLM-driven
- Parallel modality lines may explore locally, but shared shape converges explicitly later — do not silently promote modality-local practice into shared contract

## Robustness: Never Hide Errors

**Never hide errors. Never silently swallow exceptions** unless explicitly justified in a comment stating why.

All failures must preserve diagnostic information and remain inspectable.

### Input validation

External data (LLM outputs, user prompts, config) must be scrutinized:

- Treat incoming information as potentially compromised
- Validate all assumptions at system boundaries
- Make invalid states architecturally difficult to create

### Behavioral consistency

Maintain established functionality unless change is explicitly needed. Select straightforward approaches over sophisticated but fragile solutions. Avoid unintended degradation unless it represents a deliberate product choice.

### Debuggability

**Printability is a feature.** Code should be straightforward to log, test, examine, and troubleshoot. Operational clarity matters for production systems.

Manifests and run records are not overhead — they are the evidence that reproducibility holds.

## Code Style and Readability

### Clarity first

- Use guard clauses and early returns where they improve readability
- Use descriptive identifiers even when lengthy, provided they enhance understanding
- If code needs heavy narration, simplify the code first

### Minimalism

- Do not add wrappers, helpers, or indirection without concrete value
- Keep functions focused; keep modules cohesive
- Write code that teammates can confidently modify later

### Comments

Documentation should address the reasoning behind decisions and edge cases rather than paraphrasing code.

Example: ✅ "Deterministic synthesis requires seed at the top level so AudioPlan → WAV is bit-reproducible" instead of ❌ "const seed = req.seed;"

### Maintainability

Prioritize code that future developers can act correctly from without asking questions. Focused functions, cohesive modules, reviewable changes.

## Testing and Validation: Do Not Claim Success Without Evidence

**State exactly what you verified, and do not imply checks you did not run.**

Meaningful behavior changes require validation. Preference order:

1. Specific tests (unit, integration, round-trip)
2. Type checking and linting
3. Building
4. Broader regression checks

### What to test

- Actual behavior, not implementation details
- Add or update tests appropriately
- Keep test code readable
- For codec work: goldens (byte-for-byte for deterministic, structural + manifest for LLM-driven)
- For protocol work: round-trip tests (≤20 lines per modality if it fits, the protocol shape is right)

### Critical mindset

Do not fake confidence when verification is incomplete. Explicitly state what wasn't tested rather than glossing over gaps.

### Wittgenstein checklist

- [ ] `pnpm typecheck` green across relevant packages
- [ ] `pnpm test` passes for affected modules
- [ ] For codec work: `pnpm test:goldens` passes or golden diffs are documented
- [ ] For manifest changes: `RunManifest` schema is consistent
- [ ] For doctrine changes: ADR or RFC exists (don't bury decisions in code)
- [ ] For deprecations: soft-warn → hard-warn → removal lifecycle is documented

## No Drive-By Refactor

**Stay on task.** Avoid:

- Renaming unrelated symbols
- Moving files unnecessarily
- Reformatting unrelated code sections
- Adopting different stylistic patterns without justification
- Mixing cleanup work with implementation unless it directly enhances correctness, safety, or maintainability

If substantial cleanup work is warranted, flag it explicitly as a separate issue — don't bundle it silently.

This applies universally. Your job is to solve the stated problem, not to improve everything you encounter.

## Reporting (Commit Messages and PR Descriptions)

State:

1. **What changed** — one sentence, imperative mood
2. **Why** — the problem, the trade-off, the decision (reference ADR/RFC if applicable)
3. **How you validated** — tests, type-check, goldens, manual verification
4. **Remaining risks** — honest assessment

Keep it concise and technical. No fluff.

### Example

```
fix(codec-image): preserve LLM output on adapter failure

The adapter (L4) may fail to load model weights if the preferred path is
unavailable. Previously the harness would silently fall back to legacy
weights. Now the codec surfaces the failure as a structured error with the
failed path in the manifest, respecting the "no silent fallback" invariant
(hard-constraints.md §Failure modes).

Tested:
- adapter-load-failure.test.ts: missing preferred weights triggers
  quality.partial: { reason: "adapter_load_failed" }
- goldens: image outputs unchanged (golden adapter weights still load)
- pnpm typecheck: ✅

Risk: if an external consumer depended on the fallback behavior (unlikely;
it was undocumented), they will see a manifest error instead of a degraded
run. That is correct behavior.
```

## When in Doubt

1. Check the existing code. How do similar features work here?
2. Check the ADRs (0006–0011). Is this settled?
3. Check the exec plan (`docs/exec-plans/active/codec-v2-port.md`). Are there gates or rollback criteria?
4. Check the relevant brief or RFC. What are the kill criteria?
5. If still unclear, escalate truthfully. Don't guess.

## Success Looks Like This

You finish the task, and:

- The code is minimal, readable, and testable
- Behavior is preserved unless change was required
- Errors surface as structured data with context
- Tests pass (or you explain what doesn't and why)
- You're not tempted to "just fix this other thing"
- Your PR body fits in 100–150 words and states what, why, validation, risks
- A reviewer can merge it without asking clarifying questions about intent
