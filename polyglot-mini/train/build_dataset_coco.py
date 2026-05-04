"""Build (caption, painter_params) training data from Karpathy-split COCO.

Input:  train/coco/dataset_coco.json  (from Stanford/Karpathy)
Images: http://images.cocodataset.org/<split>/<filename>
Output: train/data.jsonl with {"prompt": caption, "params": {...}}
"""
from __future__ import annotations
import argparse
import concurrent.futures
import io
import json
import os
import random
import sys
import subprocess
import numpy as np
from PIL import Image
from scipy import ndimage


def kmeans_palette(pixels: np.ndarray, k: int = 5, iters: int = 8, seed: int = 0):
    rng = np.random.default_rng(seed)
    n = len(pixels)
    idx = rng.choice(n, size=min(k, n), replace=False)
    centers = pixels[idx].astype(np.float32)
    for _ in range(iters):
        d = ((pixels[:, None, :] - centers[None, :, :]) ** 2).sum(-1)
        a = d.argmin(1)
        new = np.stack([
            pixels[a == j].mean(0) if (a == j).any() else centers[j]
            for j in range(len(centers))
        ])
        if np.allclose(new, centers, atol=0.5):
            centers = new; break
        centers = new
    order = np.argsort(centers.mean(1))
    centers = centers[order]
    while len(centers) < k:
        centers = np.concatenate([centers, centers[-1:]], 0)
    return [tuple(int(x) for x in c) for c in centers[:k]]


def extract_params(img: Image.Image) -> dict:
    img = img.convert("RGB")
    im = img.copy(); im.thumbnail((224, 224))
    arr = np.asarray(im, dtype=np.float32)
    h, w, _ = arr.shape
    flat = arr.reshape(-1, 3)
    rng = np.random.default_rng(0)
    if len(flat) > 3000:
        flat = flat[rng.choice(len(flat), 3000, replace=False)]
    palette = kmeans_palette(flat, k=5)

    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    gx = np.diff(lum, axis=1); gy = np.diff(lum, axis=0)
    gm = (np.abs(gx).mean() + np.abs(gy).mean()) / 2.0
    noise_scale = float(np.clip(2.0 + (40.0 / (gm + 1.0)), 2.0, 20.0))
    lum_b = ndimage.gaussian_filter(lum, sigma=2.0)
    hf = np.abs(lum - lum_b).mean() / (lum.mean() + 1e-6)
    grain = float(np.clip(hf, 0.0, 0.2))

    var = (lum - lum_b) ** 2
    if var.sum() > 0:
        ys, xs = np.mgrid[0:h, 0:w]
        cy = (ys * var).sum() / var.sum() / h
        cx = (xs * var).sum() / var.sum() / w
    else:
        cy = cx = 0.5
    dc = abs(cx - 0.5) + abs(cy - 0.5)
    if dc < 0.08:
        composition = "centered"
    elif abs((cx - 0.5) + (cy - 0.5)) > 0.18 or abs((cx - 0.5) - (cy - 0.5)) > 0.18:
        composition = "diagonal"
    else:
        composition = "rule-of-thirds"

    vb = ndimage.gaussian_filter(var, sigma=4.0)
    mx = ndimage.maximum_filter(vb, size=15)
    peaks = int(((vb == mx) & (vb > vb.mean() + vb.std())).sum())
    accent_count = int(np.clip(peaks, 2, 12))

    return {
        "palette": [list(c) for c in palette],
        "noise_scale": noise_scale,
        "grain": grain,
        "composition": composition,
        "accent_count": accent_count,
    }


def fetch(url: str, timeout: float = 10.0) -> Image.Image | None:
    try:
        out = subprocess.run(
            ["curl", "-sS", "--max-time", str(int(timeout)),
             "-A", "Mozilla/5.0 polyglot-train", url],
            capture_output=True, check=True,
        ).stdout
        if not out:
            return None
        return Image.open(io.BytesIO(out))
    except Exception:
        return None


def build(karpathy_path: str, out_path: str, n_images: int, workers: int, seed: int, log_every: int):
    with open(karpathy_path) as f:
        data = json.load(f)
    imgs = data["images"]
    random.Random(seed).shuffle(imgs)
    imgs = imgs[:n_images]

    urls: list[tuple[str, str]] = []
    for im in imgs:
        fn = im["filename"]
        fp = im.get("filepath", "val2014")
        # Karpathy coco uses val2014/train2014 folders on cocodataset
        url = f"http://images.cocodataset.org/{fp}/{fn}"
        # one caption
        sents = im.get("sentences", [])
        if not sents:
            continue
        cap = sents[0]["raw"].strip()
        urls.append((url, cap))

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    written = 0
    started_at = __import__("time").time()

    def _one(url_cap):
        url, cap = url_cap
        img = fetch(url)
        if img is None:
            return None
        try:
            return {"prompt": cap, "params": extract_params(img)}
        except Exception:
            return None

    with open(out_path, "w") as fout, concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        for rec in ex.map(_one, urls):
            if rec is None:
                continue
            fout.write(json.dumps(rec) + "\n"); fout.flush()
            written += 1
            if written % log_every == 0:
                rate = written / max(1e-6, __import__("time").time() - started_at)
                print(f"PROGRESS {written}/{len(urls)} ({rate:.1f}/s)", flush=True)
    print(f"DONE wrote={written} out={out_path}", flush=True)

    from data_manifest import build_manifest, write_manifest
    manifest_path = os.path.join(os.path.dirname(out_path) or ".", "data_manifest.json")
    manifest = build_manifest(
        output_path=out_path,
        seed=seed,
        n_requested=n_images,
        karpathy_input_path=karpathy_path,
    )
    write_manifest(manifest, manifest_path)
    print(f"DONE manifest={manifest_path}", flush=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--karpathy", default="train/coco/dataset_coco.json")
    ap.add_argument("--out", default="train/data.jsonl")
    ap.add_argument("-n", type=int, default=800)
    ap.add_argument("--workers", type=int, default=16)
    ap.add_argument("--log-every", type=int, default=25)
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    build(a.karpathy, a.out, n_images=a.n, workers=a.workers, seed=a.seed, log_every=a.log_every)
