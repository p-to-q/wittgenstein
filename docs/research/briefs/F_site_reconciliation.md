# Brief F — Site ↔ repo reconciliation

**Date:** 2026-04-23
**Author:** research (max.zhuang.yan@gmail.com)
**Status:** Draft v0.1 — **reconciliation direction partially superseded 2026-04-25** by the v0.2 alignment + final-audit pass. `THESIS.md`, `AGENTS.md`, and `README.md` now consistently use _"text-first LLMs."_ The site tagline remains the thinner placeholder surface and should be updated by the site rewrite rather than treated as canonical doctrine.
**Summary:** `https://wittgenstein.wtf` resolves, but the page returns nothing more than the tagline _"Wittgenstein — The modality harness for text-first models."_ There is no architecture section, no showcase, no CLI, no CTA to contradict — which means the public narrative is not drifting from the repo, it is simply absent. The correct move is not reconciliation; it is to stand up a minimal v0.1 site straight out of `docs/THESIS.md` and `docs/showcase.md`, then treat Brief F as dormant until there is actually prose on the page to diff.

---

## Context

The public domain `wittgenstein.wtf` predates the April 2026 doc wave — specifically it predates PR #6, which landed `docs/THESIS.md` (the locked master statement), `docs/inheritance-audit.md` (the V/R/N ledger), and `docs/SYNTHESIS_v0.2.md` (branch-level merge brief). Between hackathon-era content and v0.1.0-alpha.2+, a repo owner would normally assume drift: the pitch on the marketing surface lags the engineering surface by weeks, the weeks include at least one naming debate and one path rejection, and whoever wrote the hero copy is not the same person who wrote ADR-0005.

The `inheritance-audit.md` ledger formalizes this worry as **V-3** (verbal inheritance: "`wittgenstein.wtf` content — Unknown staleness vs repo — Which claims on site contradict v0.1.0-alpha.2?") and blocks **N-3** (the rewrite) behind "RFC-0004 driven by R6," i.e. behind the output of this very brief. `SYNTHESIS_v0.2.md` lists the reconciliation as P2 priority: _"website should stop drifting from code/doc state."_ And `THESIS.md` §"What is explicitly open" names _"Public website ↔ repo reconciliation"_ as an RFC-deferred open question.

This brief's job is to produce the diff. If the diff is empty because the site is empty, that is still data, and the verdict adjusts accordingly.

## Method

Three steps, in order:

1. **WebFetch the live site** at `https://wittgenstein.wtf`. Capture whatever text actually renders — tagline, architecture copy, showcase gallery, CLI instructions, footer, license, contact, roadmap. Treat HTTP 2xx with thin content as distinct from 404 / 5xx / DNS failure; each case maps to a different verdict.
2. **Grep the repo** for internal references to `wittgenstein.wtf` so we know what the code and docs _think_ the site says. Candidate files: `README.md`, `docs/showcase.md`, `docs/`.
3. **Construct the reconciliation table** from whatever overlap exists between (1) the observed site surface and (2) the locked repo statements in `docs/THESIS.md`. Where the site has no content on a row, record `no-site-yet` rather than inventing a site claim.

If WebFetch returns nothing usable (DNS fail, 404, blank body, placeholder page, "Coming soon"), the brief still runs, but the reconciliation table collapses to rows whose only action is "update site" — there is nothing to update the repo from, and nothing to retire.

A repo grep for `wittgenstein.wtf` returns exactly three substantive hits: `docs/inheritance-audit.md` (the V-3 / N-3 parking lot), `docs/SYNTHESIS_v0.2.md` (the P2 reconciliation line item), and `docs/research/briefs/README.md` (the index row pointing to this file). Neither `README.md` nor `docs/showcase.md` links to the site. The repo, in other words, has already stopped treating the site as canonical — all outbound traffic goes to GitHub, not to `.wtf`. That is a useful signal before we even look at the page.

## Site snapshot (as of 2026-04-23)

WebFetch on `https://wittgenstein.wtf` resolves (HTTPS 2xx) but returns a document whose only meaningful text is the page title / hero line:

> **Wittgenstein — The modality harness for text-first models.**

Two rounds of WebFetch, one asking for "all visible text, link text, and headings," confirm there is nothing else on the page the content-processing model can see: no architecture section, no "Why this exists," no receipts table, no showcase gallery, no CLI snippet, no install instructions, no reproducibility narrative, no roadmap, no contact block, no license footer, no research lineage, no mention of "Parasoid," no mention of L1–L5, no mention of RunManifest. The word "harness" appears once, in the tagline. The word "text-first" appears once, in the tagline. That is the entire corpus.

This is consistent with a single-`<h1>` static placeholder — the kind of landing page you register a domain and deploy in twenty minutes so the URL in a Show HN post is not a 404. It is _not_ a marketing site. It is a domain squat with a one-line epitaph.

