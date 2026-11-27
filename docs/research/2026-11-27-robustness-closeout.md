# Robustness and pilot-rigor closeout — 2026-11-27

## Delivered engineering changes

Three focused engineering PRs were squash-merged into upstream main, ending at
`7e24f86a9d7a812c0415129d2f28f56556cbbc36`. Issues #707, #715 and #718 are closed.
This is software qualification and experiment preparation, not a trained model
or evidence that compute is the only unresolved dependency.

| PR                                                      | Corrected failure                                                                                                   | Evidence and remaining boundary                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#716](https://github.com/p-to-q/wittgenstein/pull/716) | Runtime version could come from an unrelated caller's package metadata                                              | Source, native compiled ESM and copied standalone CJS regressions; [provenance details](2026-11-27-runtime-provenance.md). Caller git/lockfile semantics remain unchanged.                                                                                                           |
| [#717](https://github.com/p-to-q/wittgenstein/pull/717) | Corrupt validation samples were substituted; failed/nonfinite metrics and incomplete coverage could look successful | Strict validation, explicit degradation/failure receipts, content-bound evaluation identity, disjoint synthetic seed populations and cleanup/mode restoration; [evaluation details](2026-11-27-evaluation-integrity.md). Metric implementations are test doubles in the regressions. |
| [#719](https://github.com/p-to-q/wittgenstein/pull/719) | Training accepted overlapping train/validation roots; no executable exhaustive local image-integrity audit          | Pre-device root checks, full decode, byte/RGB duplicate detection, fresh non-overwriting output receipts and actual CLI exit tests; [usage and limits](2026-11-27-dataset-audit.md). Real data rights and semantic independence remain unqualified.                                  |

The evaluation regression suite initially reproduced six assertion failures and
two errors in nine cases before correction. Expanded evaluation-integrity tests
and the new audit suite cover the repaired behavior and its failure paths.
Generated-image CLI fixtures returned exit 0 when clean and exit 1 after a
deliberate cross-split duplicate, preserving both attempts.

## Final local qualification

The final sweep ran on macOS arm64 at
`cd675521e5cf16b0159e879794944e9e0110d8ea`, whose only difference from the merged
engineering main above is the separate research proposal document. No source,
workflow or dependency change is hidden behind that qualification revision.

| Check                                                 | Result                                                   |
| ----------------------------------------------------- | -------------------------------------------------------- |
| Maintained formatting, full lint, typecheck and build | Passed                                                   |
| Codec dependency boundaries and npm publish surface   | Passed; no research/weights leakage                      |
| Full bounded JS suite                                 | 631 passed; four existing optional skips                 |
| Golden suite                                          | 15 passed                                                |
| Deterministic reviewer bench                          | 8 passed; no failures or skips                           |
| CI-defined CPU-torch test lane                        | 118 passed; no skips                                     |
| CI-defined dependency-light training receipt lane     | 119 discovered; 105 passed, 14 optional-dependency skips |

The Python suites overlap: do not add their counts as independent tests. The
CPU lane includes a real two-process/gloo one-parameter regression. It is not
scientific training, a CUDA/NCCL test, exact per-rank restart qualification, or a
measurement of a research model's capacity. No external corpus, paid inference,
GPU training, pretrained metric download or weights publication was used.

Count correction (2026-11-27 deeper audit): the eleven package summaries in
`final-js.log` sum to 631 passing tests, not the previously reported 731.
The original log and historical local status receipt are retained unchanged;
the [deeper audit](2026-11-27-deep-training-audit.md) records the correction.

Reproduce the relevant software checks from the repository root:

```sh
pnpm format:check
pnpm lint
pnpm lint:deps
pnpm lint:publish-surface
pnpm typecheck
pnpm build
pnpm test:serial
pnpm test:golden
pnpm reviewer-bench
```

The exact Python commands remain in `.github/workflows/ci.yml` under
`training-cpu` and the dependency-light training receipt step. Install their
explicit dependencies in the intended environment; an optional-dependency skip
is not evidence for the skipped behavior.

Raw commands, exit statuses, failure attempts, generated audit receipts and
source-reference hashes are retained locally under the ignored
`artifacts/runs/20261127-robustness-phase/` directory. `final-qualification.json`
records the exact qualification revision and each log; `phase-status.json` and
`evidence-sha256.json` provide the closeout index. These local files are not an
off-machine evidence archive. The committed documents and GitHub PRs carry the
public summary and reproduction instructions.

## GitHub and research review status

- **CI execution is still unresolved (#661).** At closeout the Actions API
  reported zero workflow runs for each of the three merged engineering SHAs.
  The successful Vercel checks on #719 are not repository CI. Previously
  successful Dependabot Linux runs remain valid for their own source revisions;
  they do not qualify these commits or resolve the author-dispatch failure.
- The main branch-protection endpoint still returned HTTP 404, `Branch not
protected`. Governance PR [#711](https://github.com/p-to-q/wittgenstein/pull/711)
  remains unmerged with independent review requested. No protection or
  dependency automerge was activated by this phase.
- Research PR [#720](https://github.com/p-to-q/wittgenstein/pull/720) is a separate
  execution hypothesis awaiting formal independent review from simonsunyiming.
  It proposes categorical-target corrections, compact/full-grid alignment and
  gradient checks, oracle/text/input-use controls, matched budgets and explicit
  uncertainty/stopping criteria. It is not ratified doctrine or launch approval.
- Issues #397, #398, #400 and #661 received precise implementation/review
  updates. The learned adapter and native emitter are still documentation-only;
  the technical audit does not close #400. Open research gates were retained
  rather than closed merely to reduce the queue.

## Next useful work

1. Resolve the independent review of #720 and choose one discriminating pilot
   question. Define the categorical pair/target and differentiable path, then
   implement CPU shape/gradient tests before a speculative adapter/head trainer.
2. Curate a small rights-cleared corpus, audit its actual bytes, inspect near
   duplicates and leakage, verify the DVC remote restore (#400), and settle
   exact compatible weights and rights (#402).
3. Recover and qualify author/current-main Linux Actions, then independently
   ratify and deliberately activate the intended CI gate (#661/#711).
4. With an explicit target host and resource cap, follow the existing
   [compute-readiness ladder](2026-11-27-compute-readiness-roadmap.md) for device
   capacity, two-rank/restart checks and a bounded held-out pilot. Larger runs
   depend on useful measured evidence; no allocation was started here.

The single VSC image path, Codec v2 and manifest contracts are unchanged. This
closeout records engineering facts and pending proposals, not new operating
doctrine or a claim of model quality.
