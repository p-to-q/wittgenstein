# Issue & PR Labels

This page is the canonical definition of every label used on GitHub Issues and Pull Requests in this repository. Adding a new label without updating this page is a process bug — a future contributor cannot infer the label's intent from a one-line GitHub description alone.

The semantic taxonomy remains **flat by design**. Labels such as `research-derived`, `tracker`, `enhancement`, and `discussion` carry body conventions and review meaning.

ADR-0019 adds a separate queue-management layer with prefixed labels: `priority/*`, `size/*`, and `stage/*`. This page extends that same queue layer with `status/*`, `milestone/*`, and `slice/*` labels so maintainers can capture whether an issue needs attention, the roadmap gate, and the local work shape without relying on GitHub's optional Milestone field. These labels answer "do I need to open this, when, how large, which line, which roadmap gate, and what kind of slice?" They do not replace the semantic labels below.

Per `docs/engineering-discipline.md`, a label is a contract: applying one obliges you to satisfy the body conventions listed below (e.g. `research-derived` requires citing the brief; `tracker` requires naming the gating event).

---

## Categories

We think of labels in five categories — **provenance**, **lifecycle**, **type**, **audience**, and **queue metadata**. The first four categories keep flat names. Queue metadata uses prefixes by ADR-0019.

- **Provenance** — where did this come from? (research brief, RFC, ADR, user)
- **Lifecycle** — where is it in its journey? (spike, tracker, blocked, discussion)
- **Type** — what kind of work is it? (bug, enhancement, docs, refactor)
- **Audience** — who can pick this up? (good first issue, help wanted)
- **Queue metadata** — urgency, size, and owning milestone / lane

A typical issue carries 1–3 semantic labels plus queue labels: one `priority/*`, one `size/*`, one `stage/*`, optionally one `milestone/*`, and optionally one `slice/*`. Avoid stacking multiple labels from the same queue family unless the issue is explicitly an umbrella.

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

### Queue metadata

Queue labels are operational triage metadata. They do not change whether an issue is agent-eligible. `tracker`, `discussion`, `horizon-spike`, and `blocked` remain excluded from auto-dispatch per `WORKFLOW.md`.

Queue label families have distinct jobs:

- `status/*` — current handling state: whether the issue needs triage, is ready, has an active PR, needs a decision, or is parked.
- `priority/*` — urgency relative to the active release or mainline gate.
- `size/*` — expected work volume.
- `stage/*` — owning line or area.
- `milestone/*` — roadmap gate or release checkpoint.
- `slice/*` — local shape of the work inside a milestone.

Use at most one `status/*` label on an issue. If the issue is `blocked` or `tracker`, that lifecycle label is the state signal; do not add a redundant status label unless the queue view still needs one.

#### `status/needs-triage`

The issue has not been classified enough to decide whether to open, park, close, or dispatch it.

#### `status/ready`

The issue is actionable now and has no known active PR or blocking decision.

#### `status/has-pr`

An open PR is already handling the issue. Review the PR before starting parallel work.

#### `status/needs-decision`

The next step is maintainer judgment, architectural choice, or discussion closeout rather than implementation.

#### `status/parked`

Known work, but intentionally not current. Usually paired with `priority/p3`, `stage/post-v0.3`, `tracker`, or `horizon-spike`.

#### `priority/p0`

Must resolve before the current release or mainline gate.

#### `priority/p1`

High priority after the current mainline gate. This is the normal label for the next thing maintainers should actively coordinate.

#### `priority/p2`

Important but not current-mainline blocking.

#### `priority/p3`

Parked, horizon, post-release, or only actionable when a later gate opens.

#### `size/s`

Small scoped change or review task. Usually one PR or one issue comment pass.

#### `size/m`

Medium slice with multiple files or focused research.

#### `size/l`

Large implementation, research, or coordination task.

#### `size/xl`

Very large program, umbrella, or multi-slice effort.

#### `stage/m1-image`

Image line: M1/M1B, Visual Seed Code, decoder, or SeedExpander work.

#### `stage/m2-audio`

Audio line: M2 codec v2, audio backend, or audio verification.

#### `stage/m3-sensor`

Sensor line: M3 or sensor research.

#### `stage/m4-video`

Video line: M4 or video backend research.

#### `stage/release`

Release, prerelease, changelog, or public release surface.

#### `stage/governance`

Workflow, labels, doctrine governance, or maintainer process.

#### `stage/cross-cutting`

Cross-cutting schema, CLI, manifest, dependency, or infra work.

#### `stage/post-v0.3`

Explicitly deferred until after the v0.3 release cut.

### Roadmap milestones

Use `milestone/*` when an issue needs to be grouped by the internal roadmap gate, even if the GitHub Milestone dropdown is unset. These labels are not release promises; they name the planning checkpoint the issue feeds.

#### `milestone/m0-protocol`

Codec Protocol v2 base types and no-call-site-change protocol surface.

#### `milestone/m1a-image-port`

M1A image Codec v2 port, image protocol pressure test, and image route migration.

#### `milestone/m1b-image-depth`

M1B image depth: Visual Seed Code, VQ/tokenizer radar, SeedExpander, frozen decoder bridge, image receipts, and image eval gates.

