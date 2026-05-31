---
date: 2026-05-31
status: issue #519 placement decision
labels: [research-derived, governance, training, ci]
tracks: [#519, #507, #518, #441, #435]
---

# Training Homes Placement Decision

Issue #519 found a real tree-shape inconsistency: the doctrine named
`research/training/` as the training home, while the M1B adapter work added
`python/image_adapter/`. The fix is not a move today. The fix is to name the
two surfaces, constrain them, and add the missing CI floor.

## Decision

Keep both directories for now, with different names and different authority.

`research/training/` is the canonical Phase-1 training home. It owns GPU
tokenizer work, the learned seed-code adapter, the native image-emitting LLM
head, shared training manifests, lab execution, and eval helpers.

`python/image_adapter/` is a narrow M1B image-adapter bridge. It owns the
scene-spec-to-discrete-latent MLP, tiny data-prep scripts, PyTorch/NumPy
parity, and local bridge experiments.

The phrase "adapter training" is now ambiguous unless it includes the path:

- `research/training/adapter/` means the learned MaskGIT-style L4 seed-code
  adapter.
- `python/image_adapter/` means the scene-spec-to-VQ-latent MLP bridge.

This preserves the existing M1B adapter work without blessing `python/` as a
second general training tree.

## Why Not Move It Now

A directory move would be mostly churn today:

- `python/image_adapter/` already has data-prep scripts, env docs, and runtime
  handoff names used by the current image-adapter demo path.
- #518 already fenced `python/` out of the npm tarball, so there is no current
  publish-surface leak.
- The ongoing model-training work should not be interrupted by a cosmetic
  placement migration.

Moving becomes correct only if the surface grows into shared manifests, common
datasets, lab execution, or multi-GPU training. At that point, move or split the
grown part into `research/training/image-adapter/` through a focused PR.

## CI Floor

The missing engineering floor was real. `python/image_adapter/train_numpy.py`
claimed to be good for CI, but CI did not run it. The minimum lane is now:

```bash
python3 -m compileall python/image_adapter
python3 -m unittest discover -s python/image_adapter -p 'test_*.py' -v
```

The smoke uses a synthetic four-row encoded dataset and verifies that
`train_numpy.py` exports the `witt.image.adapter.mlp/v0.1` JSON contract:
version, codebook metadata, token grid, hidden/input dimensions, and flattened
weight shapes. It does not claim PyTorch training, real image data, or quality
metrics.

CI also treats `python/**` and `data/image_adapter/**` as code-scope changes,
so edits to this surface no longer bypass the Node/Python verification job.

## Publish Boundary

`python/image_adapter/` follows the same one-way rule as `research/training/`:

```text
training/research Python  --may import-->  packages/<pkg>/src/
packages/<pkg>/src/       --must not---->  training/research Python
```

The publish guard already blocks `research/`, `python/`, `polyglot-mini/`,
`benchmarks/`, `examples/`, and heavyweight model artifacts from npm tarballs.
The import guard now also rejects package-source imports from `python/`, not
only `research/`.

## Closeout

#519 can close when this decision, the README cross-links, the CI scope update,
the NumPy smoke, and the import-guard widening land together. No model
training, lab run, or directory migration is required for this closeout.
