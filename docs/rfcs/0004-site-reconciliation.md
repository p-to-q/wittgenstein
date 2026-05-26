# RFC-0004 — Site reconciliation actions

**Date:** 2026-04-25
**Author:** engineering (@Jah-yee @Moapacha)
**Status:** 🟡 Draft v0.1
**Feeds from:** Brief F
**Ratified by:** — (no ADR; site-ops RFC, revertible)

**Summary:** `wittgenstein.wtf` is a one-line placeholder, so there is nothing to reconcile — stand up a minimal v0.1 site generated verbatim from `docs/THESIS.md` plus the curated showcase grid, and redirect the domain until that ships.

---

## Context

Brief F (`docs/research/briefs/F_site_reconciliation.md`) resolved the "site drift" question by fetching `https://wittgenstein.wtf` directly and comparing its live surface to the repo truth at v0.1.0-alpha.2+. The finding: the live site is a single line of hero text, no body, no structure. There is no stale "Parasoid," no contradicted architecture diagram, no wrong modality count, no dead CTA. The reconciliation table Brief F constructed has fourteen rows, thirteen of them reading `no-site-yet / update site`, and the fourteenth — an internal `README.md:5` vs `THESIS.md §Master` mismatch on the word "LLMs" vs "models" — lives inside the repo, not between repo and site.

This is not a drift problem. It is an absence problem. The right RFC is not a patch list but a minimal rewrite, produced mechanically from already-locked doc surfaces so no new drift is born in the act of publishing. Because this is a site-ops change — revertible in one PR, outside the code path — it takes no ADR; RFC-0004 is the terminal artifact.

## Proposal

Adopt **Posture B — Rewrite**, with one caveat drawn from Brief F's punch list: do not hand-author prose. The minimum viable public site must be _lifted verbatim_ from `docs/THESIS.md`, `README.md`'s curated showcase grid, and `docs/quickstart.md`'s 30-second invocation. Every line on the site is traceable to one of those three surfaces. No line on the site contradicts the repo, because no line on the site is new.

Before the site ships, execute two preparatory fixes the brief flagged inside the repo:

- **Fix the site↔THESIS noun mismatch**: `THESIS.md §Master` and `README.md:5` both say _"text-first LLMs"_ (locked 2026-04-24 via `docs/v02-alignment-review.md` §2.1); the live placeholder still says _"text-first models."_ The site is the one that must change at M4. No repo edits needed.
- **Park Brief F's follow-up** (F.1) until the site has enough real content to drift from. The kill criterion for reopening F is specified below.

Until the rewrite ships, the current placeholder is worse than nothing — it signals project abandonment to readers arriving from off-repo. Redirect the domain to `github.com/p-to-q/wittgenstein` in the interim.

## Interface

The site is a single static page, statically generated, deployed from a small site repo (or a `docs/site/` subtree — either works; the choice belongs to the site PR, not this RFC). Sections, in order:

1. **Hero** — the master statement, lifted from `THESIS.md §Master`:
   > _Wittgenstein is the modality harness for text-first LLMs._
2. **Status banner** (above fold) — mirrors `README.md:25–29`: _v0.1.0-alpha.2 · early-stage · breaking changes possible._
3. **What it is** — lift the extension-form paragraph from `THESIS.md §Extension form` verbatim.
4. **Architectural bet** — L1–L5 card or five-row table, pulled from `THESIS.md §Architectural bet`. No custom diagrams; use a monospace text figure if anything beyond the table is needed, or none at all for v0.1.
5. **Reproducibility bet** — lift `THESIS.md §Reproducibility bet` — one paragraph, with the "if a run cannot be replayed bit-for-bit, it did not happen" line pulled out as a callout.
6. **What we don't do** — lift `THESIS.md §Path rejection`. One sentence: _We do not pursue full multimodal retrain (Chameleon / LlamaGen)._
7. **Showcase** — embed the 8-tile curated grid already in `README.md`. Each tile links to its artifact in the repo; each carries its `manifest.json` SHA-256 in a tooltip.
8. **Try it** — the 30-second quickstart from `docs/quickstart.md`, verbatim. One CLI invocation, no setup fanfare.
9. **Research lineage** — one line with three links: `docs/research/briefs/README.md`, `docs/rfcs/README.md`, `docs/adrs/README.md`. Let readers walk the provenance chain themselves.
10. **Footer** — GitHub link, MIT license, contact. Nothing else.