#### `milestone/m2-audio`

M2 audio Codec v2 port, Kokoro/Piper/procedural audio path, audio parity, and route closeout.

#### `milestone/m3-sensor`

M3 sensor Codec v2 confirmation line, deterministic operator programs, patchGrammar, and sensor validation.

#### `milestone/m4-video`

M4 video codec line, HyperFrames or successor backend, local render receipts, and MP4/HTML artifact gates.

#### `milestone/m5a-image-bench`

M5a image benchmark bridge and image quality/eval receipts.

#### `milestone/m5b-cross-modal-bench`

M5b non-image benchmark bridge: audio, sensor, and video evaluation receipts.

#### `milestone/v0.3-release`

v0.3 prerelease packaging, release notes, changelog, tag, and release-surface checks.

#### `milestone/post-v0.3`

Explicitly deferred until after the v0.3 release train.

### Work slices

Use `slice/*` when the issue is part of a larger milestone and the local work shape matters for dispatch. These labels are intentionally generic so they can apply across modalities.

#### `slice/research`

External or internal research that must feed a durable downstream surface such as a note, RFC, ADR, issue, or implementation plan.

#### `slice/doctrine`

RFC, ADR, hard-constraint, operating-doc, or doctrine-surface work. Requires the appropriate decision lane and review discipline.

#### `slice/implementation`

Code or docs implementation work with a concrete acceptance gate.

#### `slice/receipts`

Manifest, metadata, CLI inspection, golden, or proof-surface work that makes behavior auditable.

#### `slice/eval`

Benchmark, metric, quality gate, or evaluation harness work.

#### `slice/cli`

CLI command, flag, user-facing terminal output, or dry-run surface work.

#### `slice/closeout`

Release closeout, issue queue cleanup, stale issue closure, branch hygiene, or post-merge reconciliation.

---

## How to apply labels

**Issues.** When opening an issue, apply 1–3 semantic labels: usually one type (`bug` / `enhancement` / `documentation`) plus optional provenance and lifecycle. When the queue status is clear, also apply one status, one priority, one size, one stage label, and (when known) one milestone and one slice label. The labelling is part of the filing — an unlabelled issue is harder to triage.

For machine labelling, include explicit title tokens when useful: `[p1]`, `[size/m]`, `[image]`, `[audio]`, `[sensor]`, `[video]`, `[release]`, `[governance]`, `[cross-cutting]`, `[m1b]`, `[m3]`, `[research]`, `[doctrine]`, `[receipts]`, or `[eval]`.

**PRs.** When opening a PR, the labelling should match the issue(s) it closes (if any). PRs that don't close an issue still get labelled — usually one type plus one provenance.

**Automation.** `.github/workflows/status-labeler.yml` maintains lightweight queue hints for newly opened or updated issues and PRs. It owns `status/*` replacement for PRs, may add conservative labels from explicit title tokens (`docs:`, `feat:`, `RFC-0002`, `[m1b]`, `[research]`, etc.), and may add `size/*` to PRs from changed-file / changed-line counts when no size label is already present (`size/s` <=3 files and <=80 changed lines; `size/m` <=8 and <=300; `size/l` <=20 and <=1000; otherwise `size/xl`). It does not infer `priority/*` from prose; priority automation requires explicit tokens such as `[p1]`. PR bodies are scanned only for linked issue numbers so the PR template text does not create false labels. When an open PR references an open issue, the workflow may set that issue to `status/has-pr`; when that PR closes, it refreshes the linked issue back to `status/ready`, `status/needs-decision`, or `status/parked` unless another open PR still references it. For issues, existing `status/*` labels are treated as maintainer overrides and are not recalculated; non-status label updates can fill a missing status but will not fight a manual one. Maintainers can manually rerun the workflow with `workflow_dispatch` for a single issue or PR. Dependabot remains limited to dependency labels in `.github/dependabot.yml`; the path and title labelers continue to add their existing static labels.

**Manual maintenance.** The workflow is intentionally not a full triage bot. Maintainers still own `priority/*`, most `stage/*`, `milestone/*`, `slice/*`, assignees, and any issue-to-PR semantic backfill that requires judgment. In particular, changing an issue's labels does not automatically rewrite the labels on all linked PRs. If the issue is re-scoped, the PR author or reviewer should update the PR labels manually or rerun `workflow_dispatch` only for the mechanical status/size/title-token pass.

**Renaming a label is a breaking change** to anyone who has saved searches against the old name. If you need to rename, open a PR that updates this doc, edits the label via `gh label edit`, and announces the rename in the PR body. Consider keeping the old label as an alias (re-create with the same color and a "Renamed to X" description) for one release cycle.

**Adding a new label.** Open a PR that updates this doc with the new entry (color, definition, body conventions). Create the label in the same PR via `gh label create` (or document the manual step for a maintainer). A label without a doc entry is invalid and may be deleted at any time.

---

## Cross-references

- `CONTRIBUTING.md` — first-time setup and contribution flow.
- `docs/engineering-discipline.md` — the canonical operating manual; labels are one of its grippable surfaces.
- `docs/contributor-map.md` — who-owns-what overview.

---

_Last updated: 2026-05-09. Next review: after the next queue-audit pass, or when a label is renamed (always)._
