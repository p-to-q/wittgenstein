# Issue & PR Labels

This page is the canonical definition of every label used on GitHub Issues and Pull Requests in this repository. Adding a new label without updating this page is a process bug — a future contributor cannot infer the label's intent from a one-line GitHub description alone.

The taxonomy is **flat by design**. We do not use prefixes (`area:*`, `type:*`, `phase:*`) because (a) GitHub's label UI does not group by prefix, (b) prefixes consume namespace that becomes hard to refactor, and (c) the repo is small enough that ~15 well-named labels are easier to grip than 30 prefixed ones. If the label set grows past ~20, revisit and consider prefixes.

Per `docs/engineering-discipline.md`, a label is a contract: applying one obliges you to satisfy the body conventions listed below (e.g. `research-derived` requires citing the brief; `tracker` requires naming the gating event).

---

## Categories

We think of labels in four implicit categories — **provenance**, **lifecycle**, **type**, and **audience**. The categories are not encoded in the label name, but they are useful for picking which label(s) to apply.

- **Provenance** — where did this come from? (research brief, RFC, ADR, user)
- **Lifecycle** — where is it in its journey? (spike, tracker, blocked, discussion)
- **Type** — what kind of work is it? (bug, enhancement, docs, refactor)
- **Audience** — who can pick this up? (good first issue, help wanted)

A typical issue carries 1–3 labels: usually one type, optionally one provenance, optionally one lifecycle. Avoid stacking more than three — they stop being grippable.

---

## The labels

### Provenance

#### `research-derived`

Color: `#0e8a16` (forest green).

The issue or PR originates from a research brief under `docs/research/briefs/`. The body **must** cite the brief by letter and (where applicable) hypothesis number — e.g. "Brief C v0.2 H10" or "Brief A v0.1 §2026 additions / Chameleon."

Pair with `horizon-spike` when the issue is a Brief C hypothesis turned into a runnable experiment.

#### `rfc-derived`

Color: `#5319e7` (deep purple).

The issue or PR implements, refines, or contests a numbered RFC under `docs/rfcs/`. The body **must** cite the RFC by ID — e.g. "RFC-0001 §Addendum 2026-04-26" or "RFC-0002 §3."

Use this label on PRs that are the implementation arm of an RFC (the PR is "the code that lands the RFC"), and on issues that propose changes to an RFC after it has been ratified.

#### `adr-derived`

Color: `#006b75` (dark teal).

The issue or PR implements, addends, or contests a numbered ADR under `docs/adrs/`. The body **must** cite the ADR by ID — e.g. "ADR-0005" or "ADR-0008 addendum."

Distinct from `rfc-derived`: ADRs lock decisions, RFCs propose them. An issue can be both `rfc-derived` and `adr-derived` if the work spans the proposal and the ratification.

### Lifecycle

#### `horizon-spike`

Color: `#c5def5` (light lavender).

A Brief C horizon hypothesis turned into a time-boxed experiment with explicit kill criteria. The body **must** restate the hypothesis, name the kill criteria from the brief (the ↑ / ↓ confidence-flip thresholds), and list a concrete validation gate.

Always paired with `research-derived`. May additionally carry `enhancement` (if it adds a feature seam), `tracker` (if blocked on an external event), or `blocked` (if blocked internally).

#### `tracker`

Color: `#b08800` (mustard).

Standing watch on an external event. The issue is not actionable until a named gating event trips (e.g. an open-weights model lands; a paper publishes; a third-party library hits a milestone). The body **must** name the gating event(s) and specify a re-evaluation date if the event has not tripped by some deadline.

A `tracker` issue should not be assigned. Comments on the issue are the place to record signal as it accumulates.

#### `blocked`

Color: `#b60205` (deep red).

Internal blocker prevents progress. The body **must** cite the blocker — usually another issue, an in-flight RFC, or a missing piece of infrastructure. Different from `tracker`: `blocked` means we have the agency to unblock; `tracker` means we are waiting on the world.

When the blocker resolves, remove the label and (if assigned) un-assign-and-reassign to make the timeline visible.

#### `discussion`

Color: `#fef2c0` (pale yellow).

Open architectural deliberation. The issue itself is the deliberation. The outcome may be: (a) a research brief gets amended, (b) an RFC is opened, (c) a `horizon-spike` is filed, (d) the issue is closed as `wontfix` or `duplicate`.

Distinct from `question`: `question` means "I need info to answer this." `discussion` means "the answer is the work — let's deliberate."

