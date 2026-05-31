# Image Adapters

## Runtime

- **`mlp-runtime.ts`** — loads `witt.image.adapter.mlp/v0.1` JSON (from `python/image_adapter/train.py`). Forward pass must stay aligned with Python training code. v0.1 weights use `featureSchema: witt.image.adapter.features/sha256-canonical-json-v0`; legacy weights may omit the field, but CLIP/SigLIP-conditioned adapters must use a new declared runtime contract rather than this SHA baseline.
- **`adapter-resolve.ts`** — tries **preferred (new)** then **legacy (backup)**:
  - `WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH` → else `WITTGENSTEIN_IMAGE_ADAPTER_MLP_PATH`
  - then `WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH` → else `WITTGENSTEIN_IMAGE_ADAPTER_MLP_FALLBACK_PATH`
  - skips unloadable files and `tokenGrid` mismatches before the deterministic placeholder.
- **`placeholder.ts`** — legacy placeholder metadata for checkpoints (optional).

## Expected future contents

- ONNX or alternative bridge loaders if you move inference out of Node
- Codebook / tokenizer version pinning utilities
