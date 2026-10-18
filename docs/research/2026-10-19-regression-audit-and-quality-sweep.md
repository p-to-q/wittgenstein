# Regression audit and quality sweep — is the repo actually broken?

**Date:** 2026-10-19
**Baseline:** `main` = `54cc5bf` (CI + CodeQL green), matching local, mirror and GitHub.
**Question posed by the owner:** high standards ("like Linux — do every detail well"), plus a
suspicion that successive development cycles had broken a lot of the repository. The ask:
find real bugs, missing branch conditions, tidiness/intent-comment gaps and CI/CD weaknesses;
file issues for what warrants discussion, open PRs for what can be fixed directly.

**Verdict in one line:** the repository is **not** regressed. Every package's test count
matches its recorded baseline exactly. What *looks* like breakage has two mundane causes —
a stale local `node_modules` and machine-load-induced test timeouts. The sweep still found
three genuine defects, which are now tracked and (for the first) fixed.

---

## 1. Method

1. Diff the tree against the last human-authored merge era (`304a9d1`, PR #523, 2026-05-28) —
   449 files, 35,065 insertions, which is too coarse to attribute blame.
2. Narrow to the change the owner most plausibly meant: the **2026-10 dependabot wave**
   (20 `dependabot[bot]` commits since 2026-10-01, including grouped PRs #647/#649/#650).
3. Attribute those commits by **file scope**, not by subject line.
4. Re-run every package test suite and compare against the recorded per-package baselines.
5. Spot-check the documented doctrine invariants against the code.
6. Sweep for real defects (hygiene metrics below), then file/PR.

## 2. What the dependabot wave actually touched

Every file touched by every dependabot-authored commit since 2026-10-01:

```
  12 pnpm-lock.yaml
   9 apps/site/package.json
   7 package.json
   3 polyglot-mini/requirements.txt
   2 packages/cli/package.json
   2 .github/workflows/{reviewdog,kokoro-sweep,ci}.yml   (each)
   1 packages/codec-audio/package.json
   1 .github/workflows/{site,release,link-check,labeler,issue-labeler,codeql}.yml (each)
```

**Zero files under `packages/*/src`.** The wave is manifest-only. `git log --since=2026-10-08
-- 'packages/*/src/**'` returns only commits authored by this line of work, and
`apps/site/src/**` has had **no** commits since 2026-10-08 at all — which is why #653
(recharts 2→3) is a dependency-vs-source incompatibility, not a bad edit.

Consequence: the owner's suspicion cannot be explained by a bad source edit in that window.
It has to be explained by (a) dependency *behaviour* changes, (b) CI coverage gaps, or
(c) the local environment. (a) was checked against the riskiest bump — see §6.

## 3. Test-count parity

Run serially, one package at a time (`pnpm --filter <pkg> exec vitest run`), at load ≈ 12:

| package | this run | recorded baseline | match |
| --- | --- | --- | --- |
| schemas | 71 | 71 | ✅ |
| core | 111 | 111 | ✅ |
| cli | 100 | 100 | ✅ |
| codec-image | 158 total (152 pass + 5 fail + 1 skip) | 157 + 1 skip | ✅ |
| codec-audio | 22 + 3 skip | 22 + 3 skip | ✅ |
| codec-sensor | 22 | 22 | ✅ |
| codec-svg | 6 | 6 | ✅ |
| codec-video | 14 | 14 | ✅ |
| codec-asciipng | 8 | 8 | ✅ |
| process-runner | 20 | 20 | ✅ |
| sandbox | 2 | 2 | ✅ |

**No test disappeared and none was silently skipped.** The five codec-image failures are the
known load class (§5), not regressions.

## 4. Cause one — the local `node_modules` was stale

`package.json` declares `vitest ^5.0.4` and the lockfile pins `vitest@5.0.4`, but the
installed tree still had **`vitest@4.1.11`**. The dependabot PRs changed the manifests and
the lockfile; nothing re-ran the install locally, so local gates were grading the repository
against a dependency set nobody ships.

```
$ pnpm install --frozen-lockfile
devDependencies:
- vitest 4.1.11
+ vitest 5.0.4
- @typescript-eslint/eslint-plugin 8.71.1
+ @typescript-eslint/eslint-plugin 8.71.2
- @typescript-eslint/parser 8.71.1
+ @typescript-eslint/parser 8.71.2
```

This is the single most plausible source of "someone broke the repo" impressions: red or
odd local runs against an outdated tree. The fix is procedural, not code — **after a
manifest-only dependabot wave, re-run `pnpm install --frozen-lockfile` before trusting any
local gate.**

## 5. Cause two — the codec-image timeouts are machine load, measured

The same isolated command flips within minutes of wall time:

```
load 11.62 → pnpm --filter @wittgenstein/codec-image exec vitest run → 19 files passed
load 12.00 → same command                                          → 5 failed, "Test timed out in 5000ms" (5131 ms, 5203 ms observed)
```

Phase-level profile of one dry-run `produce()` (instrumented by wrapping the four
`BaseCodec` hooks), at load ≈ 4.2:

```
total 760 ms/run   expand 2.4   adapt 4.6   decode 747.3   package 5.4
```

So ~98% of the time is the placeholder raster decode, inside
`pipeline/decoder.ts`'s pixel loop, and it scales with CPU contention — 689–713 ms/run at
load ≈ 5 versus 2300–3100 ms at load ≈ 12, i.e. a 3–4× slowdown with no code change.

Sub-budget of the 512×512 decode: `encodeRgbaAsPng` 92 ms, four `sampleField` calls per
pixel 76 ms; the remaining ~530 ms is transcendental math in
`landscape-renderer.ts`'s `renderSky`/`renderTerrain` (`Math.exp`, `Math.pow`,
`smoothstep` per pixel), not allocation.

**Attempted optimisation, measured, rejected.** `ridge`/`distant`/`horizon` in the pixel
loop depend only on `nx`, so they were recomputed for all 512 rows (512× redundant). Hoisting
the horizon curve to one pass per column is bit-identical (same operands, same operation
order — the golden PNG digest `1c641aa5…` is unchanged) and was measured with interleaved
A/B, three rounds:

```
baseline 689.0 / 700.4 / 713.2 ms      patched 643.2 / 684.8 / 666.4 ms
mean 700.9 → 664.8 ms  (-5.1%)
```

A 5% win on a path that is explicitly a placeholder, to be replaced by a real decoder
bridge, did not justify the review surface. **The branch was discarded**; the measurement is
recorded here so a future decoder-replacement slice does not redo it. Transcendental math
cannot be reduced further without changing the numerics, which would break golden parity —
and the correct answer is to stop rendering placeholders, not to micro-optimise them.

**Therefore:** keep the existing "no pin widening" decision. The 5 s default is not the
problem; a co-tenant-loaded machine is.

## 6. The riskiest manifest-only change, checked directly

`commander@15` (ESM-only; changed `--no-*` default semantics) landing in a CLI built entirely
on commander was the most plausible behavioural regression.

- The CLI uses **only** `import type { Command } from "commander"` in commands, with a single
  value import (`new Command()`) in `packages/cli/src/index.ts`.
- The only `--no-` string in the tree is `--no-install`, passed to an *external* `npx
  hyperframes` invocation — not a commander option declaration, so the semantics change
  cannot bite.
- `node packages/cli/bin/wittgenstein.js --version` → `0.1.0`; `--help` renders all 12
  commands; `doctor` returns `ok: true` with a correct tier table.

No regression attributable to the dependency majors.

## 7. Doctrine spot-checks (all pass)

| invariant | check | result |
| --- | --- | --- |
| codecs depend on schemas, not each other | `pnpm lint:deps` (`scripts/check-codec-boundaries.mjs`, AST-based) | pass; the only non-schema edge is `codec-video → process-runner`, a deliberate lift documented at `process-runner/src/index.ts` (#356) |
| no silent fallbacks | 17 bare `catch {}` audited individually | 0 truly empty bodies; each has either an inline comment, a `null`/`false` return contract, or a structured receipt that records the outcome (`renderPath: "fallback-static-html"`, `status: "missing"`) |
| no `as any` / `@ts-ignore` | grep | **0** |
| no TODO/FIXME/HACK/XXX in `packages/*/src` | grep | **0** |
| non-null assertions kept rare | grep | 7, across 6 files, all index-bounds after an explicit length check |
| manifest row set single-sourced | `MANIFEST_ROW_KEYS` + `isManifestRowKey` in `@wittgenstein/schemas` | in place since CR1–CR3 (`c2ca18e`) |
| stdout = one JSON document | `createRunLogger` bound to stderr; `printCliError` → stderr | in place (`69acff1`, `5505e79`) |
| `pnpm -r build` still works | `tsc` × 12 + `vite build` for the site | pass (note: `typecheck` is `tsc -b`, so the emit path *is* covered in CI) |

## 8. Genuine defects found

### 8.1 Image codec silently dropped two warnings from the manifest — fixed

`ImageCodec` classified warnings by substring against a **seven**-branch table while the
pipeline raises **nine** messages. The two unmatched ones were discarded *inside* the
classified logger, before `ctx.sidecar.warnings`:

- `adapters/adapter-resolve.ts:88` — `Image adapter: could not load or parse JSON at <path>`
- `adapters/adapter-resolve.ts:97` — `Image adapter: token_grid mismatch for <path>; …`

So a misconfigured adapter produced a receipt that under-counted its own warnings: the
fallback to `image/adapter-stub` was recorded, the reason was not. This contradicts
`docs/hard-constraints.md` ("No silent fallbacks … Never swallow") and the "fall-through
warning symmetry" intent recorded in `docs/codecs/image.md` (PR #241).

Tracked as **#659**, fixed in **PR #663** by making the classifier total — the code table is
lifted to module scope as `IMAGE_WARNING_CODES`, `classifyImageWarning` never returns null,
unrecognised text lands on `image/unclassified-warning`, and the dead
`if (!code) return;` branch is gone. Three tests added (two drive the real `produce()` path).

### 8.2 `palette_overflow` is declared but unreachable — tracked as #662

The warning id exists, no code can emit it, the schema imposes no palette ceiling, the
renderer never reads `scene.style.palette` (it derives colours from the token-hash profile),
and yet `docs/agent-guides/image-port.md` §9 still lists a migration test that requires
synthesising a palette-overflow case. Either make the id real or mark it reserved and delete
the phantom test requirement.

### 8.3 The merge gate is undefined while automation merges — tracked as #661

```
$ gh api repos/p-to-q/wittgenstein/branches/main
{"protected": false,
 "protection": {"enabled": false,
   "required_status_checks": {"checks": [], "contexts": [], "enforcement_level": "off"}}}

$ gh api repos/p-to-q/wittgenstein   # allow_auto_merge
false
```

`main` has zero required status checks, and `.github/workflows/auto-merge-dependabot.yml`
calls `gh pr merge --auto --squash` even though `allow_auto_merge` is `false` — the observed
instant merges (#647/#649/#650/#654/#655/#656) are consistent with "no required checks ⇒
already mergeable ⇒ the auto-merge request is satisfied immediately". Filed as a governance
question rather than changed unilaterally, because self-merge boundaries are exactly what
#267 has open.

## 9. A claim I filed and then retracted

**#660** was filed on the premise that the site bundle is never built on a pull request.
That premise was wrong. While watching PR #663's checks I observed a **Vercel preview
deployment build the site on the PR** (`vercel.json` `buildCommand` is the same
`pnpm --filter @wittgenstein/site build`), so `tsc -b && vite build` *is* exercised
pre-merge, including on dependabot PRs.

#660 was corrected in a comment and closed as not-a-gap. The part that survives is a
*gating* problem — a red Vercel check cannot block a merge because nothing is required — and
it was folded into #661 as an addendum. Recorded here because "evidence-backed claims only"
has to include retracting a claim the evidence does not support.

## 10. Environment note (will recur)

`/private/tmp` had been cleared since the previous session, taking `/private/tmp/pnpm-shims`
with it, and Corepack's cache was cold. To restore the pinned toolchain:

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
mkdir -p /private/tmp/pnpm-shims
corepack enable --install-directory /private/tmp/pnpm-shims pnpm
cd <repo> && corepack install --global pnpm@9.12.0   # packageManager pin; without this
                                                     # corepack tries pnpm@12.4.2 and
                                                     # fails MODULE_NOT_FOUND
```

## 11. Verification commands used

```bash
pnpm install --frozen-lockfile
pnpm -r build
pnpm --filter <pkg> exec tsc -b            # per package
pnpm --filter <pkg> exec eslint src --ext .ts
pnpm --filter <pkg> exec vitest run        # per package, serially
pnpm format:check
~/.cargo/bin/typos
node packages/cli/bin/wittgenstein.js --version --help doctor
gh api repos/p-to-q/wittgenstein/branches/main
```

## 12. What was deliberately not done

- **No timeout pin widening** in codec-image — §5 shows the cause is machine contention, and
  an interleaved measurement of the one safe optimisation came out at only 5%.
- **No merge of PR #663.** It is green, but #661 argues the merge gate is an open decision;
  self-merging through a gate I just described as undefined would be incoherent. It is ready.
- **No recharts migration (#653).** It is a real source-level migration, not a regression,
  and it deserves its own slice.
- **No reformatting of pre-existing non-compliant files** — repo discipline forbids drive-by
  `prettier --write`.
