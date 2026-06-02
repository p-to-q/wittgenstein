# Image adapter training data

Provide a **narrow-domain** captioned image set for v1 adapter training (no LLM weights required).

## Current tracked snapshot

The checked-in `raw/images/` files are hackathon-era archive material, not the
current M1B training corpus:

- `1.jpg` through `24.jpg` are downloaded web samples that were used as early
  image-training examples. A few are still used by the TypeScript
  placeholder/reference decoder bridge.
- `nat_*.jpg` are very early trained/generated outputs from the same period,
  likely paired with prompt-like captions in `metadata.jsonl`. They are useful
  as provenance for the early adapter experiments, not as current training
  evidence.
- `metadata.jsonl` only records a subset of the files in `raw/images/`; it is
  not a complete dataset manifest.

Keep this directory as a hackathon archive / smoke fixture unless a future
DVC-pinned dataset replaces it. Do not describe these files as recent adapter
training data or as evidence that M1B has a publishable image adapter.

## Layout

```
data/image_adapter/raw/
  images/              # image files (png, jpg, webp)
  metadata.jsonl       # one JSON object per line
```

## `metadata.jsonl` fields (required)

| Field | Type | Description |
| --- | --- | --- |
| `id` | string | Stable unique id |
| `image_path` | string | Path relative to `raw/`, e.g. `images/foo.jpg` |
| `caption` | string | Main text description |

## Optional fields

| Field | Type |
| --- | --- |
| `subject` | string |
| `style` | string |
| `constraints_negative` | string[] |

## Quick bootstrap (bounded “natural landscape” set)

From repo root, with `python/image_adapter/.venv` activated:

```bash
python python/image_adapter/build_natural_dataset.py --count 200 --synthetic-only
```

This writes ~200 images under `raw/images/` plus `metadata.jsonl`, using **only six rotating subtypes** (mountain / forest / lake / coastal / meadow / desert) so labels stay tight. Omit `--synthetic-only` to try network downloads first (picsum), with synthetic fallback per image if a download fails.

## Next steps

1. Run `python/image_adapter/prepare_dataset.py` to build `train/scenes.jsonl` (canonical `ImageSceneSpec` rows).
2. Run `python/image_adapter/encode_offline.py` to append `target_tokens` per image (stub quantizer aligned with the placeholder decoder).
3. Run `python/image_adapter/train.py` to produce `adapter_mlp.json`.
4. Point `WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH` (new) and optionally `WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH` (backup) at those files when running the Wittgenstein CLI (see root `.env.example`).

See [python/image_adapter/README.md](../../python/image_adapter/README.md) for details.