Explicit non-inclusions: no roadmap (drifts fastest), no team page, no screenshot gallery beyond showcase, no marketing blurbs, no signup form, no analytics pixel, no "built with ❤️" filler.

Source-of-truth contract: every line of rendered prose on the site must be traceable via `grep` to a line in `docs/THESIS.md`, `README.md`, or `docs/quickstart.md`. The site build should fail CI if any paragraph lacks a `data-source="thesis.md:L42"` annotation on its wrapping element. Drift prevention is a build-time invariant, not a review checklist.

## Migration

Staged, with the interim redirect keeping the public URL useful at every step:

- **M1 (now, this RFC's merge):** authority is transferred to Brief F's verdict. No site work yet.
- **M2 (this week):** no repo-side noun edit needed — THESIS and README already agree on _"text-first LLMs"_ after `docs/v02-alignment-review.md` §2.1 landed. The site is the one that will need to match at M4.
- **M3 (this week):** point `wittgenstein.wtf` at a 302 redirect to `github.com/p-to-q/wittgenstein`. A redirect is strictly better than a placeholder — readers land on a maintained surface instead of a dead one.
- **M4 (within 1 sprint):** ship the site described under `## Interface` as a separate PR in the site repo (or `docs/site/`, decision deferred). Removes the redirect.
- **M5 (on every minor release):** add a "site diff" item to the release checklist — if `THESIS.md` or the showcase grid changed, regenerate and redeploy. Because the site is lifted verbatim, this is a build-and-push step, not a review step.

Kill date for any posture other than Posture B: if M3 has not shipped within 14 days of this RFC's merge, the placeholder continues to signal abandonment and the cost of redirect inaction exceeds the cost of any posture. Hard deadline.

## Red team

- **"Public narrative is marketing; spending engineering cycles here is a distraction from RFC-0001's codec v2 port."** One day of static-site work protects months of agent-hours otherwise spent citing stale claims. Receipts-per-hour is high because the site is generated, not authored — there is no ongoing maintenance surface. The one-liner in M2 and the redirect in M3 take under an hour combined; M4 is a weekend.
- **"If RFC-0003 naming hasn't landed in code, shipping a site with 'harness' and 'codec' terminology risks renaming everything twice."** RFC-0003 keeps `harness` and `codec` as already-canonical words — the renames are `Parasoid → Loom`, `IR → Handoff`, plus the newly-minted `Transducer` and `Score`. The minimal v0.1 site does not surface any of the four renamed terms, because it does not discuss the middleware layer, the IR sum type, or the L3/L4 pair at all. The site speaks only in terms THESIS already uses. No rename cost.
- **"Why not Posture C — just delete the domain?"** Because the domain is an inbound surface: it already has readers. Deleting the DNS record strands everyone currently linking to `wittgenstein.wtf`; redirecting (M3) then upgrading (M4) loses nobody. Posture C's "holding page" variant is what M3 _is_, only cheaper — a 302 is strictly better than a holding page because it leaves readers on a maintained surface.

## Kill criteria

- **If the site drifts within 90 days of M4 landing** (i.e., any rendered line stops matching its source-of-truth file), the `data-source` build-time invariant failed; upgrade to a "site is generated from `docs/THESIS.md` on every push" CI step with no human in the loop.
- **If M3 (redirect) has not shipped 14 days after this RFC merges,** posture collapses — the placeholder's signal cost is now large enough that RFC-0004 is stale; reopen Brief F with a shorter deadline.
- **If M4 ships but Brief F's rows grow past five true drift cases in 90 days** (measured by monthly audit), the "lift verbatim" contract failed in practice; escalate to Posture B.2 — the site becomes a subdirectory of this repo (`docs/site/`) so drift is caught by existing PR review.
- **If `wittgenstein.wtf` is subsumed by a different canonical URL** (e.g., a repo move to `p-to-q.org` or a vanity subdomain under an umbrella org), this RFC is superseded; open RFC-0004.b.

## Decision record

- **Accepted by:** — (no ADR; this RFC is its own terminal artifact — site-ops change, revertible in one PR.)
- **Superseded by:** —
