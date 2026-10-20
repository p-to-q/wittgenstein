---
date: 2026-10-21
status: external-review engagement handoff note — not doctrine, not an ADR
labels: [research-derived, handoff, external-review, training-readiness, cleanup, concern]
tracks:
  [
    #283, #331, #399, #400, #402, #403, #441, #452, #659, #661, #662, #668, #669, #670,
  ]
cross-refs:
  [
    docs/research/2026-05-22-research-and-training-handoff.md,
    docs/research/2026-10-16-project-state-recovery-and-advancement.md,
    docs/research/2026-10-16-decoder-weights-hosting-decision-brief.md,
    docs/research/2026-10-21-review-evidence-index.md,
    docs/training/data.md,
    docs/training/experiment-tracking.md,
  ]
---

# External Review and Training-Readiness Handoff (2026-10-21)

> **Provenance (read this first).** This note was produced by an **external review
> engagement** — an AI-assisted multi-agent review (CodeArts working line, supervised
> by the repo owner) — **not** by the repo's owner or its resident agents. It is
> checked in on the branch `docs/engagement-handoff-2026-10-21` precisely so the
> engagement's findings survive beyond the chat context that produced them. It is a
> research note in the house style of `docs/research/`: not doctrine, not an ADR, no
> locked-constraint surface is touched. Where the full evidence lives only in the
> engagement's report set on the reviewing machine (see §10), this document says so
> explicitly instead of implying the repo contains it.

## 1. What this is

**Scope of the engagement (single day, 2026-10-21):** a full-repo review of
`p-to-q/wittgenstein` at `main @ 54cc5bf` — docs deep-read, git archaeology, Claude-
and codex-side session archaeology, external/upstream research, a 211-issue triage, a
three-criteria compliance audit, an audit of the 2026-10-15→17 recovery sprint, a
merged forward roadmap (W1–W16), an implementation-grade training-readiness spec,
#402 hosting implementation research, and a local/unmerged-work excavation — ending
in a route to training.

**Output form:** seventeen numbered reports (00–17, with 06 skipped) plus three
cleanup archive records, one upstream source cache, and a dangling-commit safety
archive, all under `tmp/wittgenstein-review/` **on the reviewing machine** — that
location is ephemeral. The durable record is **this document plus the branch it is
pushed on**, together with the compact evidence index in
[`docs/research/2026-10-21-review-evidence-index.md`](2026-10-21-review-evidence-index.md).
Every factual claim below carries its pointer (PR #, branch name, commit hash,
file:line, or report §); claims whose only evidence is a report on the reviewing
machine are marked as such.

