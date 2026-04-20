# Contributing

Wittgenstein is an early-stage open-source project, post-hackathon, actively maintained
by a small team. **Contributions of any size are welcome** — fixing a typo in a doc is as
valid as wiring a new codec. This page tells you where to start and what we look for.

## First-time setup

```bash
# clone your fork (see branch workflow below)
git clone git@github.com:<you>/wittgenstein.git
cd wittgenstein
git remote add upstream https://github.com/Moapacha/wittgenstein.git

# TypeScript side
nvm use            # installs Node 20.19 if you use nvm
corepack enable
pnpm install
pnpm bootstrap
pnpm typecheck     # should be green on a fresh clone

# Python side
cd polyglot-mini
pip install -r requirements.txt
python3 -m polyglot.cli --help
```

Stuck? [`SUPPORT.md`](SUPPORT.md) lists where to ask what.

## Where to start

New contributors: pick one of these first.

| Difficulty | Where to look | Example |
|---|---|---|
| **Easy** | Anything labelled `good first issue` or `docs` on GitHub | Fix a broken link, clarify a README section, add a missing type |
| **Medium** | `⚠️ Experimental feedback` issues in [`docs/implementation-status.md`](docs/implementation-status.md) | Add a benchmark case, write a codec doc page, add a new LLM provider adapter |
| **Deep** | `🔴 Stub` rows in [`docs/implementation-status.md`](docs/implementation-status.md) | Wire a frozen VQ decoder into `codec-image`, port a codec from Python to TypeScript |

For architectural proposals, draft a PR that updates both code and an ADR under
[`docs/adrs/`](docs/adrs/). See `docs/adrs/README.md` for the template.

## Branch workflow (please follow this)

We had some early confusion around branches and forks. This workflow keeps everyone's
work safe:

1. **Always branch from the latest `upstream/main`:**
   ```bash
   git fetch upstream
   git switch -c feat/<short-name> upstream/main
   ```
2. **One branch per logical change.** Easier to review, easier to revert.
3. **Push to your fork, open the PR against `upstream/main`.**
4. **After merge, delete the remote branch** (GitHub's "Delete branch" button works) to
   avoid stale clutter.
5. **Sync your fork's `main` periodically:**
   ```bash
   git fetch upstream
   git push origin upstream/main:main
   ```
6. **Do not commit directly to `main`.** `main` only accepts PR merges.

Paranoid about losing work? Create a local backup branch before any pull/merge:
`git branch backup/<name>`. The reflog also keeps 90 days of history, so genuine data
loss is extremely rare.

## Commit style

Conventional commits, lowercase scope:

- `feat(codec-image): wire LlamaGen decoder`
- `fix(core): persist manifest on failure`
- `docs: clarify decoder-not-generator rule`
- `chore(ci): bump actions/checkout to v4`

## Validation before push

```bash
pnpm lint
pnpm typecheck
pnpm test
```

For Python-surface changes, run the affected `python3 -m polyglot.cli ...` path end-to-end
at least once — the Python side doesn't have CI coverage today.

## Experimental vs shipping code

Wittgenstein explicitly mixes both. To keep users safe:

- Code that ships (✅ in [`docs/implementation-status.md`](docs/implementation-status.md))
  must pass `pnpm test` and preserve golden fixtures.
- Code that is `⚠️ Partial` or `🔴 Stub` must raise a structured error (not a silent
  fallback) and be clearly labelled in `docs/implementation-status.md`.
- New experimental surfaces should land behind a `--experimental` flag or an env var and
  be documented with their known failure modes.

## Review protocol

- Changes under `packages/core/src/runtime/`, `packages/schemas/`, and `packages/sandbox/`
  need core review — they're the contracts everyone else depends on.
- Codec changes should update the matching file in `docs/codecs/`.
- Output-shape changes must preserve or explicitly refresh goldens in `fixtures/golden/`.
- If reproducibility behavior changes, update `docs/reproducibility.md` and the manifest
  schema together.
- Docs-only PRs: one maintainer review is enough, and often much faster than a code PR.

## Engineering rules (non-negotiable)

- TypeScript strict mode stays on.
- zod schemas guard every boundary that crosses package or runtime edges.
- Use structured errors from `packages/core/src/runtime/errors.ts`. No thrown strings.
- Avoid hidden coupling between codecs and core internals — cross-package deps go through
  `@wittgenstein/schemas`.
- Preserve artifact traceability. A run that fails still deserves a manifest.
- No diffusion generators in the core image path. See
  [`docs/hard-constraints.md`](docs/hard-constraints.md).

## Code of Conduct

By participating you agree to [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md). In short: be
direct, be kind, credit work honestly, and label experimental things as experimental.

## Licensing

Wittgenstein is Apache-2.0. By submitting a PR you agree your contribution is licensed
under the same terms.
