---
date: 2026-05-08
status: research note
labels: [research-derived, m1-image]
tracks: [#205, #207, #251]
---

# Visual Seed Code — eval matrix cell population

> **Status:** research note (not doctrine, not active execution guidance).
> Sibling to `2026-05-07-vsc-seed-token-eval-matrix.md` (#238). That note surveyed seed-token *families* against four readiness dimensions; this note populates the (family × emission-mode) cells called out in [#251](https://github.com/p-to-q/wittgenstein/issues/251) Lane 1C, recording per-cell evidence and explicit "we don't know" where data is missing. Pins nothing as doctrine; commits nothing to implementation.
> _Tracker: [#205](https://github.com/p-to-q/wittgenstein/issues/205) / Lane 1C of [#251](https://github.com/p-to-q/wittgenstein/issues/251)._

## Why this note exists

#238's family comparison stopped at the family level — it answered "does TiTok have an open-weights ONNX path today?" but did not answer "does TiTok specifically support one-shot VSC emission, or only two-pass compile?" The implementation lane needs the latter to pick which (family, mode) cell to wire first.

The cells below are **observable facts** from public artifacts at time of survey (2026-05-08). They are NOT commitments. They are NOT quality benchmarks — quality scores wait for M5a per `docs/benchmark-standards.md`.

## Mode definitions (from #237 acceptance cases)

- **one-shot-vsc** — the LLM emits a single JSON response carrying the full `seedCode`. The runtime expands to decoder-native latents with no second LLM call.
- **two-pass-compile** — pass 1 emits semantic IR + a coarse hint (e.g. `coarseVq` or palette plan); pass 2 emits the `seedCode` after the runtime feeds back a structural prompt. Two LLM calls, two manifests, single artifact.
- **semantic-only** — no `seedCode`. Fall-back baseline. Listed for receipt completeness; not in scope for this matrix beyond noting "no seed code emitted" for every family.

## Per-dimension legend

Each cell is scored on five dimensions. Values follow a deliberately small vocabulary so cells stay diff-able:

| Dimension | Vocabulary | Meaning |
|---|---|---|
| **Token economy** | `compact` (≤64 tokens) / `medium` (65–256) / `wide` (≥257) / `n/a` | LLM context cost per image at typical published budgets. |
| **Receipt fidelity** | `byte-pinnable` / `structural-only` / `unknown` | Can a deterministic SHA-256 of `(seedCode, decoder, seed)` round-trip into identical decoder output? |
| **Decoder dependence** | `paired` / `swappable` / `frozen-LLM-vocab` / `n/a` | Is the seed code tied to one specific decoder, or substitutable across decoders? |
| **Inference cost** | `text-only` / `single-pass` / `multi-pass` / `n/a` | Compute regime at emission time (LLM-side; decoder cost is downstream). |
| **License / openness** | `MIT-or-Apache` / `research-only` / `unclear` / `n/a` | License of the published code + weights at time of survey. |

`n/a` means "this combination doesn't exist by design" (e.g., FlexTok with `coarse-scale` mode — FlexTok is a 1D family, has no coarse scales).
`unknown` means "we couldn't find authoritative evidence." Do not invent a value.

## Cell matrix (family × mode)

12 cells. Modes are columns; families are rows.

### Row 1 — VQ-VAE / VQGAN (32×32 grid)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `wide` (1024 tokens default) | `byte-pinnable` | `paired` (codebook indices are decoder-specific) | `single-pass` | `MIT-or-Apache` (CompVis, MIT) |
| **two-pass-compile** | `medium` (256 if coarseVq seeds prompt; 1024 final) | `byte-pinnable` | `paired` | `multi-pass` | `MIT-or-Apache` |

**Notes.** Reference for both modes is well-defined; the codebook structure makes byte-pinnable receipts straightforward (verified empirically by the placeholder + tile-mosaic expanders that already round-trip deterministically). Today's default in `ImageDecoderHint.family: "llamagen"` is VQGAN-class.

### Row 2 — TiTok / TA-TiTok (1D, 32 tokens)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `compact` (32 tokens — flagship claim) | `byte-pinnable` (paired (encoder, decoder)) | `paired` | `single-pass` | `MIT-or-Apache` (Bytedance, MIT) |
| **two-pass-compile** | `compact` | `byte-pinnable` | `paired` | `multi-pass` | `MIT-or-Apache` |

**Notes.** Schema mismatch with current `tokenGrid: [w, h]` representation — TiTok is 1D. Already flagged in #238 §"Repo commitments." Both cells exist in principle; neither has been wired into Wittgenstein because the schema discriminator (`seedCode.shape: "1D" | "2D"`) is parked.

### Row 3 — FlexTok (variable-length 1D)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `compact` to `medium` (8–256 tokens, runtime-variable) | `byte-pinnable` (in principle; variable-length not exercised in our schema) | `paired` | `single-pass` | `unclear` (Apple ML; not verified Apache/MIT) |
| **two-pass-compile** | `compact` to `medium` | `byte-pinnable` | `paired` | `multi-pass` | `unclear` |

**Notes.** License is the binding constraint, not the technical question. Both modes are coherent in principle; we cannot wire either until license clears. Variable-length adds a runtime parameter the current `seedCode.length` slot would have to reflect.

### Row 4 — VAR (next-scale prediction)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `n/a` (VAR is a decoder strategy, not a tokenizer; no "one-shot seed code" emission) | `n/a` | `n/a` | `n/a` | `MIT-or-Apache` (Bytedance Foundation Model Research, MIT) |
| **two-pass-compile** | `medium` (coarseVq scales encode the next-scale plan) | `structural-only` (coarse-scale plan determines structure; fine detail is decoder-internal) | `paired` (VAR's scales are decoder-specific) | `multi-pass` | `MIT-or-Apache` |

**Notes.** VAR pairs naturally with our `coarseVq.mode: "coarse-scale"` literal (already in the schema). The `one-shot-vsc` cell is genuinely `n/a` — VAR has no flat seed code; the whole point is hierarchy. Released VAR is class-conditional only; text-conditional VAR is open research.

### Row 5 — RQ-VAE / RQ-Transformer (residual stacks)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `medium` (depends on depth — typically 256 spatial × D residual layers, packed) | `byte-pinnable` | `paired` | `single-pass` | `MIT-or-Apache` (kakaobrain, MIT) |
| **two-pass-compile** | `medium` | `byte-pinnable` | `paired` | `multi-pass` | `MIT-or-Apache` |

**Notes.** Both cells are coherent but expensive to integrate: schema needs a depth dimension (`tokens: number[][]` or similar). Lower priority than VQGAN until / unless residual depth becomes the binding quality differentiator.

### Row 6 — SPAE (frozen-LLM vocabulary tokens)

| Mode | Token econ. | Receipt | Decoder dep. | Inference | License |
|---|---|---|---|---|---|
| **one-shot-vsc** | `medium` (semantic pyramid: spatial + concept tokens; published budgets vary 100–500) | `unknown` (paper does not explicitly characterize round-trip determinism beyond reconstruction loss) | `frozen-LLM-vocab` (uses the LLM's own tokenizer — most thesis-aligned) | `text-only` (no separate quantizer at emission) | `unclear` (Google Research; license at time of survey not explicitly Apache/MIT) |
| **two-pass-compile** | `medium` | `unknown` | `frozen-LLM-vocab` | `multi-pass` | `unclear` |

**Notes.** The most thesis-aligned candidate (LLM emits real natural-language tokens that double as image code), but two binding `unknown`s: license + receipt determinism. Watch but do not commit.

## What this matrix lets us decide

- **Which (family, mode) cell to wire first** — only one cell is fully `MIT-or-Apache` AND `byte-pinnable` AND has Node-friendly inference today: **VQGAN one-shot-vsc**. That confirms #238's verdict at the cell level. No surprise; the value of populating cells is making the verdict diff-able.
- **Which cells are gated on schema work** — TiTok rows (1D shape), RQ-VAE rows (residual depth). #238 already named these gates; this matrix pins which mode pairs are stuck behind which gate.
- **Which cells are gated on license / weight clarity** — FlexTok rows + SPAE rows. We cannot make engineering progress on these without a license verdict; that's a research-and-procurement question, not a code question.
- **Which cells are structurally `n/a`** — VAR `one-shot-vsc`. Don't allocate engineering effort here; if VAR ever ships in this repo, it will be via the `coarseVq.mode: "coarse-scale"` slot, not the `seedCode` slot.

## What we still don't know (explicit)

Per the lane brief — "we don't know" is a valid cell answer; flagging them up:

- **SPAE receipt fidelity** — the SPAE paper reports reconstruction loss, not byte-deterministic round-trip. We don't know whether `(seedCode, decoder, seed)` produces identical bytes across runs.
- **FlexTok variable-length receipt cost** — runtime length adds a manifest field that today's `seedCode.length` doesn't model precisely. We don't know whether a 1D variable-length seed has the same receipt-honesty properties as a fixed-length one.
- **TiTok one-shot-vsc emission cost from a frozen LLM** — we have no measurements of how reliably a frozen GPT-4o / Claude / Llama 3 emits valid 32-token TiTok sequences as JSON. Schema sketches assume it works; real model behavior may need a #207 two-pass fallback.
- **VAR text-conditional readiness** — VAR is class-conditional today. Text-conditional VAR may or may not arrive; if it does, the receipt-fidelity column changes from `structural-only` to potentially `byte-pinnable`.
- **Real per-emission token economy** — the published "32 tokens" / "8–128 tokens" / "1024 tokens" numbers are *encoder* output budgets. We don't know what a frozen LLM actually emits when prompted to produce them in JSON. Could be much wider due to JSON overhead, decoding artifacts, or LLM hallucination of extra tokens.

## Boundaries this note does NOT cross

- Does NOT pick a (family, mode) cell to wire — that's an implementation-issue scope question, gated on #109 / #67 / #205 trigger conditions.
- Does NOT add ADR / RFC content — research note only.
- Does NOT change `docs/codecs/image.md` or other doctrine surfaces.
- Does NOT add quality scores — those wait for M5a per `docs/benchmark-standards.md`.
- Does NOT supersede #238's family comparison — it complements it at the cell level. If a fact in this note conflicts with #238, #238 wins because it carries the source citations directly.

## Cross-references

- `2026-05-07-vsc-seed-token-eval-matrix.md` — parent family-level comparison (#238)
- `2026-05-07-vsc-acceptance-cases.md` — one-shot vs two-pass mode definitions (#237)
- ADR-0018 §"Not locked" — the explicit deferral both notes honor
- RFC-0006 §3 — visual seed token role
- #205 — first locked eval matrix request (parent issue)
- #207 — one-shot vs two-pass acceptance cases
- #251 Lane 1C — this note's commission
- #109 — VQ decoder bridge readiness tracker
- #67 — H9 patch-grid IR variant tracker
