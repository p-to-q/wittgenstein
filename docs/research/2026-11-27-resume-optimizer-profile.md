# Resume optimizer profile audit — 2026-11-27

Issue: [#735](https://github.com/p-to-q/wittgenstein/issues/735).

## Confirmed failure

Compatible saved/current args and finite tensors did not establish that a
restored AdamW optimizer used the recorded mathematical recipe. On main
`5fcdab670d00979a26f2e463da3f7ad20328c231`, the trainer loaded parameter-group
settings without reconciling them against that recipe. A later resume could
therefore silently adopt changed betas, weight decay, epsilon or maximize mode.

Bounded scalar CPU probes re-certified ten finite conflicts at zero-update final
resume: each of `betas`, `weight_decay`, `eps`, `maximize` and `lr` for generator
and discriminator. The stronger probes recomputed both the checkpoint byte/hash
receipt and the actual generator optimizer manifest, leaving only the conflict
with saved args/runtime configuration. This is internal consistency validation,
not authentication against someone who can replace every checkpoint and receipt.

Local `optimizer-consistent-before.json` and its log retain these ten successful
but inconsistent attempts and their scalar checkpoint pairs. Two new real-loop
regression methods produce 22 failing cases against the original trainer:
12 final-resume conflicts and ten periodic-resume conflicts. Fixtures also cover
AMSGrad at zero-update resume. Two additional actual-update probes resume a
periodic checkpoint with conflicting betas: both generator and discriminator
AdamW counters advance from two to three while recorded betas remain
`[0.9, 0.95]` and actual betas are `[0.5, 0.8]`. Those successful inconsistent
continuations are retained in `optimizer-actual-update-before.json` and its log.
No scientific quality result is inferred.

## Repair

Before loading either model or optimizer state, compare the saved AdamW profile
with the actual fresh optimizer template: learning rate, betas, weight decay,
epsilon, AMSGrad and maximize. Group and parameter counts and scalar value types
are checked too. Malformed or conflicting settings raise `ResumeOptimizerDrift`
(`RESUME_OPTIMIZER_DRIFT`) before original run files can be replaced.

Generator LR is checked against the existing schedule at the **last completed**
step, respecting periodic/final checkpoint semantics. The discriminator is
compared against its own actual template: its current default decay is `0.01`,
not the generator's configured decay. Older checkpoints can omit the
false-default `amsgrad`/`maximize` fields. Execution choices such as
`foreach`/`fused` are not compared as recipe fields. No training recipe or
checkpoint format changed.

An object collective at resume propagates any rank's profile refusal before
state loading/DDP model collectives. CPU/gloo fixtures use a healthy rank-0 file
and a conflicting rank-1 file, separately for generator and discriminator, and
require both ranks to exit with the same originating-rank failure. Single-rank
fixtures assert no model-state load, optimizer update or original-output change.

## Executable qualification

Qualified implementation: `e4bdb471f5e7cfee9505b7d17189c6670e3409a2`, tree
`149134907fc244baeac7e809315c5445e66f9a6b`. Subsequent changes in this PR are
reporting only. Exact current CI commands were run on local macOS arm64:

- CPU-torch lane: **152 passed, zero skips**.
- Dependency-light lane: **139 discovered, 124 passed, 15 optional skips**.
- Focused new profile/real-loop command: **nine passed**.
- Maintained formatting and dependency/publish boundaries passed.
- Changed resume/test files passed Ruff E9/F/I. No universal Python lint claim.

The Python lanes overlap; do not sum them as independent tests. The CPU lane
also reruns corpus identity, numeric-state, healthy DDP and recovery tests. New
pure checks are included in both CI lanes; real-loop checks are in the CPU lane.
No unrelated JS/build rerun or successful GitHub Actions execution is claimed.

Evidence: `artifacts/runs/20261127-resume-semantics-audit/`; the second full
qualification is under `optimizer-qualification/`, preserving the earlier
corpus audit's logs. `verify_optimizer_before.py` is the failing baseline runner.
These are local records, not an off-machine backup.

CUDA/NCCL, exact loader/per-rank RNG continuation, target-host performance,
real-corpus qualification and image quality remain unmeasured. The profile check
adds a small collective only at resume; it does not scan optimizer tensors on
each step (the separate numerical-integrity checks already do that). No paid
inference, GPU training, large run, pretrained download or weight release occurred.
