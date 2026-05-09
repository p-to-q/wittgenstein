# Wittgenstein Website

This folder contains the canonical website app for `wittgenstein.wtf`.

It is a Vite + React + TypeScript build, migrated from [`Jah-yee/wittgenstein-www`](https://github.com/Jah-yee/wittgenstein-www) into the monorepo so the public site can track the repo's docs, package surface, and release work.

## What This Site Is For

The site is a public-facing narrative layer for the project. It should:

- explain the thesis clearly
- present the five-layer architecture without flattening it into marketing copy
- stay aligned with the real repository and docs
- remain visually stable while text evolves

The UI and section framework are intentionally fixed. Most iteration should happen in the copy.

## Local Development

```bash
pnpm install
pnpm dev:site
```

The dev server runs on `http://localhost:3000`.

## Production Build

```bash
pnpm --filter @wittgenstein/site build
pnpm --filter @wittgenstein/site preview
```

The preview server runs on `http://localhost:4173`.

## Validation

```bash
pnpm --filter @wittgenstein/site check
```

This runs lint plus a full production build.

## Vercel Deployment

The monorepo root [`vercel.json`](../../vercel.json) now builds `@wittgenstein/site` and emits `apps/site/dist`. This keeps the default root-level Vercel project aligned with the canonical website instead of the older `apps/wittgenstein-kimi` demo.

This app also includes [`vercel.json`](./vercel.json) for a Vercel project whose root directory is set to `apps/site`. Vercel Git Source is still a manual follow-up step: the production project may still point at the old external repository ([`Jah-yee/wittgenstein-www`](https://github.com/Jah-yee/wittgenstein-www)) until a maintainer switches it.

Supported Vercel configurations:

- Root directory: repository root
  - Build command: `pnpm --filter @wittgenstein/site build`
  - Output directory: `apps/site/dist`
- Root directory: `apps/site`
  - Build command: `pnpm build`
  - Output directory: `dist`

Do not treat this migration PR as the domain cutover. The Git Source and production domain should still be switched intentionally in Vercel.

### When Vercel should (and should not) deploy

Rule: a Vercel deployment is only meaningful when the changed files can change the shipped website bytes. Doc-only PRs, codec/runtime changes, CI changes, etc. must not trigger a Preview build.

This is enforced by [`scripts/vercel-ignore-build.sh`](../../scripts/vercel-ignore-build.sh). The script returns:

- exit `1` (proceed) when any of these paths changed since the previous Vercel SHA:
  - `apps/site/**`
  - `vercel.json` (root)
  - `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`
  - `.github/workflows/site.yml`
  - `scripts/vercel-ignore-build.sh` itself
- exit `0` (skip) for any other diff.

To enforce the rule on the live project, set in **Vercel → Project Settings → Git → Ignored Build Step → Custom command**:

```
bash scripts/vercel-ignore-build.sh
```

This must be configured in the Vercel dashboard (Vercel does not honor `ignoreCommand` for build skipping from `vercel.json` alone). The script is committed so the rule is reviewable in PRs and survives project recreation.

Notes:

- The app is a Vite SPA, so both Vercel configs include a rewrite to `index.html`.
- Both Vercel configs preserve the production security headers from the external website repository (`X-Content-Type-Options`, `Referrer-Policy`, and `Permissions-Policy`).
- The canonical production host is `https://wittgenstein.wtf`.
- `public/CNAME` is harmless for static hosting portability, but Vercel itself uses project-domain settings rather than GitHub Pages style CNAME handling.

## Domain

The intended production domain is:

```text
wittgenstein.wtf
```

Static hosting helpers included in `public/`:

- `CNAME`
- `robots.txt`
- `sitemap.xml`
- `site.webmanifest`
- `favicon.ico`, `favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`

## Content Guidelines

- Keep the macro structure stable:
  - Thesis
  - Layers
  - Pipeline
  - Codecs
- Do not rewrite the UI or component layout unless explicitly requested.
- Prefer accurate engineering language over exaggerated product claims.
- When the repo is ahead of the site, update the copy.
- When the site is ahead of the repo, pull the copy back to reality.
