# v0.2 Final Audit — pre-lock review

**Date:** 2026-04-25  
**Author:** engineering + review (max.zhuang.yan@gmail.com)  
**Feeds from:** `docs/v02-alignment-review.md`, `docs/THESIS.md`, `docs/inheritance-audit.md`, Briefs A–G, RFCs 0001–0005, ADRs 0006–0011, the P2b–P5 branch train (`docs/p2b-research-briefs` → `docs/p5b-alignment-review`)  
**Status:** 🟢 Pre-lock doctrine audit for the v0.2 milestone

**Summary:** This is the last doctrine-level pass before v0.2 is treated as locked. It does three things at once:

1. reconstructs what the recent branch train actually changed;
2. pressure-tests every load-bearing decision against the current architecture;
3. turns that pressure-test into a finite, ordered **Next Action** list.

This pass is intentionally strict. Anything unclear, duplicated, over-designed, or still pretending to be open gets called out here before `main` inherits it.

---

## 1. Audit frame

Every decision in this audit is checked against the same packet. If a document or claim cannot be summarized in this packet, it is not ready to lock:

- **ADR entry:** where is the permanent decision, or where will it land?
- **Steelman:** what is the strongest case for keeping it?
- **Two hats review:** would both the Researcher hat and the Hacker hat sign off?
- **Out of scope:** what does this decision explicitly _not_ cover?
- **Kill criteria:** what future evidence would make us retract or supersede it?
- **Verdict:** keep, patch, defer, retire, or add back.

This packet is the audit's answer to the user's bar: senior-researcher clarity, hacker-grade practicality, and agent-readable structure.

### 1.1. The six audit tests

Every verdict below is also checked against six repo-level tests:

1. **Clarity.** Can a human or agent act correctly from the file alone?
2. **Convergence.** Does the decision narrow the space?
3. **Ilya compass.** Is this simpler than the nearest alternative?
4. **PPT fidelity.** Does it match the original hackathon architecture and vocabulary?
5. **Agent-first.** Is the information grep-able and executable for agents?
6. **Load-bearing.** Would removing it break a downstream contract?

---

## 2. What the recent branch train actually changed

Before judging the architecture, we need to be precise about what the recent work already did.

### 2.1. Branch train summary

The repo did not move in one shot; it moved in a sequence:

- **P2b research pass** locked the remaining briefs into a coherent research surface.
- **P3 RFC pass** turned those research verdicts into concrete engineering proposals.
- **P4 ADR pass** ratified the winning RFCs into load-bearing decisions.
- **P5 governance + alignment** corrected the naming drift, the one-round vs two-round drift, and the image-first execution order.
- **This final audit** exists to verify that those changes are now internally coherent and maintainer-ready.

### 2.2. Net-new doctrine that now exists

This branch train already created real doctrine, not just prose:

- `docs/THESIS.md` — the smallest locked statement of the project.
- `docs/tracks.md` — the explicit research ↔ hacker dual-track contract.
- `docs/research/briefs/` — four-station brief discipline (`Steelman / Red team / Kill criteria / Verdict`).
- `docs/rfcs/` — proposals with migration and kill criteria.
- `docs/adrs/` — permanent decisions.
- `docs/v02-alignment-review.md` — first-pass drift review.

What was still missing before this file:

- a final pass that says **what now counts as settled**,
- explicit maintainer onboarding docs,
- an agent-targeted line for the first concrete port (`image → audio`),
- a single ordered action list for the lock.

---

## 3. Verdict table

One row per load-bearing cluster. This is the shortest useful answer to "what survives v0.2, what doesn't?"