Two caveats on this reading. First, WebFetch summarizes and does not execute JavaScript, so it is at least theoretically possible the page contains client-rendered content the fetch model cannot see. Given the current repo has no web package and no deploy artifact that would produce such content, this is unlikely but not excluded. Second, the page title exactly matches the locked master statement from `docs/THESIS.md` line 9 (modulo the "LLMs" vs "models" suffix — more on that in the table), which is evidence that whoever deployed the placeholder had at least read the thesis. So the site is not stale content; it is thin content.

The practical consequence is that rows in the reconciliation table below are mostly of the form "site claim: no-site-yet | repo truth: _locked statement_ | drift: absence | action: update site." There is only one live contradiction, and it is on the tagline itself.

## Repo truth (v0.1.0-alpha.2+)

What the repo, as of this commit, _would like_ the site to say — drawn from `docs/THESIS.md` (locked master + extension + architectural bet + Path-C rejection + RunManifest spine) and cross-checked against `README.md` (showcase counts, CLI surface, install story, receipts table) and `docs/modality-launch-surface.md` / `docs/showcase.md` (modality group count).

- **Master statement (locked, `THESIS.md` §Master):** _"Wittgenstein is the modality harness for text-first LLMs. It assumes the frontier model is, and will remain, a text-native planner. Modality capability — image, audio, video, sensor, … — is added outside the model, through a portable harness layer that the model does not need to be retrained to use."_
- **Extension form (locked wording, `THESIS.md` §Extension):** _"Harness as multi-modal middleware. Defer modality training to the portability layer. Use small post-training (adapters) plus rule-based codecs to give text-only LLMs multimodal output capability. The LLM plans in symbols; the codec turns symbols into files; the manifest makes every file replayable."_
- **Architectural bet (locked, five layers):** L1 Harness / runtime — routing, retry, seed, budget, telemetry. L2 IR / codec — typed schemas, prompt contracts. L3 Renderer / decoder — IR to bytes; **frozen decoders in-bounds, general generators not the default path.** L4 Optional adapter — small learned translators, shipped beside codecs, not inside the base model. L5 Packaging — CLI, install, docs, agent primers.
- **Reproducibility bet (locked):** every artifact ships with a `RunManifest` (git SHA, lockfile hash, seed, LLM input/output, artifact SHA-256, cost, latency, error taxonomy). _"If a run cannot be replayed bit-for-bit, it did not happen."_
- **Path rejections (locked):** **Path C — Chameleon / LlamaGen-style full multimodal retrain — is not pursued.** Diffusion in the core image path is out (see `docs/hard-constraints.md`, ADR-0005). No silent fallbacks. Cloud-API dependence is not the default.
- **Showcase (as of `README.md` and `docs/showcase.md`):** **35 real artifacts across 7 modality groups**: image, TTS, music, soundscape, sensor-ECG, sensor-temperature, sensor-gyro. Full pack under `artifacts/showcase/workflow-examples/`. Every artifact has a matching run manifest in `artifacts/runs/<run-id>/`.
- **CLI surface:** two shipping surfaces — Python (`python3 -m polyglot.cli <modality>`) and TypeScript (`pnpm --filter @wittgenstein/cli exec wittgenstein <modality>`). `doctor` command exists. Install: Node ≥ 20.11, pnpm ≥ 9.0, Python ≥ 3.10.
- **Open (not yet fully shipped):** per-modality quality benchmarks beyond structural proxies. CLI ergonomics in the public surface. Website ↔ repo reconciliation. Naming and the one-round default are no longer open doctrine.
- **License:** Apache 2.0 (`LICENSE`, README badge).
- **Release:** `v0.1.0-alpha.2`, early-stage, breaking changes possible before `0.1.0`.

## Reconciliation table

Columns: **site claim** | **repo truth** | **drift** | **action**. Rows cover the surfaces a reasonable visitor would expect; `no-site-yet` is recorded where the site is silent.

