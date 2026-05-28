# Image adapter (Python)

Trains a **small MLP** that maps a canonical `ImageSceneSpec` (JSON, no `providerLatents`) to discrete latent indices. No LLM fine-tuning.

## Requirements

- Python 3.11+
- `pip install -r requirements.txt`

Apple Silicon: PyTorch uses MPS when available.

## Scripts

| Script | Purpose |
| --- | --- |
| `prepare_dataset.py` | `raw/metadata.jsonl` + images → `train/scenes.jsonl` |
| `encode_offline.py` | images → `target_tokens` (stub grid quantizer) → `train/encoded.jsonl` |
| `train.py` | trains MLP (PyTorch), writes `adapter_mlp.json` |
| `train_numpy.py` | same JSON contract, **pure NumPy + Adam** (no torch) — good for CI / parity with polyglot-style loops |
| `eval_metrics.py` | token MAE / exact-match rate on a held-out file |
| `eval_all.py` | one-shot runner: token metrics + spectrum health checks |
| `spectrum_check.py` | singular-value spectrum + effective-rank health checks for adapter weights (detect rank-collapse) |
| `build_natural_dataset.py` | optional: generate or download a larger, category-bounded dataset |

## Environment (runtime)

After training, point Node at the weights:

```bash
# Recommended: new model first, old weights as backup
export WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH=/absolute/path/to/adapter_mlp_new.json
export WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH=/absolute/path/to/adapter_mlp_old.json

# Legacy env names (same order: first = preferred, second = backup)
# export WITTGENSTEIN_IMAGE_ADAPTER_MLP_PATH=...
# export WITTGENSTEIN_IMAGE_ADAPTER_MLP_FALLBACK_PATH=...
```

`polyglot-mini/train/` (if present) implements a **stronger NumPy-only trainer** (He init, Adam, BCE, larger caption→painter-param dataset) but saves **`adapter.npz`**, not Wittgenstein’s **`adapter_mlp.json`**. It targets Code-as-Painter, not scene→VQ latents. To reuse that training philosophy here, keep exporting the same `witt.image.adapter.mlp/v0.1` JSON from `python/image_adapter/train.py`, or add a separate export script later.

## MiniMax `providerLatents`

If the text API returns validated `ImageLatentCodes` JSON under `providerLatents` in the scene spec, the harness **skips** this MLP and decodes those tokens directly. The MLP is for the common case: **spec-only** from the LLM.

## Spectrum health checks (M1B due diligence)

Singular-value spectrum and effective-rank are not “quality scores”. They are cheap probes for **rank collapse / low-rank bottlenecks** in adapter/projector training.

Run:

```bash
python3 spectrum_check.py --weights /absolute/path/to/adapter_mlp.json
```

Or run the bundle (token metrics + spectrum) in one command:

```bash
python3 eval_all.py --weights /absolute/path/to/adapter_mlp.json --data /absolute/path/to/encoded.jsonl
```
