# Research Program

**Status:** non-doctrine program map
**Stage:** post-v0.2 doctrine lock, post-M2 preflight, pre-M2 implementation
**Purpose:** show how engineering-borrow research, model/literature research, and
implementation-facing investigation fit together before M2 code starts.

This page is not a new decision surface. It is a map over existing surfaces so agents,
humans, and maintainers can see what has been investigated, what was adopted, and what
remains open without reconstructing the answer from chat or PR history.

Canonical decisions still live in RFCs and ADRs. Execution still lives in active
exec-plans, agent guides, and code.

---

## Research posture

Wittgenstein uses research in two different ways.

1. **Engineering-borrow research** looks at working systems and copies the smallest
   robust practice that fits this repo. It should prefer concrete source/docs over
   vibes, and it should say what not to copy.
2. **Model / literature research** evaluates decoder families, modality boundaries,
   benchmarks, and thesis-level hypotheses. It should name kill criteria and preserve
   uncertainty instead of sounding more settled than the evidence.

Both kinds of research are useful only when they feed a specific downstream surface:

```text
finding -> note / brief -> RFC or ADR -> exec-plan / agent-guide -> code / issue
```

Governance decisions use the separate lane from ADR-0014. This page does not create a
third lane.

---

## Pre-M2 closure assessment

### 1. Engineering-borrow review

The engineering-borrow requirement is mostly satisfied for the pre-M2 boundary.

| Area                     | Evidence                                                                                                                 | Adopted or preserved                                                                                                                             | Current judgment                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Codec Protocol v2        | Brief H surveyed unified, tRPC, LangChain Runnable, MCP SDK, Vercel AI SDK provider spec, unplugin, PostCSS, and ESLint. | Standard Schema input typing; typed warnings; sidecar; forkable context; stable lifecycle phases; declared warning ids; rejected practice block. | Closed enough for M0/M1A and safe to carry into M2.   |
| Image port               | `docs/agent-guides/image-port.md`, PR #68, and current `packages/codec-image` implementation.                            | `ImageCodec extends BaseCodec`; codec-authored manifest rows; sidecar warnings; single raster route; no second image path.                       | Closed.                                               |
| Audio route architecture | Brief J surveyed Express, Hono, Fastify, tRPC, and Apollo Federation against current `codec-audio` code.                 | Flat codec-owned route table; helper-functions-first route collapse; no `BaseAudioRoute` unless duplication remains above threshold.             | Closed for planning; implementation still pending M2. |
| M2 execution memo        | `docs/research/m2-implementation-design-2026-04.md`.                                                                     | Route-local vs helper cut line; speech backend contract; parity contract; caller migration shape.                                                | Closed enough to start Slice A.                       |
| Media/runtime references | TEN / Remotion / HyperFrames captured as future references in issue/audit discussion.                                    | Kept as horizon / engineering-borrow objects, not as M2 blockers.                                                                                | Not needed before M2.                                 |

Important nuance: this repo has **borrowed patterns**, not vendored external code. That is
the right choice at this stage. Pulling framework code into the repo before M2 would add
license and maintenance surface without solving the immediate audio-port problem.

### 2. Model / literature research

The model/literature requirement is also satisfied for the pre-M2 boundary.

| Area                       | Evidence                                        | Ratified or downstream owner                                                                            | Current judgment                                           |
| -------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Image decoder thesis       | Brief A, Brief G, ADR-0004, ADR-0005, ADR-0008. | Image path remains strict: structured scene -> adapter -> frozen decoder -> PNG.                        | Closed for M1A; M1B remains future decoder work.           |
| Codec protocol / IR stance | Brief B, Brief C, RFC-0001, ADR-0008.           | `Codec<Req, Art>.produce`, `Text \| Latent \| Hybrid` IR, only `Text` inhabited at v0.2.                | Closed for current port train.                             |
| CLI/runtime ergonomics     | Brief D, RFC-0002, ADR-0009, issue #77.         | CLI doctrine accepted; implementation still open but not an M2 blocker.                                 | Closed as doctrine, open as feature work.                  |
| Audio decoder family       | Brief I, ADR-0015.                              | Kokoro-82M-family default; Piper-family fallback; no v0.3 audio tokenizer; procedural soundscape/music. | Closed enough for M2, with parity tests as execution gate. |
| Audio engineering shape    | Brief J, #87 inventory, M2 implementation memo. | Helper-first route collapse; audio manifest fields; route deprecation window; parity split.             | Closed for M2 planning.                                    |

