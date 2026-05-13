---
date: 2026-05-13
status: audit deliverable (Priorities 2-5 of #283)
labels: [research-derived, m1-image, audit]
tracks: [#330, #331, #332, #333, #283, #70]
---

# Per-candidate audits — FSQ / OpenMAGVIT2 / TiTok / MaskBit (Priorities 2-5)

> **Status:** four-gate audits for the remaining four radar candidates, delivering [#330](https://github.com/p-to-q/wittgenstein/issues/330) / [#331](https://github.com/p-to-q/wittgenstein/issues/331) / [#332](https://github.com/p-to-q/wittgenstein/issues/332) / [#333](https://github.com/p-to-q/wittgenstein/issues/333). External inspection performed 2026-05-13.
> _Tracker: [#283](https://github.com/p-to-q/wittgenstein/issues/283); audit-plan source: [`docs/research/2026-05-08-radar-audit-plan.md`](2026-05-08-radar-audit-plan.md); first per-candidate audit (VQGAN-class) landed via [PR #336](https://github.com/p-to-q/wittgenstein/pull/336)._

## Summary table

| Priority | Candidate | Gate A (License) | Gate B (Weights) | Gate C / D | Verdict |
|---|---|---|---|---|---|
| 2 | FSQ | ✅ Apache-2.0 (community impl) | ⚠️ N/A — algorithm, not a packaged tokenizer | quantization primitive likely-expressible; full tokenizer pipeline not validated | **different shape; see §FSQ** |
| 3 | OpenMAGVIT2 / SEED-Voken | ✅ Apache-2.0 | ⚠️ PARTIAL — claims released, no direct HF URL surfaced | requires local compute | **provisional / unresolved pending Gate B URL verification + Gate C/D** |
| 4 | TiTok / 1d-tokenizer | ✅ Apache-2.0 | ⚠️ PARTIAL — "HuggingFace support" claimed, URLs not in README | requires local compute | **provisional / unresolved pending Gate B URL verification + Gate C/D + schema RFC** |
| 5 | MaskBit | ⚠️ **NUANCED**: code Apache-2.0, weights **"research purposes only"** | ✅ Multiple HF repos | local compute | **gated by weights-license carve-out** |

**The most important finding** is on MaskBit (#333): its README explicitly carves weights out from code, marking the trained checkpoints as "research purposes only." That's a real legal restriction for Wittgenstein's open-source / redistribution posture — Gate A doesn't cleanly PASS for MaskBit even though the code is Apache-2.0. This is the first candidate we've audited with an explicit weights/code license divergence.

## Cross-cutting notes

- All four candidates' code repos are Apache-2.0 (matching the audit's Gate A criterion at the code level). The license blob SHA at the API level is identical across them (`261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`), which simply means they all carry the OSI-template Apache-2.0 text — expected.
- None of the four candidates mention **ONNX export, transformers.js, or CPU inference benchmarks** in their README. Gate D (Node / ONNX / CPU feasibility) cannot be assessed without local empirical work for any of them. This is consistent with the VQGAN-class audit's same conclusion.
- The general pattern: licensing risk is mostly retired by external inspection; **operational risk (determinism + CPU/ONNX) requires local compute**. Same shape as VQGAN-class.

## Priority 2 — FSQ (delivers [#330](https://github.com/p-to-q/wittgenstein/issues/330))

### What FSQ actually is (important framing)

FSQ ("Finite Scalar Quantization: VQ-VAE Made Simple", Mentzer et al., ICLR 2024, arXiv:2309.15505) is a **quantization primitive**, not a packaged tokenizer with shipped weights. The paper authors at Google Research did not release a canonical repo.

The radar's framing of FSQ as a candidate at the same level as VQGAN-class was slightly misleading — FSQ removes the codebook + commitment-loss complexity of VQ, so the algorithm is on the order of 50 lines of code, but using FSQ in Wittgenstein means **training our own encoder-decoder with FSQ as the quantization step**, not pulling a pretrained model.

This changes the four-gate audit:

- **Gate A (License):** clears at the **community implementation** level. The closest viable references are:
  - **[`Nikolai10/FSQ`](https://github.com/Nikolai10/FSQ)** — TensorFlow 2 implementation, Apache-2.0, quantization layer only, active maintenance, references the paper directly.
  - **`duchenzhuang/FSQ-pytorch`** — repo 404 at audit time, no longer available.
  - Other community ports may exist (in particular, FSQ is often embedded as a few lines inside larger projects like `lucidrains/vector-quantize-pytorch`).
  - Net: licensing is **PASS** at the algorithm-implementation level, but there is no Apache-2.0 "FSQ tokenizer with weights" to drop in.
- **Gate B (Weights):** **Not applicable.** FSQ has no pretrained weights distinct from whatever surrounding model is trained alongside it.
- **Gate C (Determinism):** **inferred-likely-pass.** FSQ is structural rounding — no codebook lookup, no learned quantizer state — so deterministic round-trip is essentially free once the surrounding model is deterministic.
- **Gate D (Node / ONNX / CPU):** **quantization primitive likely-expressible; full pipeline unconfirmed.** Only the quantization step (rounding + clamping) is structurally trivial to express in any framework. Whether a full FSQ-using encoder-decoder pipeline (the surrounding network architecture, attention layers, training-time ops) exports cleanly to ONNX or runs in <30s on CPU is **not validated by this audit** — that depends on the specific encoder-decoder shape chosen, which doesn't exist yet. End-to-end Node/ONNX/CPU feasibility is deferred to whichever architecture is picked under the training-prep follow-up.

### What "wiring FSQ" actually means for M1B

If M1B's path becomes "use FSQ as the quantization primitive," the work is:

1. Pick an encoder-decoder architecture (VQGAN-style, or simpler).
2. Train it on a small dataset with FSQ in the bottleneck (no codebook losses needed).
3. Ship the trained weights ourselves (we own the license).

This is **much higher implementation cost** than VQGAN-class wiring (which is "download pretrained weights and wire the bridge"), but the long-term licensing posture is cleaner (we own everything, no upstream-license dependency).

### Verdict for FSQ

**Defer to maintainer decision.** FSQ is structurally simpler than VQGAN-class but requires training infra we don't have built. If VQGAN-class (#329 Gates C/D — [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)) clears, that's the right first wiring. FSQ stays open as a "we can own this end-to-end" fallback if VQGAN-class license terms ever change.

**Action item:** rather than running a "Gate C/D for FSQ" implementation slice, the right follow-up is a **training-prep research note** (a sibling to this audit doc) covering: candidate encoder-decoder architectures sized for our use, training-data strategy (license-clean small-image corpus), training infra requirements. **This research note is the appropriate next step for FSQ specifically.**

## Priority 3 — OpenMAGVIT2 / SEED-Voken (delivers [#331](https://github.com/p-to-q/wittgenstein/issues/331))

The radar's `OpenMAGVIT2` candidate is now hosted under [`TencentARC/SEED-Voken`](https://github.com/TencentARC/SEED-Voken) (the older `TencentARC/Open-MAGVIT2` URL now redirects there). This is part of a broader Tencent visual-tokenizer family.

### Gate A — **PASS**

- Code: Apache-2.0 (blob SHA `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`).
- Weights: README does not carve out a separate license. No explicit research-only restriction surfaced. Re-verify at fetch time per the standard wiring-slice rule (same caveat as the VQGAN-class audit).

### Gate B — **PARTIAL**

- README states "pretrained version of IBQ visual tokenizers...is released" and "Open-MAGVIT2 tokenizers...are now released" — implying availability, but **no direct HuggingFace URLs surfaced** in the README excerpt.
- README references linked `Open-MAGVIT2.md` and `IBQ.md` docs which presumably carry the actual download paths; those weren't fetched in this pass.
- Net: weights exist and are claimed-available, but the specific download path needs one more inspection step before SHA-pinning.

### rFID note

README claims **0.39 rFID at 8x downsampling** for Open-MAGVIT2 vs VQGAN, MaskGIT, TiTok, LlamaGen, OmniTokenizer. That's the strongest published reproduction-quality number across the radar's top-5. If this holds up empirically, OpenMAGVIT2's value proposition for the "Language Model Beats Diffusion" thesis is strongest.

### Gates C / D — UNKNOWN

Standard pattern: requires local compute. Defer to implementation-slice follow-up.

### Action items for OpenMAGVIT2

1. **One more external inspection step** — fetch the `Open-MAGVIT2.md` doc inside `TencentARC/SEED-Voken` to get the actual HF download path. Cheap; can be done before the next implementation slice.
2. **If VQGAN-class Gate D fails** (CPU latency exceeds budget), OpenMAGVIT2 is the natural pivot — its reported rFID is strongest.

## Priority 4 — TiTok / 1d-tokenizer (delivers [#332](https://github.com/p-to-q/wittgenstein/issues/332))

The radar's `TiTok` candidate is hosted at [`bytedance/1d-tokenizer`](https://github.com/bytedance/1d-tokenizer) (the older `bytedance-research/TiTok` name appears to have moved).

### Gate A — **PASS**

- Code: Apache-2.0 (blob SHA `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`).
- Weights: README does not carve out a separate license. Same fetch-time re-verification caveat.

### Gate B — **PARTIAL**

- README says "Better support on loading pretrained weights from huggingface models" (08/09/2024 changelog entry) — implies HF availability.
- Model variants named (TiTok-L-32, TiTok-B64, TiTok-S128) but **no specific HF URLs in the README excerpt** surfaced.
- The HF repo is likely `bytedance-research/TiTok-*` per the radar plan; one more inspection step would confirm.

### Gates C / D — UNKNOWN

- 1D token sequence may be **more sensitive to numerical issues** than 2D grid (per the audit plan's note); Gate C should be tested empirically before this candidate is considered for M1B.
- No ONNX / transformers.js mention. Gate D requires local empirical work.

### Schema discriminator RFC trigger — STILL APPLIES

Even though Gate A and Gate B clear, **TiTok integration triggers a schema discriminator RFC** (per the audit-plan and per [#332](https://github.com/p-to-q/wittgenstein/issues/332)). The codec's `seedCode` schema today assumes a 2D grid; TiTok's 1D token sequence needs a `shape: "1D" | "2D"` discriminator before any wiring slice begins.

**If TiTok eventually becomes the M1B target, the RFC must land first.** This isn't an audit-blocking concern, just sequencing — flagged for the maintainer.

## Priority 5 — MaskBit (delivers [#333](https://github.com/p-to-q/wittgenstein/issues/333))

**This is the candidate where we found a real licensing concern.**

### Gate A — ⚠️ NUANCED (the key finding of this audit pass)

- **Code:** Apache-2.0 at [`markweberdev/maskbit`](https://github.com/markweberdev/maskbit) (blob SHA `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`). PASS.
- **Weights:** README explicitly marks the trained checkpoints as **"only for research purposes" on academic ImageNet dataset**. This is a real legal carve-out from the code license.
- Net: licensing **does NOT cleanly clear** Gate A for MaskBit's pretrained weights. Wiring MaskBit weights into Wittgenstein would constrain our distribution model — they can't ship in a redistributable artifact under the same terms as the code.

This finding is **load-bearing**. The audit-plan's Gate A criterion is "Apache / MIT / BSD at the actual LICENSE file; **covers code AND weights**." MaskBit fails the weights half of that criterion.

### Gate B — **PASS**

- Multiple HuggingFace repos:
  - `markweber/vqgan_plus_paper` (VQGAN+ 10-bit)
  - `markweber/vqgan_plus_12bit` (VQGAN+ 12-bit)
  - MaskBit-Tokenizer variants 10-18 bits — multiple HF repos
- Maintenance is active (presented at ICLR 2025; generator + eval code released 02/26/2025).
- Per the audit's Gate B criterion (availability + SHA-pinning), this clears. But it's a partial victory: Gate A constrains how we'd use the weights even though Gate B says they're easy to download.

### Gates C / D — UNKNOWN

- No ONNX / transformers.js mention.
- PyTorch-only (Python 3.9 + PyTorch 2.2.2 tested).
- Standard pattern; requires local compute.

### Verdict for MaskBit

**Gated by weights license, not by operational risk.** Even if Gates C and D pass empirically, the "research purposes only" weights restriction means MaskBit cannot land as the M1B target without a license change or commercial-terms negotiation upstream. **De-prioritize MaskBit** until VQGAN-class, OpenMAGVIT2, and TiTok all fail their gates; if MaskBit becomes the only viable option, the maintainer must decide whether to:

- pursue commercial licensing for the weights, OR
- ship Wittgenstein with research-only restrictions on the image path, OR
- accept that MaskBit isn't a fit.

## Updated audit-status overview for #283

After this audit pass plus the VQGAN-class audit:

| # | Candidate | License (code) | License (weights) | Weights availability | Operational gates |
|---|---|---|---|---|---|
| 1 | VQGAN-class (LlamaGen) | ✅ MIT | ✅ MIT (project-level; fetch-time re-verify) | ✅ HF, 70-72M | ❓ #334 / #335 |
| 2 | FSQ | ✅ Apache-2.0 (community impl) | N/A (algorithm) | N/A | trivially-pass |
| 3 | OpenMAGVIT2 | ✅ Apache-2.0 | ⚠️ no carve-out surfaced; verify | ⚠️ partial (claimed released) | ❓ requires local compute |
| 4 | TiTok | ✅ Apache-2.0 | ⚠️ no carve-out surfaced; verify | ⚠️ partial (HF claim) | ❓ requires local compute + schema RFC |
| 5 | MaskBit | ✅ Apache-2.0 | ❌ **"research purposes only"** | ✅ multiple HF repos | de-prioritized due to weights license |

**The candidate set has narrowed.** VQGAN-class remains the natural Priority 1 unless its operational gates ([#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)) fail; OpenMAGVIT2 is the strongest backup based on rFID; TiTok needs schema work; MaskBit is gated by weights license; FSQ is a different-shape option requiring our own training infra.

## Next-action recommendations

1. **For VQGAN-class:** run [#334](https://github.com/p-to-q/wittgenstein/issues/334) and [#335](https://github.com/p-to-q/wittgenstein/issues/335) (Gates C and D), as already planned.
2. **For OpenMAGVIT2:** one cheap external-inspection follow-up — fetch the `Open-MAGVIT2.md` linked doc inside the SEED-Voken repo to surface the actual HF download URL. If that clears, OpenMAGVIT2 becomes the second candidate ready for Gates C/D.
3. **For TiTok:** parallel inspection of the HF repo presence; flag the schema-discriminator RFC as the gating step for any TiTok wiring.
4. **For MaskBit:** add a license-redistribution note to [#333](https://github.com/p-to-q/wittgenstein/issues/333) and de-prioritize behind the others.
5. **For FSQ:** open a **separate training-prep research note** (sibling to this audit) covering encoder-decoder architecture, training data, infra requirements. FSQ doesn't fit the standard four-gate shape; it fits a "we train it ourselves" shape that the campaign hasn't explicitly named yet.

## Sources verified 2026-05-13

License-blob evidence (immutable — blob SHAs are git object IDs and don't change):

| Repo | License | Blob SHA |
|---|---|---|
| `bytedance/1d-tokenizer` | Apache-2.0 | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `markweberdev/maskbit` | Apache-2.0 | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `TencentARC/SEED-Voken` (redirect target from `TencentARC/Open-MAGVIT2`) | Apache-2.0 | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `Nikolai10/FSQ` | Apache-2.0 | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `duchenzhuang/FSQ-pytorch` | 404 at audit time (repo no longer exists) | — |

The four blob SHAs are identical because all four use the OSI-template Apache-2.0 text verbatim.

README content evidence (mutable — these were the README contents at HEAD-of-default-branch on 2026-05-13; a future re-fetch may differ):

- `https://raw.githubusercontent.com/bytedance/1d-tokenizer/main/README.md`
- `https://raw.githubusercontent.com/markweberdev/maskbit/main/README.md`
- `https://raw.githubusercontent.com/TencentARC/SEED-Voken/main/README.md`
- `https://raw.githubusercontent.com/Nikolai10/FSQ/master/README.md`

**The wiring slice must re-verify README claims at fetch time** — specifically the MaskBit "research purposes only" weights wording and any HuggingFace URLs surfaced in linked sub-docs. Per the per-candidate audit-plan template, weights SHA-pinning and license terms are recorded in the manifest at the time of download, not at audit time.

## Cross-references

- Parent commission: [#283](https://github.com/p-to-q/wittgenstein/issues/283).
- Sibling per-candidate audit: [`docs/research/2026-05-13-audit-vqgan-class.md`](2026-05-13-audit-vqgan-class.md) (delivered [#329](https://github.com/p-to-q/wittgenstein/issues/329) via [PR #336](https://github.com/p-to-q/wittgenstein/pull/336)).
- Audit-plan source: [`docs/research/2026-05-08-radar-audit-plan.md`](2026-05-08-radar-audit-plan.md).
- Radar source: [PR #272](https://github.com/p-to-q/wittgenstein/pull/272), [`docs/research/2026-05-08-image-tokenizer-decoder-radar.md`](2026-05-08-image-tokenizer-decoder-radar.md).
- Implementation gates for VQGAN-class: [#334](https://github.com/p-to-q/wittgenstein/issues/334) (Gate C), [#335](https://github.com/p-to-q/wittgenstein/issues/335) (Gate D).
- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70).
- Exec-plan annotation: [PR #293](https://github.com/p-to-q/wittgenstein/pull/293).
