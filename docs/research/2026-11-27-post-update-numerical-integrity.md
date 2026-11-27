# Post-update numerical integrity audit — 2026-11-27

## Result

Follow-up to the [deeper training audit](2026-11-27-deep-training-audit.md).
[#731](https://github.com/p-to-q/wittgenstein/issues/731) / engineering
[PR #732](https://github.com/p-to-q/wittgenstein/pull/732) cover a reproduced gap:
finite loss, gradients and hyperparameters did not imply finite updated model or
AdamW state. A zero-update resume could also certify an already-poisoned state.
This is an engineering correction, not a research-design or quality result.

## Before: successful receipts for invalid state

On main `9d2f0e6d7fe1e3b3be6850cdd6db4cd364c68000`, generated inputs and a
one-parameter CPU model reproduced two real AdamW overflows:

- Finite `lr=weight_decay=1e20` produced an infinite parameter. The loop returned
  successfully, wrote `final.pt` and its manifest, and set both acceptance flags.
- With a finite large gradient and clipping explicitly disabled, `exp_avg_sq`
  became infinite while the parameter remained finite. The same success path
  completed. Checking only parameters would miss this case.

Separately, real serialized checkpoints with matching byte hashes and coherent
run/step metadata were changed to carry invalid parameters, buffers or optimizer
moments. When the saved final step already equaled `max_steps`, the old trainer
performed no updates and wrote another final checkpoint without refusing any of
those six generator/discriminator cases.

The original overflow checkpoints/receipts are retained locally. These fixtures
are deliberately extreme failure probes; they do not estimate the incidence of
overflow in a research run.

## Repair and observable behavior

The existing finite-status boundary now also accepts an iterator of state
tensors. Each generator/discriminator update is followed by a check of model
parameters/buffers and AdamW tensor state. Loaded state is checked before the
loop, including when no updates remain. All ranks join one collective per check;
a failure on one rank stops the attempt on every rank before further progress.

The existing `NONFINITE_TRAINING` failure path writes failed acceptance and a
hashed experiment log without a success-manifest reference. New stages are
`generator_state` and `discriminator_state`. No final evaluation/checkpoint is
written for the failed attempt; earlier valid pairs are preserved. A post-update
failure does not roll back mutated in-memory state. Recovery starts from an
earlier valid checkpoint. For a zero-update resume, `failure_step` records the
next step and no optimizer update was attempted.

No checkpoint format, shared protocol, resume step convention, research
architecture, image path or governance policy changed. The
[tokenizer usage documentation](../../research/training/tokenizer/README.md#numerical-failure-evidence)
describes failure stages and the cost boundary.

## Executable qualification

The clean implementation revision is
`d5d4789a6bd0e05e852d1e7fe6ac6e2ca8949e88` (tree
`93806b70862538916ca8ad871c0adc2abea67fdf`). Later changes in this PR are
reporting only. Qualification ran on macOS arm64 with generated data, scalar
models and CPU/gloo; the Python commands were extracted from the existing CI
workflow, which already includes the extended numerical-safety module.

| Local check                                                                  | Result                                        |
| ---------------------------------------------------------------------------- | --------------------------------------------- |
| Exact CPU-torch CI lane                                                      | 137 passed; zero skips                        |
| Exact dependency-light CI lane                                               | 133 discovered; 118 passed, 15 optional skips |
| Bounded JS suite, summed across eleven package summaries                     | 631 passed; four existing optional skips      |
| Golden suite                                                                 | 15 passed                                     |
| Deterministic reviewer bench                                                 | Eight checks passed                           |
| Maintained formatting, lint, dependency/publish boundaries, typecheck, build | Passed                                        |

The Python lanes overlap; the counts must not be added as independent tests.
Five added regression methods fail against the original trainer and pass with
the repair. Cases cover actual update/moment overflow, generator/discriminator
parameters/moments/buffers, one-bad-rank refusal, earlier-pair preservation,
poisoned zero-update resume and a healthy zero-update resume. Existing healthy
DDP forward/update tests still pass. The focused numerical/DDP command runs ten
test methods:

```sh
OMP_NUM_THREADS=1 python -m unittest \
  research.training.tokenizer.test_numerical_safety \
  research.training.tokenizer.test_distributed_forward -v
```

New test code passes Ruff E9/F/I. The trainer retains its three pre-existing
E9/F/I findings (unused import, import ordering, unnecessary f-string prefix);
the before/current finding sets were compared. No universal Python lint pass
is claimed.

## Evidence and remaining allocation gates

Local evidence: `artifacts/runs/20261127-post-update-audit/`.
`finite-update-before.json` and `moment-update-before.json` describe the two
actual successful-but-poisoned runs. `verify_before.py` runs the corrected new
fixtures against the original trainer in isolated parent/child processes;
`corrected-isolated-main-regressions.log` is the canonical failing baseline.
Other intermediate fixture/runner debugging logs are development history, not
additional defect or qualification evidence. `qualification.json`, log hashes
and `test-counts.json` bind the passing commands and package arithmetic to the
implementation revision. The closeout records the final branch bundle and
SHA-256 evidence index; these are local preservation, not an off-machine archive.

The new scans read model/AdamW state on every update and add a collective per
active optimizer. Target-host capacity and throughput must be measured with the
checks enabled. The tests do not qualify CUDA/NCCL, full-model memory, exact
per-rank data/RNG restart, finite-but-incorrect optimizer behavior or image
quality. No paid inference, GPU training, large experiment, pretrained download
or weight publication was performed.

Actual immutable corpora, rights and lab restore remain in
[#400](https://github.com/p-to-q/wittgenstein/issues/400); compatible weights and
rights remain in [#402](https://github.com/p-to-q/wittgenstein/issues/402).
Current-author/main hosted CI remains tracked in
[#661](https://github.com/p-to-q/wittgenstein/issues/661). The independent review
requirements for governance [#711](https://github.com/p-to-q/wittgenstein/pull/711)
and research pilot [#720](https://github.com/p-to-q/wittgenstein/pull/720) are
preserved. Use the [compute-readiness roadmap](2026-11-27-compute-readiness-roadmap.md)
before allocating research compute; these engineering regressions do not close
its scientific or operational gates.
