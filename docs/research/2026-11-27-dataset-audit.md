# Local dataset integrity audit — 2026-11-27

Implementation evidence for #718 and the G1 file-integrity slice of #400, with a
pre-device input fix: tokenizer preflight now rejects identical, nested or
symlink-aliased training/validation roots. This is engineering preparation, not
approval of a corpus, model, license posture or a new research architecture.

## Run without a GPU or weights

From the repository root in an environment with Pillow installed:

```sh
python -m research.training.audit_dataset \
  --train-root "$DATA/train" \
  --validation-root "$DATA/validation" \
  --eval-root "$DATA/final-eval" \
  --out-root artifacts/runs/dataset-audit-001
```

`--eval-root` is optional. Use a **fresh** output directory for every invocation;
inputs are read-only, and outputs must be outside all dataset roots. No network,
torch import, model initialization or weights download is involved. The default
per-image cap is 20 million pixels; `--max-pixels` is an explicit positive cap.
The supported suffixes match the folder loader: JPG/JPEG, PNG and WebP. Animated
or multi-frame images require separate curation and are rejected by this audit.

Outputs:

- `inventory.jsonl`: every candidate file's relative path, split, byte count,
  file SHA-256, decoded-RGB SHA-256 and dimensions, or an explicit error row.
- `dataset-audit.json`: source/tool/lockfile identity, Pillow version, limits,
  per-split counts/content hashes, inventory hash, bounded error/duplicate
  examples, technical status and unassessed gates.

Exit **0** means this technical audit passed; **1** means the recorded inventory
failed (duplicates, incomplete scan, decode errors or empty splits); **2** means
a bad invocation/environment such as overlapping roots or existing outputs.
A new failed attempt cannot overwrite a previous pass. Retain both runs.

The scan forces full image decoding. It rejects nested symlink directories and
symlink image files instead of silently claiming complete coverage. File hashes
catch byte copies; RGB hashes also catch different metadata/encodings that
produce identical dimensions and pixels. Both within-split and cross-split
exact duplicate groups fail. Counts are **groups per hash method**: one pair
can appear in both byte and RGB groups, so their sum is not a count of unique
affected images. The full inventory supports investigation beyond the bounded
examples.

## Interpretation boundary

The current duplicate index uses memory proportional to file count. Start with
a curated pilot corpus and measure memory before a large-corpus audit; this is
not a distributed 50M-image indexing service.

A pass is **not** `ready-for-training` or proof of independent evaluation:

- Verify rights, consent and checkpoint/distribution restrictions separately;
  a dataset index license or a `permissive` config flag is not clearance.
- Review near duplicates, resizes/crops, shared subjects and caption/teacher
  leakage separately. RGB hashing cannot establish semantic independence.
- Complete the DVC revision/content/remote restore checks in #400. This tool
  neither fetches data nor authenticates a DVC receipt.
- Keep the corpus immutable after auditing and bind any token cache to source
  bytes, preprocessing, checkpoint, codebook and split. File statistics detect
  common mutations during a single-file read, not a transactional snapshot or
  changes after the audit.
- Review the inventory before selecting samples. Do not tune on final-eval
  after reading results or silently drop failures to obtain a pass.

Fixture-only unit tests cover successful reports, corrupt/truncated images,
metadata-different identical pixels, duplicate groups, empty and optional
splits, symlinks, oversized images, path-independent identity, stale outputs
and CLI exit status. They demonstrate mechanics, not real-data readiness.
For broader allocation requirements see the
[roadmap](2026-11-27-compute-readiness-roadmap.md); target-definition questions
for learned models remain under #397/#398.
