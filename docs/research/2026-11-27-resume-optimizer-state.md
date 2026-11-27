# Resume AdamW state audit — 2026-11-27

Issue: [#737](https://github.com/p-to-q/wittgenstein/issues/737).

## Confirmed failure

On main `14ab47c8923c5b987a1ffc8ea22c6dae03ebc59d`, fourteen finite invalid
AdamW states passed byte/hash verification and the mathematical-profile guard,
then received successful smoke acceptance at zero-update final resume. Both
generator and discriminator were tested with wrong moment shape, negative second
moment, missing first moment, negative/fractional/impossibly future counter, and
unreferenced state. Checkpoint size/hash and the actual generator optimizer
receipt were refreshed truthfully. These are internal consistency tests, not
claims of authentication against someone replacing all evidence.

`before.json`, `before.log`, `probe.py` and the input/output scalar checkpoint
pairs retain the reproductions under
`artifacts/runs/20261127-optimizer-state-audit/`. `after.json` and `after.log`
replay those same fourteen inputs: each is now refused before state loading or
output creation, with input files preserved. Generated evidence is local and is
not an off-machine backup or an empirical image-quality result.

## Repair and compatibility

The existing coordinated resume guard now checks AdamW state's positional
parameter binding and mathematical domains, before loading either model or
optimizer state. Invalid state raises `ResumeOptimizerStateInvalid`
(`RESUME_OPTIMIZER_STATE_INVALID`), preserving the originating rank in all ranks'
errors. Recipe conflicts retain their distinct `RESUME_OPTIMIZER_DRIFT` code.

- Parameter IDs must be unique integers; stored state cannot reference IDs
  absent from all groups. IDs need not be sequential or match freshly generated
  ID spelling.
- Nonempty entries require a real singleton/numeric counter and dense floating
  moment tensors of the mapped parameter's shape. Finite negative second
  moments are refused; AMSGrad state also requires its maximum second moment.
- Counters must be integral, nonnegative and no greater than completed updates.
  The discriminator bound excludes its `gan_on_step` warmup.
- Unused parameters may have absent/empty lazy state or fewer updates. Legacy
  numeric counters remain supported. NaN/Inf numeric state retains the existing
  `NONFINITE_TRAINING` failure receipt and hash-finalized experiment log.

This does not authenticate same-shaped unnamed-parameter permutations or erased
but plausible history. There is no new checkpoint format or training recipe.

## Executable qualification

Qualified implementation: `275aab24140038c8ca1928ab556d8579c084d592`, tree
`3ce130f8d35b8b64010554a9b96d529bc3b085dc`. Later changes in this PR are this
factual report only. Exact workflow Python commands ran locally on macOS arm64:

- CPU-torch lane: **162 passed, zero skips**, using torch 2.11.0 and CPU gloo.
- Dependency-light lane: **139 discovered, 124 passed, 15 optional skips**.
- The new ten-method module is explicitly in the CPU workflow. It exercises
  28 final/periodic invalid-state cases, opaque-ID and legacy controls, lazy
  discriminator state, six legacy nonfinite-counter failure receipts, and two
  bounded one-bad-rank gloo refusals. Existing numerical/profile/dataset tests
  are also rerun by the full CPU lane.
- Maintained formatting and codec/publish boundaries passed. Resume and the new
  test module passed Ruff E9/F/I. `train.py` retains the same three pre-existing
  Ruff diagnostics as the baseline; no full Python lint pass is claimed.

The Python lanes overlap. `qualification.json` binds commands/results to the
clean implementation commit. An earlier qualification invocation incorrectly
resolved the venv interpreter symlink and lacked torch; its failed import log
and receipt remain in `qualification-environment-failure/`. The corrected
invocation asserts its CPU-torch/gloo environment before executing tests.

No successful GitHub Actions execution, unrelated JS/build rerun, CUDA/NCCL,
real corpus, exact loader/per-rank RNG replay, target-host performance or image
quality qualification is claimed. This adds a one-time state scan at resume;
it has not been benchmarked on a target training host. No paid inference, GPU
training, large experiment, pretrained download or weight release occurred.
