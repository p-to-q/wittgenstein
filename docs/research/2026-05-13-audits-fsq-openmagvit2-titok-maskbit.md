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

| Priority | Candidate                | Gate A (License)                                                      | Gate B (Weights)                                  | Gate C / D                                                                       | Verdict                                                      |
| -------- | ------------------------ | --------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 2        | FSQ                      | ✅ Apache-2.0 (community impl)                                        | ⚠️ N/A — algorithm, not a packaged tokenizer      | quantization primitive likely-expressible; full tokenizer pipeline not validated | **different shape; see §FSQ**                                |
| 3        | OpenMAGVIT2 / SEED-Voken | ✅ Apache-2.0                                                         | ✅ PASS — HF repo + checkpoint filenames surfaced | requires local compute                                                           | **candidate; blocked only on empirical Gate C/D**            |
| 4        | TiTok / 1d-tokenizer     | ⚠️ Code Apache-2.0; upstream models marked research-only              | ✅ PASS — HF tokenizer repos and files surfaced   | not worth canonical compute while weights are restricted                         | **research/benchmark only; RFC-0007 not triggered by TiTok** |
| 5        | MaskBit                  | ⚠️ **NUANCED**: code Apache-2.0, weights **"research purposes only"** | ✅ Multiple HF repos                              | local compute                                                                    | **gated by weights-license carve-out**                       |

**The first important finding** was on MaskBit (#333): its README explicitly carves weights out from code, marking the trained checkpoints as "research purposes only." That's a real legal restriction for Wittgenstein's open-source / redistribution posture — Gate A doesn't cleanly PASS for MaskBit even though the code is Apache-2.0. The 2026-05-31 TiTok refresh found the same class of code/weights divergence for the released TiTok model zoo.

## Cross-cutting notes

- All four candidates' code repos are Apache-2.0 (matching the audit's Gate A criterion at the code level). The license blob SHA at the API level is identical across them (`261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`), which simply means they all carry the OSI-template Apache-2.0 text — expected.
- Code license is not enough for canonical M-phase adoption. MaskBit and TiTok
  both have permissive code plus research-only model wording, which keeps them
  in ADR-0020's research/benchmark lane unless upstream or project-owned
  weights become permissive.
- None of the four candidates mention **ONNX export, transformers.js, or CPU inference benchmarks** in their README. Gate D (Node / ONNX / CPU feasibility) cannot be assessed without local empirical work for any of them. This is consistent with the VQGAN-class audit's same conclusion.
- The general pattern: file availability can usually be retired by external
  inspection, while **operational risk (determinism + CPU/ONNX) requires local
  compute**. License posture must be checked separately for code and weights.

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

2026-05-31 update: Gate B is no longer partial; see
[`2026-05-31-openmagvit2-gate-b-closeout.md`](2026-05-31-openmagvit2-gate-b-closeout.md).

### Gate A — **PASS**

- Code: Apache-2.0 (blob SHA `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`).
- Weights: README does not carve out a separate license. No explicit research-only restriction surfaced. Re-verify at fetch time per the standard wiring-slice rule (same caveat as the VQGAN-class audit).

### Gate B — **PASS**

