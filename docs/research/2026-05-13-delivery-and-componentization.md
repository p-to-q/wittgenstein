---
date: 2026-05-13
status: research note (doctrine-shaped) — delivery / componentization doctrine
labels: [research-derived, delivery, componentization, engineering, governance]
tracks: [#283, #292]
companion-to: docs/research/2026-05-13-wittgenstein-research-program.md
---

# Delivery, Engineering Quality, Componentization

> **Status:** doctrine-shaped research note. Answers the maintainer
> question: given the elite research/training/eval infrastructure
> Wittgenstein is building (per the [research-program note](2026-05-13-wittgenstein-research-program.md)),
> **does all of it need to ship to every user?** Answer: **no.** The
> discipline is tiered delivery — different audiences get different
> install surfaces. The elite infra lives in the repo and produces the
> best results; users and reviewers get an experience proportional to
> their need.
>
> This note codifies that as doctrine. Three concrete trackers fall out
> of it (see §"Concrete follow-ups"). Any process-doctrine change
> (e.g. mandating a new release gate) routes through ADR-0014's
> governance lane.

## Why this note exists

The research-program note commits Wittgenstein to multi-month training
runs, full-resolution eval ablations, and infrastructure (FSDP, aim,
DVC, GPU CI). That's **what we want as a project**. The question this
note answers is: **what do USERS get?**

### Both ends — performance ceiling AND accessibility floor

The maintainer's clarification (2026-05-13): we keep **both**.

- **Headline performance numbers** (published benchmarks, paper / arxiv
  results, leaderboard entries, comparisons vs LlamaGen/Open-MAGVIT2)
  run on the **elite tier** — GPU canonical, full eval, full ablation
  matrix. **The project's published quality claim is what the elite
  tier produces, full stop.**
- **User experience** is **tiered**, so a low-spec laptop user, a
  reviewer without a GPU, and a researcher with a cluster all get
  appropriate install footprints — but **none of them is the
  benchmarked configuration**. The benchmark is its own thing.

This is how mature engineering projects work: `llama.cpp` publishes
benchmark numbers on the best available hardware while the runtime
also works on a Raspberry Pi; PyTorch publishes paper-grade numbers
on H100s while `pip install torch` works on a CPU laptop. **The
published quality claim and the typical user's experience are
allowed to be different**, as long as both are honest.

What this means for Wittgenstein:

| Surface | Configuration | Quality bar |
|---|---|---|
| Published benchmarks / paper | Elite tier (GPU, full ablation, own-trained models per the [research-program note](2026-05-13-wittgenstein-research-program.md)) | **SOTA-adjacent.** No compromises. |
| Typical user experience | Tiered (Tier 0–2 per below) | "Works in 30 seconds; produces honest receipts." |
| Reviewer verification | Reviewer-bench (Tier 0 surface + tiny ablation subset) | "Project's claims are verifiable in 5 minutes on a laptop." |

The discipline below is about **the user experience**. It does **not**
relax the published benchmark requirements — those keep the elite-tier
contract.

Without an explicit answer:

- A user who wants to render a sensor signal could end up downloading
  5 GB of frozen-decoder weights.
- A reviewer who wants to verify the manifest-spine claim could end up
  needing to configure CUDA.
- A low-spec laptop user could end up unable to install ANY part of
  Wittgenstein because the workspace install pulls onnxruntime-gpu.

These would all be unforced failures. Mature projects don't do this:

- `llama.cpp` ships a small runtime; weights are separate.
- `transformers` is small on install; `from_pretrained` lazy-downloads.
- `ollama` keeps the CLI tiny and pulls models on demand.
- `pytorch` separates `torch-cpu` / `torch-cuda` so users only pay for
  what they need.

Wittgenstein's existing package-boundary discipline (codec packages
already separate; `@wittgenstein/cli` is its own publish surface) means
**we're 80% of the way to clean tiering**; this note is the doctrine
finish.

## Three audiences, three install surfaces

### Audience 1 — first-time user

Wants: try Wittgenstein in 30 seconds. May not care about M1B image yet.

Gets:

```bash
npm i -g @wittgenstein/cli   # ~10 MB, no model weights
wittgenstein sensor "ECG 72 bpm resting" --dry-run --out /tmp/ecg.json
```