### Type

#### `bug`

Color: `#d73a4a` (red, GitHub default).

Something does not work as documented. The body should reproduce the bug and state expected vs. actual behaviour. If the documented behaviour is wrong, prefer `documentation`.

#### `enhancement`

Color: `#a2eeef` (sky blue, GitHub default).

A new feature or improvement to existing behaviour. PRs that add a new public API, a new CLI flag, or a new codec route get this label. Pure refactors do not — use `refactor` instead.

#### `documentation`

Color: `#0075ca` (blue, GitHub default).

Changes to anything under `docs/`, `README.md`, `CONTRIBUTING.md`, `SHOWCASE.md`, or other documentation surfaces. Documentation-only PRs (no code change) almost always get this label, often paired with `research-derived` or `rfc-derived`.

#### `refactor`

Color: `#bfdadc` (sky grey).

Code restructure with no behaviour change — same inputs produce the same outputs, the same tests pass, no new public API. The body should cite the smell being addressed and (if any) the doctrine principle it serves (e.g. "harness modality-blind invariant per `docs/engineering-discipline.md` §Read-before-write").

`refactor` PRs should be reviewable as "is this a true no-op for behaviour?" — if a reviewer cannot answer that question from the diff, the PR is too big.

### Audience

#### `good first issue`

Color: `#7057ff` (purple, GitHub default).

A newcomer-friendly task. The scope is bounded, the file pointers are explicit, the validation gate is mechanical. **Do not** apply to `tracker` or `horizon-spike` issues — those need context. Pair with `documentation` for prose / typo / link work, or with `enhancement` for small well-scoped feature seams.

#### `help wanted`

Color: `#008672` (teal, GitHub default).

Maintainers actively want help on this. Distinct from `good first issue`: `help wanted` may be a deep task; `good first issue` is by definition shallow. The two can co-exist on a small well-scoped task that the maintainer also wants done soon.

### Disposition

#### `wontfix`

Color: `#ffffff` (white, GitHub default).

Decided not to address. The body **must** state why (e.g. "doctrine conflict — see ADR-0007"). Closes the issue / PR. Apply this rather than silently closing — future contributors should be able to find the rationale.

#### `duplicate`

Color: `#cfd3d7` (grey, GitHub default).

Already tracked. The body must link to the canonical issue / PR. Closes this issue / PR.

#### `invalid`

Color: `#e4e669` (yellow-green, GitHub default).

Not actionable as filed (e.g. asks for behaviour that violates a hard constraint, or reports a "bug" that is documented behaviour). The body must explain. Closes the issue / PR.

#### `question`

Color: `#d876e3` (magenta, GitHub default).

The filer needs information to proceed. Distinct from `discussion`: `question` is "please clarify"; `discussion` is "let's deliberate." A `question` should resolve quickly with a comment, after which the label is removed and the issue is closed or relabelled.

### Dependabot-managed

These are applied automatically by Dependabot. Do **not** apply manually.

#### `dependencies`

Color: `#0366d6`.

Dependabot version-bump PR.

#### `github_actions` / `python` / `javascript`

Per-ecosystem dependabot routing labels. Cosmetic; safe to ignore.

---

## How to apply labels

**Issues.** When opening an issue, apply 1–3 labels: usually one type (`bug` / `enhancement` / `documentation`) plus optional provenance and lifecycle. The labelling is part of the filing — an unlabelled issue is harder to triage.

**PRs.** When opening a PR, the labelling should match the issue(s) it closes (if any). PRs that don't close an issue still get labelled — usually one type plus one provenance.

**Renaming a label is a breaking change** to anyone who has saved searches against the old name. If you need to rename, open a PR that updates this doc, edits the label via `gh label edit`, and announces the rename in the PR body. Consider keeping the old label as an alias (re-create with the same color and a "Renamed to X" description) for one release cycle.

**Adding a new label.** Open a PR that updates this doc with the new entry (color, definition, body conventions). Create the label in the same PR via `gh label create` (or document the manual step for a maintainer). A label without a doc entry is invalid and may be deleted at any time.

---

## Cross-references

- `CONTRIBUTING.md` — first-time setup and contribution flow.
- `docs/engineering-discipline.md` — the canonical operating manual; labels are one of its grippable surfaces.
- `docs/contributor-map.md` — who-owns-what overview.

---

_Last updated: 2026-04-26. Next review: when the label set crosses ~20 entries (consider introducing prefixes), or when a label is renamed (always)._