| #   | Cluster                                                                        | ADR / file anchor                                | Steelman                                                                 | Two hats                                                    | Out of scope                                                   | Kill criteria                                                            | Verdict                                        |
| --- | ------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------ | -------------------------------- |
| 1   | Master thesis: modality harness for text-first LLMs                            | `docs/THESIS.md`, ADR-0003 family                | Matches the hackathon narrative and all shipping surfaces                | Both hats yes                                               | Does not choose a decoder family by itself                     | Only superseded by a new ADR                                             | ✅ **KEEP**                                    |
| 2   | Five-layer foundation L1–L5                                                    | `AGENTS.md`, `docs/architecture.md`, ADR-0003    | Cleanest persistent architecture in the repo                             | Both hats yes                                               | Does not force every modality to have a non-trivial L4         | If L4/L5 prove impossible to generalize in code                          | ✅ **KEEP**                                    |
| 3   | Decoder ≠ generator; no diffusion in the core image path                       | ADR-0005, hard constraints                       | Protects the repo thesis and reproducibility story                       | Both hats yes                                               | Does **not** ban future opt-in non-core adapters               | If a future image brief proves the core path cannot ship without it      | ✅ **KEEP with one-line addendum later**       |
| 4   | Path C rejected through v0.4                                                   | ADR-0007                                         | Keeps scope inside harness-scale engineering                             | Both hats yes                                               | Not a claim about all future research forever                  | ADR-0007 already names its own reopen condition                          | ✅ **KEEP**                                    |
| 5   | Layered epistemology: `IR = Text                                               | Latent                                           | Hybrid`                                                                  | ADR-0006, RFC-0001                                          | Cheap reserved slot, expensive to retrofit later               | Researcher yes; Hacker yes if runtime stays `Text`-only for now          | Not a promise to implement JEPA now            | Collapse back to `Text` if `Latent` stays uninhabited through v0.4 | ✅ **KEEP with explicit caveat** |
| 6   | One-round LLM default                                                          | ADR-0008 amendment, alignment review             | Matches the strict image slide and keeps price/latency sane              | Both hats yes                                               | Does not forbid `--expand` experiments                         | Reopen only with measured quality lift                                   | ✅ **KEEP**                                    |
| 7   | Locked vocabulary: Harness / Codec / Spec / IR / Decoder / Adapter / Packaging | ADR-0011                                         | Restores the PPT-native language and agent readability                   | Both hats yes                                               | Does not require a formal glossary file, but benefits from one | Any future rename needs a new ADR                                        | ✅ **KEEP**                                    |
| 8   | Brief C horizon scan                                                           | Brief C                                          | Good roadmap pressure-test                                               | Researcher yes; Hacker only if treated as roadmap, not gate | Not a v0.2 blocker                                             | If it starts steering doctrine without evidence                          | ⚠️ **KEEP as roadmap input only**              |
| 9   | Benchmarks v2                                                                  | Brief E, exec plan M5                            | Needed eventually for real quality, but v0.2 only needs a default tier   | Researcher yes; Hacker yes if sequenced after image         | Not a demand to ship `--quality=heavy` now                     | Heavy tier can be reintroduced when there is a second viable metric tier | ✏️ **KEEP but shrink v0.2 surface**            |
| 10  | Brief G image-network line                                                     | Brief G                                          | Only missing research surface that still blocks image execution planning | Researcher yes; Hacker yes because image is priority one    | Not the full decoder pick itself yet                           | If it remains a stub when M1 starts                                      | 🔼 **PROMOTE to Draft before image execution** |
| 11  | Two-hats review                                                                | `docs/tracks.md`                                 | Prevents research drift and implementation drift at the same time        | This is the hats model itself                               | Not code review in the narrow bug-finding sense                | If it becomes box-checking instead of actual dissent                     | ✅ **KEEP**                                    |
| 12  | Current read-order / onboarding                                                | `AGENTS.md`, no contributor map, no agent guides | Still incomplete for a new maintainer or agent                           | Hacker hat says no; Researcher hat says no                  | Not a thesis problem                                           | If a new maintainer still cannot orient in one read pass                 | ➕ **ADD missing docs now**                    |

---

## 4. What should be patched, deferred, or added

This section turns the verdict table into explicit doc work.

### 4.1. Patch now

These are small, mechanical, same-PR changes:

