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
- CI-only unknowns (unchanged by design): Node 20.19 (no local Node 20);
  research/validation discovery runs with numpy on CI (system py3.10 locally
  skips 2 numpy cases); dependency-review runs on PRs only. The push will
  produce the first true CI run of the Python 3.12 floor + discovery step +
  merged eslint stack against this line.

## Push options

1. **Direct push** (simplest, works with the current state):
   `git push https://github.com/p-to-q/wittgenstein.git main`
   CI runs via the `ci.yml` push trigger. If git asks for credentials:
   `gh auth setup-git` once.
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
