# Staff-level Audit — 2026-05-03

**Date:** 2026-05-03
**Status:** Working note (preserves findings; does not lock doctrine)
**Hats:** Researcher / Builder / Hacker
**Purpose:** Pressure-test the repo against world-class research-engineering standards before v0.3 release.

This memo preserves the findings of the 2026-05-03 staff-level external review. Action items are tracked in `docs/exec-plans/active/v0.3-roadmap.md` and as GitHub issues. The memo itself does not ratify any decision — it is the audit artifact, not doctrine.

---

## Core judgment

Wittgenstein is a **doctrine-locked, implementation-light** project at v0.2.0-alpha.2. Doctrine has run ahead of code by ~1.5 milestones:

- 15 ADRs / 5 RFCs / 11 Briefs / 11 issue templates / two explicit decision lanes / automated guardrails — denser than most 1.0+ open-source projects.
- Doc / code LOC ratio ≈ 0.71. Reference points: PyTorch ≈ 0.05, vLLM ≈ 0.15, Llama.cpp ≈ 0.05, HuggingFace transformers ≈ 0.10.
- ROADMAP Phase 1 image neural codec: **5 of 5 checkboxes still unchecked.** No VQ decoder, no trained adapter, no first golden, no recipe documented, no CLIPScore wiring.
- `fixtures/golden/{image,audio}/` contain only `.gitkeep`. Reproducibility is doctrine, not test.

This is not necessarily wrong — Wittgenstein's thesis is "contract in code, not in prompts" — but at this ratio the project is accumulating **doctrinal debt**: every ADR adds a future commitment to honor.

---

## 1. Researcher hat — reproducibility, evidentiary discipline

### 1.1 README "Receipts" table — 4 of 6 rows are misleading or unsupported

| Row                                                  | Challenge                                                                                                                                                                                                 | Fix                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| 0.7698 BCE on 781 COCO captions, 600 epochs, 9 s CPU | 781 × 600 = 468,600 effective views — textbook overfit territory. No train/val/test split, no holdout BCE, no calibration (ECE/Brier). "9 s CPU" is a counter-signal: model too small or data too sparse. | Add 80/10/10 split, holdout BCE, learning curve. Or rename "training loss," not "validation loss."             |
| 5/5 ambient classifier accuracy "spot checks"        | Anecdote, not metric. 369 examples, even baseline = 16–50%.                                                                                                                                               | Per-class confusion matrix + macro F1 + 5-fold CV mean±std. Or move to "Demos."                                |
| ~52,000× LLM token cost reduction                    | Apples to oranges: 60 tokens vs raw pixels. Frontier vision-LLMs use ViT patches (~256 tokens), not pixels. Real reduction vs SEED-LLaMA / similar: ~6×.                                                  | "structured scene spec saves ~6× LLM input tokens vs frame-level latent baseline (SEED-LLaMA, ViT-L patches)." |
| <2 ms sensor expand latency                          | 2,500 samples × NumPy is trivially fast. No baseline.                                                                                                                                                     | Compare to pandas → resample → matplotlib, or remove.                                                          |
| 10/10 typecheck green                                | Engineering, not research.                                                                                                                                                                                | Move to "Engineering" section.                                                                                 |

### 1.2 Reproducibility — claim vs evidence gap

- README + `docs/reproducibility.md`: "same inputs + same seed + same lockfile → identical artifact bytes."
- `fixtures/golden/{image,audio}/` actual: only `.gitkeep`.

The manifest spine is evidence-collection infrastructure; without a checked-in golden, it cannot prove regression. **No CI gate currently fails when reproducibility breaks.** Lowest-cost fix: sensor goldens (pure NumPy / pure TS, no neural decoder dependency).

### 1.3 Data lineage — not yet airtight

`polyglot-mini/train/build_dataset_coco.py` selects 781 captions but the repo lacks (a) dataset SHA-256 lock, (b) sample-IDs JSON manifest, (c) fixed-seed sampler. "781 examples" is therefore not a reproducible selection. Recommend: every training entry writes `data_manifest.json` referencing dataset hash + sampling seed + sample IDs SHA-256, all transitively pinned by the run manifest spine.

### 1.4 Brief lineage DAG — not yet visualized

11 briefs interlock in non-obvious ways (Brief C revised with H9/H10, Brief A refreshed for VAR/FlexTok, Brief I → ADR-0015). A `docs/research/briefs/lineage.mermaid` DAG (à la OLMo / NEP / PEP processes) makes the chain navigable.

---

## 2. Builder hat — repo hygiene, test discipline, module boundaries

