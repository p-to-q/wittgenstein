# Hackathon Launch

**Status:** archived historical receipt
**Superseded by:** `README.md`, `docs/roadmap.md`,
`docs/exec-plans/active/codec-v2-port.md`, and `docs/research/program.md`
**Usage rule:** kept for provenance from the original launch phase; do not use this as
active pre-M2 execution guidance.

---

This repo is closest to a strong hackathon launch when we optimize for artifacts, demos, and reproducibility rather than polishing every abstraction.

## What To Ship

- A one-command image demo that proves the single image path works.
- A one-command sensor demo that emits JSON, CSV, and a `loupe` HTML dashboard.
- A one-command audio demo that emits WAV with optional ambient layering.
- A trained local adapter for image and audio so we can say "small post-training model included" without paying extra token cost at runtime.
- A clean README that explains the product in under two minutes.

## Code And Engineering Wins Beyond Site + PPT

- Publish-ready package metadata and release notes for `@wittgenstein/cli` and the codec packages.
- Stable artifact examples checked into `artifacts/demo/` so judges can inspect outputs even if APIs fail live.
- Lightweight goldens and smoke tests for image, audio, and sensor routes.
- A `launch:check` script that gives a fast "are we demo-safe?" answer.
- A local training story for adapters that runs in minutes on a laptop.

## Immediate Launch Checklist

1. Run `pnpm launch:check`.
2. Run `pnpm demo:sensor` and open the emitted `loupe` HTML artifact.
3. Run `pnpm demo:audio` and listen to the mixed WAV output.
4. Render the image demo and keep the artifact in `artifacts/demo/`.
5. Make sure README screenshots and artifact paths match what the code currently emits.

## NPM Publish-Ready Path

We should prepare for publish even if we do not actually publish during the hackathon.

1. Keep packages private until package boundaries settle.
2. Add descriptions, keywords, repository fields, and `files` whitelists before flipping `private`.
3. Publish `@wittgenstein/cli` first, then `@wittgenstein/schemas`, then the individual codecs.
4. Tag a launch candidate after `pnpm launch:check` passes and demo artifacts are regenerated.

## Audio Upgrade Path

- Current fast path: symbolic audio plan -> local WAV render -> optional ambient layer.
- Better path after launch: add a tiny learned ambient/style adapter and ship a few stronger soundscape presets.
- Constraint: keep the extra model small enough to retrain locally in minutes.
