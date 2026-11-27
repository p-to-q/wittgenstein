# Distribution

Wittgenstein is designed to be installable and skill-friendly, not just a local experiment.

## Delivery Surface

- `@wittgenstein/cli` exposes `wittgenstein` in the monorepo
- Public npm package **`wittgenstein-cli`** (no scope) is produced from `packages/cli/npm-publish/` after `pnpm run release:npm` — single bundled binary plus the sensor Loupe renderer, no `workspace:*` in the published manifest

## npm (public registry)

Maintainers:

- Publish owner(s): `@Jah-yee`, `@Moapacha` (CODEOWNERS maintainer pair)
- Image/training specialist reviewer: `@koriyoshi2041` (for `needs-ml-specialist` escalations; see `docs/labels.md`)

**Do not run `npm publish` from the repo root** — the root package is `private` and you will get `EPRIVATE`, and npm may try to pack the whole tree.

The repository root release version, workspace CLI manifest, bundled public
package, packed binary `--version` and GitHub tag are checked together. Private
workspace implementation packages retain their own versions. Build metadata in
the tarball records the source commit, lockfile SHA-256 and dirty status; a public
release check requires the exact clean source. Historical release labels are not
moved or reused for today's code.

From the **monorepo root**, first build and inspect without publishing:

```bash
pnpm install --frozen-lockfile
pnpm test:release
pnpm release:npm-cli
pnpm release:check --tag "v$(node -p 'require("./package.json").version')"
```

The check packs the CLI, verifies its SHA-512 integrity, extracts it into an
isolated consumer directory and executes its `--version` and `doctor`. It writes a source-bound
receipt and tarball under `artifacts/runs/release-*/`. This is local validation,
not publication. Rebuild after source/lockfile changes. The npm surface excludes
training code, data and weights.

After qualification on the exact clean main commit, an authorized npm publisher
can run:

```bash
npm whoami
npm access list collaborators wittgenstein-cli --json
pnpm publish:npm-cli
pnpm release:check --require-npm
```

The helper publishes the checked tarball, using `next` for prereleases and
`latest` for stable versions, then reads back the exact public version, channel
and integrity. It refuses dirty/stale source or conflicting existing artifacts
and reconciles an already-matching version without republishing it. Login/2FA
and package write access must belong to the operator; no token is stored in the
repository. For an account that needs interactive OTP, publish the exact checked
`.tgz` directly with `npm publish /absolute/path/to/package.tgz --tag next --otp=...`
(`--tag latest` for a stable release), then run `pnpm release:check --require-npm`.
If a publish response is uncertain, check the registry first; never blindly retry
or overwrite a version.

Only after the public check succeeds, create the matching immutable Git tag on
that exact qualified main commit and push it to `upstream`. The Release workflow
rebuilds from the tag and refuses a missing/mismatching npm version, channel or
tarball before creating a public GitHub Release. If Actions is unavailable, keep
the GitHub release a draft until the same checks have succeeded; manually
publishing a draft does not execute this workflow guard. A draft does not count
as a released npm/GitHub pair.

Public install name: **`wittgenstein-cli`**. Use
`npm install -g wittgenstein-cli@next` for a verified published prerelease;
`npm install -g wittgenstein-cli` follows the stable `latest` channel. The scoped
workspace package `@wittgenstein/cli` is not the public install target. The
`0.3.0-alpha.4` source is a release candidate: until the publication handoff
records success, the registry may have no `next` tag and the newest GitHub
prerelease remains historical. See the [candidate handoff](release/0.3.0-alpha.4-candidate.md).

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

`wittgenstein install image --dry-run` is the no-download planning surface for
the Tier 1 bridge. A non-dry-run install reads
`WITTGENSTEIN_DECODER_MANIFEST`, validates the decoder-family manifest and Gate
C/D audit receipts, verifies cached asset SHA-256 values from
`WITTGENSTEIN_DECODER_CACHE_DIR` (or the default decoder cache), and checks that
the required runtime peer resolves. It exits 0 with `status: "ready"` only after
that preflight passes:

```bash
WITTGENSTEIN_DECODER_MANIFEST=/path/to/decoder-manifest.json \
WITTGENSTEIN_DECODER_CACHE_DIR=/path/to/decoder-cache \
wittgenstein install image --json
```

Until a blessed manifest and matching cached assets exist, the command exits
non-zero with a structured decoder-preflight receipt.

## Skill-Ready Expectations

- clear command surface
- deterministic artifact locations
- docs that explain the contracts, not just the aspiration
