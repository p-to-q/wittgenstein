# Support

Wittgenstein is an early-stage, post-hackathon open-source project. We don't have a
support contract; what we do have is a small, opinionated set of channels that actually
get answered.

## Where to ask what

| You want to... | Go here |
|---|---|
| Report a bug (crash, wrong output, broken command) | [Open an issue → Bug report](https://github.com/Moapacha/wittgenstein/issues/new?template=bug.md) |
| Suggest a feature or new modality | [Open an issue → Feature request](https://github.com/Moapacha/wittgenstein/issues/new?template=feature.md) |
| Ask "how do I...", "why does X..." | [Open an issue → Question](https://github.com/Moapacha/wittgenstein/issues/new?template=question.md) |
| Give feedback on an experimental part (⚠️) | [Open an issue → Experimental feedback](https://github.com/Moapacha/wittgenstein/issues/new?template=experimental-feedback.md) |
| Report a security vulnerability | Private advisory via [the "Report a vulnerability" button](https://github.com/Moapacha/wittgenstein/security/advisories/new) — **do not open a public issue** |
| Propose an architectural change | Draft a PR that updates both the code and an ADR under `docs/adrs/` |

## Before you open an issue

Two minutes here save us both an hour later:

1. **Run `pnpm doctor`** (TypeScript surface) or `python3 -m polyglot.cli --help`
   (Python surface) — confirms the toolchain loads at all.
2. **Search existing issues**, including closed ones. Early-stage projects repeat their own
   mistakes fast.
3. **If a command failed**, attach the manifest from `artifacts/runs/<id>/manifest.json` —
   it contains the git SHA, seed, LLM output, and error taxonomy code. One attached
   manifest is worth ten screenshots.

## What to expect

- **Response time:** best-effort, aiming for 5 business days on the first reply.
- **Priority:** bugs that block a shipping path (`✅ Ships` in
  [`docs/implementation-status.md`](docs/implementation-status.md)) are highest. Bugs in
  `⚠️ Partial` or `🔴 Stub` components are lower priority by design — those are known
  unfinished surfaces.
- **Age:** if your issue goes quiet for two weeks, it's fine to bump it with a polite
  comment. We're a small team.

## Helping us help you

If you want the fastest path to a resolved issue:

- Include the **minimum** reproduction. A 30-line snippet beats a forked repo.
- State the **surface** you're on: Python (`polyglot-mini/`) or TypeScript (`packages/`).
- Include `node --version`, `pnpm --version`, `python3 --version`, and your OS.
- If a suggested fix exists, open a PR — we'd rather review code than theorise.

## Community

- Project repo: <https://github.com/Moapacha/wittgenstein>
- Discussions: we haven't enabled GitHub Discussions yet; issues are the primary channel
  until volume warrants a separate space.
