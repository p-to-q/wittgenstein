---
date: 2026-10-16
status: audit deliverable (Gates C+D for #331) — four gates cleared at audit level
labels: [research-derived, m1-image, audit, openmagvit2, receipts]
tracks: [#331, #283, #334, #335]
follows-from: docs/research/2026-05-31-openmagvit2-gate-b-closeout.md
---

# OpenMAGVIT2 (LFQ) per-candidate audit — Gates C and D verdict

> **Status:** the empirical half of the OpenMAGVIT2 four-gate audit
> ([#331](https://github.com/p-to-q/wittgenstein/issues/331)). Gates A/B closed
> earlier by external inspection; this note records the C (deterministic
> round-trip) and D (ONNX / CPU feasibility) measurements, run locally on
> 2026-10-15/16 on the Apple Silicon CPU tier. **All four gates are now cleared
> at audit level** under the #473 structural policy. Delivery (bridge wiring,
> family manifest, hosting) is **not** scheduled — the M1B floor remains
> `llamagen`. The candidate stays `candidate`, not `blessed`; see
> § Follow-on decisions.
> _Trackers: [#331](https://github.com/p-to-q/wittgenstein/issues/331)
> (per-candidate audit), [#283](https://github.com/p-to-q/wittgenstein/issues/283)
> (M1B decoder umbrella); shared Gate C/D protocol trackers
> [#334](https://github.com/p-to-q/wittgenstein/issues/334) /
> [#335](https://github.com/p-to-q/wittgenstein/issues/335)._

## Why this audit comes next

The 2026-05-13 per-candidate audit pass cleared OpenMAGVIT2 Gate A (Apache-2.0
code and HF card) and its 2026-05-31 closeout cleared Gate B (concrete
SHA-pinnable checkpoint files on the Hugging Face tree). Both notes left Gates
C/D explicitly open: determinism and ONNX/CPU feasibility need local compute,
and the standard rule applies — operational risk is never assumed, only
measured.

The measurement harness landed in-repo first (`797ab56`, 2026-10-16): an
OpenMAGVIT2 Gate C producer, an opset-17 ONNX decoder exporter with a built-in
torch↔onnxruntime parity block, and committed receipt fixtures so the contract
shapes are testable without a checkpoint. This note delivers the verdicts from
the lab runs that produced the real receipts, plus the reproduction steps.

## Pinned artifacts

| Artifact | Value |
|---|---|
| Upstream code repo | `TencentARC/SEED-Voken` (the Open-MAGVIT2 subtree; the old `TencentARC/Open-MAGVIT2` URL redirects here) |
| Upstream commit measured | `c1544efff959ba18d453089071307a7115698551` |
| Config | `configs/Open-MAGVIT2/gpu/imagenet_lfqgan_256_L.yaml` — `ch_mult [1,1,2,2,4]` (16× downsample), `z_channels 18`, `n_embed 262144`, `embed_dim 18`, `use_ema true` |
| Tokenizer checkpoint | `imagenet_256_L.ckpt`, 921,240,234 bytes, SHA-256 `a0e27c4a5ab21db0f38cba484e717584e8a8ea7d9fda9a729d058bc8d68d0922` — re-verified after download, identical to the HF LFS object id |
| HF model repo | `TencentARC/Open-MAGVIT2` (revision `607230591be9efcb4ec5ec9b6417b9e863f2dd2c`); the per-resolution repos (`…-Tokenizer-256-resolution`) hold byte-identical files |
| Weight selection | EMA tensors preferred (upstream `init_from_ckpt(stage="transformer")` convention): 339 EMA tensors used, `decay`/`num_updates` ignored, 0 plain tensors used |
| Parameters | encoder 49,751,442 · decoder 65,376,387 |
| Quantizer | LFQ (lookup-free, no learned codebook): K = 2^18 = 262144, E = 18, sign-bit index → latent |
| Token grid / output | 16 × 16 tokens → 256 × 256 RGB (16× downsample) |
| Input image (main run) | upstream `assets/teaser.jpg`, SHA-256 `7c35929e7495148f438510a825b9768835f08b8b7cd4142fa9afb2306fe12aeb` (same file as the LlamaGen audit, so the two Gate C receipts are comparable) |
| Sanity inputs | four square source images: `teaser.jpg` native center crop plus three showcase images, PIL-resized to 256² before the `(x/127.5 − 1)` normalization |
| Environment | macOS 26.5 arm64, Python 3.12.3, torch 2.14.1 (`use_deterministic_algorithms(true)`, 4 threads), onnx 1.23.2, onnxruntime 1.31.0 |

## Gate C — Deterministic round-trip → ✅ PASS (structural policy)

### Methodology

Mirrors the VQGAN-class producer so the receipts are directly comparable
(`m1b-gate-c-roundtrip-metrics.v0`, same metric names):

- **T1 (encode parity)** — `encode(image)` 3× on the same machine/seed/device;
  assert byte-identical int64 token grids (SHA-256 invariant).
- **T2 (decode parity)** — decode the run-1 tokens 3×; assert byte-identical
  PNG SHA-256 (deterministic re-encode: `compress_level=6`, no timestamp,
  `optimize=False`).
- **T3 (round-trip drift, advisory)** — `encode → decode → re-encode`; report
  exact-match and token-grid Hamming distance. Not fixed-point for learned VQ
  tokenizers; per #473 it is a hard blocker only if a family manifest declares
  a cap (none is declared for this candidate).
- **Index→latent bit-exactness (OpenMAGVIT2-specific)** — prove that the live
  index→latent path (`LFQ.get_codebook_entry(tokens)`) is bit-identical to the
  latent produced inside `encode` by `LFQ.forward` before any decoding happens.

### Results

| Check | Result |
|---|---|
| T1 encode parity (3 runs) | ✅ all equal — token SHA `16c23ef4…` |
| T2 decode parity (3 runs) | ✅ all equal — decoded SHA `e97e9436…`, PNG SHA `fcb7a77d…` |
| Latent digest (3 runs) | ✅ all equal — latent SHA `5baa2c69…` |
| `get_codebook_entry` vs `LFQ.forward` latent | ✅ `max_abs_diff = 0.0`, `exact_fraction = 1.0` |
| T3 re-encode drift | ❌ not a fixed point — 28/256 tokens = **0.109375** (advisory); re-encoded tokens themselves are stable across runs (`269720c9…`) |

### Verdict

**✅ Gate C PASS** under the #473 structural policy: `encode_consistent=true`,
`decode_consistent=true`, `sample_count=3`, within-device determinism
byte-identical for both encode and decode. Cross-device parity is declared
`structural-only` (same declaration as LlamaGen). The re-encode drift
(10.9375%) is the same class as LlamaGen's recorded 12.11% — expected for a
non-fixed-point VQ tokenizer and kept advisory, exactly as #473 intends.

### OpenMAGVIT2 code-path findings (measured against `c1544eff`)

Three upstream facts shaped the harness and will matter to any future seed
bridge:

1. **LFQ return shape.** With `return_loss_breakdown=True`, `LFQ.forward`
   returns a 2-tuple `(ret, LossBreakdown)` where `ret` is itself
   `(quantized, entropy_loss, indices)`; unpacking it as a 3-tuple fails. The
   default (`False`) returns the 3-tuple directly. The harness uses the
   default — the earlier "expected 4, got 2" symptom was this shape, not a
   version difference.
2. **LFQ defaults to `training=True`.** In that state `forward` runs an
   entropy computation whose logits tensor is `(1, 256, 1, 262144)`-shaped
   (hundreds of MB, slow on CPU). The harness calls `.eval()`, which also
   makes the entropy/commit fields return `self.zero` — the correct inference
   configuration for a frozen decoder.
3. **`decode_code` is a dead upstream path for LFQ.** `VQModel.decode_code`
   calls `self.quantize.embed_code(...)`, which does not exist on the LFQ
   quantizer in this tree. The live index→latent path is
   `LFQ.get_codebook_entry(x, bhwc, order)`, which the Gate C producer uses
   and proves bit-exact (above). A bridge must not call `decode_code`.

## Gate D — ONNX / CPU feasibility → ✅ PASS

### Methodology

Decoder-only export, self-contained boundary (same shape as the named LlamaGen
Gate D artifact): `tokens: int64 [1, 256]` → index→latent expansion → frozen
decoder → `image: float32 [1, 3, 256, 256]` in `[-1, 1]`. The encoder is
offline tooling per the bridge contract and is intentionally not exported.

Two implementation decisions worth recording:

- **Opset 17, not 18.** The LFQ sign-bit expansion is replicated with int64
  `Div`/`Mod` arithmetic (exact for indices < 2^18), which stays inside
  opset 17. A `BitwiseAnd` formulation would look more literal but requires
  opset 18 — rejected to match the opset-17 LlamaGen artifact and its
  `onnxruntime-node` LTS compatibility.
- **Legacy TorchScript exporter pinned (`dynamo=False`).** torch 2.14 defaults
  `torch.onnx.export` to the dynamo exporter, which requires the `onnxscript`
  package and emits a structurally different graph. The legacy exporter is the
  one that produced the LlamaGen opset-17 artifact, so the export path is
  pinned explicitly.

Export + CPU execution:

1. Export with the pinned upstream `Decoder`/`LFQ` code at `c1544eff`, EMA
   weights, `opset 17`, `dynamo=False`.
2. Load with `onnxruntime.InferenceSession(..., providers=["CPUExecutionProvider"])`.
3. Time `n_warmup=1` + 3 timed batch-1 decodes; check output shape.
4. Parity: compare ORT output against the torch wrapper on two deterministic
   token fixtures (sequential; a spread fixture that exercises the high bit
   planes). Parity threshold 1e-4.

### Results

| Step | Outcome | Detail |
|---|---|---|
| ONNX export (opset 17) | ✅ | 261,661,489 bytes; SHA-256 `49b127f5b430e244dcb746e236886071e76bbbcb1499b9c1ac19f3ca85647f18` (re-exports in the session reproduced the same SHA) |
| ORT CPU load | ✅ | providers `[CPUExecutionProvider]`; input int64 `[1, 256]`; output float32 `[1, 3, 256, 256]` |
| CPU decode latency | ✅ | 4.895 s / 5.124 s / 5.450 s (max 5.450 s, threshold ≤ 30 s); output SHA `71145dde…` stable across runs |
| torch↔ORT max abs diff | ✅ | **7.373e-05** ≤ 1e-4 (sequential 5.579e-05; spread 7.373e-05) |

**Supplementary stability probe (same session).** To show the residual ~7e-5 is
a stable backend-kernel difference rather than nondeterminism: torch with 1 vs
4 threads produced `max_abs_diff = 0.0`; two separate ORT sessions produced
`max_abs_diff = 0.0`; the torch↔ORT difference reproduces at the same value.
An indexing or bit-order bug would show O(1) output differences, so tiny
stable max-diff plus the bit-exact token→latent check (Gate C) together
establish the export's semantic correctness.

### Verdict

**✅ Gate D PASS.** Export is clean, ORT CPU decode is ~5.5× under the 30 s
policy cap (for reference, LlamaGen's Gate D recorded a 0.824 s ORT CPU median
on its audit host), output contract matches, and parity is within the
documented 1e-4 threshold. No falsifies-recommendation trigger.

## Reconstruction sanity (advisory, not a gate)

Four square inputs were encoded → decoded through the same code path and
compared against the source pixels. This is a sanity band, **not** a
reproduction of the published ImageNet metrics (no rFID run happened).

| Input | PSNR vs source | Token drift |
|---|---|---|
| `teaser.jpg` native center crop | 20.17 dB | 13.7% |
| `01-coastal` (showcase) | 28.54 dB | 4.3% |
| `02-forest` (showcase) | 38.83 dB | 20.3% |
| `03-lake` (showcase) | 27.29 dB | 9.4% |
| `teaser.jpg` squashed to square (aspect artifact — not representative) | 18.04 dB | — |

The band brackets the published 256² PSNR (21.90 dB, upstream
`docs/Open-MAGVIT2.md`), and drift does not track reconstruction quality —
`02-forest` decodes best yet drifts most, which is what one expects from a
drift metric that measures re-quantization boundary sensitivity, not pixel
error. The squashed-aspect teaser number is an input artifact (4854×2198
forced to square), not model behavior.

## Combined four-gate matrix

| Gate | Verdict | Source |
|---|---|---|
| **A. License** | ✅ PASS (code + HF card Apache-2.0; re-verify at fetch time per protocol) | [2026-05-13 audits](2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md) + [Gate B closeout](2026-05-31-openmagvit2-gate-b-closeout.md) |
| **B. Weights** | ✅ PASS (SHA-pinnable files; exact SHA-256 verified at download this session) | [Gate B closeout](2026-05-31-openmagvit2-gate-b-closeout.md) |
| **C. Determinism** | ✅ PASS (structural policy; drift advisory 0.109375) | this note |
| **D. ONNX / CPU** | ✅ PASS (opset-17 ONNX, ≤ 5.45 s CPU, parity 7.37e-05) | this note |

Machine check: running the repo's own composite harness
(`research/validation/vqgan_gate_audit.py`) against these receipts returns
`status: "passed"` for candidate `seed/openmagvit2` with both gate `pass_check`
blocks green (receipt kept out of git per the `artifacts/m1b-audit/` rule).
Caveat recorded as a follow-up: that harness hardcodes the #334/#335 trackers
and VQGAN-class wording in its gate rows.

## Repo-side wiring (durable as of `797ab56`)

- `research/validation/m1b_om2_gate_c_roundtrip.py` — Gate C producer (EMA
  selection, bit-exact index→latent check, drift metrics, deterministic PNGs).
- `research/validation/m1b_export_om2_decoder_onnx.py` — Gate D exporter with
  the additive `parity_check` block folded into the exit code.
- `research/validation/fixtures/m1b-audit/om2-*.fixture.json` — committed
  contract shapes (placeholder hashes; metrics representative of these runs),
  wired into `m1b-audit-artifact-check` (7 checked entries).
- Producer unit tests in `research/validation/test_m1b_metric_producers.py`
  (parser defaults, EMA selection, structural-policy drift case, export
  guardrails; numpy-less environments skip instead of erroring).

## What this enables / what it does NOT establish

**Enables:** OpenMAGVIT2 is now a *fully audited* pivot candidate. If the
LlamaGen delivery path fails at any step (hosting, licensing, runtime), a seed
bridge slice has measured, reproducible evidence to stand on — including the
exact ONNX boundary and weight-selection conventions.

**Does NOT establish:**

- No delivery wiring: no `decoders/seed/manifest.json`, no family manifest, no
  bridge implementation. The runtime still throws `SEED_BRIDGE_NOT_IMPLEMENTED`
  (now reporting all four gates passed; see below).
- Not *blessed*: per #473 a blessed decoder requires the family manifest, a
  `decoderHash`, Gate C/D receipts cross-checked by
  `validateDecoderManifestAuditReceipts`, and declared acceptance policies.
  That machinery exists; no family manifest does — for any family, yet.
- Single-host evidence: macOS arm64 CPU only. Cross-device parity is declared
  `structural-only`, not measured on a second machine or a GPU tier. Linux was
  not run.
- No `onnxruntime-node` load of the artifact yet — Gate D used Python ORT CPU
  (the same harness the LlamaGen Gate D used). The composite receipt's
  `node_available` flag is a presence check only.
- Only the 256² / 16×16 / K=262144 variant was audited. Other released
  variants (`imagenet_128_L`, 16384-codebook tokenizers) are unaudited.
- Decoder-only: the encoder is not exported (bridge contract, same as
  LlamaGen).

## Follow-on decisions

1. **Bless vs keep candidate → keep `candidate`.** Gates cleared is not the
   same as shipped; `blessed` is a delivery decision that wants the family
   manifest + receipt cross-check machinery, and no family manifest exists
   today (the blessing schema is exercised by tests only). Recommendation:
   stay with the LlamaGen floor; pick the seed bridge up as a slice only if
   the LlamaGen delivery path fails, or when a second family is explicitly
   wanted. Decision tracker remains #331/#283. Recommended disposition:
   #331's audit deliverable is complete with this note; close it once the note
   is pushed — the delivery/selection question stays live under #283.
2. **Wire the producers into the Python CI half (recommended, separate
   slice).** `research/validation` tests are local-only today
   (`m1b:audit-self-check`); `test_m1b_metric_producers.py` and
   `test_vqgan_gate_audit.py` are stdlib-only (numpy optional, skip-guarded)
   and would run cheaply in the existing Node+Python job after the numpy
   install step. Keep `m1b:audit-self-check` local (it exercises pnpm build
   outputs). **Landed 2026-10-16** (`a33f7c0`) — see the
   [follow-on closeout](2026-10-16-m1b-audit-followons-closeout.md).
3. **Tooling fix before any seed manifest cross-check.** `vqgan_gate_audit.py`
   hardcodes the #334/#335 trackers and VQGAN-class wording; add
   tracker overrides (or derive from `--candidate`) so a seed-family receipt
   can pass the `gateReceipt.tracker === manifest.tracker` rule honestly.
   **Landed 2026-10-16** (`73b3794`): `--gate-c-tracker` / `--gate-d-tracker`
   overrides plus family-neutral wording; the
   [follow-on closeout](2026-10-16-m1b-audit-followons-closeout.md) also
   records the candidate-label constraint found for the future seed manifest.

## Reproducibility — sources and tools

Environment (lab box): Python 3.12.3 arm64, torch 2.14.1, onnx 1.23.2,
onnxruntime 1.31.0, numpy 2.5.4, pillow 12.3.0. Receipts live outside the
repo (`/tmp/om2/out/*.json`); the committed fixtures are the contract copies.

```bash
# Gate C (3 runs, deterministic; writes receipt + PNGs)
python -m research.validation.m1b_om2_gate_c_roundtrip \
  --repo-root /tmp/om2/SEED-Voken --ckpt /tmp/om2/imagenet_256_L.ckpt \
  --input-image /tmp/om2/teaser.jpg --device cpu \
  --out /tmp/om2/out/om2-gate-c-roundtrip.json --png-dir /tmp/om2/png

# Gate D export (+ torch<->ORT parity on two token fixtures)
python -m research.validation.m1b_export_om2_decoder_onnx \
  --repo-root /tmp/om2/SEED-Voken --ckpt /tmp/om2/imagenet_256_L.ckpt \
  --out /tmp/om2/out/om2-decoder.onnx --receipt /tmp/om2/out/om2-gate-d-onnx-export.json

# Gate D CPU timing (full 2^18 index space)
python -m research.validation.m1b_gate_d_onnx_cpu \
  --onnx /tmp/om2/out/om2-decoder.onnx --codebook-size 262144 \
  --out /tmp/om2/out/om2-gate-d-onnx-cpu.json

# Composite receipt (machine verdict)
python -m research.validation.vqgan_gate_audit \
  --candidate seed/openmagvit2 --weights /tmp/om2/imagenet_256_L.ckpt \
  --onnx /tmp/om2/out/om2-decoder.onnx \
  --roundtrip-json /tmp/om2/out/om2-gate-c-roundtrip.json \
  --onnx-json /tmp/om2/out/om2-gate-d-onnx-cpu.json \
  --out /tmp/om2/out/om2-vqgan-gate-audit.json
```

Primary sources checked: upstream code at `c1544eff`
(`src/Open_MAGVIT2/models/lfqgan.py`,
`modules/diffusionmodules/improved_model.py`,
`modules/vqvae/lookup_free_quantize.py`); HF model tree + LFS metadata
(`TencentARC/Open-MAGVIT2`, revision `607230591b…`); upstream
`docs/Open-MAGVIT2.md` performance tables (rFID 1.17 / PSNR 21.90 for the
audited variant).

## Cross-references

- Per-candidate audit (A/B pass, C/D open): [2026-05-13 audits](2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md)
- Gate B closeout: [2026-05-31 openmagvit2 gate B](2026-05-31-openmagvit2-gate-b-closeout.md)
- Sibling Gate C/D verdict for the M1B floor: [2026-05-27 VQGAN-class gates C+D](2026-05-27-audit-vqgan-class-gates-cd.md)
- Acceptance policy: [2026-05-31 M1B gate C/D acceptance policy](2026-05-31-m1b-gate-acceptance-policy.md)
- Runtime surface updated alongside this note: [`seed.ts`](../../packages/codec-image/src/decoders/seed.ts) (gate status now reports all four gates passed; bridge still not wired)
- Trackers: [#331](https://github.com/p-to-q/wittgenstein/issues/331) · [#283](https://github.com/p-to-q/wittgenstein/issues/283) · [#334](https://github.com/p-to-q/wittgenstein/issues/334) · [#335](https://github.com/p-to-q/wittgenstein/issues/335)