The engagement was read-only against `main` throughout: no checkouts, no test runs on
the shared checkout, no branch deletions, no pushes to existing branches. Its two
implementation PRs (#669/#670) live on their own branches from separate worktrees.

## 2. The project in one paragraph, and the wager

Wittgenstein is the modality harness for text-first LLMs: the model stays text-only;
structured, code-bearing contracts (Visual Seed Code for image) plus a frozen decoder
deterministically turn planning into real PNG/WAV/CSV/MP4, and every run leaves a
manifest receipt (`docs/THESIS.md`, `AGENTS.md`). The current mainline blocker is
**M1B** (issue #283): the image path still renders a procedural placeholder, and its
unlock path has been rewritten from "wire an external LlamaGen checkpoint" to
"train wittgenstein-native models" (CHANGELOG 0.3.0-alpha.3; research program
`docs/research/2026-05-13-wittgenstein-research-program.md`).

The canonical wager, verbatim (research program L212–216):

> *"How much multimodal capability can we recover, structure, and operationalize from
> text-first models if we move intelligence into the harness, the codec boundary, and
> the decoder-facing code layer?"*

Everything downstream follows from it. The **load-bearing bet** is the distilled,
image-emitting llm-head (250M–1B, teacher LlamaGen-3B) — the research program's own
words: *"If we test this wager only by prompting GPT-5 / Claude / Gemini to emit
Visual Seed Code, we're testing prompt engineering, not the thesis. The thesis
demands a model trained for the interface."* The **cheapest falsifier available
today** is **issue #452 Phase 0** — an LLM emission-entropy test over Semantic IR
(10 prompts × 10 runs, pure local, zero dependencies). It tests whether the
intermediate representation carries information at all — the premise under both the
adapter (1.2) and the llm-head (1.3). If Semantic IR is empty calories, the whole
M1B investment path should be re-examined **before** GPU-hours are spent, not after
(report 11 §A4; kill criteria in `docs/research/briefs/C_unproven_horizon.md`).

Training budget the wager protects (from `research/training/README.md` §Compute and
research-program §1.4): tokenizer ~1–2 GPU-weeks on 8×A100; adapter ~1–3 GPU-weeks on
4×A100; llm-head ~4–8 GPU-weeks on 8×A100; 36 ablation configs → 12–16 real runs.
One Phase-1.1 GPU burn already happened on **LLaVA-Pretrain (research-only license)**
— that checkpoint is validation-only and can never ship
(`docs/training/data.md` §License-clean).

## 3. Five rulings (established facts — do not re-investigate)

These were settled by cross-referenced session archaeology on both the Claude and
codex sides; re-litigating them wastes a future session's budget.

1. **"Two projects" = `wittgenstein` + `ants`.** wittgenstein (the modality harness,
   developed on the codex side) and ants (internal codename lobsterlab, "Autonomous
   Navigation of Tiny-model Space", developed on the Claude side) — independent
   archaeology converged on the same split (report 03 §五, 04 §五, both on the
   reviewing machine).
2. **"GM" = a voice transcription of "跑模型" (running models)**, pointing at the
   wittgenstein M1B training phase. `\bGM\b` has zero semantic hits across both repos
   and both session corpora (base64 noise only) (report 01 §2.1, 03 §6.2, 04 §6.1).
3. **The "弹幕" (danmaku) mentions are ASR mis-transcriptions** of ordinary phrases
   ("单元测试 / 但我们 / 但这些" depending on context). Zero functional hits repo-wide;
   stop treating it as a feature name (report 03 §6.1, 04 §6.2).
4. **CVE-2026-85663 is REAL.** NVD API 2.0 (the authoritative source): Aim ≤3.29.1
   unauthenticated remote tracking server + `getattr` arbitrary method dispatch,
   CVSS 9.3/9.8 CRITICAL, Deferred, published 2026-09-04 — and it was introduced into
   the repo's decision docs **by the owner himself** in `242b91d` (2026-10-15). An
   earlier engagement report (05 §4.2) wrongly called it fabricated/hallucinated;
   the reversal and its method lesson are recorded in §11 below. The Aim-tracker risk
   assessment built on it (`docs/training/experiment-tracking.md`;
   `docs/research/2026-10-16-training-infra-decision-briefs.md` Brief 1) **stands**.
5. **"实习生" (interns) = the owner's name for low-capability AI coding agents**
   (Claude Code / CodeArts / OpenCode), not human interns (report 03 §三, 04 §3.3).
   Quantitative picture (report 02 §三): 101 of 551 Apr–May commits carry explicit
   Claude/Cursor trailers (18.3%, undercount — codex-side branches use unsigned
   lowercase style); the real low-quality marker is the **batch factory pattern**
   (24 branches in one day) and metadata self-entanglement, not the model tier.

## 4. Repo timeline (corrected)

Answering the owner's standing question — "was there progress between May and
October?" — with the corrected actor model (report 15 §Part D; git-verified):

| Window | Commits | Who | Substance |
|---|---|---|---|
| 04-19 → 05-12 | 163 | codex + owner | founding, doctrine lock, M0–M3 |
| 05-13 → 05-24 | ~130 | intern agents (factory day 05-13: 37 commits / 41 PRs, 0 approvals) | bulk issue closure, M1B split |
| 05-25 → 06-01 | 101/week | Parafee41 + koriyoshi2041 (human collaborators) | Gate C/D audit, model-owner closeout, training-PR freeze |
| **06-01 → 06-02** | **5 (3 + 2)** | **RoomWithOutRoof + Jah-yee** | resumable-tokenizer closeout + **data-sweep receipt floor (the W13 skeleton)** + node floor; hackathon data-archive clarification; kimi app deletion (`c7913c9`) |
| 06-04 → 10-08 | 28 | dependabot only | **vacuum** — zero human/agent commits on main |
| 10-15 → 10-17 | 81 | intern-grade agent (bug-hunt intent) | recovery sprint: F1–F9 debt repayment (audited at B+, §5) |
| 10-19 (06:03–06:34 +0800) | 5 branches / 7 commits | **CodeArts session** (cwd `今天 2`; report 17 §A.3 — **not codex**) | offline quality sweep → PRs #663–#667 opened, then closed by the org CodeRabbit blocklist (non-technical; withdrawn 10-20) |
| 2026-10-21 | — | this engagement | review, triage, route to training, this handoff |

Two corrections to earlier models, both now evidence-settled: (a) the stagnation
window is **06-04→10-08**, not "all of June–September" — the first two days of June
carried a final training-side closeout (RoomWithOutRoof, previously unidentified;
their commits are the origin of the `research/training/` resume/closeout skeleton
that the training spec extends — and `Jah-yee` ↔ `RoomWithOutRoof` are the same
human's two git identities, report 17 §B.3); (b) during the vacuum the codex line
**was** active — on an offline codec-sensor/kokoro/Kaggle experiment line whose
outputs went to Kaggle submissions and experiment records, never touching this
repo's git (report 04; corroborated by the dangling-commit census in report 17 §B.1:
the 06–09 buckets contain zero non-dependabot unique work).

## 5. Quality findings that still matter (the surviving defect ledger)

The October recovery-sprint audit (report 12) graded the 10-15→17 sprint **B+**: of
24 verifiable fix claims, **22 FIXED-RIGHT at source level with promised tests
present, 2 fixed-but-incomplete, zero fabricated** — every substantive fix commit's
claims checked against current main, none found to be lies. The deductions were
(a) the sprint's "full code read" excluded `apps/site` entirely and missed two
same-package side-path lesions, (b) the flagship A2 timeout fix covered only the
headers phase of the HTTP cycle, (c) one Stage-A fix (MIT header in `llamagen.ts`)
was silently overwritten by a Stage-C commit (`397a0d1`) hours later. What survives
as open defects, with file:line:

| # | Defect | Evidence | Status / remedy |
|---|---|---|---|
| W1 | **Body-read timeout window** — `fetchWithTimeout` clears its timer when headers arrive (`packages/core/src/llm/http.ts:39–53`); body reads (`openai-compatible.ts:99/:107`, `anthropic.ts:77/:85`) and the ~162 MB weights download (`packages/codec-image/src/decoders/llamagen.ts:272–291`) hang forever on a stalled body; the fetcher's own doc comment promises the opposite (E5-class mismatch) | report 12 §3.1, lead-verified | **FIXED by open PR #670** (branch `fix/llm-body-read-timeout`, commits `e680426` + `b65310f`; status-check and `arrayBuffer()` moved inside the armed AbortController window) — awaiting owner review |
| W2 | **Manifest version forgery** — `readWittgensteinVersion()` silently returns `"0.0.0"` on any package.json read/parse failure (`packages/core/src/runtime/manifest.ts:72–80`); schema-valid, so the write-path validator cannot catch it; introduced `43218ca` (2026-04-19, repo day one) | report 08 §E2, lead-verified | **FIXED by open PR #669** (branch `fix/manifest-version-typed-error`, typed `MANIFEST_VERSION_UNREADABLE`) — awaiting owner review |
| W3 | **#659 warning-code mapping** — `warningCodeFor`'s 7-branch table misses 2 of 9 pipeline warn sites; the logger silently `return`s (`packages/codec-image/src/codec.ts:484–487`) — violates "No silent fallbacks" | issue #659, `status/ready` | **Fixed on branch `fix/image-warning-classifier-total` = closed PR #663** (class-level fix: module-scope `IMAGE_WARNING_CODES`, total `classifyImageWarning` with `image/unclassified-warning` backstop, tests 2→5, `Closes #659`) — **ready to reopen**, zero rebase needed (merge-base = current main HEAD) |
| W4 | E5 comment/value mismatch + **#662** dead `palette_overflow` warning-id declaration (schema has no cap, renderer never reads palette) | report 08 §E5; issue #662 | queued — Batch 2 |
| W6 | **#668 dead site components** — 52 unreferenced shadcn files in `apps/site/src/components/ui/` (168,409 bytes) + **40** removable runtime deps (corrects #668's 37; live set after deletion is 6) — once blocked dependabot's recharts major for days | issue #668; W6 record | archive record ready (52 files + 40 deps itemized) — one deletion PR away |
| W7 | **E4 fabricated EvalsSection** — `apps/site/src/sections/EvalsSection.tsx:8–43`: **9 invented percentage bars + a 5-row "runHistory" table (20 invented cells + 5 invented deltas)**, no data source anywhere in the repo, a disclaimer admitting it; introduced `185c562` (2026-05-11) under a commit titled "tighten homepage copy" | report 08 §E4/C9; W7 record, lead-verified | remediation drafted: **Option A delete the section (recommended)** / B1 replace with the real implementation-status ⚠️/🔴 matrix — owner picks |
| E1 | **Mock-fork test gap** — factory-day fix `486dcf3` claimed "contract locked by schema test" but the test exercised a test-local mock; the real `createHarnessCtx().fork()` (`packages/core/src/harness.ts:480–494`) has zero regression tests (`rg "fork" packages/core/test/` → nothing) | report 08 §E1 | add real-fork regression tests (keep + test) |
| R1 | **18-line `as` assertion** in harness v2 `produce()` reads metadata with no boundary runtime validation (`packages/core/src/harness.ts:176–194`); introduced `47881b0` (2026-04-26) — violates "validate at the boundary" | report 08 §R1, lead-verified | boundary zod check or contract test on the asserted shape |
| — | C8 — Gate C/D receipts live only on a private NFS path (`/nfsdata/wxu/...`), unverifiable from the repo (introduced `bef3026`, 2026-05-28, **human collaborator output — owner to weigh**) | report 08 §C8 | intent card: annotate or commit sanitized scripts/fixtures into `research/validation/` |

Do-not-touch (explicit, so a future agent does not "clean these up"): the placeholder
system (`placeholderLatents`, `seed.ts` `SEED_BRIDGE_NOT_IMPLEMENTED` throw,
`llamagen.ts` cache-only state) — honest, contract-marked partial implementations per
ADR-0016 lineage that M1B bridges onto; doctrine surfaces; early goldens; the 12 open
M1B training-stack issues (#70, #392–#394, #396–#398, #399, #400, #402, #403, #452) —
those are the roadmap, not backlog noise (report 11 §B6).

## 6. Workstream status (W1–W16)

The merged backlog from report 13, status as of 2026-10-21 (report 15 §Part B):

| W | Item | Status |
|---|---|---|
| W1 | Body-read timeout | **PR #670 open, all CI green** (incl. CodeRabbit + Vercel) — awaiting owner review |
| W2 | Manifest version typed error | **PR #669 open, all CI green** — awaiting owner review |
| W3 | #659 warning-code mapping | **upgraded: reopen PR #663** (`fix/image-warning-classifier-total`; merge-base = main HEAD, zero rebase; tests 2→5; blocklist that closed it already withdrawn) |
| W4 | E5/#662 comment & dead declaration | queued — Batch 2 |
| W5 | Zombie branch deletion (**23** verified merged-zombies, not 24) | archive record ready — one approval away |
| W6 | Dead site components (52 files + **40** deps) | archive record ready — one approval away |
| W7 | EvalsSection fabrication | two drafted options — owner picks A (recommended) or B1 |
| W8 | Process-group kill + AbortSignal in `runProcess` | spec'd (report 12 §3.3); queued behind PR slots |
| W9 | Per-call worst-case budget estimate | spec'd (report 12 §3.6); queued |
| W10 | durationMs semantics unification | spec'd (report 12 §3.2); queued |
| W11 | SVG-lane retry + anthropic baseUrl parity | spec'd (report 12 §3.7); queued |
| W12 | #402 canonical hosting decision | brief `136b015` already recommends HF Plan A; implementation research complete (§8 below) |
| W13 | Receipt floor #441/#399/#400 | implementation-grade spec ready (report 14 Part 1); the 06-01 RoomWithOutRoof commits already laid an early skeleton (resume/closeout/data-sweep receipt tooling) — spec extends, not replaces |
| W14 | LlamaGen three-piece | spec ready (report 14 Part 2, source-verified against upstream) |
| W15 | #452 Phase 0 entropy test | design is owner's call; execution on request (local, cheap) |
| W16 | Phase 1.1–1.3 training execution | GPU-bound; 12-guardrail regime; not approachable unsupervised |

## 7. Route to training

The merged sequence (report 11 §Part C, report 00 §Part C, report 13; consistent with
the repo's own ordering in `docs/exec-plans/active/v0.3-roadmap.md` and the S8 row of
`docs/exec-plans/active/m1b-image-implementation-slices.md`):

1. **Falsify cheaply first — run #452 Phase 0** before any GPU-hour (10 prompts ×
   10 runs, entropy of LLM Semantic-IR emissions; zero dependencies).
2. **Zero-cost cleanup batch** (the §5 ledger's delete/one-line items): ≤2–3 PRs per
   batch (org spam precedent), two-hat review each.
3. **Owner calls** (§9): #661 branch protection, #402 ratification, #267, branch
   collapse.
4. **Receipt floor** — #441 → #399 → #400 in the roadmap's own order: training-run
   manifest closeout (args snapshot D1, triple-seed pinning D2, supervisor
   manifest-sibling verification D3, Tier-0 preflight receipt D4), dataset snapshot
   receipts, tracker receipts. Implementation-grade spec: report 14 Part 1 (on the
   reviewing machine); the live baseline it extends is
   `research/training/_shared/manifest.py` (547 lines), `experiment_tracking.py`,
   `data_versioning.py`, and `docs/training/data.md` /
   `docs/training/experiment-tracking.md`.
5. **LlamaGen three-piece** (report 14 Part 2; every upstream claim API-fetched with
   URL + line numbers, cached in `_upstream/` on the reviewing machine):
   - **Checkpoint quartet** (`model` / `optimizer` / `steps` / `args` — upstream
     `train_t2i.py:195–216`; the tokenizer variant adds discriminator pieces,
     `vq_train.py:239–263`). Wittgenstein's current payload has **no `args` key**
     (`tokenizer/train.py:682–686`). Upstream resume has three hidden defects, each
     verified in source: `steps` falls back to **parsing the filename**
     (`train_t2i.py:371`), `start_epoch` is snapped back to an epoch boundary so
     resume **re-runs up to one epoch** of already-trained steps (:372–373), and
     there is **no RNG-state restore**. The spec's E1–E6 extensions fix all three
     (typed `RESUME_STEPS_MISSING` / args-drift check / RNG save-restore + per-rank
     seed derivation / run-id continuity / supervisor verification / optional cloud
     dual-write) — report 14 §2a.2.
   - **EMA** (upstream `utils/ema.py`, 22 lines, function-form, `decay=0.9999`):
     updates **`named_parameters()` only — buffers are never EMA'd** (upstream's own
     TODO). Publish-key conventions: **tokenizer release prefers the `ema` key**
     (`vq_demo.py:25–29`), **AR heads ship raw `model` weights** (`sample_c2i.py:48–56`).
     Lineage note: the weight-EMA ancestor is fast-DiT (`train.py:41–51`,
     byte-identical), **not** taming-transformers (which only has codebook K-means
     EMA). Wittgenstein adoption: class-form EMA over the full `state_dict()`
     including buffers, warmup decay, and — because `TrainingRunManifest` is
     deliberately closed — the EMA fact rides the config snapshot + `@ema`/`@model`
     **metric-name suffixes** + an eval sidecar `weightsSource` field (report 14 §2b).
   - **extract_codes token pre-extraction**: the complete extraction loop exists
     **only on the c2i line** (`extract_codes_c2i.py`: DistributedSampler
     `shuffle=False`, `batch_size=1 # important!`, per-image `.npy` with a
     global-counter filename, flip/ten-crop baked in at extraction); on t2i the
     consumer `Text2ImgDatasetCode` is literally `pass`
     (`dataset/t2i.py:138–140`) and `train_t2i.py` encodes online (L156–158).
     Wittgenstein variant: one **content-addressed token cache**
     (`token-cache/<tokenizer-ckpt-sha256[:12]>/<split>/<image-sha256[:16]>.npy`,
     sharded `.npz` recommended), augmentation **not** baked in (ablation sweeps
     seed length S and k∈{2,4,8}), a `witt.training.token-cache/v0.1` receipt, a
     typed `TOKEN_CACHE_STALE` refusal — and crucially **adapter (1.2) and llm-head
     (1.3) share the cache**, so the encode cost is paid once across both
     subprograms and their 12–16 ablation runs (report 14 §2c).
6. **Adapter (Phase 1.2) is self-build, budget it as such**: `google-research/maskgit`
   ships "Training [Coming Soon]" and never delivered; MAGVIT2/MaskBit have no
   official training repos. Copy the harness conventions from LlamaGen's AR trainer;
   the MVTM masking/γ-schedule/VSC-conditioning-prefix and the 4-step iterative
   decoder are genuinely new (paper arXiv:2202.04200, fetched). Three cheapest
   kill-switch checks embed in the loop: K1 deterministic-replicate null-hypothesis
   gate, K2 6L-vs-12L depth probe, K3 predicted-entropy-vs-VSC-entropy probe
   (report 14 Part 3).
7. **llm-head (Phase 1.3) last** — the load-bearing bet, ~4–8 GPU-weeks. Teacher
   runs in torch (not ONNX; dynamic KV-cache loop), teacher outputs pre-extracted
   into a second cache with a `witt.training.teacher-cache/v0.1` receipt (report 14
   Part 4).

The **12 pre-training guardrails** are already written down across the repo's own
docs (receipt floor before GPU — `m1b-image-implementation-slices.md` S8; triple-seed
pinning — `docs/research/2026-05-13-m1b-training-prep.md`; no silent data swap —
`docs/training/data.md` §Refresh Policy; DVC etag ≠ content hash —
`docs/research/2026-10-16-training-infra-decision-briefs.md` Brief 2; license-clean
for anything shippable — `docs/training/data.md` §License-clean; honest
`determinismClass: structural-parity`; smoke ≠ training success —
`research/training/tokenizer/README.md` §Minimum acceptance bar; Tier-0 self-check
8/8 — `docs/research/2026-05-27-pre-training-readiness.md`; no full-weight runs on
contributor laptops — `docs/research/2026-05-26-m1b-lab-gate-runbook.md`;
tokenizer's own unfinished list — tokenizer README §Not in here yet; #441 closeout
boundary — `docs/research/2026-05-31-training-stack-re-audit-closeout.md`; tracker
security re CVE-2026-85663 — `docs/training/experiment-tracking.md`). The engagement
adds nothing to that list; its finding was that the guardrails are complete and the
**training code itself is not** — `research/training/adapter/` and `llm-head/`
contain READMEs and zero `.py` files.

## 8. #402 canonical hosting — Plan A (HF Hub), ratified-pending

Plan A (own HF Hub repo, commit-SHA pin) is recommended by the in-repo decision brief
at `136b015` (`docs/research/2026-10-16-decoder-weights-hosting-decision-brief.md`)
and the implementation research found **no blockers** (report 16, on the reviewing
machine; HF docs curl-verified 2026-10-21). The change is **config-tier, not
code-tier** — the HF-shaped fetcher is already pre-wired
(`buildHuggingFaceAssetFetcher`, URL template `…/{repoId}/resolve/{revision}/{filename}`
matches HF's resolve scheme segment-for-segment):

| # | Site | Today | After ratification |
|---|---|---|---|
| 1 | `packages/codec-image/src/decoders/llamagen/manifest.json` `repoId` | `"FoundationVision/LlamaGen"` (upstream snapshot; 404s on our filename) | `"<owner>/<new-repo>"` |
| 2 | same, `revision` | upstream snapshot SHA | upload commit's full 40-char SHA |
| 3 | `llamagen.ts:253–255` `resolveWeightsBaseUrl` fallback | `?? undefined` (cache-only default) | `?? "https://huggingface.co"` (env becomes mirror override) |
| 4 | `packages/cli/src/commands/install.ts:77` CLI fallback | env-only | same chain + HF default |
| 5 | `llamagen-decoder.test.ts`, `decoder-weights.test.ts` | pin cache-only default | flip to fetch-enabled; keep `cacheOnly` replay + mirror lanes |

Unchanged by construction: `weightsFilename`/`weightsSha256`/`license`, sha256-
verify-before-atomic-promote, the typed error taxonomy, and `CODEBOOK_VERSION`
(still refers to the upstream snapshot — codebook semantics must **not** follow the
hosting change). The 162.57 MB file rides LFS/Xet automatically via `hf upload`;
anonymous resolver budget is 3,000 req/5 min per IP (one install = one resolve, no
token needed); `x-linked-etag` on LFS files **is** the file's SHA-256, but the
manifest pin stays the trust root.

**Execution checklist (13 steps, report 16 §D):** items 1–8 are owner/HF-side
(namespace + repo name decision → create org → `hf auth login` → `hf repos create` →
model card with `license: mit`, `base_model: FoundationVision/LlamaGen`, tags `[onnx]`
and the provenance chain (upstream commit `ce98ec41…`, HF pin `81e41139…`, upstream
`.pt` sha `109aa8af…`, export script + opset 17, Gate C/D receipts, decoder-half-only,
bytes sha `fd6800b3…`) → locate and re-verify the audited bytes → `hf upload` →
verify `x-linked-etag` == `fd6800b3…` and capture the upload commit SHA); items 9–13
are repo-side (edit manifest repoId/revision → flip the two default URLs → flip the
test assertions → **merge PR #670 before or together with the flip** — a 163 MB body
is exactly the case where a stalled download must not hang a run → end-to-end proof
via empty-cache `wittgenstein install image` + Gate D smoke + `doctor` green, record
the form-changing decision in `docs/changes.md`).

**Four owner-only decisions:** (a) namespace — org vs personal, and the org name
string (all three candidate names were free on 2026-10-21); (b) repo name
(`wittgenstein-harness/image-vqgan-v1` per the #402 issue text, or
`p-to-q/wittgenstein-llamagen-decoder-onnx`); (c) whether to bless a second mirror
now or later (runtime-configured, never manifest-pinned); (d) the HF account actions
themselves.

## 9. Open decisions for the owner (compressed approval list)

1. **Review/merge PR #669 and #670** (both open, CI green; then clean their
   worktrees).
2. **Reopen PR #663** (W3 — the #659 class-level fix; ~15 min; zero rebase) and
   **reopen PR #665** (recharts 2→3, unblocks dependabot #653 held ~5 days; ~10 min).
   The blocklist that closed them was org-level collateral from a *different* repo's
   batch submission and its statement was already withdrawn (2026-10-20); the PR
   channel is demonstrably functional (#669/#670 are open with CI green). #667 needs
   one ADR-0013 reference added to its body before reopen (doctrine-guardrail nudge
   on `CONTRIBUTING.md`); #664/#666 as-is when slots free. Rhythm: ≤2 concurrent PRs.
3. **W5 zombie-branch deletion** — 23 verified merged-zombie `claude/*` branches
   (2026-05-13 factory day; squash content fully in main; 23/23 merge-commit
   ancestor checks pass). The ready-to-run command list is in the W5 record
   (`cleanup/W5-zombie-branches-record.md` on the reviewing machine): one
   `git push github --delete claude/<name>` per branch, executed after approval.
   **The 8 un-collapsed M1B parallel delivery branches are DO-NOT-DELETE**
   (`pr-457`, `p-to-q-pr457`, `pr-527`, `pr527`, `jah-yee-m1b-delivery-rebase`,
   `codex/m1b-audit-delivery`, `codex/m1b-audit-delivery-surface`, `Jah-yee/m1b-doctor`)
   — possible unharvested commits; collapse decision is separately the owner's.
4. **W6 deletion PR** — 52 dead UI files + 40 deps, per the archive record (the
   standing delete-after-archiving rule is satisfied; the record exists).
5. **W7 Option A** (delete the fabricated EvalsSection) — recommended; B1 (replace
   with the real status matrix) drafted as the alternative.
6. **#402 ratification** (§8) → same-day config implementation.
7. **#452 Phase 0 design** — the owner designs the entropy test; execution is local
   and cheap on request.
8. Standing governance calls: #661 branch protection vs auto-merge (`protected:
   false` measured 10-18; auto-merge demonstrably runs ahead of CI), #267 wide-lane
   autonomy boundaries (ratify or close as historical).

## 10. Where everything lives

| Artifact | Location | Durability |
|---|---|---|
| This handoff | branch `docs/engagement-handoff-2026-10-21` → `github` remote | durable (pushed) |
| Evidence index (compact) | `docs/research/2026-10-21-review-evidence-index.md` on this branch | durable |
| **Full 17-report set** (00–17) + `cleanup/` (W5/W6/W7 records) + `_upstream/` (10 cached upstream source files) + `archive-zh/` | `tmp/wittgenstein-review/` **on the reviewing machine only** — NOT in the repo | ephemeral; this document + the index preserve the map |
| Safety archive of 537 dangling commits | `tmp/wittgenstein-review/safety-archive/` (git bundle pack + idx + rev + `dangling-commits.txt`) on the reviewing machine | ephemeral; protects against `git gc` before the owner inspects |
| Open PRs #669/#670 | `fix/manifest-version-typed-error`, `fix/llm-body-read-timeout` on GitHub | durable |
| Five reopen-ready branches | `fix/image-warning-classifier-total`, `docs/regression-audit-2026-10-19`, `fix/site-recharts-3-migration`, `ci/dependabot-ecosystem-labels`, `chore/test-serial-script` on GitHub (PRs #663–#667, closed unmerged) | durable |
| Repo-side anchors cited throughout | `docs/exec-plans/active/*`, `docs/training/*`, `docs/research/2026-05-*` and `2026-10-16-*`, `research/training/*` | durable (in-repo) |

## 11. Corrections register (what this engagement itself got wrong, and fixed)

Honesty requires the engagement's own errors be as visible as the repo's. Each row
was corrected in-place in the report set; the durable lesson is included.

| # | Earlier (wrong) claim | Correction | Lesson |
|---|---|---|---|
| 1 | "CVE-2026-85663 is fabricated / AI-hallucinated" (report 05 §4.2, via NVD **web page** + search engine) | **Real CVE** — NVD **API 2.0**: CVSS 9.3/9.8, Deferred, published 2026-09-04; owner-introduced in `242b91d` | Negative claims ("X doesn't exist") need a *stronger* verification method than the original lookup; NVD's web UI silently redirects for Deferred CVEs — use the API |
| 2 | "The 10-19 sweep never opened PRs / was local-only" (early W5 record framing) | PRs **#663–#667 were opened** (10-18 22:04–22:32 UTC) and then **closed by the org CodeRabbit blocklist** — non-technical collateral, statement withdrawn 10-20 (report 17 §A.1) | Verify PR lifecycle via `gh pr view` state fields before characterizing work as "unpushed" |
| 3 | "No local work during the vacuum" (early model) | The codex line ran an **offline codec-sensor/kokoro/Kaggle experiment line** throughout — outputs went to Kaggle, never to this repo's git (report 04; corroborated by the 537-dangling-commit census: 06–09 buckets are 52 dependabot + 1 pre-landing twin) | "Dormant in repo git" ≠ "dormant"; check off-repo activity channels |
| 4 | The 10-19 sweep executor = codex (assumed) | A **CodeArts agent session** in cwd `今天 2` — codex and Claude Code both exhaustively ruled out (session indices, identifier greps, shell-history mtimes); positive identification via memory files + artifact timestamps (report 17 §A.3) | Executor attribution needs negative *and* positive evidence |
| 5 | 24 zombie `claude/*` branches (report 02) | **23** — verified across three ref stores (GitHub API, clone, bare origin) (W5 record §0) | Counts come from re-runnable inventories, not earlier reports |
| 6 | 37 removable dead deps (issue #668) | **40** — #668's keep-set itself contains 3 deps used nowhere (W6 record §0); live set after deletion is 6, not ~9 | Re-verify keep-sets, not just delete-sets |
| 7 | Six fabricated eval percentages (report 08) | **9 bars + 20 table cells + 5 deltas** — the "runHistory" table is a second fabricated structure the first pass missed (W7 record §0.1) | Read the whole component before counting its fabrications |
| 8 | "Intern-era *late* decline" (early report 11 draft) | **No intern late era exists** — intern batch work ended in May; the actual late phase is the 10-15→10-17 recovery sprint (owner's own correction, 10-21; report 11 §Part E) | Era labels cut both ways; only evidence (file:line, hash, replayable command) holds across eras |
| 9 | PR #358 closed issue #300 on factory day (report 02 correlation) | #300 closed 05-15 by PR #432; 18/19 other pairs verified (report 11 §Part D D2) | Correlations from git logs need `closingIssuesReferences` confirmation |
| 10 | "Intern issue bodies are low-quality" (working hypothesis) | Reversed by measurement: Stage-II bodies are *more* template-complete (Context 94%, Acceptance 77%); the real defects are zero-review merge velocity and verification-type drift (report 07 §3.3) | Calibrate priors against data before characterizing a population |

---

*Pointers: intent map and triage ledger → report 11; sprint audit → report 12;
roadmap → report 13; training-readiness spec → report 14; #402 research → report 16;
local/unmerged work → report 17; master index → report 15 (all on the reviewing
machine, mapped by the evidence index). Repo-side doctrine cited here:
`docs/THESIS.md`, `docs/hard-constraints.md`, `AGENTS.md`, ADR-0013/0014/0015/0016/0018,
`docs/exec-plans/active/v0.3-roadmap.md`,
`docs/exec-plans/active/m1b-image-implementation-slices.md`.*