### 2.1 Test:src ratio — 0.17 globally, dangerously skewed

| Package          | src LOC | test LOC | Ratio    | Verdict                                             |
| ---------------- | ------- | -------- | -------- | --------------------------------------------------- |
| `codec-image`    | 1,650   | 417      | 0.25     | OK                                                  |
| `codec-audio`    | 963     | 211      | 0.22     | OK                                                  |
| `schemas`        | 733     | 247      | 0.34     | Good                                                |
| `codec-video`    | 704     | 141      | 0.20     | Watch (stub-heavy, no stub-contract test)           |
| `cli`            | 632     | 23       | **0.04** | 🔴 user-facing surface                              |
| `codec-sensor`   | 542     | 39       | **0.07** | 🔴                                                  |
| `core`           | 1,575   | 78       | **0.05** | 🔴 manifest spine + retry + budget + seed live here |
| `codec-svg`      | 97      | 41       | 0.42     | Good                                                |
| `codec-asciipng` | 302     | 34       | 0.11     | Watch                                               |

`packages/core` 0.05 is the most dangerous: `manifest.ts`, `seed.ts`, `router.ts`, `budget.ts`, `retry.ts` are the implementation of the reproducibility promise. **Recommend hard threshold:** `core` ≥ 0.4, `cli` ≥ 0.25, encoded in `engineering-discipline.md` as a pre-merge check.

### 2.2 Goldens — invoked in doctrine, absent in tree

`docs/hard-constraints.md`: "Goldens are the regression baseline. Byte-for-byte for deterministic decoders." `fixtures/golden/{image,audio}/`: only `.gitkeep`. Sensor (pure NumPy / TS) can produce the first byte-for-byte golden in hours.

### 2.3 Doc:code structural over-density

- 11 root-level governance markdown.
- 37 docs.
- 15 ADRs / 5 RFCs / 11 Briefs / 11 issue templates.
- A workflow (`doctrine-guardrail.yml`) whose purpose is to nudge "cite an ADR when changing doctrine."

