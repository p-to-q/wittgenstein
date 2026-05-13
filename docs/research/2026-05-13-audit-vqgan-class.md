---
date: 2026-05-13
status: audit deliverable (Priority 1 of #283)
labels: [research-derived, m1-image, audit]
tracks: [#329, #283, #70]
---

# VQGAN-class per-candidate audit — Gates A and B verdict

> **Status:** four-gate audit for VQGAN-class, delivering [#329](https://github.com/p-to-q/wittgenstein/issues/329) (the Priority 1 sub-issue of [#283](https://github.com/p-to-q/wittgenstein/issues/283)). **Gates A and B pass via external inspection performed 2026-05-13.** Gates C and D require local compute and are flagged for an implementation slice; this note records the empirical work needed and is honest about its absence.
> _Tracker: [#329](https://github.com/p-to-q/wittgenstein/issues/329); parent [#283](https://github.com/p-to-q/wittgenstein/issues/283); M1B umbrella [#70](https://github.com/p-to-q/wittgenstein/issues/70)._

## Why this audit comes first

Per the radar local-audit plan ([`docs/research/2026-05-08-radar-audit-plan.md`](2026-05-08-radar-audit-plan.md), merged via [PR #322](https://github.com/p-to-q/wittgenstein/pull/322)), VQGAN-class is the only candidate that already satisfies the schema-fit + decoder-bridge slot in the codec. The image codec's `DecoderFamilySchema` at [`packages/codec-image/src/schema.ts:5`](../../packages/codec-image/src/schema.ts) already names `"llamagen"` as a valid family and `.default("llamagen")`. The bridge itself is currently a `NotImplementedError` stub at [`packages/codec-image/src/decoders/llamagen.ts`](../../packages/codec-image/src/decoders/llamagen.ts) — so the wiring work is bounded: clear the four gates, then flip the stub to a real bridge.

This audit covers **both** repos VQGAN-class spans:

1. `CompVis/taming-transformers` — the original VQGAN training framework + the VQ tokenizer the LFQ-family discrete-token decoders inherit from.
2. `FoundationVision/LlamaGen` — the discrete-token decoder family that ratifies the "Language Model Beats Diffusion" thesis using a VQGAN-class tokenizer.

The codec schema's named default is LlamaGen, which is the more direct wiring target. `taming-transformers` is the upstream lineage.

## Gate A — License clarity → **PASS**

### `CompVis/taming-transformers`

- SPDX identifier: `MIT`
- License blob SHA: `57fb4153bafcd64b60377ba0ba2c79b7530efc1e`
- URL: <https://github.com/CompVis/taming-transformers/blob/master/License.txt>
- Verified 2026-05-13 via `https://api.github.com/repos/CompVis/taming-transformers/license`.

### `FoundationVision/LlamaGen`

- SPDX identifier: `MIT`
- License blob SHA: `a4440eb39415ac6930768af56e50b7f782779b19`
- URL: <https://github.com/FoundationVision/LlamaGen/blob/main/LICENSE>
- Verified 2026-05-13 via `https://api.github.com/repos/FoundationVision/LlamaGen/license`.

### Weights license

The LlamaGen README states:

> "The majority of this project is licensed under MIT License. Portions of the project are available under separate license of referred projects."

There is **no explicit carve-out** that distinguishes weights from code in either README; MIT appears to cover both at the project level. The `taming-transformers` README similarly does not separately license its weights. The "portions of the project are available under separate license of referred projects" caveat in LlamaGen is **unverified until checked at fetch time** and is subject to artifact-by-artifact license / terms verification (notably for the VQ tokenizer file from `huggingface.co/FoundationVision/LlamaGen` and any `taming-transformers` weight bundle mirrored from k00.fr / heibox.uni-heidelberg.de / ommer-lab.com). This audit does **not** establish legal effect for our use of those specific artifacts; it only establishes that the project-level READMEs do not carve out weight-specific restrictions.

**Action item for the wiring slice:** during the actual weights download, re-read the model card / accompanying terms text for the specific revision pulled, record the verified terms + SHA-256 in the manifest, and surface any artifact-level term that materially differs from the project-level MIT framing. Do not assume the project-level claim extends to a specific checkpoint without confirming.

### Verdict — Gate A: **PASS** at the project / README level

Both `taming-transformers` (the VQGAN lineage) and `LlamaGen` (the codec's named-default decoder family) carry MIT `LICENSE` files at the repo root with permissive terms. The "Apache / MIT / BSD at the actual LICENSE file" gate criterion is satisfied at the project level. Artifact-level terms remain to be re-verified at fetch time per the action item above.

## Gate B — Weights availability + SHA-pinning → **PASS** (LlamaGen) / **PARTIAL** (taming-transformers upstream)

### LlamaGen weights (primary wiring target)

- **HuggingFace repo:** <https://huggingface.co/FoundationVision/LlamaGen> — class-conditional VQ tokenizers + AR generators.
- **HuggingFace repo:** <https://huggingface.co/peizesun/llamagen_t2i> — text-conditional generators.
- **Live demo space:** <https://huggingface.co/spaces/FoundationVision/LlamaGen>.
- **Parameter counts:**
  - **VQ tokenizer: 70–72M** parameters. This is the file we wire for M1B (the encoder-decoder bridge), not the AR generator.
  - AR generators: 111M – 3.1B parameters (not relevant to the M1B bridge wiring).

The 70-72M VQ tokenizer is **comfortably under the audit's <1 GB ideal CPU-runnable size** (in FP32: ~280–290 MB; in FP16: ~140–145 MB). HuggingFace's commit-hash version pinning satisfies the "SHA-pinnable URL" criterion; the actual file SHA-256 will be recorded by the wiring slice when it downloads a specific revision.

**Gate B for LlamaGen weights: PASS.**

### `taming-transformers` weights (upstream lineage; not the primary target)

The `taming-transformers` README hosts pretrained weights across **four** different hosts:

- `k00.fr/*` — URL-shortener links (concerning long-term stability).
- `heibox.uni-heidelberg.de/*` — institutional host (Universität Heidelberg), more stable but tied to an academic group.
- `ommer-lab.com/*` — lab-specific host (Ommer lab, also Heidelberg-affiliated).
- Google Drive — for the scene-synthesis variants; awkward for SHA-pinning.

None of these are HuggingFace-canonical. Each is potentially stable but the **lack of a single canonical mirror with HF-style commit-hash version pinning is a real Gate B concern** for the upstream `taming-transformers` weights.

**Gate B for `taming-transformers` weights: PARTIAL.** Mitigation: the wiring slice should mirror whichever weight file we end up depending on into our own pinned storage (CDN or HF), recording the original-host SHA-256 at mirror time. Long-term resilience matters more for our manifest spine than convenience.

### What this means for M1B

Since the codec's named default is **LlamaGen** — not raw `taming-transformers` — and LlamaGen is the wiring target the schema already accommodates, the primary Gate B verdict is **PASS**. The `taming-transformers` lineage is informational; if M1B ends up depending on a `taming-transformers` weight file directly (e.g. as a comparison baseline or for a tokenizer not in the LlamaGen repo), the wiring slice mirrors that file and records the SHA.

## Gate C — Deterministic round-trip → **UNKNOWN (requires local compute)**

Per the audit-plan template:

- Encode-twice on the same image: assert byte-identical token grid.
- Decode-twice on the same VQ codes: assert byte-identical PNG.
- Encode → decode → re-encode: assert token-stable round-trip.
- CPU vs GPU parity class: documented (per-platform byte-equality or structural-only).

**Status:** This audit cannot verify Gate C empirically — the verdict requires a Python environment with PyTorch, the LlamaGen VQ tokenizer downloaded, and at least two CPU runs of `encode → decode → re-encode` with byte-comparison. This is an implementation task, not a research-note task.

**Follow-up issue filed:** [#334](https://github.com/p-to-q/wittgenstein/issues/334) — `[m1b audit] VQGAN-class Gate C (determinism) — empirical round-trip`. The issue scopes:

1. Pin a specific LlamaGen VQ tokenizer revision SHA.
2. Run `encode → decode → re-encode` 3× on the same input image, on the same machine, with the same seed.
3. Report byte-equality across the three runs.
4. Repeat on a second machine if available; document the cross-platform parity class.
5. Close Gate C with the empirical result.

This follow-up is **expected** by the audit plan; the absence here is honest reporting, not a gate failure.

## Gate D — Node / ONNX / CPU feasibility → **UNKNOWN (requires local compute)**

The LlamaGen README does not mention ONNX export, transformers.js compatibility, or CPU-only inference benchmarks. The dependencies require `torch>=2.1.0`; vLLM is referenced for GPU acceleration. There is **no community ONNX export** mentioned in the README content surveyed.

**Status:** This audit cannot verify Gate D empirically — the verdict requires attempting a minimal ONNX export of just the VQ tokenizer's decoder half (encoder is needed only for offline tooling) and timing CPU inference for a 256² image.

**Follow-up issue filed:** [#335](https://github.com/p-to-q/wittgenstein/issues/335) — `[m1b audit] VQGAN-class Gate D (Node / ONNX / CPU feasibility) — empirical export + benchmark`. The issue scopes:

1. Pin the same LlamaGen VQ tokenizer revision SHA as Gate C (or a separate pin if Gate C hasn't started — record both either way).
2. Attempt an ONNX export of the decoder half via PyTorch's `torch.onnx.export`. If the export breaks on any layer, name the layer + error.
3. If export succeeds, run the ONNX model via `onnxruntime` CPU-only on a typical laptop and time a single 256² decode.
4. Report: export feasibility + inference latency + RAM footprint.
5. Close Gate D with the empirical result.

If Gate D fails (e.g. unrunnable export, or CPU latency exceeds 5 minutes), the falsifies-recommendation criterion in the audit plan triggers: VQGAN-class is no longer the recommended Priority 1, and audit work should pivot to FSQ ([#330](https://github.com/p-to-q/wittgenstein/issues/330)) or OpenMAGVIT2 ([#331](https://github.com/p-to-q/wittgenstein/issues/331)).

## Overall verdict

| Gate | Verdict | Status |
|---|---|---|
| **A. License** | ✅ PASS | both `CompVis/taming-transformers` and `FoundationVision/LlamaGen` are MIT; no weights carve-out |
| **B. Weights** | ✅ PASS (LlamaGen) / ⚠️ PARTIAL (taming-transformers upstream) | LlamaGen VQ tokenizer is on HF, 70-72M params, version-pinnable; taming-transformers upstream weights are on fragmented hosts but mirrorable |
| **C. Determinism** | ❓ UNKNOWN | requires local compute; follow-up implementation issue recommended |
| **D. Node / ONNX / CPU** | ❓ UNKNOWN | requires local compute; follow-up implementation issue recommended |

**This is not yet a "candidate clears all four gates" verdict.** Two of the four gates remain `unknown` pending the empirical work named above. The audit-plan's M1B unblock criterion ("at least one candidate clears all four gates") is not yet met.

What this audit DOES establish:

- VQGAN-class is **not blocked by license** at the code or (default) weights level.
- VQGAN-class is **not blocked by weights availability** for the primary M1B wiring target (LlamaGen).
- The remaining risk is **operational** (determinism + CPU/ONNX feasibility), not licensing.

## Next-action recommendations

1. **Follow-up issues filed:** [#334](https://github.com/p-to-q/wittgenstein/issues/334) (Gate C — determinism) and [#335](https://github.com/p-to-q/wittgenstein/issues/335) (Gate D — ONNX / CPU feasibility). Each is `size/s`, `priority/p1`, `stage/m1-image`, `slice/implementation`. Both require local PyTorch and a copy of the LlamaGen VQ tokenizer weights.
2. **Until #334 and #335 close:** do NOT begin wiring `loadLlamagenDecoderBridge`. Per the audit plan: "M1B unblocks when at least one candidate clears **all four gates**."
3. **alpha.2 cut question (open for maintainer decision):** the exec-plan annotation in [PR #293](https://github.com/p-to-q/wittgenstein/pull/293) names two defensible paths — (a) cut alpha.2 now with M1B's blocker explicitly named in release notes, OR (b) hold alpha.2 until Gates C and D close. This audit reduces the uncertainty: the license and weights risk is now retired; only operational risk remains. The maintainer can weigh whether retired-license + retired-weights is enough confidence to cut, or whether the empirical determinism / ONNX work should land first.

## Sources verified 2026-05-13

- `https://api.github.com/repos/CompVis/taming-transformers/license` — MIT (SHA `57fb4153bafcd64b60377ba0ba2c79b7530efc1e`).
- `https://api.github.com/repos/FoundationVision/LlamaGen/license` — MIT (SHA `a4440eb39415ac6930768af56e50b7f782779b19`).
- `https://raw.githubusercontent.com/FoundationVision/LlamaGen/main/README.md` — weights locations, parameter counts.
- `https://raw.githubusercontent.com/CompVis/taming-transformers/master/README.md` — upstream weights hosting profile.

## Cross-references

- Parent commission: [#283](https://github.com/p-to-q/wittgenstein/issues/283).
- Per-candidate sub-issue: [#329](https://github.com/p-to-q/wittgenstein/issues/329).
- Audit-plan source: [`docs/research/2026-05-08-radar-audit-plan.md`](2026-05-08-radar-audit-plan.md) §"Priority 1 — VQ-VAE / VQGAN".
- Radar source: [PR #272](https://github.com/p-to-q/wittgenstein/pull/272), [`docs/research/2026-05-08-image-tokenizer-decoder-radar.md`](2026-05-08-image-tokenizer-decoder-radar.md).
- M1B umbrella: [#70](https://github.com/p-to-q/wittgenstein/issues/70).
- Exec-plan annotation: [PR #293](https://github.com/p-to-q/wittgenstein/pull/293) (M1B unblock criterion).
- Codec source: [`packages/codec-image/src/schema.ts`](../../packages/codec-image/src/schema.ts) (`DecoderFamilySchema.default("llamagen")`); [`packages/codec-image/src/decoders/llamagen.ts`](../../packages/codec-image/src/decoders/llamagen.ts) (current `NotImplementedError` stub).
