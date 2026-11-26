# Tokenizer evaluation integrity — 2026-11-27

Engineering correction for #715, following the compute-readiness roadmap's
requirement that a smoke or receipt is not a scientific result. No model,
modality, metric definition or manifest schema is introduced.

## Corrected behavior

- Validation decoding fails on a corrupt file. It no longer replaces an image
  with a previous sample or zeros. Training retains its documented replacement
  behavior and corrupt tally, now iteratively rather than recursively; long
  corrupt runs cannot exhaust the Python call stack. A training corruption
  count still requires investigation before interpreting a run.
- Empty evaluation, missing requested codebook coverage, missing/failed rFID,
  and nonfinite rFID are explicit degradation. `computed_metrics.rfid` becomes
  true only after a finite result. Bad reconstruction shapes and nonfinite
  pixels fail before uint8 conversion can conceal them.
- Temporary rFID images are cleaned on success and on model/loader failure.
  Model train/eval mode is restored in `finally`.
- Partial numeric snapshots may be retained, but their degradation reaches
  the existing acceptance `eval_failed`/`eval_failure_reason` fields and the
  experiment failure event. A saved checkpoint is not complete evaluation.
- Synthetic validation starts after the 64 synthetic training sample seeds;
  previous overlapping smoke metrics were plumbing evidence, not held-out
  generalization evidence, and should not be reused as such.
- Evaluation dataset SHA now binds content hashes (with multiplicity),
  preprocessing size, and synthetic seed/count rather than absolute filenames
  alone. Moving identical bytes between mounts preserves identity. Bytes are
  checked before and after evaluation; a detected change refuses the snapshot.
  This is not a transactional filesystem snapshot: use an immutable corpus.
  Historical receipts keep their old meaning; the shared schema is unchanged.

## Verification and remaining limits

CPU tests inject corrupt files, a long corrupt run, missing/failing metrics,
nonfinite reconstructions, changed validation bytes and model exceptions. They
exercise successful partial results as well as failure receipts, and are wired
into the CPU-torch CI lane. Optional metric implementations are replaced with
controlled test doubles: no metric weights are downloaded and no research model
is trained. The two-rank one-parameter regression still checks real DDP wiring.

This does not establish licensed data, near-duplicate removal, scientific
quality, CUDA/NCCL parity, exact distributed resume, or a learned adapter/LLM
head. See the [compute-readiness roadmap](2026-11-27-compute-readiness-roadmap.md)
for the still-open gates. Local evidence is retained under the ignored
`artifacts/runs/20261127-robustness-phase/` directory, including the failing
pre-fix regressions; Linux Actions qualification remains separate (#661).
