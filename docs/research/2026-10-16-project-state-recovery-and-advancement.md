# 2026-10-16 · Project state recovery and advancement plan

Recovery session on the local mirror after a long quiet period (last push 2026-10-08;
June–October mostly dependabot). This note records: (1) the verified current state,
(2) a full code read with defect findings, (3) a refreshed paper-source feasibility
matrix (GitHub API verified 2026-10-16), and (4) a staged advancement plan.
Fact / interpretation / unknown are marked explicitly.

## 1. Current state (facts)

- Working clone at `main`, HEAD `8aef787` (dependabot npm-prod bump #643); workspace clean.
- 17 open issues (not 25): 70, 263, 267, 331, 391, 392, 393, 394, 396, 397, 398, 399, 400, 402, 403, 452, 584.
- Health gates all pass individually (lint, typecheck, 123/123 codec-image tests, 1/1 golden,
  49/49 workspace tests with `--testTimeout=30000`, reviewer-bench 8/8, publish-surface,
  doctor tier0 ready, Python compileall + training unittest 8/8). The only flakes observed are
  CLI spawn tests under heavy machine load with the package default 5s timeout — not code regressions.
- v0.3 release gates all closed (`docs/exec-plans/active/v0.3-roadmap.md`).
- M1B (#283) all four gates PASS: Gate A license (MIT — see §3), Gate B weights SHA-pinnable,
  Gate C determinism (T1/T2 byte-exact per device; cross-device structural; re-encode Hamming ~12% advisory),
  Gate D ONNX/CPU export (162.57MB, median decode 0.824s ≤ 30s).
- M1B delivery is still blocked on #402 (lazy weight fetch + SHA pin), #403 (install/doctor tier),
  #441 (training stack stance); PR #457 superseded by merged #527/#528.
- Interpretation: the decoder delivery surface (preflight, weights sha-verify chain, decoder-manifest
  schema + audit-receipt validation) is substantially more ready than the open-issue count suggests;
  the missing piece is the actual ONNX inference wiring and the blessed manifest.

## 2. Code-read findings (2026-10-16, with evidence)

Read in full: `packages/core` (harness/manifest/seed/router/registry/errors/retry/budget/telemetry/config/
llm adapters/schema preamble+validate/legacy pipeline), `packages/codec-image` (codec/schema/types/
adapters/pipeline/decoders incl. llamagen, seed, weights, preflight, manifest, runtime),
`packages/cli` (install/doctor/decoder-manifest/replay/shared/tiers), `packages/schemas` v2
(base/ir/ctx/sidecar/codec), `packages/process-runner`, `packages/sandbox`. Python surfaces surveyed.

Defect findings (each verified in source; none observed to corrupt artifacts today):

- **F1 — `durationMs` epoch bug** (fact). `packages/codec-image/src/codec.ts` `ImageCodec.decode()`
  sets `durationMs: Math.max(0, ctx.clock.now())`, recording epoch milliseconds (~1.75e12) instead of
  elapsed run time. `codec-audio` does it correctly (`now() - startedAt`); `codec-svg`/`codec-asciipng`
  hardcode 0. This violates the manifest's telemetry-honesty contract for the image codec.
  Fixed in this session (see §4 slice A1).
- **F2 — LLM calls have no timeout and no retry wiring** (fact). Neither `openai-compatible.ts` nor
  `anthropic.ts` passes an `AbortSignal` to `fetch`; a hung connection blocks the run indefinitely.
  `runtime/retry.ts` `retryWithPolicy` has **zero call sites** in the repo (dead code), and
  `config.runtime.retry` (maxAttempts=3, backoffMs=500) is parsed but never consumed. L1 advertises
  routing/retry/seed/budget/telemetry, but retry is not wired.
- **F3 — process-runner timeout leaves orphans possible** (fact). `process-runner/src/index.ts`
  `runProcess` sends only `SIGTERM` on timeout; a child that ignores/defers SIGTERM keeps running
  after the promise rejects. No SIGKILL escalation, no wait-after-SIGTERM grace.
- **F4 — `foldManifestRows` writes arbitrary keys** (fact). `harness.ts` folds codec `ManifestRow`s
  into the manifest with `manifest[row.key] = row.value` — a codec could overwrite core fields
  (e.g. `seed`, `artifactSha256` before the dedicated guards run). No key whitelist.
- **F5 — pricing table is stale** (fact). `llm/pricing.ts` covers gpt-4o / claude-3.5 era models.
  Newer models fall through to `costUsd=null` + `costUsdReason="unknown-model"`, which is honest
  per Issue #182 doctrine, but means manifests record no cost for current models until the table
  is amended. No automated staleness check exists.
- **F6 — `createRunId` uses `Math.random()`** (fact, low severity). Run IDs need uniqueness, not
  secrecy; still, `crypto.randomUUID()` is the industry default and removes collision worries.
- **F7 — research-weights enforcement is duplicated** (fact, consistency note). ADR-0020 opt-in is
  enforced both in `harness.ts applyLicenseReceipt` and in `codec-image weights.ts
  enforceResearchWeightsOptIn`. Not a bug; both are defense-in-depth, but the two error shapes
  should stay in sync.
- **F8 — sandbox is an intentional stub** (fact). `packages/sandbox/src/exec.ts` throws
  `SANDBOX_NOT_IMPLEMENTED` citing ADR-0016. Correct per doctrine; no action beyond ADR-0016's
  own timeline.
- **F9 — legacy v1 pipeline still serves asciipng/svg** (fact). The registry registers v2 codecs for
  image/audio/sensor/video; asciipng and svg still run the v1 `parse`/`render` path in
  `harness.runLegacyCodecPipeline`. This is a port backlog item, not a defect.

Interpretation: the codebase is small, disciplined, and honest for its maturity; the robustness gap
versus OpenAI/DeepSeek/ByteDance-grade production is concentrated in the L1 network boundary
(timeouts, retries, process control) and in small manifest-integrity leaks — not in architecture.

## 3. Paper-source feasibility matrix (2026-10-16, GitHub API verified)

License fields re-verified against the GitHub API today (gh api repos/<r> license):

| Candidate | Repo | Code license | Weights | Stars / archived | Verdict |
| --- | --- | --- | --- | --- | --- |
| LlamaGen | FoundationVision/LlamaGen | MIT | MIT (HF, SHA-pinned in audit) | 1970 / no | **M1B canonical target; 4/4 gates PASS** |
| Open-MAGVIT2 | TencentARC/SEED-Voken | Apache-2.0 | Apache-2.0 HF card | 1022 / no | Second canonical candidate (seed family); Gates A/B pass, C/D unknown (#331) |
| TiTok | bytedance/1d-tokenizer | Apache-2.0 | research-only (HF) | 1177 / no | Research lane only per ADR-0020; method lessons already absorbed (#567) |
| VAR | FoundationVision/VAR | MIT | — | 8753 / no | Lineage evidence; a generator, not a frozen decoder bridge |
| FlexTok | apple/ml-flextok | NOASSERTION (apple-mlr research license) | research | 335 / no | Excluded from canonical path; research lane |
| MaskBit | no official code | n/a | research-only | n/a | Excluded (ADR-0020) |

Known inconsistency to fix later (fact): `packages/codec-image/src/decoders/llamagen.ts` header says
"Upstream: Apache-2.0" but the audited upstream (pinned `ce98ec4`) and GitHub API both say **MIT**;
the vendored `research/training/_shared/_third_party/LICENSE.llamagen` also says MIT. The header
comment was wrong; corrected to MIT in Stage A (`b88f183`) so receipts cannot propagate a false
license posture.

## 4. Staged advancement plan

Guiding constraint (user directive): no compute yet; first make the code production-grade robust
and improve architecture; then propose how the research mainline should advance.

### Stage A — robustness slices (small, testable, in-repo)
- **A1 (done this session)**: fix F1 `durationMs` in `ImageCodec.decode()` — capture `startedAt`
  at phase entry and record elapsed ms, matching `codec-audio`. Guard test added.
- **A2 — LLM adapter timeout + retry wiring**: pass `AbortSignal.timeout(...)` (configurable via
  config, sensible default) to both adapters; wire `retryWithPolicy` to transient failures only
  (network error, 408/429/5xx — never 4xx validation errors), with exponential backoff + jitter
  and `Retry-After` respect. Consume the existing `config.runtime.retry` fields so no schema change
  is needed. Add unit tests with a mocked fetch.
- **A3 — process-runner kill escalation**: after SIGTERM, wait a short grace period then SIGKILL;
  reject once (idempotent settle) and expose `timedOut` distinctly.
- **A4 — manifest row whitelist**: restrict `foldManifestRows` to a closed key set (or at least
  reject keys that collide with core RunManifest fields) with a typed error; add a test.
- **A5 — hygiene**: `createRunId` via `crypto.randomUUID()` (format-preserving fallback),
  pricing-table maintenance note + `doctor` hint when provider/model unpriced; fix the
  llamagen.ts license header (MIT).

### Stage B — architecture improvements (after A, still no compute)
- Manifest-integrity invariants as a shared validator: `durationMs >= 0`, `ok`/`error` pairing,
  `costUsd != null ⇒ costUsdReason != "no-llm-call"` (already handled at fold time), `artifactSha256`
  null iff no artifact; run it in `writeJson("manifest.json")` path.
- Pre-call budget guard: check `budget` before issuing an LLM call, not only after (avoids
  overspending on a run that will be rejected).
- Telemetry path guard (`writeText` rejects `..`/absolute paths).
- Decide and document whether the v1 asciipng/svg codec path gets ported to v2 (backlog item) or
  explicitly frozen as-is.

### Stage C — research mainline advancement (when compute returns)
Order preserved from the 2026-05-31 exec order, refreshed by today's facts:
1. #441 verdict (training stack stance) — plain PyTorch, torchrun+DDP first, FSDP2 escalation.
2. #402 lazy weight fetch + SHA pin → #403 install/doctor tier (surfaces are ready; only ONNX
   wiring + blessed manifest remain).
3. #399/#400 (infra) in parallel, then training/eval slices #393/#394/#396/#397/#398.
4. No SeedExpander training until the tokenizer/decoder radar is closed (doctrine per #205/#207).
5. TiTok lessons (#567) and gate-acceptance policy (#473) stay as code-contract rules.

## 5. Unknowns (explicit)

- Whether the Open-MAGVIT2 weights are byte-identical across HF revisions (Gate B pin needed).
- Whether ONNX CPU determinism holds for Open-MAGVIT2 on macOS+Linux (Gates C/D unknown, #331).
- Current model prices for the pricing table (stale since mid-2026 model rotations).
- The user's compute budget and timing for Stage C — plan is readiness work until then.

## 6. Addendum — Stage B landed (2026-10-16, same session)

Stage A already committed (`b88f183`); the llamagen header inconsistency noted in §3 is fixed there.
Stage B landed as two commits plus one test-robustness fix, all local, all gates green:

- `bcaea32` **B1/B2 — budget fail-fast + telemetry path guard**: `BudgetTracker.assertWithinLimits()`
  is public and the harness calls it before every LLM generate (v2 `services.llm.generate` wrapper
  and the legacy path), so an exhausted budget rejects the NEXT call instead of paying first.
  `RunTelemetry.writeText` rejects absolute names and `..` segments with a typed
  `TELEMETRY_PATH_TRAVERSAL` error; `writeJson` inherits the guard.
- `2ff5c10` **B3/B4 — manifest write-path validation + doctor pricing hint**: the harness now runs
  the manifest through the canonical `RunManifestSchema` before persisting and refuses with
  `MANIFEST_INVALID` + zod issues (replay-validates-on-read becomes validates-on-write-too; this
  closes the `foldManifestRows` unknown-value bypass). `priceModel` is exported from the core
  surface and `wittgenstein doctor` reports `llmPricing {modelKnown, costUsdReason, hint}` so an
  unpriced (provider, model) pair is surfaced up front. First validator run immediately caught a
  real invalid pairing (`costUsd=0` + `reason="no-llm-call"`) in a test fixture — the check works.
- `53904b9` **process-runner test deflake**: the SIGKILL escalation test gave the child a 100ms
  startup window that the machine's load could eat (ENOENT on the pid file, reproduced 2×); now
  3s + a bounded pid-file poll. Production runner code was correct throughout.

**asciipng/svg v1→v2 port decision (this session): freeze, do not port now.**
Facts: `codec-svg` and `codec-asciipng` are v1 `WittgensteinCodec`s (schemaPreamble/parse/render)
routed through the legacy pipeline; both are stable, golden-tested, and shipped as tier0
("sensor / svg-local / asciipng"). Their non-local sources (svg engine, asciipng minimax) are
LLM-generation paths that a v2 port must move into codec-owned `produce()` — real work, not a
mechanical port. Issue #300 (v1-compat retirement) is closed; the legacy pipeline is not scheduled
for removal. Interpretation: porting now buys receipt uniformity but risks churn on the most
stable shipped surface while robustness and M1B delivery are the binding constraints.
Decision: keep both codecs v1 (frozen) until (a) M1B audit delivery closeout lands (#402/#403/#441),
and (b) the v2 protocol exits experimental; then port svg-local first (pure-local, smallest),
then asciipng, per the sibling-port order already recorded in
`docs/exec-plans/active/codec-v2-port.md`. Documented in `docs/implementation-status.md`.

**Validation record (after B, worker under load 8–28):** typecheck green · lint green ·
core 101/101 · codec-image 124/124 · golden 1/1 · process-runner 20/20 (3× after deflake) ·
cli 50/50 · reviewer-bench 8/8 · publish-surface clean · doctor ok (llmPricing present) ·
numpy smoke OK. No push to mirror/GitHub yet.

**What Stage B does NOT cover (explicit, not forgotten):** doctor pricing-table rates themselves
remain stale (mid-2026 model rotations — the hint now tells operators exactly which pair is
unpriced, but the table refresh needs current vendor pages); sandbox remains a typed stub;
M1B delivery (#402/#403/#441) stays blocked on compute/lazy-fetch work, unchanged.


## 7. Addendum — Stage C code slices landed (2026-10-16, continued session)

No training, no compute: three delivery slices landed as local commits, all gates green.

- `397a0d1` **#402 loader contract-fill (codec-image)**: the `LLAMAGEN_BRIDGE_NOT_IMPLEMENTED`
  stub is replaced by the full loader — bundled pin record parsed at load, weights-first-then-runtime
  order (a cache miss fails as `WEIGHTS_NOT_INSTALLED` even without the ONNX peer), cache-only by
  default with a HF-style fetch lane behind `options.weightsBaseUrl` / `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL`,
  capability advertisement, int64 `BigInt64Array` feeds `[1,16,16]`, and `onnxOutputToPng`. Decode math
  is evidence-pinned against upstream commit `ce98ec4`: `torch.clamp(127.5*x+128, 0, 255)` then a
  **truncating** `dtype=torch.uint8` cast (verified against `vq_demo.py` + `reconstruction_vq_ddp.py`;
  implementation uses `Math.trunc`, not `Math.round`). `encodeRgbaAsPng` was extracted into
  `src/png.ts` so bridge and pipeline share one RGBA→PNG definition. `decoder-bridge-contract.test.ts`
  now expects the honest `WEIGHTS_NOT_INSTALLED`; new `llamagen-decoder.test.ts` (18 tests) verifies
  the conversion by zlib-inflating the produced IDAT — an independent decode, not a second encoder copy.
- `2ce1812` **#403 install CLI + doctor tier readiness (cli)**: `wittgenstein install image` now has a
  real fetch lane — same `resolveDecoderWeights` + `buildHuggingFaceAssetFetcher` the bridge uses
  (exported from codec-image so install and loader cannot diverge). Cache-only by default;
  `--weights-base-url` / env activates `<base>/<repoId>/resolve/<revision>/<filename>` fetch +
  sha256-verify + atomic cache promotion. Missing weights with no base URL → `TIER_INSTALL_NEEDS_WEIGHTS_URL`
  citing #402/#435; GPU tier → `TIER_INSTALL_GPU_UNSUPPORTED`; ADR-0020 opt-in stays enforced. Install
  writes `~/.config/wittgenstein/installed-tiers.json` (override `WITTGENSTEIN_INSTALL_RECEIPT_PATH`);
  re-runs are idempotent no-ops; doctor reads the receipt (corrupt → `invalid`, never "ready") and
  derives tier1 readiness from live preflight. End-to-end fetch is covered by a flow test running a
  real local HTTP server against the spawned CLI, including the second-run no-op.
- `1569564` **pricing table refresh (core)**: current vendor rates from primary sources
  (platform.claude.com model pages; platform.minimax.io/docs/pricing/overview) + two agreeing
  aggregators for OpenAI. Anthropic current lineup (opus-5-5 $4/$20, sonnet-5-5 $2/$10,
  haiku-5-5 from $0.10/$0.50, fable-5-1 $10/$50), OpenAI gpt-4.1/4.1-mini/4.1-nano + gpt-5/mini/nano,
  MiniMax M2/M2.7/M3 ($0.30/$1.20). Newest OpenAI tiers (5.4/5.5/5.6/6.x) are deliberately **not**
  pinned because aggregator sources conflict — unknown-model receipts stay honest (pin test enforces).

**Validation record (this addendum):** codec-image 153 passed / 1 skipped · cli 85/85 · core 105/105 ·
repo-wide typecheck + lint clean. Still no push to mirror/GitHub.

### Pre-training checklist (derived from the #441 closeout "Safe Before GPU" list)

Everything below is code/process work that needs no GPU. Items are ordered as Stage C intends.

1. **Receipt floor (safe now, most already merged):** canonical `TrainingRunManifestSchema` receipts,
   `gpuCount: 0` CPU-smoke honesty, optimizer-state SHA, experiment-tracker sibling receipt —
   already the #441 closeout baseline. Verify against `research/training/_shared` when slices start.
2. **#399 tracker infra:** shared experiment tracker + Aim deployment evidence; the local JSONL
   tracker is the smoke floor.
3. **#400 data policy:** ImageNet/CC12M snapshot + DVC remote provider/credentials — maintainer/model-
   owner decision (cannot be defaulted autonomously).
4. **#393/#394/#396/#397/#398 slices:** tokenizer/adapter/LLM-head training + eval scaffolding, each
   emitting the canonical manifest; no quality claims until real runs.
5. **Reuse gate:** LlamaGen vendored shim only. TiTok / Open-MAGVIT2 / MaskGIT reuse needs license +
   model-owner review before becoming training code (#435 hub).
6. **Delivery wiring left for M1B closeout:** bridge → image pipeline `decode()` swap **landed
   2026-10-16 (`91ca0dd`, S7b)**: DI seam (`services.decoderBridge` / `options.bridge`), preflight
   family/shape/codebook + output-resolution assertions, typed no-fallback, `decoderReceipt` +
   conditional `image.decoder` manifest row, stub-bridge tests + skippable real-bridge smoke.
   CLI `--decoder llamagen` opt-in flag **landed 2026-10-16 (`8fd1a24`)**: loader runs before
   any LLM spend, failures are structured CLI errors (installHint) with exit 1, and core
   `HarnessRunOptions.services` folds entry-layer services into `HarnessCtx.services`.
   Bridge-lane replay verification **landed 2026-10-16 (`23f2055`, S7d)**: `wittgenstein replay`
   re-executes image runs from the recorded `llmOutputRaw` (`services.recordedGeneration`, no
   stub substitution), resolves the recorded decoder cache-only from the manifest spine, and
   checks the D2 chain — decoder id/hash/class → `latentsSha256` decode-input digest →
   class-aware artifact parity (`REPLAY_OK` / `REPLAY_STRUCTURAL_OK`; refusals never green).
   Remaining: canonical ONNX hosting decision (#435), then issue closeout review.
   **Closeout review landed 2026-10-16 (`655eba3` + `c2ca18e`):** #384/#402/#403
   assessment + manifest row-schema symmetry decisions CR1–CR3
   (`docs/research/2026-10-16-m1b-delivery-closeout-review.md`); the remaining
   owner decisions (hosting/pin) are unchanged.
7. **SeedExpander training gating:** stays off until tokenizer/decoder radar closeout (#205/#207).

### Open-risk ledger (unchanged, restated)

- The shipped ONNX remains a derivative export with no canonical SHA-pinnable URL: install is
  cache-only until #435 lands. Honest, no silent fallback.
- svg/asciipng remain frozen v1: unfreeze needs M1B closeout (issues actually closed) + v2 protocol
  exit from experimental.
