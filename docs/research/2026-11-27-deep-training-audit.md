# Deeper training integrity audit — 2026-11-27

## Result and scope

Four reproduced engineering defects were fixed and merged. The scope was the
existing tokenizer's data receipts, numerical updates, checkpoint recovery and
acceptance evidence. This is executable software preparation for a future
allocation, not a scientific result or proof that compute is the only remaining
research requirement.

No paid inference, GPU training, large experiment, external corpus, pretrained
metric download or weights publication was used. Tensor tests use generated
fixtures, scalar models and CPU/gloo. No shared schema, image path, research
architecture or governance decision was changed.

| Merged fix                                                                                                                | Before                                                                                                                                        | Verified behavior                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| [#723](https://github.com/p-to-q/wittgenstein/pull/723), closes [#722](https://github.com/p-to-q/wittgenstein/issues/722) | Changed dataset/DVC fields retained an accepted stale SHA-256; the writer could replace a valid receipt with a forged digest                  | Recompute the existing normalized dataset+DVC identity, reject invalid writes before replacement and hash the same bytes parsed by references |
| [#725](https://github.com/p-to-q/wittgenstein/pull/725), closes [#724](https://github.com/p-to-q/wittgenstein/issues/724) | Nonfinite generator/discriminator loss or backward gradients poisoned parameters yet the loop completed and checkpointed                      | Check before backward/affected updates; coordinate refusal across ranks, persist failure evidence and skip final eval/checkpoint              |
| [#727](https://github.com/p-to-q/wittgenstein/pull/727), closes [#726](https://github.com/p-to-q/wittgenstein/issues/726) | Byte-valid checkpoint pairs could disagree on run ID or step; path-bearing IDs could select another output directory                          | Reconcile payload/args/sibling identities, reject unsafe directory names and step disagreement; retain legacy missing-identity warnings       |
| [#729](https://github.com/p-to-q/wittgenstein/pull/729), closes [#728](https://github.com/p-to-q/wittgenstein/issues/728) | Nonfinite optimizer values passed preflight; an Inf learning-rate fixture reached update/checkpoint writing before manifest validation failed | Reject invalid optimizer numbers/ranges before devices; retain legal zero rates and existing nonpositive warmup/clipping disable settings     |

The Inf-learning-rate reproduction was a **late failure**, not a completed,
accepted run. The loss/gradient fault fixtures separately demonstrated the
incorrect completed-checkpoint behavior. Keeping these outcomes distinct matters.

## Reproduction and local qualification

Qualification ran at `27c518f5e45aaa6e5de13eb1480b577c8ac6a23f` on macOS arm64.
The merged engineering main `eca0a701e49d0b89c4da56212ed5b7c29c5d46d8` has the
same qualified source tree. This document and the count corrections are later
reporting-only changes.

| Check                                                                                        | Result                                                   |
| -------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Repository maintained formatting, lint, dependency/publish boundaries, typecheck, full build | Passed                                                   |
| Full bounded JS suite                                                                        | 631 passed; four existing optional skips                 |
| Golden suite                                                                                 | 15 passed                                                |
| Deterministic reviewer bench                                                                 | Eight checks passed                                      |
| Exact CI-defined CPU-torch training lane                                                     | 132 passed; no skips                                     |
| Exact CI-defined dependency-light receipt lane                                               | 133 discovered; 118 passed, 15 optional-dependency skips |

The Python lanes overlap; their totals are not independent test counts. New
regressions are included in the appropriate CI definitions. Healthy DDP updates
still pass. All four one-bad-rank loss/gradient cases exit within bounded waits;
the affected optimizer is not stepped. Another test proves that an earlier
checkpoint pair remains finite and passes the existing restore-integrity check
after a later numerical failure. Real serializer tests reject conflicting decoded
identities/steps even when the pre-device file hash/shape gate passes.

To reproduce the focused checks in a CPU torch/Pillow environment:

```sh
OMP_NUM_THREADS=1 python -m unittest \
  research.training._shared.test_data_versioning \
  research.training._shared.test_sweep_manifest \
  research.training._shared.test_sweep_cli \
  research.training.tokenizer.test_numerical_safety \
  research.training.tokenizer.test_resume_identity \
  research.training.tokenizer.test_preflight \
  research.training.tokenizer.test_receipt_helpers -v
```

Use `.github/workflows/ci.yml` for the full CPU and dependency-light commands.
Existing trainer E9/F findings (unused `replace` import and an unnecessary
f-string prefix) remain the same as the baseline; repository `pnpm lint` passed.
No clean all-Python lint result is claimed. Focused new-test/changed validator
checks passed.

Raw failing attempts, successful checks, commands, exit statuses and source
identities are retained locally under the ignored directory
`artifacts/runs/20261127-deep-training-audit/`. `qualification.json` records the
exact qualified revision; `js-count-reconciliation.json` records per-package
counts and original-log hashes. A final SHA-256 index and branch bundle preserve
the local closeout. These files are not an off-machine evidence archive.

## Corrected historical test totals

Recounting the eleven Vitest package summaries found two previous reporting
arithmetic errors:

- `20261127-repository-readiness/closeout-all-tests.log`: **611**, not 711,
  passing tests; four skips.
- `20261127-robustness-phase/final-js.log`: **631**, not 731, passing tests;
  four skips. This phase's fresh log also totals 631.

The two committed closeout documents now carry explicit corrections. Original
logs and historical local receipts remain unchanged, so the reconciliation is
visible rather than erasing the earlier error. A change in the written aggregate
is not a newly observed regression or evidence that 100 tests disappeared.

## GitHub state and remaining gates

- [#400](https://github.com/p-to-q/wittgenstein/issues/400) was reopened after
  reconciling its closed API state with the still-unmet acceptance and maintainer
  notes. Receipt/audit tooling is implemented; actual immutable corpus pointers,
  rights decisions, lab remote restore and a real sweep receipt remain outstanding.
- Author/current-main hosted CI remains unresolved in
  [#661](https://github.com/p-to-q/wittgenstein/issues/661). At this audit, no
  Actions run was recorded for the checked new engineering revisions. Vercel
  success and skipped/cancelled CodeRabbit checks are not repository CI or
  independent review. Local software qualification is what was performed.
- Main branch protection still reports `Branch not protected` (HTTP 404).
  [#711](https://github.com/p-to-q/wittgenstein/pull/711) remains an unmerged
  governance proposal; this phase did not activate protection or automerge.
- [#720](https://github.com/p-to-q/wittgenstein/pull/720) remains a research
  proposal awaiting independent review. No categorical-target, adapter/head
  trainer, matched-budget pilot or scientific acceptance rule was ratified here.
  Previously requested reviews remain pending.

## Practical next allocation

Follow the [compute-readiness roadmap](2026-11-27-compute-readiness-roadmap.md)
and [training launch guide](../contributing/training-setup.md). First close the
rights/immutable-data/remote-restore gate and target-host software/capacity gate.
Resolve independent review of the discriminating pilot design before
implementing new research assumptions; the adapter/native-emitter surfaces are
still documentation-only. Compatible weight identity and rights remain tracked
in [#402](https://github.com/p-to-q/wittgenstein/issues/402).

A self-consistent data receipt does not authenticate the actual corpus. Scalar
CPU/gloo checks do not qualify a full VQGAN, CUDA/NCCL or target-host memory.
The numerical guard detects loss/gradient failure, not every possible optimizer
state failure. A discriminator failure can follow a generator update within the
same attempted step; that partial in-memory step is not checkpointed as final.
Exact dataloader/per-rank RNG continuation and empirical image quality remain
unqualified. Do not start a large run or release weights on the basis of these
engineering tests alone.
