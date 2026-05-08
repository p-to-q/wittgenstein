---
date: 2026-05-08
status: research note
labels: [research-derived, m1-image]
tracks: [#205, #207, #251, #258]
revision: 2026-05-08 — citation audit per #254 review
---

# Visual Seed Code — eval matrix cell population

> **Status:** research note (not doctrine, not active execution guidance).
> Sibling to `2026-05-07-vsc-seed-token-eval-matrix.md` (#238). That note surveyed seed-token *families*; this note populates the (family × emission-mode) cells from #251 Lane 1C, with explicit `unknown` for any claim not anchored to a local source.
> _Tracker: [#205](https://github.com/p-to-q/wittgenstein/issues/205) / Lane 1C of [#251](https://github.com/p-to-q/wittgenstein/issues/251) / decoder radar [#258](https://github.com/p-to-q/wittgenstein/issues/258)._

## Citation discipline (revision r2)

The first revision of this note carried readiness verdicts ("only VQGAN one-shot-vsc is fully clean") that read as load-bearing without local evidence. Per the #254 review, this revision applies the following rules:

1. **License / openness** claims that appear in #238 are anchored inline to its §"Candidate survey" subsections. Claims not anchored to #238 are downgraded to `unknown` with the gap named explicitly.
2. **Receipt fidelity** is not directly characterized in #238's source citations. Every `byte-pinnable` cell is marked `inferred-Wittgenstein` with the inference chain stated. Cells where the inference does not hold are `unknown`.
3. **No verdict line.** The closing reads "current working prior, pending local citation audit"; cell-flips will follow as evidence accrues, not the other way around.
4. **Successor doc.** This cell matrix is interim. The proper home for radar-shaped output is the radar that #258 commissions; once that lands, this note will be superseded with a closeout pointer, not preserved as a parallel surface.

## Mode definitions (from #237 acceptance cases)

- **one-shot-vsc** — the LLM emits a single JSON response carrying the full `seedCode`. The runtime expands to decoder-native latents with no second LLM call.
- **two-pass-compile** — pass 1 emits semantic IR + a coarse hint (e.g. `coarseVq` or palette plan); pass 2 emits the `seedCode` after the runtime feeds back a structural prompt. Two LLM calls, two manifests, single artifact.
- **semantic-only** — no `seedCode`. Fall-back baseline; not in scope for this matrix.

## Per-dimension legend

Each cell carries five dimensions. The vocabulary is small so cells stay diff-able as evidence arrives.

| Dimension | Vocabulary | Meaning |
|---|---|---|
| **Token economy** | `compact` (≤64) / `medium` (65–256) / `wide` (≥257) / `n/a` / `unknown` | LLM context cost per image at typical published encoder budgets. |
| **Receipt fidelity** | `byte-pinnable (inferred)` / `structural-only` / `unknown` | Can a deterministic SHA-256 of `(seedCode, decoder, seed)` round-trip into identical decoder output? `(inferred)` flags Wittgenstein inference, not published claim. |
| **Decoder dependence** | `paired` / `swappable` / `frozen-LLM-vocab` / `n/a` | Is the seed code tied to one specific decoder, or substitutable? |
| **Inference cost** | `text-only` / `single-pass` / `multi-pass` / `n/a` | Compute regime at emission time (LLM-side; decoder cost is downstream). |
| **License / openness** | `MIT-or-Apache (cited)` / `MIT-or-Apache (per #238)` / `unclear` / `unknown` / `n/a` | License of the published code + weights. `(per #238)` anchors to that note's specific claim; `unknown` means we did not reverify. |

`n/a` means "this combination doesn't exist by design" (e.g., FlexTok with `coarse-scale` mode — FlexTok is a 1D family, no coarse scales).
`unknown` means we could not find authoritative evidence in either #238 or in our local audit. Do not invent a value.

## Cell matrix (family × mode)

12 cells. Modes are columns; families are rows. License anchors point to #238's §"Candidate survey" subsections; quote text is reproduced inline so this note remains usable without round-tripping through #238.

### Row 1 — VQ-VAE / VQGAN (32×32 grid)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `wide` (~1024 tokens at 32×32, per #238 §1 *"1024-token grid (32×32) matches our default `latentResolution`"*) | `byte-pinnable (inferred)` | `paired` | `single-pass` | `MIT-or-Apache (per #238 §1)` — *"VQGAN reference implementation is MIT (Heidelberg + CompVis)"* |
| **two-pass-compile** | `medium` (256-class coarseVq seeds prompt; 1024 final) `inferred` | `byte-pinnable (inferred)` | `paired` | `multi-pass` | `MIT-or-Apache (per #238 §1)` |

**Receipt-fidelity inference.** VQGAN encoders are deterministic w.r.t. fixed weights and the codebook lookup is integer-indexed, so `(seedCode, decoder, seed)` → tokens is byte-stable when weights and code are pinned. This is a Wittgenstein inference; #238 does not state byte-pinnability directly. The empirical evidence on our side is that the placeholder + tile-mosaic expanders (which mimic the VQGAN-class shape) round-trip deterministically — this is necessary but not sufficient for VQGAN itself.

**Two-pass token-economy inference.** The "256-class coarseVq" claim is *not* in #238; it is a Wittgenstein interpretation of how a coarse-grid prompt could compress the pass-1 budget. Marked `inferred`.

### Row 2 — TiTok / TA-TiTok (1D, 32 tokens)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `compact` (per #238 §2 *"compresses the image to as few as 32 tokens"*) | `byte-pinnable (inferred)` | `paired` (per #238 §2 *"TiTok ships its own paired decoder"*) | `single-pass` | `MIT-or-Apache (per #238 §2)` — *"official implementation MIT (TheLastDarkLord, Bytedance Research)"* |
| **two-pass-compile** | `compact` `inferred` | `byte-pinnable (inferred)` | `paired` (per #238 §2) | `multi-pass` | `MIT-or-Apache (per #238 §2)` |

**Receipt-fidelity inference.** Same chain as VQGAN: deterministic encoder + integer codebook → byte-stable tokens, conditional on pinned weights. Not in #238 directly.

**Schema gap.** #238 §2 says: *"Mismatch with our current `tokenGrid: [w, h]` schema — TiTok is a 1D sequence."* Both cells are conceptually coherent; neither is wired in Wittgenstein because the 1D-shape discriminator is parked.

### Row 3 — FlexTok (variable-length 1D)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `compact` to `medium` (per #238 §3 *"flexible length (1 to 256 tokens) via nested-dropout training"*) | `unknown` | `paired` `inferred` | `single-pass` | `unclear` (per #238 §3 *"License: Apple ML Research; license unclear at time of survey"*) |
| **two-pass-compile** | `compact` to `medium` | `unknown` | `paired` `inferred` | `multi-pass` | `unclear` |

**Receipt-fidelity downgrade.** Variable-length tokens introduce a length parameter that today's `seedCode.length` does not model precisely. Whether the length is itself byte-deterministic across runs (or is a sampled output) is not addressed in #238 or in our local audit. Marked `unknown` rather than `inferred`.

**Decoder-dependence inference.** FlexTok publishes paired (encoder, decoder); this is the same shape as TiTok. #238 does not state `paired` for FlexTok directly, so this is `inferred`.

### Row 4 — VAR (next-scale prediction)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `n/a` | `n/a` | `n/a` | `n/a` | `MIT-or-Apache (per #238 §4)` — *"Code is open (MIT-licensed reference implementation, Bytedance/Foundation Model Research)"* |
| **two-pass-compile** | `medium` `inferred` (coarseVq scales encode the next-scale plan) | `structural-only` `inferred` | `paired` (per #238 §4 *"VAR's coarse scales ARE the coarse-VQ tokens"*) | `multi-pass` | `MIT-or-Apache (per #238 §4)` |

**`n/a` justification.** Per #238 §4: *"VAR is a decoder strategy, not a seed family on its own."* There is no flat seed code by design — the hierarchy is the point. The `n/a` is structural, not a gap.

**Structural-only inference.** Wittgenstein interpretation: VAR's next-scale plan determines structure but the fine-detail decoder is internal, so coarse-VQ → VAR can pin structure but not bytes. This framing is *not* in #238; flagged as Wittgenstein inference.

**Text-conditional gap.** #238 §4: *"Released VAR is class-conditional only; text-conditional VAR is open research."* Independent of the cells above; affects whether VAR is reachable from a text-only LLM at all.

### Row 5 — RQ-VAE / RQ-Transformer (residual stacks)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `medium` `inferred` (depth × spatial; #238 §5 says *"each spatial position has D codebook indices stacked as residuals"* but does not give a typical packed budget) | `byte-pinnable (inferred)` | `paired` `inferred` | `single-pass` | `MIT-or-Apache (per #238 §5)` — *"License: official implementation MIT (kakaobrain)"* |
| **two-pass-compile** | `medium` `inferred` | `byte-pinnable (inferred)` | `paired` `inferred` | `multi-pass` | `MIT-or-Apache (per #238 §5)` |

**Schema gap.** #238 §5: *"residual-stack shape doesn't map naturally to our current `tokens: number[]` schema."* Both cells are coherent but expensive to integrate.

### Row 6 — SPAE (frozen-LLM vocabulary tokens)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `unknown` (#238 §6 does not give a typical token budget; "100–500" was a Wittgenstein guess in r1 and is removed here) | `unknown` (per #238 §6 *"License: original Google Research; specific code license at time of survey unclear"* — and the paper reports reconstruction loss, not byte-deterministic round-trip) | `frozen-LLM-vocab` (per #238 §6 *"Encodes images into a sequence of natural language vocabulary tokens"*) | `text-only` | `unclear` (per #238 §6) |
| **two-pass-compile** | `unknown` | `unknown` | `frozen-LLM-vocab` | `multi-pass` | `unclear` |

**The thesis-alignment claim from r1 is preserved** (this is the most LLM-native candidate) but it does *not* override the binding `unknown`s on license and receipt fidelity. Watch but do not commit.

## Current working prior

> **Pending local citation audit.** The cell matrix above suggests VQGAN-class one-shot-vsc as the working candidate to wire first — that aligns with #238's family-level read. The **strength** of this prior is bounded by the citation discipline above: most cells anchor to #238, and #238 itself does not directly address byte-pinnability or Node-friendly export status at the per-cell level. Before any (family, mode) cell is wired into M1B implementation, the radar commissioned by #258 must:

1. Re-verify the license claim by linking the actual `LICENSE` file at the candidate's GitHub repo, not just trusting the inherited claim.
2. Verify weights availability by linking the HuggingFace model card or paper artifact.
3. Test deterministic round-trip empirically (encode → decode → re-encode) on a CPU-runnable checkpoint — `byte-pinnable (inferred)` is not enough to gate implementation.
4. Confirm Node/ONNX status by attempting an actual export, not by inferring from #238's "PyTorch" verdict.

The radar's job is to flip cells from `inferred` / `per #238` / `unknown` to `cited` (with a local URL anchor) or to a definitive `not-applicable`. This note is the scaffolding the radar builds on.

## What we still don't know (explicit, retained from r1, expanded)

- **SPAE receipt fidelity** — the SPAE paper reports reconstruction loss, not byte-deterministic round-trip.
- **FlexTok receipt fidelity** — variable length adds an unmodeled determinism concern.
- **TiTok one-shot-vsc emission cost from a frozen LLM** — no measurements of how reliably a frozen GPT-4o / Claude / Llama 3 emits valid 32-token TiTok sequences as JSON.
- **VAR text-conditional readiness** — released VAR is class-conditional. Text-conditional VAR may or may not arrive.
- **Real per-emission token economy** — published numbers are *encoder* output budgets. We don't know what a frozen LLM actually emits in JSON.
- **Node-friendly status per cell** — none of the families above ship a verified Node-first inference path. #238 §"Comparison dimensions" gives ⚠️ for VQGAN (via transformers.js if ONNX-exported) and ❌ for everything else. This is a *family*-level observation; the per-cell column was deliberately not added to this matrix because Node-friendliness does not differ between one-shot-vsc and two-pass-compile within a family.

## Boundaries this note does NOT cross

- Does NOT pick a (family, mode) cell to wire — that's an implementation-issue scope question, gated on #109 / #67 / #205 / #258 trigger conditions.
- Does NOT add ADR / RFC content — research note only.
- Does NOT change `docs/codecs/image.md` or other doctrine surfaces.
- Does NOT add quality scores — those wait for M5a per `docs/benchmark-standards.md`.
- Does NOT supersede #238's family comparison — it complements it at the cell level. If a fact in this note conflicts with #238, #238 wins (it carries source citations directly).

## Cross-references

- `2026-05-07-vsc-seed-token-eval-matrix.md` (#238) — parent family-level comparison; primary source for license and shape claims in this note.
- `2026-05-07-vsc-acceptance-cases.md` (#237) — one-shot vs two-pass mode definitions.
- ADR-0018 §"Not locked" — explicit deferral both notes honor.
- RFC-0006 §3 — visual seed token role.
- #205 — first locked eval matrix request.
- #207 — one-shot vs two-pass acceptance cases.
- #251 Lane 1C — original commission for this note.
- #254 — review that produced revision r2 (this revision).
- #258 — decoder/tokenizer radar that will supersede this note's cell verdicts.
- #109 — VQ decoder bridge readiness tracker.
- #67 — H9 patch-grid IR variant tracker.