| #   | Site claim                                                        | Repo truth                                                                                                                                                                             | Drift                                              | Action                                                                                                                                           |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | _"The modality harness for text-first models"_ (tagline, present) | _"The modality harness for text-first LLMs"_ (`README.md`, `THESIS.md`, `AGENTS.md`)                                                                                                   | Site placeholder now lags the locked repo wording. | **update site** during the site rewrite; repo is already internally aligned.                                                                     |
| 2   | Modality count — no-site-yet                                      | 7 modality groups (image, TTS, music, soundscape, sensor-ECG, sensor-temp, sensor-gyro)                                                                                                | Absence                                            | **update site** — add a single line naming the seven groups.                                                                                     |
| 3   | Modality list — no-site-yet                                       | Same as above; _video_ is 🔴 stub per README §Experimental                                                                                                                             | Absence                                            | **update site** — list seven groups, explicitly mark video as stub to match `docs/implementation-status.md`.                                     |
| 4   | Architecture diagram — no-site-yet                                | L1–L5 locked in THESIS §Architectural bet; full ASCII diagram in README lines 92–112                                                                                                   | Absence                                            | **update site** — port README ASCII block or render an SVG of the same.                                                                          |
| 5   | Showcase count — no-site-yet                                      | 35 artifacts, curated samples for 8 hero tiles (README lines 75–82); `docs/showcase.md` canonical                                                                                      | Absence                                            | **update site** — embed the 8-tile curated grid linking to raw artifacts, or iframe `docs/showcase.md`.                                          |
| 6   | CLI install instructions — no-site-yet                            | Two surfaces; README §Install + §CLI; requirements Node ≥ 20.11, pnpm ≥ 9.0, Python ≥ 3.10                                                                                             | Absence                                            | **update site** — include the 30-second quickstart block verbatim from README lines 121–126.                                                     |
| 7   | Reproducibility story — no-site-yet                               | RunManifest spine locked in THESIS §Reproducibility; artifact trail example in README lines 174–180                                                                                    | Absence                                            | **update site** — one paragraph + the `artifacts/runs/…` tree snippet.                                                                           |
| 8   | Research lineage / citations — no-site-yet                        | `docs/research/neural-codec-references.md`; Brief A on VQ/VLM lineage; `docs/research/briefs/README.md` index                                                                          | Absence                                            | **update site** — link out to `/docs/research/briefs/`, no inline citations needed.                                                              |
| 9   | Naming — does site say "Parasoid"?                                | No. Site has no body copy. Repo has now locked ADR-0011 vocabulary and retired "Parasoid."                                                                                             | No drift.                                          | **no action.** If site adds body copy, use only the ADR-0011 vocabulary.                                                                         |
| 10  | Roadmap claims — no-site-yet                                      | `docs/roadmap.md` + `docs/implementation-status.md` Ships / Partial / Stub matrix                                                                                                      | Absence                                            | **update site** — link to `docs/roadmap.md`, do not inline a roadmap that will drift.                                                            |
| 11  | Contact / license footer — no-site-yet                            | Apache 2.0; GitHub Issues is the support surface (`SUPPORT.md`)                                                                                                                        | Absence                                            | **update site** — add footer: `Apache 2.0 · github.com/p-to-q/wittgenstein · issues`.                                                            |
| 12  | Benchmarks claims — no-site-yet                                   | README §Receipts table (6 rows, real numbers, measurement protocol in `docs/benchmark-standards.md`). Quality scores (CLIPScore/WER/UTMOS) flagged as ⚠️ Proxy in experimental matrix. | Absence                                            | **update site** — either embed the Receipts table verbatim or omit benchmarks entirely; do not paraphrase and create new drift.                  |
| 13  | Path rejections (diffusion, Path C) — no-site-yet                 | Locked in THESIS §Path rejections and `docs/hard-constraints.md`                                                                                                                       | Absence                                            | **update site** — one line: _"No diffusion in the core image path. No full multimodal retrain."_ Helps readers who arrive from Chameleon / Emu3. |
| 14  | Release / status banner — no-site-yet                             | `v0.1.0-alpha.2`, early-stage, breaking changes possible before 0.1.0 (README lines 25–29)                                                                                             | Absence                                            | **update site** — include the exact status banner. Reduces expectation mismatch for first-time visitors.                                         |
| 15  | Call-to-action — no-site-yet                                      | README §"How to help" — three paths, quickstart first                                                                                                                                  | Absence                                            | **update site** — one CTA: _"Open a real artifact in 30 seconds →"_ linking to `docs/showcase.md`.                                               |

Net: almost every row resolves to **update site**, and none requires the repo to move back toward the placeholder wording. Calling this a "reconciliation" is generous — it is a content brief for a site that does not yet exist.

## Red team

Three pushbacks worth taking seriously.

**"Site is marketing, repo is engineering, drift is expected and healthy — stop trying to reconcile them."** Partially fair. For mature projects, the marketing surface legitimately runs ahead of the engineering surface (to set direction) and behind it (to avoid shipping vapor). The objection fails here for two reasons. First, there is no marketing surface to diverge. The site is one line. One line cannot drift in the useful sense; it can only be silent or wrong, and today it is silent. Second, the specific drift that was feared — hackathon copy still saying "diffusion" or "Parasoid" or a stale modality count — does not exist to be defended. Reconciliation is premature because there is nothing to reconcile, not because drift is healthy.