This is the meta-governance signal. Smart design (ADR-0014's two-lane decision model is excellent), but only justifies its weight while doctrine is changing more often than code. After M2 audio + first VQ decoder bridge land, doctrine should freeze.

### 2.4 Hygiene smells

- `apps/site copy/` — Mac Finder duplicate (untracked, local cruft).
- `output/play-animation copy.html` — **git-tracked.** `git rm --cached` it; add `* copy*` ignore pattern.
- `output/` at repo root — semantically generic; should be `artifacts/showcase/legacy/` or similar.
- `loupe.py` at repo root vs `polyglot-mini/loupe.py` — duplicate or symlink, neither is canonical.

### 2.5 Codec independence — currently honored by convention, not by CI

Hard-constraint says "codecs depend only on `schemas`." No CI rule enforces it. A 5-line `dependency-cruiser` (or `madge`) configuration closes the gap.

### 2.6 dependency-review-action: `continue-on-error: true`

The single PR-time supply-chain gate is non-blocking. Set `fail-on-severity: high` and `deny-licenses: GPL-3.0, AGPL-3.0` (Apache-2.0 incompatibility).

---

## 3. Hacker hat — secrets, attack surface, supply chain

Overall: secrets hygiene is among the cleanest early-stage repos audited. `grep` for `sk-` / `AIza` / `ghp_` / `xoxb-` / `-----BEGIN`: zero hits. Env vars use `WITTGENSTEIN_*` namespace. `.env.*.local` correctly gitignored. SECURITY.md exists; polyglot-mini sandbox warning is honest.

Four specific holes:

### 3.1 `pull_request_target` attack-surface lock-down

`doctrine-guardrail.yml` uses `pull_request_target` (runs on base commit but with write tokens). Current configuration is safe: `permissions` limited to `contents: read` + `pull-requests: write`; workflow only calls `github.rest.pulls.listFiles` + `issues.createComment`; no `actions/checkout`. **Risk:** if a future change adds `actions/checkout@vN with: ref: ${{ github.event.pull_request.head.ref }}`, the workflow becomes a token-leak vector. **Mitigation:** add a top-of-file lock comment ("NEVER add checkout-with-PR-ref to this workflow"); encode in `engineering-discipline.md`.

### 3.2 dependency-review-action gating

See §2.6 — the same fix is both Builder and Hacker concern.

### 3.3 CodeQL on `default` query suite, autobuild for Python

- Switch query suite to `security-extended` or `security-and-quality`.
- For Python: explicit `setup-python` + `pip install -r polyglot-mini/requirements.txt` + `setup-codeql` with `setup-python-dependencies: true`.

### 3.4 polyglot-mini sandbox = subprocess + 20 s timeout + safe globals

Honest research-grade boundary. README + SECURITY.md flag it. Long-term path is `nsjail` / `bubblewrap` / Pyodide-WASM. The audit recommends ratifying the boundary as **ADR-0016** rather than leaving it implicit in `SECURITY.md`. The `@wittgenstein/sandbox` 30-LOC TS stub is the placeholder for the production path.

### 3.5 `apps/wittgenstein-kimi` 7,404 LOC = single largest TS surface

If it's a demo deck, its npm dependency graph should not share the audit surface with `@wittgenstein/cli`. **Recommend:** move out of root `pnpm` workspace, or give it a separate `dependabot.yml` directory entry with stricter ignore rules.

---

## 4. Progress reasonableness — v0.2.0-alpha.2 → v0.3

- 161 commits / 13 days; weekly cadence already naturally falling (119 → 42 commits).
- 96 PRs, latest #96+; merge rate healthy.
- 4 release tags (v0.1.0-alpha.1, .2, v0.2.0-alpha.1, .2) — release cadence healthy.
- 2 maintainers (`@Jah-yee`, `@Moapacha`); CODEOWNERS routes all doctrine surfaces.
- 4 active feature branches (Codex-driven M2 audio slices A/B/C1/C2).

But:

| Where effort _should_ go                                  | Where recent PRs actually go                             |
| --------------------------------------------------------- | -------------------------------------------------------- |
| VQ decoder bridge + adapter training + first image golden | M2 audio routing slices, ADRs 0012–0015, brief refreshes |
| Sensor byte-for-byte golden                               | Label taxonomy, two-lane ADR                             |
| `core` / `cli` test ratio raise                           | Doctrine guardrail, governance lane ADR                  |

ROADMAP Phase 1 image: 5 unchecked boxes, none budged in 2 weeks. Phase 2 audio: routing slices in flight, but Kokoro/Piper integration + UTMOS/WER not yet started. Recent two weeks have skewed governance-lane.

**Healthy v0.3 path:** doctrine freeze for ~3 weeks; spend the PR budget on (1) one real VQ decoder bridge (even quantized LlamaGen 7B, narrow wrapper); (2) sensor byte-for-byte golden; (3) `core` test ratio → 0.4. These three matter more than four more ADRs.

---

## 5. Three open questions surfaced by the audit

These are not closed by this memo — they are surfaced for the maintainer to answer, ideally as Governance Notes or paired ADR amendments.

### Q1 — One non-negotiable engineering contract from alpha to 1.0?

If forced to keep only one, which: **manifest spine** (evidence collection) or **byte-for-byte goldens** (testable proof)? The audit's lean: byte-for-byte goldens, because evidence without verification is documentation.

### Q2 — Should `doctrine-guardrail.yml` become a rate limiter?

Current behavior: nudge if PR touches doctrine without ADR ref. Proposed extension: refuse to label-pass a new ADR PR if the previous ADR has not produced at least one engineering-lane code PR. This makes ADR-0014 §Kill criterion ("> 1 ADR/week sustained for 4 weeks") mechanical.

### Q3 — README "Receipts" purity vs density?

Two postures: (a) keep 6 rows (educational density, mixed signal) or (b) trim to 3 rows that all re-compute by `pnpm` from a clean checkout (evidentiary purity, lower density). The audit's lean: (b).

---

## Action mapping

Each finding maps to the v0.3 roadmap (`docs/exec-plans/active/v0.3-roadmap.md`):

- §1.1 → P0.2 README receipts tightening.
- §1.2 → P0.1 sensor goldens.
- §1.3 → P2.1 dataset reproducibility lock.
- §1.4 → P2.3 brief lineage mermaid.
- §2.1 → P1.1 core/cli test ratio raise.
- §2.2 → P0.1 sensor goldens (cross-cutting).
- §2.3 → P2.5 doctrine freeze sprint.
- §2.4 → P0.3 hygiene cleanup.
- §2.5 → P1.3 codec-cruiser CI rule.
- §2.6 / §3.2 → P1.2 supply-chain CI hardening.
- §3.1 → P1.2 (lock-down comment + engineering-discipline rule).
- §3.3 → P1.2 (CodeQL upgrade).
- §3.4 → P2.4 ADR-0016.
- §3.5 → P2.2 kimi workspace extraction.

The roadmap is the single source of truth for what gets executed and when. This memo is the source of truth for **why**.
