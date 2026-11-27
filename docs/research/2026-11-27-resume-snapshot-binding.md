# Verified checkpoint snapshots on resume

Engineering closeout for [#739](https://github.com/p-to-q/wittgenstein/issues/739).

## Defect and repair

The cheap pre-device receipt check opened a checkpoint pathname separately from
`torch.load`. A controlled atomic replacement could therefore substitute a finite
model after verification, including when both files had exactly 18,008 bytes,
and receive successful zero-update acceptance under the old sibling receipt.
The reproduction is a consistency defect, not evidence of a production incident.

Training now explicitly requests receipt verification at its actual load seam.
One seekable descriptor is hashed, passed to `torch.load(weights_only=True)`, and
hashed again. File metadata catches ordinary in-place changes, including writes
that restore identical bytes. A pinned, shape-validated receipt supplies the
payload run-ID, step and current-corpus checks. Changed/missing receipt bytes are
refused. The old early dataset refusal before model construction is retained.

Load failures are coordinated before optimizer/DDP collectives; after optimizer
validation, every rank must agree on both checkpoint and raw receipt hashes.
Refusal precedes model/optimizer state loads and run-output mutation. Existing
optimizer error priorities and standalone legacy receipt-optional readers remain
compatible. `RESUME_INTEGRITY_INVALID` identifies snapshot-integrity failures.

Memory overhead for hashing is bounded to 1 MiB chunks; there is no second
in-memory checkpoint or temporary checkpoint copy. Actual loading adds two full
checkpoint reads beyond preflight. Target-host I/O overhead is unmeasured.

## Qualification

Clean implementation commit: `0f6760c` (full SHA and tree in local
`artifacts/runs/20261127-resume-snapshot-binding/qualification.json`). The later
closeout commit changes this report only.

- Exact local `training-cpu` workflow command: **172 tests passed, zero skips**.
- Dependency-light workflow command: **139 discovered; 124 passed, 15 optional
  skips**. These lanes overlap and must not be added together.
- Maintained Prettier checks, codec boundaries and npm publish-surface checks
  passed. Resume/new-regression Ruff E9/F/I passed; no full-repo lint claim.
- New module: `research.training.tokenizer.test_resume_snapshot`, explicitly in
  the CPU workflow. Its ten methods cover healthy final/periodic loads,
  descriptor lifecycle, same-size atomic replacement, post-load in-place writes,
  receipt corruption/replacement/deletion, corpus and payload identity, legacy
  reading, and three bounded two-rank gloo refusal cases (one bad receipt,
  different valid checkpoint pairs, identical checkpoint/different receipt).
- The exact original same-size pair was replayed. Original SHA-256
  `bda0756a9a68d68d6832b736708fb47646bce4e02d5e2f9d92ebf2c61911fb0c`;
  replacement `901b77c6eefec038539817ef3d1a64ba9cefcca85f921b87a4011880de22cfee`.
  Preflight passes, but the injected load refuses with
  `RESUME_INTEGRITY_INVALID`; no output directory is created. Raw local proof:
  `probe.py`, `after.json`, `after.log`, and `replay/` under the same run directory.
- An exploratory test fixture added an unsupported dataset field; schema
  validation correctly refused it. That fixture was corrected to distinct,
  schema-valid receipt bytes. The failed qualification/log are retained locally;
  the clean qualification above is authoritative.

These are local CPU results, not a claim that GitHub Actions ran or that an
independent reviewer approved. No paid inference, model downloads, GPU training,
real corpus, full VQGAN, CUDA/NCCL or image-quality qualification was performed.
This does not establish exact loader-cursor/per-rank RNG replay or authenticate
an adversary able to rewrite all evidence. Local proof is not an off-machine
backup. Existing corpus/rights, weight-identity and enforced-CI gates stay open.
