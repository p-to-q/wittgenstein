---
date: 2026-05-08
status: research note
labels: [research-derived, m1-image, agent-skill]
tracks: [#255, #251]
---

# Agent skill surface — what belongs where

> **Status:** research note (not doctrine, not active execution guidance).
> Surveys the skill / system-prompt / always-loaded-doc design space and recommends what Wittgenstein's agent surface should look like. Pins nothing as doctrine; commits no implementation beyond what already exists in `packages/agent-contact-text/`.
> _Tracker: [#255](https://github.com/p-to-q/wittgenstein/issues/255) Lane 3, [#251](https://github.com/p-to-q/wittgenstein/issues/251) Lane 1D-adjacent._

## Why this note exists

The repo has three mutually-overlapping agent-facing surfaces today:

1. **Always-loaded operating docs** — `AGENTS.md`, `PROMPT.md`, `WORKFLOW.md`, `docs/engineering-discipline.md`, `docs/THESIS.md`, `docs/glossary.md`, `docs/hard-constraints.md`. These travel into the agent's context regardless of task.
2. **Codec-internal `schemaPreamble`** — short, codec-specific prompt copy that Wittgenstein injects before the LLM call (`packages/codec-image/src/schema.ts` `imageSchemaPreamble`, `packages/codec-audio/src/schema.ts` `audioSchemaPreamble`, etc.). Always-loaded *for that codec*, never for others.
3. **Skill files** — `packages/agent-contact-text/skills/image-visual-seed-code/SKILL.md` (the Anthropic-format skill that the official Skills system or Acontext-style harnesses can autoload).

These three surfaces have *different* properties: different token costs, different invocation models, different audiences. A new maintainer reading the repo cold cannot tell what belongs in which without reading the 600-line `docs/research/visual-seed-code-skill-playbook.md` first.

This note surveys the prior art on skill-format design (Anthropic Skills, OpenAI Codex Skills, Acontext, community patterns) and recommends a single concise placement table for Wittgenstein's three surfaces. The output is doc-level guidance, not a skill rewrite.

## What's been published

### Anthropic Skills

**Source.** Claude Code skills documentation: `docs.claude.com/en/docs/claude-code/skills`. Anthropic best-practices doc: `docs.claude.com/en/docs/agents-and-tools/agent-skills/best-practices`.

**Shape.** Each skill is a directory containing:
- `SKILL.md` with YAML frontmatter (`name`, `description`) and a body that the model reads when the skill auto-activates based on the description match.
- Optional `references/*.md` files that the model loads on-demand when SKILL.md cites them.
- Optional scripts / data assets.

**Auto-loading rule.** The skill's `description` field is what the routing layer matches on. Best practice: the description should describe *when to use* the skill in declarative terms ("Plan a Wittgenstein image render by emitting a Visual Seed Code-bearing image contract..."), not *what the skill does*.

**Token economics.** The frontmatter description is always-loaded into the routing layer's context (low cost). The SKILL.md body is loaded only when the skill activates (medium cost). The `references/` are loaded only when the body cites them (highest cost).

**Citation / verify-status.** The Anthropic skill format is published in their public docs but I haven't directly inspected the docs site here; the description above is from observed practice + the existing skill at `packages/agent-contact-text/skills/image-visual-seed-code/SKILL.md`.

### OpenAI / Codex skill conventions

**Source.** OpenAI's Codex CLI documentation describes a related but distinct shape: skills are JSON-defined with a `name`, `description`, and a `steps` field that lists the actions the skill performs. Less LLM-native than Anthropic's auto-loading body; more procedural.

**For Wittgenstein:** less directly applicable. The Wittgenstein agent's job is to emit structured JSON, not to execute a procedure. Anthropic's body-as-instructions shape fits better.

### Acontext (community / older convention)

**Source.** `acontext` (no canonical link I have direct evidence for; Brief I via the existing `visual-seed-code-skill-playbook.md` claims "north-star references" Acontext skill-memory pattern).

**For Wittgenstein:** Acontext-style memory patterns (skills as long-term notes that the agent rereads at session start) are interesting but require a runtime that loads them — Wittgenstein doesn't have one. The `packages/agent-contact-text/` corpus is closer to the always-loaded doc tier than to Acontext's recall-at-startup tier.

### Community patterns / SkillsBench

**Source.** Various GitHub repos in the `awesome-skills` / `skill-bench` space. Verify-locally before any commitment.

**Common patterns observed:**
- Skill triggers on intent matching (semantic similarity to description).
- Skill body is task-specific (50–500 lines of instructions).
- Skill can include negative examples ("do not do X").
- Skill cross-references its supporting reference docs explicitly so the agent only loads what it needs.

## What Wittgenstein has now

| Surface | Path | Token cost class | Audience |
|---|---|---|---|
| `AGENTS.md` | repo root | always-loaded (medium body) | All agents touching the repo |
| `PROMPT.md` | repo root | always-loaded (short) | First-load briefing |
| `WORKFLOW.md` | repo root | always-loaded (medium) | Agents touching issues / PRs |
| `docs/engineering-discipline.md` | docs | always-loaded for engineering tasks | Code-writing agents |
| `docs/THESIS.md` | docs | always-loaded short doctrine | All |
| `docs/glossary.md` | docs | reference (loaded on need) | All |
| `docs/hard-constraints.md` | docs | reference | All |
| `imageSchemaPreamble()` | `packages/codec-image/src/schema.ts` | injected per LLM call | Image codec users |
| `audioSchemaPreamble()` | `packages/codec-audio/src/schema.ts` | injected per LLM call | Audio codec users |
| `sensorSchemaPreamble()` | `packages/codec-sensor/src/schema.ts` | injected per LLM call | Sensor codec users |
| `image-visual-seed-code/SKILL.md` | `packages/agent-contact-text/skills/` | auto-loaded skill body when image task matches | Image VSC emitters |
| `docs/research/visual-seed-code-skill-playbook.md` | docs/research | research note (not loaded) | Skill-design readers |
| `packages/agent-contact-text/0X_*.md` | corpus | reference (loaded on need) | Long-form context readers |

The tiering is *implicit* — there's no single doc saying "this goes here, that goes there." Future agents reverse-engineer it from the file structure.

## Proposed placement table (the recommendation)

A single declarative rule for new agent-facing material:

| If the material is... | It belongs in... | Token cost class |
|---|---|---|
| **Locked vocabulary / non-negotiable architectural rules** (e.g. "image has one shipping path") | `docs/THESIS.md`, `docs/hard-constraints.md`, `docs/glossary.md` | Always-loaded short |
| **Working-rules / engineering discipline** (e.g. "schema-first at boundaries, no silent fallback") | `docs/engineering-discipline.md`, `AGENTS.md`, `PROMPT.md`, `WORKFLOW.md` | Always-loaded medium |
| **Per-modality "what to emit" instructions** (the LLM emission contract for one codec) | The codec's `schemaPreamble()` function — JSON-shape examples + operator hints | Per-call injection (most efficient) |
| **Per-modality task triggers and decision trees** (e.g. "when user asks for image, choose between one-shot-vsc / two-pass-compile / providerLatents") | A skill file in `packages/agent-contact-text/skills/<modality>/SKILL.md` | Auto-loaded on intent match |
| **Per-task example libraries / failure-mode catalogs** | `references/*.md` next to the skill | Loaded on skill body's request |
| **Design rationale / research / non-actionable history** | `docs/research/*.md` | NOT loaded by default |
| **Reproducibility / receipt rules** | `docs/reproducibility.md` (already exists) | Reference |

## Specific recommendations for Wittgenstein

### 1. The image VSC skill stays where it is

The existing skill at `packages/agent-contact-text/skills/image-visual-seed-code/SKILL.md` is well-shaped: 105 lines, declarative description, body covers when-to-use / role / output contract / path hierarchy / one-shot vs two-pass / hard constraints. The supporting `references/schema.md`, `references/troubleshooting.md`, `references/evals.md` are properly tiered (loaded on demand).

**No change recommended.** When the radar (#272) ratifies a tokenizer family, the skill's `family` field guidance should update — that's a small follow-up PR, not a redesign.

### 2. Add (eventually) a `sensor-procedural-signal/SKILL.md`

Sensor is the second-most agent-facing modality after image (the user runs `wittgenstein sensor "ECG 72 bpm"` directly). Today there is no sensor skill — the agent learns the sensor JSON shape from `sensorSchemaPreamble()` alone. That works for the simple case but doesn't capture:

- When patchGrammar earns its keep (decision tree for the agent).
- The patch-local time semantics (the patch-local rule the agent must obey if it emits patchGrammar).
- The recursion-cap (no nested patchGrammar).
- The affineNormalize bound (`minOutput < maxOutput` strict).

A small sensor skill (similar size to the image skill) would close this gap. **Defer until the patchGrammar measurement (per #276) lands.** If patchGrammar fails its measurement, the skill scope shrinks; if it passes, the skill's decision tree gets richer.

### 3. Don't add audio / video skills yet

- **Audio:** the per-route differences (speech / music / soundscape) recommended in #274 want different code shapes. A single audio skill would obscure those differences; three audio skills (one per route) would be a maintenance burden. **Defer until at least one audio sub-RFC (per #274) ratifies and the route-specific code shape is locked.**
- **Video:** M4 implementation surface is not yet active. **Defer until #277 ratifies and the M4 implementation issues open.**

### 4. Don't add release / review skills

The brief in #255 named "release skill, review skill" as questions. Today the release lane is governance-driven (ADR-routed, by hand) and review is dictated by the maintainer's judgment + ADR-0013 rules. A skill would either re-encode rules already in `WORKFLOW.md` (redundant) or invent new rules (doctrine drift via skill, which #257's inventory rule explicitly forbids).

**No release/review skill.** Keep this in the operating docs.

### 5. Don't introduce a runtime dependency on Acontext

Per the brief: *"No runtime dependency on Acontext unless separately ratified."* This recommendation respects that. The skill at `packages/agent-contact-text/skills/image-visual-seed-code/SKILL.md` is in Anthropic-Skills format — usable by Claude Code natively, by Acontext-compatible harnesses if they support the format, and by any agent that reads the file directly. No runtime hook into Acontext's loading machinery is needed.

## How to test that a skill triggers

The brief asks: *"How do we test that a skill actually triggers and improves output?"*

Two tiers of test:

### Tier 1 — does the skill trigger?

- For Anthropic-format skills, the `description` frontmatter is matched by the routing layer. Test: run the agent with a representative user prompt for the modality; check that the skill's `description` field appears in the agent's loaded-skills list. (Tooling-specific; in Claude Code this is observable via the agent's debug output.)
- For Wittgenstein specifically: a skill should trigger for "wittgenstein image ..." but not for "wittgenstein sensor ...". The negative case is the test: if both trigger, the description is too broad.

### Tier 2 — does the skill improve output quality?

- A/B comparison: run the same user prompt with and without the skill loaded; compare emitted JSON for shape correctness (passes `imageCodec.parse()`) and content quality (manual review of the seedCode tokens / semantic IR).
- Hard to automate without a quality benchmark — see `docs/benchmark-standards.md` and the M5a CLIPScore / VQAScore plan.

**Today both tiers are manual.** A future eval-harness issue could automate tier 1; tier 2 waits for M5a.

## What this note does NOT do

- Does NOT propose a new SKILL.md. The image skill stays as-is; the sensor skill is deferred.
- Does NOT modify `AGENTS.md` or any always-loaded doc.
- Does NOT introduce Acontext as a runtime dependency.
- Does NOT promote the existing skill playbook (`docs/research/visual-seed-code-skill-playbook.md`) to doctrine — it stays a research note.
- Does NOT propose a release / review / debug skill.

## Concrete follow-ups (deferred)

If this note is ratified:

1. **Sensor skill stub** — `packages/agent-contact-text/skills/sensor-procedural-signal/SKILL.md`. Open as a small implementation issue gated on patchGrammar measurement (per #276) landing.
2. **Skill-trigger test infrastructure** — small CLI command `wittgenstein doctor --skills` (or similar) that lists which SKILL.md descriptions match a given prompt. Useful for tier-1 skill testing.
3. **Skill description audit** — review the existing image skill's `description` field after #272 ratifies, ensuring the tokenizer-family wording matches the radar's recommendation.

These are deferred. None block the current research-note ratification queue.

## Cross-references

- `docs/research/visual-seed-code-skill-playbook.md` — the existing 600-line skill playbook research note; this 200-line note is the operating-summary distillation.
- `packages/agent-contact-text/skills/image-visual-seed-code/SKILL.md` — the working example.
- `packages/agent-contact-text/README.md` — the skill corpus's own README.
- ADR-0013 / ADR-0014 — independent ratification rules for doctrine surfaces (skills border on doctrine in some interpretations).
- #255 Lane 3 — this note's commission.
- #251 Lane 1D — adjacent research surface (offline VSC inspection).
- #272 — image radar (tokenizer family pick affects skill content).
- #276 — sensor research (patchGrammar measurement gates the sensor skill).
- #274 — audio research (per-route shapes affect future audio skills).