Tier 0 covers everything that doesn't need a learned model:
**sensor**, **svg-local**, **asciipng**, **audio (procedural runtime)**,
**doctor**, **replay** (for sensor / svg-local / asciipng).

The 30-second quickstart already in the README is Tier-0 by accident.
This note makes it Tier-0 by **design**.

### Audience 2 — image-curious user

Wants: generate an image. Has a laptop.

Gets:

```bash
wittgenstein doctor             # tells them they don't have image installed yet
wittgenstein install image      # explicit opt-in. Fetches weights with progress
                                # bar; sha256-verifies; writes receipt.
wittgenstein image "a cat in the rain"
```

Tier 1 — Image inference CPU: adds `onnxruntime-node` (~80 MB) +
fetched decoder weights (1-5 GB). All weights fetched from
HuggingFace, sha256-verified against the manifest pinned in
`packages/codec-image/decoders/<family>/manifest.json`. **The npm
package never bundles weights.**

Tier 2 — Image inference GPU: same as Tier 1 with `onnxruntime-gpu`
or `torch-cuda` variant. Detected by doctor; opt-in via
`wittgenstein install image --gpu`.

### Audience 3 — academic / reviewer

Wants: verify the project's claims without setting up infrastructure.

Gets:

```bash
git clone wittgenstein && pnpm install   # workspace deps only, ~30 sec
pnpm reviewer-bench                       # tiny eval pack: ~5 min, no GPU
```

The reviewer-bench produces a structured report:

- Receipts table: which routes produce which artifacts at which
  determinism class.
- Replay verification: re-runs each saved manifest, asserts byte/
  structural parity.
- Sample eval on small subsets (200 samples per modality, not 50k).
- Citation list back to the research notes / ADRs / RFCs.

A reviewer reads ONE report, runs ONE command, and has a defensible
position on the project's engineering claims. They do **NOT** need
GPU, ImageNet, FFmpeg, or HyperFrames.

For deeper inspection, the reviewer reads `docs/research/`,
`docs/adrs/`, `docs/rfcs/` — all already in the repo, all already
audit-shaped.

### Audience 4 — contributor / researcher

Wants: run the Phase 1 training, ablations, benchmarks.

Gets:

```bash
git clone wittgenstein && pnpm install
cd research/training
python -m pip install -r requirements.txt    # the heavy stack
wittgenstein train-sweep configs/phase1-ablation.yaml
```

Tier 3 is the elite infra. It does NOT live under `packages/*` — it
lives under `research/training/`, with its own `requirements.txt`,
its own Dockerfile, its own dataset pipeline. **`research/` is
explicitly excluded from npm publish** (via package.json `files`).

A user pip-installs `@wittgenstein/cli` and gets ZERO PyTorch in their
dep tree. A contributor explicitly enters `research/training/` to
pick up the heavy stack.

### Audience 5 — maintainer

Wants: cut a release, publish weights, run the CI sweep.

Gets the full repo + Tier 3 + the release pipeline (`wittgenstein
release-trained`, HF push, tag bump). Tier 4 — never publicly
documented as a user-facing install; reachable only via the maintainer
runbook in `docs/release/`.

---

## Architectural moves

### 1. Lazy weight fetch with sha256 verification

Every decoder bridge (`packages/codec-image/src/decoders/<family>/`)
ships a `manifest.json` carrying:

```json
{
  "repoId": "wittgenstein-harness/image-vqgan-v1",
  "revision": "v0.4.0",
  "weightsFilename": "decoder.onnx",
  "weightsSha256": "abcd...",
  "codebookFilename": "codebook.bin",
  "codebookSha256": "ef01..."
}
```

`load<Family>DecoderBridge(options)` consults this manifest, looks up
the weights in `~/.cache/wittgenstein/decoders/<family>/<sha>/`, and
on cache miss fetches + sha256-verifies before constructing the
session.

**Refuses to construct the session if verification fails** (no silent
fallback to "well, the file is here, hope it's right"). Refuses to
fetch from any URL other than the one in the manifest (no chain-of-
trust expansion).

Mirrors codec-audio/decoders/kokoro/index.ts — same pattern, image
side just hasn't been wired yet.

### 2. Optional/peer dependencies for runtimes

