# Distribution

Wittgenstein is designed to be installable and skill-friendly, not just a local experiment.

## Delivery Surface

- `@wittgenstein/cli` exposes `wittgenstein` in the monorepo
- Public npm package **`wittgenstein-cli`** (no scope) is produced from `packages/cli/npm-publish/` after `pnpm run release:npm` — single bundled binary plus the sensor Loupe renderer, no `workspace:*` in the published manifest

## npm (public registry)

Maintainers:

**Do not run `npm publish` from the repo root** — the root package is `private` and you will get `EPRIVATE`, and npm may try to pack the whole tree.

From the **monorepo root**:

```bash
pnpm run release:npm-cli
npm publish packages/cli/npm-publish
```

Or step by step:

```bash
cd packages/cli && pnpm run release:npm && cd npm-publish && npm publish
```

Requires `npm login` (or a publish token) on that machine. The published name is **`wittgenstein-cli`**; install with `npm install -g wittgenstein-cli`. If npm reports that **OTP / 2FA** is required for publish, append `--otp=…` to the `npm publish` command for that account only.

- `scripts/install.sh` is the future `curl | sh` seam
- `AGENTS.md` is the short agent primer; `packages/agent-contact-text/` holds extended narrative primers (00–03) for coding agents
- output conventions are stable under `artifacts/runs/*`
- `packages/cli/README.md` is the npm-facing install and smoke-check entrypoint

## CLI Contract

```bash
wittgenstein init
wittgenstein image  "prompt" --out out.png
wittgenstein image  "prompt" --allow-research-weights --out out.png # benchmarking-only opt-in; see ADR-0020
wittgenstein tts    "prompt" --out out.wav
wittgenstein audio  "prompt" --out out.wav
wittgenstein video  "prompt" --out out.mp4
wittgenstein sensor "prompt" --out out.json
wittgenstein doctor
wittgenstein install image --dry-run
```

`doctor` now reports the tier-readiness table described in the delivery notes:
Tier 0 local codecs are ready from the npm package; Tier 1+ image decoder
bridges remain explicit opt-in install surfaces tracked in #403. Decoder-weight
loaders must verify SHA-256 before use and refuse research-only weights unless
the caller opts in with `--allow-research-weights`.

`wittgenstein install image --dry-run` is the current no-download planning
surface for the Tier 1 bridge. A non-dry-run install intentionally fails with a
structured `TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST` error until the concrete
decoder-family manifest and fetch recipe land.

## Skill-Ready Expectations

- clear command surface
- deterministic artifact locations
- docs that explain the contracts, not just the aspiration
