# www.aquin.app — clone bootstrap

> **Status:** Captured research artifact (site-clone snapshot; evidence preserved as-is, not active execution guidance, not ratified doctrine).
> Captured via the `site-clone` skill on the date below. Re-running the capture replaces these files; treat them as a frozen snapshot rather than a live source.
> _Tracker: #91 (research taxonomy reclassification pass)._

## Last capture

- **URL:** [https://www.aquin.app/](https://www.aquin.app/)
- **When:** 2026-04-19 (refreshed via `capture-page.mjs` + `patch-for-localhost.mjs`)
- **Artifacts:** `index.raw.html`, `index.rendered.html`, `index.html`, `screenshot.png`

## Installed skill (repo root)

- Claude Code: `.claude/skills/site-clone/SKILL.md`
- Cursor: `.cursor/commands/site-clone.md` (invoke **site-clone** from the command palette)
- Codex CLI: `.codex/skills/site-clone/SKILL.md`

Upstream: [CloveSVG/One-Click-Clone](https://github.com/CloveSVG/One-Click-Clone).

## Artifacts captured here

| File | Description |
| --- | --- |
| `index.raw.html` | First-byte HTML from `curl` (Next.js / Vercel shell + payload). |
| `index.rendered.html` | DOM after `networkidle` + 3s wait via Playwright. |
| `index.html` | Same as rendered DOM, with `href`/`src`/`url()` roots rewritten to `https://www.aquin.app/` so assets load when you open the file from **localhost** (run `npm run patch:localhost` after re-capturing). |
| `screenshot.png` | Full-page screenshot (1440×900 viewport). |
| `capture-page.mjs` | Re-run: `node capture-page.mjs` (requires `playwright` in this folder). |

## Open on localhost

From this directory:

```bash
npm run patch:localhost   # if index.rendered.html changed
npm run serve
```

Then open **http://127.0.0.1:4173/index.html** (or **http://localhost:4173/index.html**).

Static HTML still loads JS/CSS/fonts from the live origin; use a normal browser (some ad blockers may affect third-party requests).

## Full pixel-perfect Next.js clone

The **site-clone** skill assumes **browser automation** (Chrome MCP, Playwright MCP, etc.) and a **Next.js + Tailwind** app as the build target. Continue by:

1. Enabling a browser MCP in Cursor (or use Claude Code with Chrome as documented in the skill).
2. Running **`/site-clone https://www.aquin.app/`** (or the Cursor command **site-clone** with that URL).
3. Following `SKILL.md`: extract tokens, assets, sections, then rebuild components under your chosen `apps/*` package.

This folder is the **extraction scratch space** for `www.aquin.app` per the skill (`docs/research/<hostname>/`).
