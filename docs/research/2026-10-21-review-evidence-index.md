---
date: 2026-10-21
status: evidence index for the 2026-10-21 external review engagement — companion to 2026-10-21-external-review-and-training-readiness-handoff.md
labels: [research-derived, handoff, external-review, index]
---

# Review Evidence Index (2026-10-21)

> **Where the files actually live.** The full report set lives **outside this repo**,
> at `tmp/wittgenstein-review/` on the reviewing machine (the engagement's working
> directory). It is not committed here; this index preserves the map — filename →
> one-line content → key numbers — so a future session knows what exists and what
> each item claimed. The engagement's synthesized, durable record is the handoff
> note [`2026-10-21-external-review-and-training-readiness-handoff.md`](2026-10-21-external-review-and-training-readiness-handoff.md)
> on this branch; summaries below point back into it by section.

## Numbered reports (00–17; 06 was never issued)

| File | One-line summary | Key numbers |
|---|---|---|
| `00-diagnosis-report.md` | Synthesis: repo understanding, three owner-worry diagnoses, A/B/C route proposal (CVE verdict corrected in-place after NVD API arbitration) | 6–13 GPU-weeks budget; 12 guardrails; 5+ parallel M1B branches |
| `01-docs-map.md` | Docs deep-read: training-phase anatomy, the 12 pre-training guardrails with doc sources, H1–H10 hypotheses, milestone matrix | 12 guardrails; H-confidence 0.1–0.6 |
| `02-git-code-audit.md` | Git archaeology: factory-day forensics, harness.ts 8-fix hotspot, branch inventory (superseded in counts by the W5 record) | 05-13: 37 commits / 41 PRs / 0 approvals; 551 commits Apr–May, 101 signed (18.3%) |
| `03-claude-sessions.md` | Claude-side session archaeology: ants line, "two projects" ruling, ASR mis-transcription rulings | 15 ants-side open items |
| `04-codex-sessions.md` | Codex-side session archaeology: wittgenstein line, "GM"/"intern" rulings, offline experiment line in the vacuum | 13 wittgenstein-side open items |
| `05-external-research.md` | External research: transformers.js v3/v4, #402 three-option comparison, LlamaGen/taming/MaskGIT gap table (§4.2 CVE claim superseded — see 00) | 3 training-harness repos to copy; 5 control repos, none use Aim |
| `07-issue-triage.md` | All 211 issues staged; open-19 register; factory-day issue forensics (English; Chinese archived) | 211 issues triaged; Stage-II body completeness Context 94% / Acceptance 77% |
| `08-intern-compliance-audit.md` | Three-criteria compliance audit (principles / robustness / citations) — source of E1/E2/E4/E5/R1 and C8 | E-code defect ledger; EvalsSection 9 fabricated bars (re-counted by W7) |
| `09-cleanup-methodology.md` | Engagement charter: intent-first review, S0/S1/S2 triage tiers, route to training | 3 intake tiers |
| `10-intent-sourcebook.md` | 62 verbatim intent quotes (thesis → roadmap → owner's words) with errata (English; Chinese archived) | 62 quotes |
| `11-intent-map.md` | Intent map + final triage ledger (keep/delete/fix/card/owner-call) + corrected debt timeline Part E | wager + 3 kill criteria; 5 owner calls; 4 corrections |
| `12-sprint-audit.md` | October recovery-sprint audit: fix-by-fix verdicts, branch-case findings, awareness blind spots | **B+; 22/24 FIXED-RIGHT, 2 incomplete, 0 fabricated**; Top-5 robustness list |
| `13-forward-roadmap.md` | Merged W1–W16 backlog + capability triage (3 buckets) + batch plan | 16 workstreams; ≤2 PRs/batch |
| `14-training-readiness-spec.md` | Implementation-grade spec: receipt floor (Part 1), LlamaGen three-piece (Part 2), adapter self-build (Part 3), llm-head skeleton (Part 4), coupling map | D1–D4 deltas; E1–E6 resume extensions; 547-line `_shared/manifest.py` baseline |
| `15-master-index.md` | Master index: deliverables table, W1–W16 live status, corrected repo timeline, follow-up cadence | 16 docs + 3 records + 1 upstream cache |
| `16-hf-hosting-implementation.md` | #402 HF-canonical hosting research: exact config diff, HF policy checks (curl-verified), 13-step checklist | 162.57 MB file; 5-site config diff; 3,000 resolves/5 min anonymous |
| `17-local-unmerged-work.md` | Local/unmerged work archaeology: 10-19 sweep excavation, executor identification, dangling-commit census | 5 branches / 7 commits / 31 min; **537 dangling commits, 0 unique recoverable**; PRs #663–#667 closed by withdrawn blocklist |

## Cleanup records (`cleanup/`)

| File | One-line summary | Key numbers |
|---|---|---|
| `W5-zombie-branches-record.md` | Archive record + ready-to-run command list for merged-zombie `claude/*` deletion; 8 M1B parallel branches listed DO-NOT-DELETE | **23** zombies (corrects 24); 23/23 ancestor-verified; 8 protected |
| `W6-dead-site-components-record.md` | Archive record for the `apps/site` dead-kit deletion PR (per delete-after-archiving rule) | **52 files (168,409 B) + 40 deps** (corrects #668's 37); live set 46→6 |
| `W7-evals-section-options.md` | Remediation options for the fabricated EvalsSection: A delete (recommended) / B1 replace with real status matrix | 9 bars + 20 cells + 5 deltas; introduced `185c562` (05-11) |

## Safety archive (`safety-archive/`)

| File | One-line summary | Key numbers |
|---|---|---|
| `wittgenstein-dangling-86814bec3150f4d1f26c088af651db25ba2082a5.{pack,idx,rev}` + `dangling-commits.txt` | Git bundle of every unreachable commit found by `git fsck --unreachable --no-reflogs`, taken before any operation that could trigger `gc` | 537 commits (04: 89 / 05: 345 / 06: 15 / 07: 16 / 08: 11 / 09: 11 / 10: 50); unique recoverable content: **0** |

## Upstream cache (`_upstream/`)

10 source files fetched raw from FoundationVision/LlamaGen, CompVis/taming-transformers,
chuanyangjin/fast-DiT, and huggingface/pytorch-image-models (timm) on 2026-10-21 —
the verbatim evidence base for report 14's three-piece spec (train_t2i.py,
vq_train.py, train_c2i.py, ema.py, extract_codes_c2i.py, extract_codes_t2i.py,
dataset files, taming/fast-DiT EMA lineage). If the spec is ever re-derived, these
are the files to re-fetch.

---

*All locations above are on the reviewing machine (`tmp/wittgenstein-review/`), not
in this repository. The repo-side durable record is the handoff note and this index
on branch `docs/engagement-handoff-2026-10-21`.*