# Push-readiness record — the local-only main line (2026-10-16)

Status: local-only; nothing has been pushed. Written 2026-10-16 ~06:4x CST at
local main `3980257`; committing this record adds one docs-only commit on top
(48 commits ahead of GitHub `main`).

Companion docs: [project state recovery](./2026-10-16-project-state-recovery-and-advancement.md),
[M1B delivery closeout review](./2026-10-16-m1b-delivery-closeout-review.md),
[decoder-weights hosting decision brief](./2026-10-16-decoder-weights-hosting-decision-brief.md),
[M1B closeout ledger](../release/m1b-closeout-ledger.md).

## Why this record exists

The working clone (`/Users/dujiayi/code/wittgenstein`) has carried a long
local-only line while the remote sat idle. The owner push should be **one
decision**, so this record fixes the verified state, what the push carries,
the checks already run on the exact tree to be pushed, the post-push
checklist, and ready-to-paste issue updates.

## State (verified 2026-10-16)

- Working clone branch `main` = `3980257` — a merge commit that reconciles the
  local line with the current GitHub main (see below).
- **GitHub `main` is not frozen at `8aef787` anymore.** It is `b62bec5`
  (dependabot #644, eslint-stack bump, merged 2026-10-15T03:45Z; repo pushed
  at 2026-10-15T03:47Z). The earlier "remote frozen at 8aef787" note was
  stale; the remote had in fact moved by exactly one merge since the local
  base. `b62bec5`'s parent chain: `8aef787` (#643) → `b62bec5` (#644).