- The canonical HF repo is
  [`TencentARC/Open-MAGVIT2`](https://huggingface.co/TencentARC/Open-MAGVIT2).
- The HF model card declares Apache-2.0, matching the code-side license.
- The current HF tree exposes concrete checkpoint filenames:
  `imagenet_128_L.ckpt`, `imagenet_256_L.ckpt`, `AR_256_B.ckpt`,
  `AR_256_L.ckpt`, and `AR_256_XL.ckpt`.
- `curl -I` against the HF `resolve/main/` URLs returned HTTP 200 for
  `imagenet_128_L.ckpt` and `imagenet_256_L.ckpt` on 2026-05-31.
- The HF README still contains stale `*_B.ckpt` ImageNet links; fetch-time
  manifest generation must use the HF tree/API filenames, not the stale card
  prose.
- Net: Gate B is externally cleared. Wiring still records exact
  file SHA-256 at fetch time before any bridge can load weights.

### rFID note

README claims **0.39 rFID at 8x downsampling** for Open-MAGVIT2 vs VQGAN, MaskGIT, TiTok, LlamaGen, OmniTokenizer. That's the strongest published reproduction-quality number across the radar's top-5. If this holds up empirically, OpenMAGVIT2's value proposition for the "Language Model Beats Diffusion" thesis is strongest.

### Gates C / D — UNKNOWN

Standard pattern: requires local compute. Defer to implementation-slice follow-up.

### Action items for OpenMAGVIT2

1. **Do not spend another non-compute pass on Gate B** unless the HF repo
   changes. The remaining blockers are empirical: deterministic round-trip
   and Node/ONNX/CPU feasibility.
2. **If VQGAN-class Gate D fails** (CPU latency exceeds budget), OpenMAGVIT2
   is the natural pivot — its reported rFID is strongest.

## Priority 4 — TiTok / 1d-tokenizer (delivers [#332](https://github.com/p-to-q/wittgenstein/issues/332))

The radar's `TiTok` candidate is hosted at [`bytedance/1d-tokenizer`](https://github.com/bytedance/1d-tokenizer) (the older `bytedance-research/TiTok` name appears to have moved).

2026-05-31 update: Gate B is no longer partial, but the same inspection
surfaced a code/weights license divergence. See
[`2026-05-31-titok-gate-b-license-closeout.md`](2026-05-31-titok-gate-b-license-closeout.md).

### Gate A — ⚠️ CODE PASS; WEIGHTS RESEARCH-ONLY

- Code: Apache-2.0 (blob SHA `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64`).
- Weights: `README_TiTok.md` links the released model zoo and says the models
  are for research purposes. HF model cards report Apache-2.0, but ADR-0020
  requires the canonical M-phase path to have permissive code **and** weights.
  The stricter upstream README wording wins for default shipping.

### Gate B — **PASS**

- `README_TiTok.md` links concrete HF tokenizer repos:
  `yucornetto/tokenizer_titok_l32_imagenet`,
  `yucornetto/tokenizer_titok_b64_imagenet`, and
  `yucornetto/tokenizer_titok_s128_imagenet`.
- HF API reports public, ungated repos with `model.safetensors` files at
  revisions `1c9a2084c59112fd415b7ed97d4c200e864a95de`,
  `603747b9431d1d903ce6f1c55207f3c3bea4c785`, and
  `aa8740991cc9e5965e6dea04caad8905193fc24b`.
- The consolidated `fun-research/TiTok` HF repo also exposes
  `tokenizer_titok_l32.bin`, `tokenizer_titok_b64.bin`, and
  `tokenizer_titok_s128.bin` at revision
  `ab646ed225080a3acb7c78440a574d7f67f16fa7`.
- HEAD probes returned HTTP 200 for the three `model.safetensors` files and
  the three consolidated tokenizer `.bin` files on 2026-05-31.
- Net: weights availability and SHA-pinning surfaces are real. The remaining
  blocker is license posture, not file discovery.

### Gates C / D — NOT RUN FOR CANONICAL SELECTION

- 1D token sequence may be **more sensitive to numerical issues** than 2D grid
  (per the audit plan's note); Gate C would still require empirical testing if
  TiTok were reopened.
- No ONNX / transformers.js mention. Gate D would still require local empirical
  work.
- Because Gate A does not cleanly clear for canonical M1B weights, spending
  canonical-selection compute on Gates C/D is not justified now.

### Schema discriminator RFC trigger — NOT TRIGGERED BY TiTok

TiTok would require the `shape: "1D" | "2D"` discriminator from
[RFC-0007](../rfcs/0007-image-seedcode-shape-discriminator.md), but that RFC
only activates after a 1D candidate clears all four gates. TiTok did not clear
Gate A for canonical weights, so it does **not** trigger schema wiring.

**If TiTok is reopened with permissive weights, the RFC must land before any
decoder-family registration or bridge wiring.** Until then, TiTok stays out of
`DecoderFamilySchema`.

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

| #   | Candidate              | License (code)                 | License (weights)                             | Weights availability        | Operational gates                     |
| --- | ---------------------- | ------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------------- |
| 1   | VQGAN-class (LlamaGen) | ✅ MIT                         | ✅ MIT (project-level; fetch-time re-verify)  | ✅ HF, 70-72M               | ❓ #334 / #335                        |
| 2   | FSQ                    | ✅ Apache-2.0 (community impl) | N/A (algorithm)                               | N/A                         | trivially-pass                        |
| 3   | OpenMAGVIT2            | ✅ Apache-2.0                  | ✅ Apache-2.0 on HF card                      | ✅ HF repo + ckpt filenames | ❓ requires local compute             |
| 4   | TiTok                  | ✅ Apache-2.0                  | ❌ upstream README marks models research-only | ✅ HF tokenizer repos/files | research/benchmark only; RFC dormant  |
| 5   | MaskBit                | ✅ Apache-2.0                  | ❌ **"research purposes only"**               | ✅ multiple HF repos        | de-prioritized due to weights license |

**The candidate set has narrowed.** VQGAN-class remains the natural Priority 1 unless its operational gates ([#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335)) fail; OpenMAGVIT2 is the strongest backup based on rFID; TiTok and MaskBit are gated by weights-license restrictions; FSQ is a different-shape option requiring our own training infra.

## Next-action recommendations

1. **For VQGAN-class:** run [#334](https://github.com/p-to-q/wittgenstein/issues/334) and [#335](https://github.com/p-to-q/wittgenstein/issues/335) (Gates C and D), as already planned.
2. **For OpenMAGVIT2:** Gate B is closed; run empirical Gate C/D only if
   OpenMAGVIT2 becomes the active fallback after VQGAN-class.
3. **For TiTok:** do not spend another static Gate B pass. Treat the current
   upstream weights as research/benchmark only under ADR-0020. RFC-0007 stays
   dormant unless TiTok is reopened with permissive weights or a future 1D
   candidate clears all four gates.
4. **For MaskBit:** add a license-redistribution note to [#333](https://github.com/p-to-q/wittgenstein/issues/333) and de-prioritize behind the others.
5. **For FSQ:** open a **separate training-prep research note** (sibling to this audit) covering encoder-decoder architecture, training data, infra requirements. FSQ doesn't fit the standard four-gate shape; it fits a "we train it ourselves" shape that the campaign hasn't explicitly named yet.

## Sources verified 2026-05-13

License-blob evidence (immutable — blob SHAs are git object IDs and don't change):

| Repo                                                                     | License                                   | Blob SHA                                   |
| ------------------------------------------------------------------------ | ----------------------------------------- | ------------------------------------------ |
| `bytedance/1d-tokenizer`                                                 | Apache-2.0                                | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `markweberdev/maskbit`                                                   | Apache-2.0                                | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `TencentARC/SEED-Voken` (redirect target from `TencentARC/Open-MAGVIT2`) | Apache-2.0                                | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `Nikolai10/FSQ`                                                          | Apache-2.0                                | `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| `duchenzhuang/FSQ-pytorch`                                               | 404 at audit time (repo no longer exists) | —                                          |

The four blob SHAs are identical because all four use the OSI-template Apache-2.0 text verbatim.

README content evidence (mutable — these were the README contents at HEAD-of-default-branch on 2026-05-13; a future re-fetch may differ):

- `https://raw.githubusercontent.com/bytedance/1d-tokenizer/main/README.md`
- `https://raw.githubusercontent.com/markweberdev/maskbit/main/README.md`
- `https://raw.githubusercontent.com/TencentARC/SEED-Voken/main/README.md`
- `https://raw.githubusercontent.com/Nikolai10/FSQ/master/README.md`

OpenMAGVIT2 Gate B refresh, checked 2026-05-31:

- `https://huggingface.co/TencentARC/Open-MAGVIT2/tree/main`
- `https://huggingface.co/TencentARC/Open-MAGVIT2/raw/main/README.md`
- `https://github.com/TencentARC/SEED-Voken`

TiTok Gate B / license refresh, checked 2026-05-31:

- `https://github.com/bytedance/1d-tokenizer`
- `https://raw.githubusercontent.com/bytedance/1d-tokenizer/main/README_TiTok.md`
- `https://huggingface.co/yucornetto/tokenizer_titok_l32_imagenet`
- `https://huggingface.co/yucornetto/tokenizer_titok_b64_imagenet`
- `https://huggingface.co/yucornetto/tokenizer_titok_s128_imagenet`
- `https://huggingface.co/fun-research/TiTok`

**The wiring slice must re-verify README claims at fetch time** — specifically the MaskBit and TiTok "research purposes only" weights wording and any HuggingFace URLs surfaced in linked sub-docs. Per the per-candidate audit-plan template, weights SHA-pinning and license terms are recorded in the manifest at the time of download, not at audit time.

## Cross-references

- Parent commission: [#283](https://github.com/p-to-q/wittgenstein/issues/283).
- Sibling per-candidate audit: [`docs/research/2026-05-13-audit-vqgan-class.md`](2026-05-13-audit-vqgan-class.md) (delivered [#329](https://github.com/p-to-q/wittgenstein/issues/329) via [PR #336](https://github.com/p-to-q/wittgenstein/pull/336)).
- Audit-plan source: [`docs/research/2026-05-08-radar-audit-plan.md`](2026-05-08-radar-audit-plan.md).
- Radar source: [PR #272](https://github.com/p-to-q/wittgenstein/pull/272), [`docs/research/2026-05-08-image-tokenizer-decoder-radar.md`](2026-05-08-image-tokenizer-decoder-radar.md).
- Implementation gates for VQGAN-class: [#334](https://github.com/p-to-q/wittgenstein/issues/334) (Gate C), [#335](https://github.com/p-to-q/wittgenstein/issues/335) (Gate D).
- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70).
- Exec-plan annotation: [PR #293](https://github.com/p-to-q/wittgenstein/pull/293).