- `AGENTS.md` read order must include the actual v0.2 spine (`THESIS`, `tracks`, `RFCs`, `ADRs`, `briefs`).
- `THESIS.md` must stop pretending naming and one-vs-two-round are still open.
- `inheritance-audit.md` must stop treating naming as unresolved and must retire `Parasoid` against ADR-0011, not ADR-0010.
- `RFC-0001` must say what the repo actually believes now:
  - **Accepted**
  - ratified by ADR-0008
  - one-round default
  - only `Text` inhabited at v0.2
- `Brief C` must explicitly say it is not a v0.2 gate.
- `Brief E` must explicitly say heavy-tier metrics are a v0.3+ reservation, not part of the v0.2 shipping surface.
- `codec-v2-port.md` must stage benchmark work as `M5a image` then `M5b audio/sensor/video`.

### 4.2. Defer, but do not forget

- **Heavy-tier benchmark surface** — document it, do not ship it as a v0.2 promise.
- **ADR-0005 addendum on opt-in diffusion adapters** — land only once Brief G names a concrete image-network verdict.
- **Any revisit of `IR.Latent`** — only through future evidence, not speculation.

### 4.3. Add back now

These are the missing docs the repo now actually needs:

1. **`docs/glossary.md`**  
   One sentence per locked term. Cheap, high-leverage, very agent-friendly.

2. **`docs/contributor-map.md`**  
   The missing human+agent onboarding map for maintainers like Jamie.

3. **`docs/agent-guides/README.md`** and **`docs/agent-guides/image-to-audio-port.md`**  
   The first concrete agent line for the image→audio port and the place future guides should live.

---

## 5. Sign-off conditions and out-of-scope boundary

### 5.1. Sign-off condition

v0.2 doctrine is lockable when:

- the patch set in §4.1 lands,
- the new docs in §4.3 land,
- Brief G is promoted from stub to a real draft before image execution starts,
- no load-bearing concept remains undocumented or falsely documented as open.

### 5.2. Out of scope for this audit

This audit does **not**:

- ship code,
- choose the final image decoder,
- reopen Path C,
- add a second raster image path,
- relitigate the thesis,
- rewrite the website,
- implement JEPA or `IR.Latent`,
- run a new literature sweep beyond the merged briefs.

This is a doctrine and maintainer-surface audit, not an implementation phase.

---

## 6. Next Action

Ordered, finite, and directly executable.

### Tier 1 — patch the doctrine files in this PR

1. `AGENTS.md` — update read order to match the real v0.2 spine.
2. `docs/THESIS.md` — remove stale open bullets for naming and pipeline rounds.
3. `docs/inheritance-audit.md` — mark naming resolved via ADR-0011 and retire `Parasoid` correctly.
4. `docs/rfcs/0001-codec-protocol-v2.md` — align status, ratification, summary, and `IR` caveat with the post-alignment verdict.
5. `docs/research/briefs/C_unproven_horizon.md` — add explicit "roadmap input, not a v0.2 gate."
6. `docs/research/briefs/E_benchmarks_v2.md` — make v0.2 default-tier-only explicit.
7. `docs/exec-plans/active/codec-v2-port.md` — split benchmark landing into `M5a` and `M5b`.

### Tier 2 — add the missing maintainer / agent surfaces in this PR

8. `docs/glossary.md` — locked vocabulary and cross-cutting concepts.
9. `docs/contributor-map.md` — maintainer map with two contributing lines.
10. `docs/agent-guides/README.md` — what guide files are for and when to add one.
11. `docs/agent-guides/image-to-audio-port.md` — prompt-ready implementation line for Jamie-style contributors and their agents.

### Tier 3 — the only follow-up that still blocks execution

12. Promote `docs/research/briefs/G_image_network_clues.md` from stub to draft with a concrete G1 verdict before starting image execution work.

### Tier 4 — execution after doctrine lock

13. Start `codec-v2-port.md` at `M0`, then `M1 image`, then `M2 audio`, in that order. The plan is fully drafted (per-package diff, golden parity contract, migration tests, rollback criteria) — see the doc's `## Pre-flight checklist` for the M0 unblock list.

That is the full close-out list. Nothing else in this milestone should be treated as unresolved doctrine.
