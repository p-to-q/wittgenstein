---
date: 2026-05-08
status: research note (audit plan)
labels: [research-derived, m1-image, audit-plan]
tracks: [#283, #272, #258, #70, #109]
---

# Radar local-audit plan — per-candidate gate sheets

> **Status:** research note (audit plan, not audit results).
> Defines the structured per-candidate audit each radar follow-up needs to clear before any tokenizer family wires for M1B. This note is the *checklist*; the actual audits land as either short comment-on-#283 entries or one-PR-per-cleared-candidate.
> _Tracker: [#283](https://github.com/p-to-q/wittgenstein/issues/283), gates [#70](https://github.com/p-to-q/wittgenstein/issues/70) M1B trained projector._

## Why a plan rather than the audits themselves

The radar (PR #272) named license / weights / determinism / Node-ONNX as the four pre-wire gates. Doing all 11 candidates' audits in one PR would be the volume-as-virtue trap that the #254 r2 review specifically warned against. Worse, a single mega-PR makes flipping individual cells hard later.

This plan provides the *structure* — one gate sheet per candidate, with named files to inspect, named URLs to verify, and explicit "what would falsify the radar's recommendation" criteria. Each candidate becomes its own small audit slice that can be ticked off independently, in priority order.

This plan also makes one thing explicit that the radar (#272) left to follow-up: the radar tagged claims about license, weights, and ONNX status as `verify-locally` (citing #238) without spelling out the verification protocol itself. The protocol is below. **Per-candidate audits must inspect external sources** — `LICENSE` files at the candidate's reference repo, HuggingFace model cards, ONNX export status — **at execution time**, and record the inspected URLs plus content SHAs so the audit is reproducible when those external sources change later. This note defines the audit template; it does not assert verdicts on the gates themselves.

## The four-gate template

Every candidate gets the same four-gate sheet. Each gate is binary (pass / fail / unknown). A candidate clears the audit when all four are pass.

### Gate A — License clarity

**Pass criterion.** The candidate's reference repo carries an `Apache-2.0`, `MIT`, or `BSD-2/3` license file at the documented path. The license applies to both code and any pre-trained weights bundled or referenced.

**What to inspect.**
- `LICENSE` (or `LICENSE.txt`, `COPYING`) at the repo root.
- `README.md` for any license-tier qualifications ("non-commercial," "research-only," "Apache-2.0 except for X").
- HuggingFace model cards for separate weight licenses (sometimes models are under different terms than code).
- For multi-checkpoint repos, the specific checkpoint's license card.

**What can fail this gate.**
- License is research-only / non-commercial.
- Code is permissive but weights are restricted (or vice versa).
- License is missing entirely (treat as fail until clarified).
- Custom corporate license without OSI approval (treat as fail; legal review burden is high).

### Gate B — Weights availability + SHA-pinning

**Pass criterion.** The candidate's pre-trained weights are downloadable from a stable URL with a verifiable SHA-256 at the time of download. We can pin the exact version we use.

**What to inspect.**
- HuggingFace hub: model card has explicit version tags + commit SHAs.
- Model weight files (`.safetensors`, `.pt`, `.onnx`) have published checksums.
- Mirrors: at least one independent location holds the same weights.
- Size: a CPU-runnable ablation checkpoint exists (sub-1GB preferred for development; <100MB ideal).

**What can fail this gate.**
- Weights are gated behind a license-acceptance form (slows wiring; not a hard fail but flag).
- Weights are only on a single host (single point of failure; flag).
- No checksum metadata published (fail — cannot pin the exact weights).
- Weights too large for development laptops (>10GB is impractical).

### Gate C — Deterministic round-trip (empirical)

**Pass criterion.** Running the encoder twice on the same input under the same checkpoint produces byte-identical token output. Decoder output from the same tokens under the same decoder checkpoint produces byte-identical pixel output. The full encode → decode → re-encode loop is byte-stable.

**What to inspect.**
- Run the encoder twice on a fixed image; compare token outputs (`==`).
- Run the decoder twice on the same tokens; compare pixel outputs (SHA-256).
- Where applicable, run encode → decode → re-encode; verify round-trip token stability.
- Compare across CPU vs GPU; document the parity class (byte vs structural).

**What can fail this gate.**
- Stochastic ops at inference (sampling, dropout left enabled). Fail.
- CUDA non-determinism (cuDNN benchmark mode, mixed-precision ops). Document; structural-only is acceptable but flag.
- Float-precision sensitivity producing token drift between hardware. Fail (means receipts can't byte-pin).

### Gate D — Node / ONNX / CPU feasibility

**Pass criterion.** The candidate can be invoked from a Node-only or ONNX-runtime path on a contributor's laptop without GPU dependencies. Either:
- An `.onnx` export exists or can be produced from the reference checkpoint, OR
- A `transformers.js` port exists, OR
- A small CPU-only PyTorch / ONNX-Runtime path completes in <30s on a typical laptop.

**What to inspect.**
- Reference repo's `export.py` or equivalent ONNX export script.
- HuggingFace's auto-ONNX surfaces for the model.
- transformers.js compatibility list.
- Community ONNX exports (verify provenance + checksum).

**What can fail this gate.**
- Custom CUDA ops with no CPU fallback. Fail — cannot run in dev environment.
- ONNX export breaks on critical layers (often happens with attention variants).
- CPU inference is so slow it's unusable (>5min for one image).

## Per-candidate gate sheets

The 11 candidates from #272 with priorities derived from the radar's recommended ranking. **VQGAN-class first** because it's the only candidate that already satisfies schema-fit + decoder-bridge slot in the codec.

### Priority 1 — VQ-VAE / VQGAN

| Gate | Status | Specific verifiers (require live inspection of external sources) |
|---|---|---|
| A. License | `unknown — verify` | Inspect `CompVis/taming-transformers` `LICENSE`. #238 §1 inherits "MIT (Heidelberg + CompVis)"; need to confirm MIT or other compatible. Also check `FoundationVision/LlamaGen` (the existing default decoder family) `LICENSE`. |
| B. Weights | `unknown — verify` | HuggingFace `CompVis/taming-transformers` model card; LlamaGen checkpoints. Confirm SHA-256 metadata + size. |
| C. Determinism | `unknown — verify` | Run decode-twice on the same VQ codes; expect byte-identical PNG. Run encode-twice on same image; expect identical token grid. |
| D. Node/ONNX | `unknown — verify` | Look for community ONNX exports. If none, attempt a minimal export of just the decoder half (encoder needed only for offline tooling). |

**Prerequisite shortcut.** LlamaGen-class is the *named* default in the codec's `DecoderFamilySchema` today (`packages/codec-image/src/schema.ts` — `DecoderFamilySchema.default("llamagen")`), but the bridge itself is currently a stub (`packages/codec-image/src/decoders/llamagen.ts` → `NotImplementedError`). If LlamaGen-class license clears, wiring the bridge becomes the natural M1B implementation work; the schema slot is already shaped for it, which is the actual cascade.

**Falsifies-recommendation if.** License is anything other than Apache/MIT/BSD on EITHER taming-transformers OR LlamaGen, **or** a CPU decoder path won't run in <30s for a 256² image with reasonable RAM (<4GB).

### Priority 2 — FSQ (Finite Scalar Quantization)

| Gate | Status | Specific verifiers |
|---|---|---|
| A. License | `unknown — verify` | Author affiliation: Google Research. Check the reference repo (likely `google-research/finite-scalar-quantization` or co-located in another Google ML repo). License history of Google ML repos is mixed; this is the binding gate for FSQ. |
| B. Weights | `unknown — verify` | Pre-trained FSQ weights may exist on HuggingFace via the paper's referenced checkpoints. Verify exact path. |
| C. Determinism | `inferred-likely-pass` | FSQ has no learned codebook lookup — quantization is structural rounding. Should be byte-stable structurally; verify empirically. |
| D. Node/ONNX | `unknown — verify` | FSQ's quantization layer is small; ONNX export should be trivial if the surrounding model is exportable. Verify on a reference architecture. |

**Falsifies-recommendation if.** License is research-only / non-commercial. The simplicity advantage means nothing if we can't redistribute.

**Hypothesis to verify.** The "VQ-VAE Made Simple" framing in the FSQ paper claims that removing the codebook + commitment-loss complexity of VQ produces a structurally simpler tokenizer. The audit's Gate C (determinism) is the natural verification: if FSQ's structural quantization holds up empirically, FSQ becomes the lowest-implementation-cost option in the radar conditional on Gate A (license) clearing.

### Priority 3 — OpenMAGVIT2 (LFQ-bearing)

| Gate | Status | Specific verifiers |
|---|---|---|
| A. License | `unknown — verify` | OpenMAGVIT2 is a community reproduction. Check the maintainer's `LICENSE` file. Original Google MAGVIT-v2 is unreleased; this gate binds on the reproduction. |
| B. Weights | `unknown — verify` | Check community-published checkpoints. Reproduction quality vs original MAGVIT-v2 should be documented. |
| C. Determinism | `inferred-likely-pass` | LFQ tokens are bit-vectors — no learned codebook lookup. Same structural argument as FSQ. |
| D. Node/ONNX | `unknown — verify` | LFQ layer is structurally simple; bottleneck is the surrounding transformer. Same audit pattern as FSQ. |

**Falsifies-recommendation if.** Reproduction quality (rFID) is materially worse than the published MAGVIT-v2 numbers. The "Language Model Beats Diffusion" thesis depends on the tokenizer being good; a degraded reproduction breaks the bet.

### Priority 4 — TiTok / TA-TiTok

| Gate | Status | Specific verifiers |
|---|---|---|
| A. License | `unknown — verify` | `bytedance-research/TiTok` `LICENSE`. #238 §2 inherits MIT but verify directly. |
| B. Weights | `unknown — verify` | HuggingFace `bytedance-research/TiTok-*` checkpoints. |
| C. Determinism | `unknown — verify` | 1D token sequence may be more sensitive to numerical issues than 2D grid; explicit empirical test important. |
| D. Node/ONNX | `unknown — verify` | #238 §2 said "no native ONNX export at time of survey." This is the binding gate for TiTok. Attempting an export is the audit work. |

**Falsifies-recommendation if.** Schema discriminator (`seedCode.shape: "1D" \| "2D"`) RFC fails ratification. TiTok requires the schema extension; without it TiTok is unreachable.

**Special note.** TiTok's audit triggers a follow-on RFC even if all four gates pass — the schema discriminator is doctrine-adjacent. Schedule the RFC immediately after the audit, not before.

### Priority 5 — MaskBit

| Gate | Status | Specific verifiers |
|---|---|---|
| A. License | `unknown — verify` | `markweberdev/maskbit` `LICENSE`. Surveyed in #272 as `unknown`. |
| B. Weights | `unknown — verify` | Checkpoint availability. |
| C. Determinism | `inferred-likely-pass` | Bit-token quantization is structurally similar to LFQ. |
| D. Node/ONNX | `unknown — verify` | Smaller community work than the others; ONNX export status uncertain. |

**Falsifies-recommendation if.** Unmaintained / non-permissive license. MaskBit is interesting research but the maintenance question is real for a community project.

### Lower priority — XQ-GAN, FlexTok, VAR, RQ-VAE, SPAE, MUSE

These were ranked lower in the radar for binding reasons named there. Auditing them now would be wasted effort:

- **XQ-GAN** (multi-shape framework) — defer until the priority-1-5 audits clear; if VQGAN-class wires successfully, XQ-GAN's unification value drops.
- **FlexTok** — license-blocked; license clearing is the only useful audit.
- **VAR** — text-conditional release is the gate; class-conditional only.
- **RQ-VAE** — schema-cost gate; not worth the audit until residual depth becomes a binding quality differentiator.
- **SPAE** — license + receipt-determinism gates.
- **MUSE** — no public weights.

A single tracker comment on each can update status quarterly without per-candidate audit overhead.

## Audit deliverable shape

Each cleared candidate produces ONE OF:
- A short PR adding a new file at `docs/research/2026-05-09+/audit-<candidate>.md` with the four-gate verdict and citations to the verified files.
- A comment on **#283** with the same content, if the audit is a clean pass with nothing to add to the codebase.
- A comment on **#283** with explicit `fail` verdict, naming the gate that broke and why.

Failed audits should *not* try to flip the radar's ranking unilaterally — that's what cell-flip language was for in #254 r2. Failed audits surface as data; the radar's overall recommendation flexes when enough cells flip.

## Reproducibility

The audit must be re-runnable when external sources change. Each gate sheet should record:

1. **Date of audit** (license terms can change).
2. **Specific URLs inspected** (full path, not just "HuggingFace hub").
3. **SHA-256 of any LICENSE file content** the auditor read.
4. **SHA-256 of any weights file** the auditor verified.
5. **Encoder/decoder version tag or git commit** the auditor tested against.
6. **Hardware and software versions** for determinism tests (CUDA / cuDNN / PyTorch / ONNX-Runtime).

Without these, a future re-audit cannot know what changed if a verdict flips.

## What this plan does NOT do

- Does NOT do the audits themselves. Per-candidate audits require live inspection of external sources (LICENSE files, model cards, ONNX export status) at execution time.
- Does NOT pick a tokenizer family. The radar (#272) names a recommended ranking; this plan is the verification scaffold.
- Does NOT propose schema changes. TiTok-related schema discriminator is its own RFC, post-audit.
- Does NOT modify `docs/codecs/image.md` or any doctrine surface.
- Does NOT preempt M1B start. M1B unblocks when at least one candidate clears all four gates per the exec plan annotation in PR #293 (#285 reconciliation).

## Cross-references

- **PR #272** — image tokenizer/decoder radar (this plan's parent).
- **PR #294** — prior draft of this plan; superseded by this revision (agent-state phrasing rewritten as repository-neutral protocol per #294 review).
- **PR #271** — VSC theoretical anchor (gates the criteria framing).
- **PR #254 r2** — eval matrix cells (citation discipline this plan inherits).
- **PR #285 reconciliation** (PR #293) — exec plan status update naming this audit as M1B unblock prerequisite.
- **#283** — this plan's commission.
- **#258** — radar commission (closed by #272).
- **#70** — M1B trained projector umbrella (downstream consumer).
- **#109** — VQ decoder bridge readiness tracker.
- **ADR-0018** — adapter as seed expander; this audit's framing inherits from there.
