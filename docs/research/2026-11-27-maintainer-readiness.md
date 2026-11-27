# Maintainer closeout — 2026-11-27

## Outcome and boundary

Installation, CI definitions, runtime boundaries and training integrity were
repaired in focused upstream PRs. The current objective is to make a future
operator's first allocation useful and diagnosable, not to claim that a model is
already qualified or that compute is the only missing research ingredient.

Start the next handoff with the
[compute-readiness roadmap](2026-11-27-compute-readiness-roadmap.md) and
[training launch guide](../contributing/training-setup.md).
No paid inference, GPU training, large research experiment or weights release
was performed in this maintenance pass. Tiny CPU tensor regressions are tests,
not scientific results.

## Integrated work

| PR                                                      | Result                                                                                                                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#703](https://github.com/p-to-q/wittgenstein/pull/703) | Normal lifecycle frozen install avoids the optional ONNX Linux CUDA-download failure; full PR/main verification and aggregate `CI gate`, including the site build                               |
| [#704](https://github.com/p-to-q/wittgenstein/pull/704) | Consolidated training receipts/input checks/resume hardening with original source attribution; explicit data/objective selection; checkpoint+manifest integrity; honest environment limitations |
| [#705](https://github.com/p-to-q/wittgenstein/pull/705) | Removed unused site UI scaffold and 40 unused runtime dependencies; retained active site components                                                                                             |
| [#706](https://github.com/p-to-q/wittgenstein/pull/706) | Anthropic proxy base URL, end-to-end response-body deadlines, real loopback HTTP regressions                                                                                                    |
| [#708](https://github.com/p-to-q/wittgenstein/pull/708) | All image warnings preserved; unknown warning IDs remain visible; unreachable palette warning retired                                                                                           |
| [#674](https://github.com/p-to-q/wittgenstein/pull/674) | Reconciled setup-node v7 against the current CI graph instead of merging its stale original head                                                                                                |
| [#681](https://github.com/p-to-q/wittgenstein/pull/681) | Correct official Fabric documentation link                                                                                                                                                      |
| [#710](https://github.com/p-to-q/wittgenstein/pull/710) | DDP forward/reducer fix, CPU two-rank CI regression, bounded test workers, compute-readiness roadmap and original-branch ledger                                                                 |
| [#713](https://github.com/p-to-q/wittgenstein/pull/713) | Root TypeScript ESLint stack 8.74.0, reviewed and merged on fresh Linux PR CI                                                                                                                   |
| [#712](https://github.com/p-to-q/wittgenstein/pull/712) | Site TypeScript ESLint 8.74.0, rebased after #713 and merged only after fresh combined-state Linux CI                                                                                           |

The former Recharts / hookform PRs #700/#701 were superseded after their unused
site consumers were removed; #682 was superseded by #708. Fork duplicate #702
was closed after the upstream install fix. Resolved issues #668/#659/#662/#680
were closed against their actual successors.

The final engineering closeout additionally fixes DDP generator synchronization:
calling `model.module.encode/decode` bypassed DDP's forward/reducer boundary.
A two-rank CPU regression with opposing local objectives **failed before the
fix** (parameters 0.4997950196 vs 0.5001950264) and passes through `model(img)`.
The same test checks the optional GAN path. This is not CUDA/NCCL qualification.
A dedicated CPU-torch CI job now exercises these tests; serial package/file
workers bound JS test concurrency. Body-deadline tests control only the timer,
while preserving real HTTP reads; they no longer mistake loaded-host header
arrival for a timeout implementation bug.

Useful serial-test and Dependabot-label changes were salvaged from the old
branches without importing their proposed operating doctrine. New training docs
correct stale synthetic/LPIPS fallback claims, unsupported eight-card capacity
claims, and the proposed averaging of categorical token IDs. D=32 remains a
hypothesis, not a demonstrated advantage.

## Validation evidence and limits

Evidence is retained locally under
`artifacts/runs/20261127-repository-readiness/`; it includes failures as well as
successful rechecks. This directory is ignored, not an uploaded release bundle.
The local host is macOS arm64, Node 22.23.3 / pnpm 9.12.0. The torch CPU suite
uses its separate Python environment, not the stdlib-only system interpreter.

- Fresh archive-based checkout: normal frozen install and local verification
  passed for the install repair. The final working-tree checks separately cover
  subsequent changes; the separate Linux PR evidence is described below.
- Typecheck, lint, dependency/publish boundaries, full build, goldens, reviewer
  bench, CLI doctor, maintained formatting, actionlint and typos passed locally.
- Final `pnpm test:serial` passed in one invocation across all eleven packages:
  611 passed, four skipped (`closeout-all-tests.log`). Earlier split rechecks,
  loaded-host process-start/CLI timeouts and the repaired header race remain in
  the evidence directory; they are not erased or called green.
- Stdlib training/receipt suite: 118 tests, 14 optional-dependency skips. Final
  CPU torch recovery/receipt/preflight/two-rank suite: 87 passed, no skips.
- A real local `sensor --dry-run --seed 42` CLI invocation wrote HTML/JSON/CSV
  with a run manifest. Sidecar SHA-256 values were checked against the files.
  This proves the local harness/renderer path, not a remote model or a learned
  image decoder. See `local-sensor-verification.json` in the evidence directory.

Count correction (2026-11-27 deeper audit): the eleven package summaries in
`closeout-all-tests.log` sum to 611 passing tests, not the previously reported 711. The original log is unchanged. See the
[reconciliation and subsequent checks](2026-11-27-deep-training-audit.md).

The earlier `Jah-yee` workflow-dispatch attempt failed with **HTTP 422,
“Actions has been disabled for this user.”** That failure remains recorded; its
cause has not been attributed to billing or guessed. Later on 2026-11-27
(Asia/Shanghai), Dependabot-triggered Linux PR CI completed successfully:

- [Run 45889714337](https://github.com/p-to-q/wittgenstein/actions/runs/45889714337)
  checked #712 head `48fb52b` against main `14c2299`.
- [Run 45889848405](https://github.com/p-to-q/wittgenstein/actions/runs/45889848405)
  checked #713 head `88d8997` against the same base. Its root ESLint update was
  subsequently merged after reviewing the exact package/lockfile delta.
- [Run 45892137943](https://github.com/p-to-q/wittgenstein/actions/runs/45892137943)
  checked rebased #712 head `26230de` against main `4d57d69`, after #713 landed.
  The combined root/site dependency update passed every job and was merged;
  the original #712 run was not reused to qualify a different base.

Run/head/base identities, every job and the full logs were inspected and saved
locally. Lifecycle install, lint/typecheck, full build, package tests, goldens,
reviewer bench, Python checks, all 87 CPU-torch/gloo training regressions and the
aggregate `CI gate` passed. This is fresh Linux evidence for the maintenance
code and those dependency candidates, not proof that the author's dispatch
access or a current-main push run is restored. A changed dependency combination
needs its own current-base qualification. CUDA/NCCL, target-host capacity and
scientific image quality remain unqualified. Vercel and CodeRabbit are not CI
substitutes.

The dependency automerge workflow remains disabled. Main protection has not
been activated; proposed governance PR #711 awaits independent formal review.
The default reviewer account could not be resolved, so review was requested
from the verified non-author administrator `simonsunyiming`; no approval is
claimed. Reviewer configuration drift remains tracked in #267.

## Branch dispositions

The [branch ledger](2026-11-27-maintainer-branch-ledger.json) records all 160
original remote heads, original SHA, archived/deleted/retained disposition and
remaining review rationale. Archive refs were made before deletion; two local
Git bundles were verified and hashed. Deletion used fresh remote SHAs and exact
leases, not branch names alone.

After the first two cleanup batches: 129 remote heads were deleted, including
newly merged maintenance heads; 37 remained (19 upstream, 18 fork). Counts are
per remote, not unique implementations. This is a dated snapshot, not a promise
that later PR heads will not exist. Unique unmerged work and the active second
resume worktree were preserved. The bundles are local, not an independent
backup. No unmerged research branch was forced into main just to reduce a count.

`feat/cli-image-dry-expand` is **not** landed. Historical M1B delivery variants,
site migration variants and conflicting stage/ADR proposals also must not be
represented as current main behavior. The old manifest-version branch was
rejected as written: requiring a caller's `package.json` breaks legitimate empty
working-directory runs. The underlying identity bug (#707) was subsequently
fixed in PR #716 with source, compiled-ESM and standalone-bundle regressions;
see the [robustness-phase closeout](2026-11-27-robustness-closeout.md). The earlier
branch rejection remains historical; the later code-owned identity fix is landed.

## Remaining work, with owners by issue

| Issue              | Actual next gate                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| #661 / #267        | Restore author-triggered Actions access, qualify current-main execution, independent governance review and deliberate main-gate activation |
| #400               | Rights-cleared actual data, content verification, DVC remote access/restore and storage; synthetic receipts are only contract tests        |
| #396               | Target-host environment, measured one-device capacity, two-rank/restart checks, then a bounded real-data pilot                             |
| #397 / #398        | Missing learned seed-expander / LLM-head implementation; not launch-ready trainers                                                         |
| #399               | Shared tracking deployment; local JSONL receipts already exist                                                                             |
| #402 / #403        | Approved exact weights / hosting / release posture, then canonical installer and real end-to-end image qualification                       |
| #394 / #452 / #70  | Held-out quality, seed-information and text-to-seed evidence under the existing M1B gates                                                  |
| #392 / #393 / #263 | Deferred CPU latency, seed sweep and sensor measurement evidence                                                                           |
| #391               | Parked horizon, not immediate compute preparation                                                                                          |

The readiness roadmap gives pass/stop/not-run criteria and separates tokenizer
reconstruction, oracle seed expansion and planner-generated seed utility. Those
substantive open issues stay open. Repository maintenance cannot honestly close
missing data rights, an unimplemented trainer, external Actions access or an
unrun quality experiment.
