# Reproducibility

Every CLI invocation creates `artifacts/runs/<run-id>/manifest.json`.

## Manifest Fields

- git SHA
- lockfile hash
- Node version
- Wittgenstein version
- command and args
- seed
- codec and route
- provider and model
- prompt raw and prompt expanded
- raw model output and parsed output
- artifact path and artifact hash
- duration, success flag, structured error

## Sibling Files

- `llm-input.txt`
- `llm-output.txt`
- final artifact when rendering succeeds

## Seed Rules

- CLI can pass `--seed`.
- Config can provide `runtime.defaultSeed`.
- The resolved seed is written to the manifest even on failure.

## Training-data sampling lock

The `polyglot-mini` adapter-training data pipeline emits its own deterministic receipt: `polyglot-mini/train/data_manifest.json` records the seed, the requested sample count, the actual write count, the SHA-256 of the produced `data.jsonl`, and the SHA-256 of the canonical (sorted) prompt list. Re-running `build_dataset_coco.py` against the same Karpathy split with the same seed reproduces the same hashes. See `polyglot-mini/train/data_manifest.py` for the helper and Issue #114 for context.

## Why This Exists

The manifest spine is the main quality bar in this scaffold. A failing run is still useful if it leaves a complete trace.
