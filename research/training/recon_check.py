"""Reconstruction spot-check for a trained tokenizer checkpoint.

Loads a step_*.pt, infers (codebook_size, embed_dim) from the saved weights
(so we never guess the config), encodes+decodes one real image, and writes
before/after PNGs plus an L2/PSNR number. Validation only -- a checkpoint
trained on research-only data is not publishable.

Run:
  CUDA_VISIBLE_DEVICES="" PYTHONPATH=. python research/training/recon_check.py \
      --ckpt <path/to/step_XXXXXXXX.pt> \
      --data <path/to/image/folder> \
      --out  <output/dir>

The `.pt` payload is written by `_write_checkpoint` (`train.py`) as
{"model", "step", "optimizer", ...}: the checkpoint-native step key is `step`,
distinct from the canonical *manifest* field `stepCount`. `checkpoint_step`
reads that native key (importable without torch) and accepts `stepCount` as a
forward-compatible alias.
"""

from __future__ import annotations

import argparse
import glob
import os


def checkpoint_step(payload: dict) -> int:
    """Resolve the step from a checkpoint payload.

    Prefers the checkpoint-native `step` key (see `_write_checkpoint`); falls
    back to the canonical manifest name `stepCount` if a future payload uses it.
    Returns -1 when neither is present so callers can report "unknown" honestly.
    """
    raw = payload.get("step", payload.get("stepCount", -1))
    return int(raw)


def find_image(root: str) -> str:
    for ext in ("*.jpg", "*.jpeg", "*.png"):
        hits = glob.glob(os.path.join(root, "**", ext), recursive=True)
        if hits:
            return sorted(hits)[0]
    raise FileNotFoundError(f"no images under {root}")


def load_image(path: str, size: int):
    """Center-crop to square, resize to `size`, normalize to [-1, 1] (LlamaGen)."""
    import numpy as np
    import torch
    from PIL import Image

    img = Image.open(path).convert("RGB")
    w, h = img.size
    s = min(w, h)
    img = img.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))
    img = img.resize((size, size), Image.BICUBIC)
    t = torch.from_numpy(np.asarray(img, dtype="float32")).permute(2, 0, 1) / 255.0
    return (t * 2.0 - 1.0).unsqueeze(0)  # [1,3,H,W] in [-1,1]


def to_png(t, path: str) -> None:
    """t: [1,3,H,W] or [3,H,W] in [-1,1] -> uint8 PNG."""
    from PIL import Image

    x = t.detach().float().cpu()
    if x.dim() == 4:
        x = x[0]
    arr = ((x.clamp(-1, 1) + 1.0) * 127.5).round().byte().permute(1, 2, 0).numpy()
    Image.fromarray(arr).save(path)


def main() -> None:
    import torch

    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--size", type=int, default=256)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    step = checkpoint_step(ckpt)
    sd = ckpt["model"]
    sd = {k[len("module."):] if k.startswith("module.") else k: v for k, v in sd.items()}

    cb_key = next(
        (k for k in sd if k.endswith("quantize.embedding.weight")
         or k.endswith("codebook.weight")
         or (k.endswith("embedding.weight") and sd[k].dim() == 2 and sd[k].shape[0] >= 1024)),
        None,
    )
    if cb_key is None:
        raise RuntimeError(f"could not find codebook weight; keys sample: {list(sd)[:8]}")
    K, D = int(sd[cb_key].shape[0]), int(sd[cb_key].shape[1])
    print(f"[recon] ckpt={args.ckpt} step={step} codebook K={K} D={D} (key={cb_key})")

    from research.training.tokenizer.model import TokenizerConfig, build_tokenizer

    cfg = TokenizerConfig(codebook_size=K, codebook_embed_dim=D)
    model = build_tokenizer(cfg)
    missing, unexpected = model.load_state_dict(sd, strict=False)
    print(f"[recon] load_state_dict missing={len(missing)} unexpected={len(unexpected)}")
    if missing:
        print(f"[recon]   missing sample: {missing[:6]}")
    if unexpected:
        print(f"[recon]   unexpected sample: {unexpected[:6]}")
    model.eval().to(device)

    img_path = find_image(args.data)
    x = load_image(img_path, args.size).to(device)
    print(f"[recon] image={img_path} shape={tuple(x.shape)}")

    with torch.no_grad():
        try:
            quant, _, _ = model.encode(x)
            rec = model.decode(quant)
            mode = "encode/decode"
        except Exception as e:
            print(f"[recon] encode/decode path failed ({e!r}); using forward()")
            out = model(x)
            rec = out[0] if isinstance(out, (tuple, list)) else out
            mode = "forward"

    l2 = torch.mean((x - rec) ** 2).item()
    psnr = 10.0 * torch.log10(torch.tensor(4.0 / max(l2, 1e-12))).item()  # data range 2
    before = os.path.join(args.out, f"step{step:08d}_before.png")
    after = os.path.join(args.out, f"step{step:08d}_after.png")
    to_png(x, before)
    to_png(rec, after)
    print(f"[recon] mode={mode} L2(MSE)={l2:.5f} PSNR={psnr:.2f}dB")
    print(f"[recon] wrote {before}")
    print(f"[recon] wrote {after}")
    print("[recon] DONE")


if __name__ == "__main__":
    main()
