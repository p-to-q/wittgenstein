# Resume corpus identity audit — 2026-11-27

Issue: [#733](https://github.com/p-to-q/wittgenstein/issues/733).

## Confirmed failure

On main `5fcdab670d00979a26f2e463da3f7ad20328c231`, replacing an image at the
configured training root did not prevent resume. A generated two-image/scalar
CPU reproduction completed two updates, replaced one image and resumed the
final checkpoint with **zero additional updates**. Both runs reported successful
acceptance with the same run ID and identical model parameters, but the second
manifest attributed the model to the replacement corpus. The content hash
changed while the filename index hashes stayed identical. Reusing the original
output root can replace earlier run evidence with this inconsistent attribution.

This is a software provenance failure, not an image-quality experiment.
`before.json` and `before.log` under the local evidence directory retain the
original successful-but-inconsistent checkpoint pairs. The executable
`verify_dataset_before.py` applies the added real-loop regression methods to the
original trainer without changing the checkout: two methods fail in nine cases
(eight file-change/checkpoint combinations and one revision change).

## Repair

The existing rank-0 content fingerprint is captured earlier, before model loading
or run-output mutation. Resume compares the checkpoint's required content hash
and dataset revision, plus optional index/count fields when recorded. Older
manifests without the additive fields remain supported. Missing or mismatched
dataset identity raises `ResumeDatasetDrift` (`RESUME_DATASET_DRIFT`). Rank 0
broadcasts startup status before DDP/model collectives so peers also stop on
refusal. The content scan is moved, not duplicated.

Regression fixtures cover replacement, addition, removal and renaming for both a
periodic checkpoint with work remaining and a zero-update final resume. They
assert byte-for-byte preservation of the original run directory on refusal.
Unchanged-corpus resumes and a bounded two-rank gloo refusal are exercised too.
This pre-model refusal writes no new success receipt; the original receipts
remain the evidence of the last completed attempt.

## Qualification and boundaries

Implementation: `b6140a9abbd0b2c9e8ddcea26730806d233d4002`, tree
`bbd7e956b78144f3518ca83039f311f9c622bb0e`. Subsequent changes in this PR are
reporting only. Exact current CI test commands were executed locally:

- CPU-torch lane: **143 passed, zero skips**.
- Dependency-light lane: **135 discovered, 120 passed, 15 optional skips**.
- Focused corpus/identity command: **13 passed**.
- Maintained formatting, dependency and publish-surface checks passed.
- Changed resume/test files passed Ruff E9/F/I; no universal Python lint claim.

The Python lanes overlap. No unrelated JavaScript test/build rerun is claimed.
The new real-loop module is explicitly included in the CPU CI job. These are
local macOS arm64 checks, not evidence that GitHub Actions ran or passed.

Local evidence: `artifacts/runs/20261127-resume-semantics-audit/`, including
`qualification.json` and raw per-command logs. Local preservation is not an
off-machine backup. The scan does not lock corpus files during training or prove
that every rank's mount is identical; immutable data/rights/remote restore (#400)
and exact loader/RNG continuation remain separate gates. There was no paid
inference, GPU training, large experiment, pretrained download or weight release.