**"Reconciliation before RFC-0001 lands is premature — naming and protocol will shift again; you will write this brief twice."** Strong objection. The inheritance-audit explicitly parks naming (R-9, V-2) at ADR-0010 and the public-site rewrite (N-3) at "RFC-0004 driven by R6." If Brief F's output drives RFC-0004, and RFC-0004 lands after RFC-0001 (CLI) and the naming pass, then any site copy written today gets rewritten when the middleware layer stops being "Parasoid" and starts being whatever-it-becomes. The mitigation is deliberate: write site copy that only references locked statements (THESIS §Master, §Extension, §Architectural bet, §Reproducibility, §Path rejections). Every one of those is ADR-gated; none of them is expected to move before v0.2. Avoid the open-question surfaces (layer naming, CLI ergonomics, benchmark protocol beyond structural proxies), and the site survives the next three RFC-landings unchanged.

**"Just retire the site until v0.2 ships."** Also reasonable, and arguably the lowest-risk path. The case against retirement is that `wittgenstein.wtf` is the canonical URL people paste into Slack, HN comments, and tweets; if it 404s, the default reader assumption is "this project died between the hackathon and now." A one-line placeholder is not better than a 404 — it is a 404 with extra steps. Either retire the domain (redirect to the GitHub README) or fill it. The middle state we are currently in is the worst of both worlds: the URL resolves, so readers don't get the _"search GitHub instead"_ bounce, but nothing on the page justifies the visit.

## Kill criteria

Concrete conditions under which Brief F should be archived rather than extended.

1. **If the site remains a one-page placeholder for more than a reconciliation cycle, the correct move is retire-and-replace, not patch.** A reconciliation table makes sense only when there is a site with content to diff. If the action count on a real content site ever exceeds 20 rows with "update site" outnumbering "update repo" by more than 10:1 (current ratio: 14:1 against one mostly-empty row), the brief has drifted from reconciliation into a roadmap for a site that does not exist — wrong tool.
2. **If RFC-0004 (public-site rewrite) lands before RFC-0001 (CLI) and ADR-0010 (naming pass)**, Brief F's premise is invalidated: the site will be written against the repo's unlocked surfaces and will immediately re-drift when those surfaces lock. Archive Brief F and replace it with a "site content freeze" brief keyed to locked statements only.
3. **If the site migrates to a framework that renders from `docs/THESIS.md` directly** (a trivial Astro / Eleventy config over the markdown in-repo), reconciliation becomes structural rather than editorial — the site cannot drift from the thesis because it _is_ the thesis. Brief F collapses to a one-liner and the file should be deleted rather than maintained.
4. **If the domain is allowed to lapse or redirected to `github.com/p-to-q/wittgenstein`,** Brief F is moot. The canonical URL becomes the README, the README is already the source of truth, and the reconciliation target disappears.

Any one of (1)–(4) retires this brief. None of them retire the underlying question (_"is our public narrative consistent with our code?"_) — that question survives, but answers go elsewhere.

## Verdict

The site is reachable, but it is a placeholder: one line of hero text, no body, no structure, no drift in the interesting sense. There is no stale "Parasoid," no stale modality count, no contradicted architecture diagram, no mention of diffusion anywhere, no dead CTA. The repo has since aligned internally on _"text-first LLMs"_; the lag now lives on the site placeholder, not inside the repo.

The correct move is therefore not reconciliation. It is (a) stand up a minimal v0.1 site from the locked sections of THESIS + the curated showcase grid, and (b) update the placeholder tagline to the same _"text-first LLMs"_ wording the repo now uses. Park a proper site-vs-repo reconciliation brief until there is a real content site to diff.

**Punch list, priority order:**

1. **Stand up a minimal v0.1 site** as a static page rendered from THESIS §Master + §Architectural bet + §Reproducibility + §Path rejections, plus an embed of the 8-tile curated showcase grid from README, plus the 30-second quickstart. Link everything else out to the GitHub repo. No custom prose; lift verbatim. This avoids creating new drift surfaces.
2. **Update the site tagline** from _"text-first models"_ to _"text-first LLMs"_ so the canonical URL matches the locked repo doctrine.
3. **Add a status banner** matching README lines 25–29 (_v0.1.0-alpha.2, early-stage, breaking changes possible_) above the fold so first-time visitors calibrate expectations.
4. **Park Brief F** and open a follow-up (F.1) only after RFC-0004 has driven real site content. Until then, the reconciliation table is mostly _update site_ and not true reconciliation.
5. **Before reopening,** write the kill criterion for F.1 in advance: if the site continues to be rendered from THESIS directly rather than hand-authored, F.1 never needs to exist.

**The one thing that must change before anyone sees the site again:** the site must carry enough content to be worth resolving to. A one-line placeholder at the canonical URL is strictly worse than a redirect to the GitHub README, because it signals "the project stopped updating" to every reader arriving from outside the repo. Either ship item (1) above, or redirect the domain to `github.com/p-to-q/wittgenstein` until item (1) ships. Do not leave the placeholder live. — research, 2026-04-23.
