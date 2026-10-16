# 0021 Node 22.22 Runtime Floor

## Status

Accepted (2026-10-17). Amends ADR-0002: its "Node 20+" runtime baseline is
superseded by Node 22.22+; the TypeScript + pnpm workspace decision stands.

## Context

The repo pinned `engines.node: ">=20.19.0"` (`.nvmrc` 20.19.0, CI Node
20.19.0) through the alpha line. Node 20 reached end-of-life in April 2026
(final release 20.20.2, March 2026), and three dependabot majors had
accumulated behind the old floor:

- `commander@15` requires Node `>=22.12.0` — PR #588 fails `pnpm install`
  with `ERR_PNPM_UNSUPPORTED_ENGINE` under the old floor.
- `react-router@8` (site) requires Node `>=22.22.0` — PR #640 is refused by
  pnpm for the same reason.
- `undici@8` (codec-audio) requires Node `>=22.19.0` — frozen via an explicit
  dependabot `ignore` entry whose documented revisit trigger is "when the Node
  engine floor moves to 22+".

Node 22 is in maintenance LTS (supported into April 2027); Node 24 is the
current active LTS. The smallest floor that satisfies every blocked consumer
is `>=22.22.0`, and an engine floor is only honest if CI tests it — so CI
pins the floor exactly.

## Decision

The repo runtime floor moves to **Node 22.22.0**:

- `package.json` `engines.node` → `>=22.22.0`; `.nvmrc` → `22.22.0`.
- Every workflow that provisions Node pins `node-version: 22.22.0`
  (ci, kokoro-sweep, reviewdog, site) — CI tests the declared floor.
- Docs and package manifests follow: README badge + requirements,
  CONTRIBUTING, `docs/hard-constraints.md`, `docs/technical-details-script.md`,
  `docs/codecs/video.md`, `apps/site/package.json`.
- The npm artifact generator (`packages/cli/scripts/prepare-npm-artifact.mjs`)
  emits `engines.node: ">=22.22.0"`; `scripts/install.sh` guidance matches.
- `wittgenstein doctor`'s `NODE_ENGINE_MINIMUM` probe moves to `[22, 22, 0]`
  so `doctor` reports honestly on unsupported runtimes.
- The dependabot "Engine floor" header is rewritten and the undici
  semver-major `ignore` entry is removed (its revisit trigger fired). The
  first `undici@8` PR still needs a `codec-audio` review
  (`EnvHttpProxyAgent` / `setGlobalDispatcher`) before merge.
- Left untouched on purpose: `docs/inheritance-audit.md` (dated historical
  snapshot), `CHANGELOG.md` history, and `docs/research/**` notes.

## Consequence

- Node 20 is no longer supported: npm consumers get an `engines` warning or
  refusal, pnpm installs fail with `ERR_PNPM_UNSUPPORTED_ENGINE`, and
  `wittgenstein doctor` reports `nodeSatisfied: false`.
- The blocked majors (#588 commander 15, #640 react-router 8) become
  installable; each still needs its own green CI before merge, and the
  undici 8.x lane reopens under normal review.
- Future floor bumps should repeat the same method: pick the smallest version
  that satisfies the oldest blocked consumer, and keep CI pinned to it.
