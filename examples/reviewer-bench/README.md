# Reviewer bench

**One command. ≤5 minutes. No GPU. No external downloads. Paste-into-review-form output.**

```bash
pnpm reviewer-bench
```

That's it. A markdown report prints to stdout and gets saved at
[`examples/reviewer-bench/report.md`](report.md). Exit 0 on full pass; 1 on any failure (with detail in the report).

## What this bench is for

If you're a **reviewer, evaluator, or first-time visitor**, this bench is
the fastest defensible read on Wittgenstein's engineering claims:

- Each deterministic-by-construction route (sensor, svg-local, asciipng)
  produces an artifact whose **SHA-256 matches a pinned receipt** in
  [`expected.json`](expected.json) — the goldens travel with the repo.
- `wittgenstein replay` round-trips a saved manifest to byte parity —
  the manifest spine is a verification surface, not just an audit log.
- `wittgenstein doctor` exits clean — environment honesty.

No CUDA. No ImageNet. No HyperFrames install. No model-weight download.

## What this bench is NOT for

The **quality** claim — SOTA-adjacent FID-30K, CLIP-score, ablation
matrix — is verified by the **published benchmark page** (the elite tier
artifact published with each release), not re-run here. See
[`docs/research/2026-05-13-delivery-and-componentization.md`](../../docs/research/2026-05-13-delivery-and-componentization.md)
for why the two surfaces are separated:

> The published benchmark number is what the elite tier produces, full
> stop. The user/reviewer-facing experience is **tiered** so a
> low-spec laptop user, a reviewer without a GPU, and a researcher
> with a cluster all get appropriate install footprints — but none of
> them is the benchmarked configuration. The benchmark is its own
> thing.

In one sentence: **this bench proves the engineering. The benchmark
page proves the quality.**

## Layout

- [`run.ts`](run.ts) — the entrypoint. Reads `expected.json`, runs each
  row, computes SHAs, compares, emits a markdown report.
- [`expected.json`](expected.json) — pinned receipts. Travel with the
  repo; updated by `scripts/reviewer-bench-pin.ts` when a deterministic
  route's output intentionally changes.
- [`report.md`](report.md) — last run's report (overwritten each run).

## When the bench fails

If `pnpm reviewer-bench` exits non-zero, that's a **real signal** — one
of:

- A deterministic route's output bytes changed without the maintainer
  re-pinning `expected.json`. Either a regression or an unrecorded
  intentional change.
- `wittgenstein replay` lost byte parity. The manifest spine claim is
  violated.
- `wittgenstein doctor` errored out. Environment honesty is off.

Each failure has a detail block in the report quoting the relevant CLI
stdout/stderr.

## Regenerating receipts (maintainer)

After an intentional change to a deterministic route's output:

```bash
node --import tsx scripts/reviewer-bench-pin.ts > examples/reviewer-bench/expected.json
```

Eyeball the diff, commit. **Do not edit `expected.json` by hand.**

## Where to read further

- [`docs/research/2026-05-13-wittgenstein-research-program.md`](../../docs/research/2026-05-13-wittgenstein-research-program.md) — the three-track research program (engineering / research / hacker).
- [`docs/research/2026-05-13-delivery-and-componentization.md`](../../docs/research/2026-05-13-delivery-and-componentization.md) — the tiered delivery doctrine. This bench is the Tier 0 reviewer surface.
- [`docs/research/2026-05-13-verification-ladder.md`](../../docs/research/2026-05-13-verification-ladder.md) — the verification ladder this bench operationalizes.
- [`docs/hard-constraints.md`](../../docs/hard-constraints.md) — load-bearing doctrine.
- [`docs/adrs/`](../../docs/adrs/) — every architecture decision, ratified.
- [`docs/rfcs/`](../../docs/rfcs/) — every RFC, with red-team sections.