Currently `@wittgenstein/codec-video` declares `@wittgenstein/core` as
a hard dep, which is correct. But future image GPU deps (e.g.
`onnxruntime-gpu`) should be `peerDependenciesMeta.optional: true`
so that users not on the GPU tier don't pay for them.

`@wittgenstein/cli` checks at runtime whether the peer is installed
and emits a structured error guiding the user to
`wittgenstein install image --gpu` if they're trying to use a tier
without its deps.

### 3. `wittgenstein install <tier>` CLI

New CLI subcommand. Backed by a small `installer.ts` that:

1. Looks up the tier's required deps + weights from a hard-coded
   tier manifest in the repo.
2. Asks npm to install peer deps if needed.
3. Fetches + sha256-verifies weights.
4. Writes a receipt to `~/.config/wittgenstein/installed-tiers.json`
   so `doctor` can report it.
5. On uninstall, removes weights but not deps (deps are user-managed).

### 4. Doctor reports tier readiness

`wittgenstein doctor` extends to list:

```
Tier 0 (sensor / svg-local / asciipng): ✓ ready
Tier 1 (image CPU): ✗ not installed.
   Install: wittgenstein install image
Tier 2 (image GPU): ✗ not installed.
   Install: wittgenstein install image --gpu
   Detected GPU: NVIDIA RTX 4090 (8GB VRAM)
Tier 3 (research/training): not relevant (use git clone)
```

Doctor is the user's compass; it tells them what's possible and what
to do next.

### 5. `examples/reviewer-bench/` one-command eval pack

A self-contained directory with:

- `README.md` — how a reviewer runs the bench and reads the output
- `fixtures/` — 200 sample inputs per modality (tiny, repo-committed)
- `expected/` — the SHA-256 of each artifact (the golden)
- `run.ts` — the script `pnpm reviewer-bench` invokes

Output: a markdown report (one page) with pass/fail per modality, a
table of receipts, and citations into the research / ADR docs. Time
budget: ≤ 5 minutes on a 2024-era laptop, no GPU required.

### 6. `research/training/` strictly outside npm publish

`packages/*/package.json` already declares a `files` whitelist that
excludes `research/`. This needs to remain the explicit invariant:

- No package ever imports from `research/training/`.
- Training scripts may import from `packages/*` (one-way dep, contributor
  uses the harness inside training jobs).
- npm publish never includes `research/`, `bench/`, `examples/`, or any
  GB-class artifact.

A small CI check can guard this — a script that diffs the npm `tarball`
contents against an expected-files manifest and fails on drift.

### 7. Public benchmark page (Phase 2+)

