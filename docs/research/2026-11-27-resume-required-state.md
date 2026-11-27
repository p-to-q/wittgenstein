# Tokenizer resume: required training state

Engineering bug fix for [#750](https://github.com/p-to-q/wittgenstein/issues/750).
This note records a recovery defect and its bounded regression checks; it does
not change the model, research design, checkpoint format or release gates.

## Reproduced defect

On main `e4127722cc8b601e91188230af15934f4c912399`, a checkpoint carrying
`optimizer: null` passed the strict payload loader because only key presence
was checked. The training loop then skipped optimizer restoration. For a saved
GAN-enabled configuration, absent/null `discriminator` and `disc_optimizer`
were also accepted. Missing discriminator weights printed a fresh-start warning;
missing optimizer history did not. Either case continued under the saved run ID.

A scalar CPU reproduction used the actual trainer and real torch serialization.
Each deliberately incomplete fixture had its checkpoint byte count and SHA-256
updated in the sibling manifest, so the file-integrity gate still passed.
All ten tested periodic/final variants wrote final checkpoints:

- A periodic checkpoint after two updates resumed for one more update with its
  generator AdamW counter at **1 instead of 3** when `optimizer` was null.
- Removing or nulling `disc_optimizer` produced the same history reset for the
  GAN optimizer.
- A zero-update resume from `final.pt` re-saved empty optimizer history while
  preserving the completed step count.
- Missing/null discriminator weights were replaced by freshly initialized
  weights, even on a zero-update resume.

These are intentionally malformed test fixtures, not evidence that a past real
training run suffered this failure. Matching hashes bind the fixture bytes;
they do not establish that those bytes contain a complete recoverable state.

## Repair boundary

The existing torch-free payload loader now requires mapping-valued `model` and
`optimizer` state for strict recovery. When saved args enable GAN, it also
requires both `discriminator` and `disc_optimizer`, including during warmup:
the current writer already saves those mappings before the first GAN update.

Absent, null and non-mapping required states raise the existing
`RESUME_QUARTET_INCOMPLETE` error, naming every invalid field and the source
checkpoint. The trainer communicates that typed refusal to all ranks before
loading weights/optimizer state, making a forward pass, updating parameters or
writing new output. It no longer advertises a fresh-discriminator continuation.

Non-GAN checkpoints remain supported. Empty mappings remain valid at this shape
boundary; the existing model loader and AdamW validators check their contents.
In particular, the GAN optimizer's empty lazy state during warmup remains valid.
Explicit legacy inspection with `require_optimizer=False` remains available;
an absent/null generator optimizer then carries `RESUME_OPTIMIZER_MISSING`.
The trainer does not enable that inspection opt-out.

## Executable regressions

```sh
OMP_NUM_THREADS=1 python -m unittest \
  research.training.tokenizer.test_resume_required_state -v
```

The module covers invalid shapes and aggregation of missing fields without
torch. CPU tests exercise both periodic and zero-update resume, unchanged output
trees on refusal, healthy non-GAN and GAN-warmup recovery, and three two-rank
CPU/gloo cases where only one rank receives incomplete state. Both ranks must
report `RESUME_QUARTET_INCOMPLETE`; subprocess waits have bounded timeouts.
The existing dependency-light and CPU training CI selections include this module.

Raw before/after reproduction results, expected pre-fix failures, test commands,
source identities and qualification receipts are retained under the ignored local
directory `artifacts/runs/20261127-resume-required-state/`. Those local files are
not a public attachment or an independently stored evidence backup.

## Remaining limits

These checks use scalar models, synthetic inputs and CPU/gloo. They do not
qualify VQGAN quality, GPU/NCCL execution, exact dataloader/per-rank RNG
continuation, corpus rights or target-machine capacity. A shape-valid checkpoint
can still have other defects; existing tensor, optimizer, data and snapshot
checks remain necessary. Hosted CI and independent PR review must be reported
separately from local test success.