The remaining unknowns are implementation checks, not missing research:

- Kokoro CPU byte-parity must be verified in M2.
- Piper fallback must be concretely pinned if Kokoro fails the gate.
- Public route-first examples should be updated in M2 Slice C, not before.

---

## What is not closed before M2

These items are real, but they should not block M2 Slice A.

| Item                                    | Why it stays open                                                          | Owner                                                        |
| --------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `#77` CLI/auth/doctor execution         | Ratified CLI doctrine exists, but this is a separate feature line.         | Future CLI execution PR.                                     |
| `#70` M1B image adapter/decoder bridge  | Depends on a usable LFQ-family decoder line; not needed for audio routing. | Future M1B research/implementation.                          |
| `#66` / `#67` horizon spikes            | Useful, deliberately speculative.                                          | Time-boxed future spikes.                                    |
| Long-form theory notes                  | Need clearer labels over time, but are not active execution guidance.      | Future reclassification pass if they start feeding new RFCs. |
| TEN / Remotion / HyperFrames comparison | Useful for future video/backend design, not an audio preflight blocker.    | Future video/backend brief or issue.                         |

---

## Engineering-quality gate before M2

Before starting M2 implementation, the repo should satisfy the following. As of
2026-04-29, it does.

- No open PRs block M2.
- `README.md`, `PROMPT.md`, `AGENTS.md`, and `docs/roadmap.md` point to the same pre-M2
  state.
- Brief I is ratified by ADR-0015.
- Brief J and the M2 implementation memo are subordinate to ADR-0015 and the active
  exec-plan, not standalone doctrine.
- Codec Protocol v2 is not types-only scaffolding: `BaseCodec.produce()` validates
  route matching and fails loudly when no route matches.
- `pnpm lint`, `pnpm typecheck`, `pnpm test`, site build, and Kimi build pass on main.

---

## Recommendation

Start M2 as planned, beginning with Slice A: codec-owned routing and harness thinning.

Do not start another broad research sweep before Slice A. The next research-like action
should happen inside M2 implementation only when code forces a concrete question, such
as the exact Kokoro/Piper package, weights, hash, or deterministic backend pin.

If a future contributor wants to broaden the research surface, require one of:

- a named blocker in active implementation;
- a new external object study with a specific downstream decision;
- a horizon spike with a time box and kill criteria.

Otherwise, keep research serving execution rather than becoming a parallel product.

---

## Post-v0.3 image-route correction

After the v0.3 release-closeout line, image becomes the next major architecture-correction surface.

The current image scaffold preserved the right seams but over-centered `scene-spec JSON`
as the terminal image IR. That is now corrected by:

- [`docs/research/hybrid-image-code.md`](hybrid-image-code.md)
- RFC-0006
- ADR-0018

The locked direction is:

- `Semantic IR` remains supported for concept activation / organization, inspection, and optional conditioning, but not as the terminal image research object
- `Visual Seed Token` becomes first-class
- the adapter is redefined primarily as a seed expander / visual-code compiler
- one-shot VSC is the default lane
- two-pass compile is the high-quality lane

The main research variables that remain open are:

- seed family,
- seed length,
- coarse-grid geometry,
- the value of auxiliary semantic conditioning during expansion.

Those variables stay in research until evaluation narrows them; the architectural correction itself is no longer open.