Tier 4 ships a public, auto-updated benchmark page comparing
Wittgenstein's trained models against LlamaGen / Open-MAGVIT2 / etc.
Auto-generated from the eval-harness ([#394](https://github.com/p-to-q/wittgenstein/issues/394))
output. Lives at `apps/site/bench/` and rebuilds on each release.

Phase 2 work; flagged here as architectural completeness.

---

## What does NOT happen under this doctrine

- ❌ `npm install @wittgenstein/cli` never downloads a model weight.
- ❌ Tier 0 routes (sensor / svg-local / asciipng / procedural audio)
  never depend on a learned-model runtime.
- ❌ A reviewer never needs CUDA / GPU drivers to verify the project's
  claims.
- ❌ A user on a low-spec laptop is never blocked from Tier 0 by a
  heavy dep upstream.
- ❌ Training code is never installable via npm.
- ❌ Weights are never bundled in any package's tarball.
- ❌ The procedural placeholder is never re-introduced as a "tier
  fallback" — the image route either runs the real decoder (Tier 1+)
  or emits a structured error pointing at `wittgenstein install image`.
  **No silent fallback** (existing doctrine).

---

## Engineering-quality investments (what "top-tier engineering" means here)

Beyond what's already done (typecheck/lint/test/build/golden/CI/manifest
spine/replay/cold-checkout):

| Investment | Why | Status |
|---|---|---|
| **Lazy weight fetch + sha256 verify** | Required for Tier 1+; closes the supply-chain hole | new tracker |
| **Optional/peer deps for heavy runtimes** | Tier discipline at the npm layer | new tracker |
| **`wittgenstein install <tier>` CLI + doctor tier readiness** | User-visible tier surface | new tracker |
| **`examples/reviewer-bench/`** | Reviewer one-command verification | new tracker |
| **`research/training/` isolation from npm publish** | Doctrine: contributor stack ≠ user stack | new tracker |
| **Per-tier `wittgenstein doctor` info** | Compass for what's possible | rolled into install-CLI tracker |
| **Public benchmark page** | Tier 4, auto-generated | Phase 2 |
| **Latency budgets in CI** | Catch performance regressions | future |
| **SBOM + signed releases** | Supply chain | post-Phase-2 |

---

## Doctrine compatibility

- **No silent fallbacks** (hard-constraints) — preserved. Tiers are
  explicit; failing to load a tier surfaces a structured error.
- **Frozen decoder** (ADR-0005) — preserved. Tier 1+ decoders are
  fetched-and-frozen-locally; not generated on demand.
- **Manifest spine** — preserved. Tier readiness + install state
  recorded; doctor surfaces them; replay verifies them.
- **License posture** (ADR-0020) — preserved. The lazy-fetch path is
  the enforcement point: research-only weights refuse to install
  without `--allow-research-weights`.
- **One image path** — preserved. The image route uses ONE decoder
  family per release. Tiers determine HOW (CPU vs GPU runtime), not
  WHICH (the family is pinned in the release manifest).

## Concrete follow-ups (file as new issues this PR)

| # | Tracker | Why |
|---|---|---|
| 1 | **Lazy weight fetch + sha256 verify for decoder bridges** | Tier 1+ canonical mechanism; ships before any image-route weight does |
| 2 | **`wittgenstein install <tier>` CLI + doctor tier readiness** | The user-visible install surface |
| 3 | **Optional/peer-dep declarations for heavy runtimes** | Tier discipline at the npm dep layer |
| 4 | **`examples/reviewer-bench/` reviewer one-command verification** | The reviewer surface |
| 5 | **`research/training/` isolation + npm-publish guard** | Doctrine: contributor stack stays out of user stack |

Each is sized small/medium. None require GPU compute to implement; all
are pure engineering. They unblock the user/reviewer surfaces in
parallel with the Phase 1 training work, not after it.

## Decision-shaped summary

| Question | Answer |
|---|---|
| Does the elite infra ship to every user? | **No.** Tier 0 stays tiny. |
| Does the elite infra exist in the project? | **Yes.** Under `research/training/`, with its own dep stack. |
| Where do the **published benchmark numbers** come from? | **The elite tier.** GPU canonical, full ablation matrix, own-trained models. No compromises on the headline number. |
| Does the user pay for the elite infra they don't use? | **No.** Lazy fetch + peer deps + tiered installer. |
| Does the reviewer need GPU to verify? | **No.** `examples/reviewer-bench/` runs on a laptop in 5 minutes — verifies engineering claims (manifests, replay, receipts). For the **quality** claim, the reviewer reads the published benchmark page (Tier 4 artifact) — they don't have to re-run it. |
| Does the low-spec user get any tier? | **Yes.** Tier 0 is always available. |
| Does this create a second image path? | **No.** One image route per release; tiers determine HOW (CPU vs GPU runtime), not WHICH (the family is pinned). |
| Does the user-facing simplicity compromise research quality? | **No.** The elite infra still produces the research; users just don't carry it. |
| Can a user's local result match the published number? | **Not necessarily.** Tier 1 inference on CPU may have `structural-parity` divergence from the GPU-trained reference. Receipts make this explicit; users see exactly which tier produced their artifact. |

## Refs

- Research program note: [`2026-05-13-wittgenstein-research-program.md`](2026-05-13-wittgenstein-research-program.md)
- M1B prep (Phase 0 floor): [`2026-05-13-m1b-prep-research.md`](2026-05-13-m1b-prep-research.md)
- Verification ladder: [`2026-05-13-verification-ladder.md`](2026-05-13-verification-ladder.md)
- Replay command (the verification entrypoint): [#384](https://github.com/p-to-q/wittgenstein/issues/384) / PR #388
- License posture: [ADR-0020](../adrs/0020-code-weights-license-divergence-policy.md)
- No-silent-fallback doctrine: [`docs/hard-constraints.md`](../hard-constraints.md)
- Existing Kokoro lazy-load precedent: `packages/codec-audio/src/decoders/kokoro/index.ts`