- **Reconciliation already done** (`3980257`):
  - Trial merge (in-memory `git merge-tree`) was clean; no local commit ever
    touched `package.json` / `pnpm-lock.yaml`, so the dependency update lands
    unopposed.
  - Merge — not rebase — was chosen deliberately: a rebase would rewrite all
    47 local SHAs, breaking the SHAs cited throughout `docs/` (e.g. `69acff1`,
    `8288bda`, `5505e79`). If the merge is ever to be undone:
    `git reset --hard 3e75414`.
  - Result: **47 ahead / 0 behind** GitHub main at `3980257` — 48 ahead
    once this record lands (49 ahead of the local mirror, which itself is one
    commit behind GitHub; it stopped at `8aef787`/#643).
- Remotes: only `origin` = local bare mirror `/Users/dujiayi/code/wittgenstein.git`
  (still at `8aef787`); **no git remote points at GitHub** (hence `gh -R`).
  gh is authed as `Jah-yee`. `git worktree list` / `git branch -vv` are clean
  (the stale `/private/tmp/witt-research` scratch worktree and its
  `research/training-infra-briefs` branch were removed — commit `242b91d`,
  fully contained in main, unreferenced).
- HF hosting repo `wittgenstein-harness/image-vqgan-v1` does not resolve
  publicly (HTTP 401 on 2026-10-16) — the audited ONNX upload (#402) is still
  owner-pending; the audited bytes are not on this machine.
- 7 open PRs, all dependabot: #646 (globals 17), #645 (@types/node 26), #640
  (react-router 8), #630 (pillow ≥12.3), #601 (actions/checkout 7), #599
  (actions/cache 6), #588 (commander 15).

## What the push carries (47 commits, grouped)

Recovery/robustness (6): `060734e`, `b88f183`, `bcaea32`, `2ff5c10`, `53904b9`, `a8b3d19`
#402/#403 loader+install+pricing (4): `397a0d1`, `2ce1812`, `1569564`, `63f40f2`
S7b–S7d bridge/CLI/replay (8): `8c35fe1`, `91ca0dd`, `d6e587c`, `8fd1a24`, `200c9be`, `30a5782`, `23f2055`, `048bf7a`
Closeout review + hosting brief (4): `655eba3`, `c2ca18e`, `c8a7001`, `136b015`
Training-infra briefs (1): `242b91d`
CI/toolchain fixes (5): `eb46b1f`, `e87a1a1`, `bd9f404`, `d46f20b`, `847a794`
Link check #584 (2): `7b1c7cc`, `5fd9ddc`
OM2 audit + follow-ons (9): `797ab56`, `9c9ea3d`, `bb28dc1`, `a33f7c0`, `73b3794`, `e933d3f`, `0da0f6d`, `bc75894`, `5343e93`
S7e runtime identity (3): `32f7a7c`, `8288bda`, `a1ec574`
CLI polish (4): `68b499a`, `69acff1`, `5505e79`, `3e75414`
Merge (1): `3980257`

The merge itself brings only: eslint-stack 8.63.0 → 8.71.1 (+
eslint-plugin-react-refresh 0.5.3 → 0.5.7 in `apps/site`), `package.json`,
`apps/site/package.json`, `pnpm-lock.yaml`.

## Validation already run on the exact merged tree

- `pnpm install` ✓ (eslint-stack 8.71.1 landed) and `pnpm install
  --frozen-lockfile` re-check ✓ — CI's install step works on this lockfile.
- `pnpm -r lint` ✓ all packages (the new eslint stack is the only post-merge
  delta — this is the gate that could have regressed).
- `pnpm typecheck` ✓.
- Full serial test sweep `pnpm -r --workspace-concurrency=1 run test` exit 0 —
  all packages green; cli 100 tests / 12 files (per-package totals match the
  batch records; the merge touched no test files).
- `test:golden` ✓ · `reviewer-bench` ✓ · `format:check:maintained` ✓ ·
  `lint:deps` ✓ · `lint:publish-surface` ✓ · `typos` rc=0 ·
  `m1b:audit-self-check` ✓.
- CI-only unknowns (unchanged by design): Node 20.19 (superseded — now run locally; see addendum);
  research/validation discovery runs with numpy on CI (system py3.10 locally
  skips 2 numpy cases); dependency-review runs on PRs only. The push will
  produce the first true CI run of the Python 3.12 floor + discovery step +
  merged eslint stack against this line.

## CI-mirror verification of the JS half (addendum, 2026-10-16 ~09:1x–09:5x CST)

The "no local Node 20" caveat above is retired. Node 20.19.0 (official
`node-v20.19.0-darwin-arm64` tarball; SHA-256
`c016cd1975a264a29dc1b07c6fbe60d5df0a0c2beb4113c0450e3d998d1a0d9c` verified
against `SHASUMS256.txt`; pnpm 9.12.0 via corepack) has now run the JS half
of `ci.yml` against this tree:

- `pnpm typecheck` · `pnpm lint` · `pnpm lint:deps` ·
  `pnpm lint:publish-surface` · `pnpm format:check` · `pnpm test:golden` ·
  `pnpm reviewer-bench` · `typos` · `pnpm m1b:audit-self-check` — all rc=0
  (logs `/private/tmp/node20-gate-*.log`, `/private/tmp/node20-typecheck-after-pins.log`).
- `pnpm -r --workspace-concurrency=1 run test` (plain `pnpm test`, vitest's
  default 5s test timeout): **final run rc=0 — all 14 projects green**
  (cli 12 files / 100 tests; codec-image 19 files, 157 pass + 1 skip;
  core 111; process-runner 20; schemas 71; the rest as previously recorded).
  Log: `/private/tmp/node20-sweep-final-a.log`.

Earlier runs of the same command were flaky on this machine and shaped the
outcome:

- The session-start sweep flaked `doctor.test.ts`'s npx-backend probe
  (timed out; 7255 ms elapsed), and a later sweep flaked
  `replay.test.ts`'s "reports invalid recorded requests" (timed out;
  5454 ms measured) — single-spawn tests whose siblings ran up to 8.7s
  under load. Fix (`4bafa00`): every spawn-based test in
  `packages/cli/test` now carries the 30s allowance (class closure over
  `doctor`/`bin`/`install`/`install.flow` + the 12 remaining end-to-end
  replay tests; the in-process S7d/S7e unit describe and all non-spawn
  tests keep the 5s guard — per-test pins chosen over a package-wide
  `testTimeout` so fast tests keep the tight hang guard). Pins follow the
  `e87a1a1` / `eb46b1f` convention; test-harness only, no product code, no
  workflow change. Post-pin the cli suite is green even under load average
  ~15 (a sibling ran 9.1s and passed).
- One sweep hit a transient machine-wide stall inside `codec-image`
  (8 timeouts across 6 in-process test files while co-tenant sessions
  — Codex CLI, Chrome, Python — held the load average at ~14–16; the same
  suite passed cleanly before and after). Sweep logs now open with
  `date; uptime`: treat a red run at load average 12+ as suspect and re-run when
  quiet. Re-run recipe: `export PATH=/private/tmp/node20/bin:$PATH` then
  `pnpm -r --workspace-concurrency=1 run test`.

### Dependabot CI is base-red at the Python step — step-verified

`gh api repos/p-to-q/wittgenstein/actions/runs/<id>/jobs` for #645
(38678114742) and #646 (38678114571): every JS step passes on GitHub
runners — Install, Format, Lint, Lint deps, Lint publish surface,
Typecheck, **Test**, Golden tests, Reviewer bench — and the job dies at
**Install Python deps** (`No matching distribution found for
scipy>=1.18.0` on Python 3.11; scipy 1.18.x requires ≥3.12). Same failure
in #630's 2026-09-01 run (99729921836); it predates the dependency bumps.
Local `bd9f404` (Python 3.12) + `a33f7c0` (research/validation discovery
step) fix this, so once this line is pushed the previously red PRs should
go green after a rebase.

Also confirmed: **no CI has run on `main` since 2026-06-02**, because
dependabot auto-merges (`app/github-actions`, `auto-merge-dependabot.yml`)
push with `GITHUB_TOKEN` and token-authored pushes do not trigger
workflows. The push below is the first main CI run in months.

State delta: local main `4bafa00` = 49 commits ahead of GitHub `b62bec5`
and 50 ahead of the local mirror (still `8aef787`), 0 behind; this
addendum is the next commit on top. Nothing has been pushed.

## Push options

1. **Direct push** (simplest, works with the current state):
   `git push https://github.com/p-to-q/wittgenstein.git main`
   CI runs via the `ci.yml` push trigger. If git asks for credentials:
   `gh auth setup-git` once — already configured and dry-run-verified
   (2026-10-17; see §Pre-push re-verification).
2. **Branch + PR** (review trail; note the repo's rule that authoring a PR
   does not ratify it — an independent review is required for
   doctrine-bearing changes):
   `git push https://github.com/p-to-q/wittgenstein.git main:refs/heads/delivery-2026-10` then
   `gh pr create -R p-to-q/wittgenstein --base main --head delivery-2026-10`.

## Post-push checklist

1. Watch the first CI run on the pushed head: `gh run list -R p-to-q/wittgenstein --limit 5`.
2. First real link-check report: `gh workflow run link-check.yml -R p-to-q/wittgenstein`
   (expected clean — local preview with CI inputs: 1568 links / 709 unique /
   1566 OK / 0 errors / 0 timeouts).
3. Re-run/rebase the dependabot PRs so they CI against the new base
   (`@dependabot rebase` comment). Majors need review, one at a time:
   #588 commander 15 (CLI surface!), #640 react-router 8, #645 @types/node 26,
   #646 globals 17; #630 (pillow) exercises the new Python 3.12 floor.
4. Close #584 with the draft below.
5. Close #331 with the draft below.
6. Refresh the local mirror once the push lands:
   `git -C /Users/dujiayi/code/wittgenstein.git fetch https://github.com/p-to-q/wittgenstein.git main:main`.
7. #402 remains owner-gated: upload the audited ONNX bytes to
   `wittgenstein-harness/image-vqgan-v1`, verify the LFS oid equals
   `fd6800b3df8193968656e3e6b01ab48bd8899ebede829dfd1166da5f5b9f9389`,
   then flip `weightsBaseUrl` + ship the install fetch recipe.

## Draft issue updates (paste after push)

### #584 — closing comment

Fixed on main: `7b1c7cc` (workflow) + `5fd9ddc` (link rot).

Root cause: the workflow relied on lychee-action's floating default
`lycheeVersion`, which had drifted to v0.24.2 — that release removed the
`--exclude-mail` flag the workflow still passed, so every scheduled run died
in argument parsing before checking a single link (the job never produced a
real report). Fix: drop the removed flag, pin `lycheeVersion: v0.24.2` and the
action SHA (`e7477775…`, v2.9.0), make retry/timeout parameters explicit.

The first local full run then surfaced actual link rot, now also fixed:
roadmap `docs/docs/` paths (×2), 77 showcase paths + 4 dead paths, the
ADR-0005 name, and two aquin.app 404s (Wayback snapshots). Verified locally
with the workflow's exact inputs: 1568 links / 709 unique / 1566 OK / 0
errors / 0 timeouts (rc=0). This workflow's first real report will come from
a manual `workflow_dispatch` run. Closing.

### #331 — closing comment

Closing per the recorded disposition — the four-gate audit is complete and
its follow-ons have landed.

- Gate A/B: cleared (Apache-2.0 code + weights; SHA-pinned sources).
- Gate C (2026-10-15/16, local, #473 structural policy): PASS — three
  encode/decode runs byte-identical; `LFQ.get_codebook_entry` bit-exact vs
  the forward pass (max_abs_diff 0.0); re-encode token-Hamming drift
  0.109375, advisory (same class as LlamaGen's recorded 0.1211).
- Gate D: PASS — opset-17 decoder-only ONNX (SHA `49b127f5…`, 261,661,489 B);
  ORT CPU decode 4.895–5.450 s (≤ 30 s); torch↔ORT parity 7.373e-05
  (≤ 1e-4); thread invariance 1↔4 = 0.0; ORT session self-stability 0.0.

In repo: Gate C/D producers + fixtures (`797ab56`); audit note
`docs/research/2026-10-16-openmagvit2-gate-cd-audit.md`; gate status lifted in
`seed.ts` (`bb28dc1`). Follow-ons landed: research/validation tests wired into
CI (`a33f7c0`); tracker overrides + family-neutral wording (`73b3794`);
closeout note `docs/research/2026-10-16-m1b-audit-followons-closeout.md`
(`e933d3f`); closed-tracker re-bucket (`0da0f6d`).

Disposition: keep `candidate` (not blessed; the M1B floor remains
`llamagen`). The `candidateMatchesFamily` label rule for a future
`seed`-family manifest stays deferred to a seed-bridge slice.

## Still open after the push (not closable by this line)

- #402 (owner upload → fetch recipe), #403 (parked), #452 (needs a
  live-LLM/ML run plan), #392 (embedded-deploy lane, deliberately parked),
  #399/#400 (lab/ops evidence), #396/#397/#398/#393/#394 (training/eval, parked),
  #267 (maintainer process), #70, #263, #391.

## Wording discipline (from the closeout ledger)

Safe: "M1B audit delivery closeout"; "VQGAN-class candidate cleared the
four-gate audit"; "decoder manifests, audit receipts, validators, preflight
checks, and review gates are in repo". Unsafe: "M1B completed"; "working
LlamaGen decoder bridge"; "image quality validated end to end"; "a tokenizer /
adapter / image-emitting model has been trained".

## Pre-push re-verification (2026-10-17 ~03:0x CST)

Re-checked right before the pending owner decision — the remote did not move
and the two mechanical caveats on the push path are now closed.

- **Remote unchanged.** Fresh fetch of GitHub `main` → still `b62bec5`;
  `main...FETCH_HEAD` = `50 0` and the remote tip is an ancestor, so the push
  is a plain fast-forward. No new workflow runs since the record was written;
  the open set is unchanged (17 issues / 7 dependabot PRs: #646 #645 #640
  #630 #601 #599 #588); `main` is still unprotected.
- **Push mechanics verified.** `git push --dry-run` passes for **both**
  options below with no credential prompt — direct `main:main` (reports
  `b62bec5..2b1b4b0`) and `main:refs/heads/delivery-2026-10` (reports a new
  branch). The global git credential helper is already configured
  (`!gh auth git-credential`; gh authed as `Jah-yee`), so the "if git asks
  for credentials" caveat is retired.
- **Safety copy added.** The local mirror now carries
  `backup/delivery-2026-10` = this pre-push tip; it guards against local
  repo damage only — the single-copy risk ends with the GitHub push. Delete
  after the push lands:
  `git -C /Users/dujiayi/code/wittgenstein.git branch -D backup/delivery-2026-10`.
- **#402 still owner-pending.** `wittgenstein-harness/image-vqgan-v1` still
  does not resolve (HTTP 401 on `api/models/...`), so the audited ONNX bytes
  are still not uploaded.
- **Hygiene.** Working tree clean at `2b1b4b0` + this docs commit;
  `git fsck --connectivity-only` rc=0; `artifacts/runs` = 305; no
  secret-like strings or oversized blobs in `b62bec5..main`; the witt-repo
  sentinel machine is green (`last_exit 0`).

State delta: local `main` = this commit → **51 ahead / 0 behind** GitHub
`b62bec5`; 52 ahead of mirror `main` (still `8aef787`). Nothing has been
pushed.

## Post-push closeout (2026-10-17, post-push session)

The push executed at 03:16:33 CST (`b62bec5..b741eb7`, rc=0). Everything
below has since been verified or landed on GitHub `main`.

**Verification of the push itself.** First main CI since 2026-06-02 went
green on `b741eb7` (run `38953730150`, 45/45 steps, ~2m27s); CodeQL
`38953730111` green. Link-check hardening landed (`46baa91` GITHUB_TOKEN;
`63978c9` hono.dev) and the scheduled check is fully clean (1596 OK,
0 errors, 0 timeouts; #584 closed). Reviewdog markdownlint bumped to v0.31.5
(`f1838ef`, bullseye apt-404 fix) and validated green on #645.

**Node floor (ADR-0021).** Floor raised to `>=22.22.0` across `engines`,
`.nvmrc`, all four workflows (CI pinned to the floor exactly), the npm
artifact generator, `install.sh`, and `wittgenstein doctor`'s
`NODE_ENGINE_MINIMUM` (`fb79727`, `cf653a4`, `a38800c`, `fca618b`; ADR-0021
+ ADR-0002 amendment). CI on `fca618b` green under Node 22.22.0; Node 20.19
now refuses install with `ERR_PNPM_UNSUPPORTED_ENGINE` (verified locally
with the checksum-matched 20.19.0 tarball). Local-only caveat recorded:
`packages/codec-image` produce/lazy-import tests (5 tests, ~3.4–3.8s locally
vs 0.3–1.0s on CI) can cross the 5s default in recursive local runs under
co-tenant load — identical under Node 20 and 22, isolated runs green, CI
margins 5–10x. No pin widening (class discipline).

**Dependabot queue cleared.** Merged on green rebased heads: #588 (commander
15, ESM-only — satisfied by the floor, `require(esm)` needs Node ≥22.12),
#599 (actions/cache 6), #630 (pillow ≥12.3), #640 (react-router 8.4,
ESM-only; site build + Vercel preview green), #648 (actions/checkout 7.0.1),
#651 (vitest 5). Auto-merged by the dependabot workflow on open: #647 (dev
group), #649 (npm-prod group, 29 radix/lucide minors), #650 (eslint-stack
group). Follow-up fix: checkout pins moved to v7.0.1's SHA but dependabot
left the inline `# v6` comments — corrected to `# v7.0.1` in the 8 workflow
files (`274a320`), reconciled with merge commit `8e6f598` after `main` moved.

**Parked with analysis.** #652 (@huggingface/transformers 4.3.1): blocked on
kokoro-js — `kokoro-js@1.2.1` (latest on npm) requires `^3.5.1`, and
codec-audio's exact pin keeps our `env.cacheDir` integrity check on the
*same* module instance as the runtime; 4.x would split the instance. Closed,
with a semver-major `ignore` + revisit trigger added to `dependabot.yml`.
#653 (recharts 3): `pnpm typecheck` fails (`ui/chart.tsx` recharts-2 types);
left open as the tracking PR for a small migration slice.

**Open questions recorded.** (a) The Auto-merge workflow merged grouped PRs
within seconds of opening (#647/#649/#650) even though the repo API reports
`allow_auto_merge: false`; observed behavior wins for now — grouped
minor/patch merges fire without waiting for checks, majors never auto-merge.
(b) undici 8.x had not been opened by dependabot as of this record; when it
appears it needs the codec-audio review noted in `dependabot.yml`.

**Repo state at close.** GitHub `main` = this record's commit (pushed with
the transformers-ignore commit); local mirror synced; only #653 remains open
among dependabot PRs; #584/#331 closed this session; #645/#646 merged
earlier.
