#!/usr/bin/env python3
"""
Pure NumPy MLP trainer (Adam, He init, train/val split) — same export as train.py / mlp-runtime.ts.
No PyTorch. Style aligned with polyglot-mini/train/train.py.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np

from features import FEATURE_SCHEMA_SHA256, scene_dict_to_feature_vector

MLP_VERSION = "witt.image.adapter.mlp/v0.1"
INPUT_DIM = 128


def he_init(rng: np.random.Generator, fan_in: int, fan_out: int) -> np.ndarray:
    scale = np.sqrt(2.0 / fan_in)
    return rng.normal(0.0, scale, (fan_out, fan_in)).astype(np.float32)


def forward(
    x: np.ndarray,
    w1: np.ndarray,
    b1: np.ndarray,
    w2: np.ndarray,
    b2: np.ndarray,
) -> tuple[np.ndarray, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """x [B,I], w1 [H,I], w2 [O,H]. Returns y_hat [B,O], cache."""
    z1 = x @ w1.T + b1
    h = np.maximum(0, z1)
    z2 = h @ w2.T + b2
    y_hat = 1.0 / (1.0 + np.exp(-np.clip(z2, -30, 30)))
    return y_hat.astype(np.float32), (z1, h, z2)


def mse_loss(y_hat: np.ndarray, y: np.ndarray) -> float:
    return float(np.mean((y_hat - y) ** 2))


class Adam:
    def __init__(self, params: dict[str, np.ndarray], lr: float = 1e-3) -> None:
        self.lr = lr
        self.b1 = 0.9
        self.b2 = 0.999
        self.eps = 1e-8
        self.t = 0
        self.params = params
        self.ms = {k: np.zeros_like(v) for k, v in params.items()}
        self.vs = {k: np.zeros_like(v) for k, v in params.items()}

    def step(self, grads: dict[str, np.ndarray]) -> None:
        self.t += 1
        for k in self.params:
            g = grads[k].astype(np.float32)
            self.ms[k] = self.b1 * self.ms[k] + (1 - self.b1) * g
            self.vs[k] = self.b2 * self.vs[k] + (1 - self.b2) * (g * g)
            mh = self.ms[k] / (1 - self.b1**self.t)
            vh = self.vs[k] / (1 - self.b2**self.t)
            self.params[k] -= (self.lr * mh / (np.sqrt(vh) + self.eps)).astype(np.float32)


def backward_mse(
    x: np.ndarray,
    y: np.ndarray,
    y_hat: np.ndarray,
    z1: np.ndarray,
    h: np.ndarray,
    w2: np.ndarray,
) -> dict[str, np.ndarray]:
    """Gradients for W1, b1, W2, b2."""
    bsz, o = y_hat.shape
    dy_hat = (y_hat - y) * (2.0 / (bsz * o))
    dz2 = dy_hat * (y_hat * (1.0 - y_hat))
    dw2 = dz2.T @ h
    db2 = np.sum(dz2, axis=0)
    dh = dz2 @ w2
    dz1 = dh * (z1 > 0).astype(np.float32)
    dw1 = dz1.T @ x
    db1 = np.sum(dz1, axis=0)
    return {"w1": dw1, "b1": db1, "w2": dw2, "b2": db2}


def export_json(
    path: Path,
    w1: np.ndarray,
    b1: np.ndarray,
    w2: np.ndarray,
    b2: np.ndarray,
    *,
    codebook_size: int,
    gw: int,
    gh: int,
    hidden: int,
    dec: dict,
) -> None:
    payload = {
        "version": MLP_VERSION,
        "featureSchema": FEATURE_SCHEMA_SHA256,
        "codebookSize": codebook_size,
        "tokenGrid": [gw, gh],
        "inputDim": INPUT_DIM,
        "hiddenDim": hidden,
        "w1": w1.astype(np.float32).reshape(-1).tolist(),
        "b1": b1.astype(np.float32).reshape(-1).tolist(),
        "w2": w2.astype(np.float32).reshape(-1).tolist(),
        "b2": b2.astype(np.float32).reshape(-1).tolist(),
        "family": dec["family"],
        "codebook": dec["codebook"],
        "codebookVersion": dec["codebookVersion"],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "train" / "encoded.jsonl",
    )
    ap.add_argument("--epochs", type=int, default=120)
    ap.add_argument("--lr", type=float, default=3e-3)
    ap.add_argument("--batch-size", type=int, default=32)
    ap.add_argument("--hidden", type=int, default=256)
    ap.add_argument("--val-frac", type=float, default=0.1)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2]
        / "data"
        / "image_adapter"
        / "artifacts"
        / "adapter_mlp_numpy.json",
    )
    args = ap.parse_args()

    if not args.data.is_file():
        raise SystemExit(f"Missing training file: {args.data}")

    rows: list[dict] = []
    with args.data.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    if len(rows) < 4:
        raise SystemExit("Need at least 4 encoded rows.")

    spec0 = rows[0]["image_scene_spec"]
    gw, gh = spec0["decoder"]["latentResolution"]
    num_tokens = gw * gh
    codebook_size = int(rows[0].get("codebook_size", 8192))
    max_idx = max(0, codebook_size - 1)

    xs = np.stack([scene_dict_to_feature_vector(r["image_scene_spec"]) for r in rows], dtype=np.float32)
    ys = np.stack(
        [np.array([t / max_idx for t in r["target_tokens"]], dtype=np.float32) for r in rows],
        dtype=np.float32,
    )

    rng = np.random.default_rng(args.seed)
    n = len(rows)
    perm = rng.permutation(n)
    split = max(1, int(n * args.val_frac))
    tr_idx, va_idx = perm[split:], perm[:split]
    x_tr, y_tr = xs[tr_idx], ys[tr_idx]
    x_va, y_va = xs[va_idx], ys[va_idx]

    hdim = args.hidden
    o = num_tokens
    w1 = he_init(rng, INPUT_DIM, hdim)
    b1 = np.zeros(hdim, dtype=np.float32)
    w2 = he_init(rng, hdim, o) * 0.1
    b2 = np.full(o, 0.5, dtype=np.float32)

    params = {"w1": w1, "b1": b1, "w2": w2, "b2": b2}
    opt = Adam(params, lr=args.lr)

    best_val = 1e9
    t0 = time.time()
    bs = min(args.batch_size, len(x_tr))

    for ep in range(1, args.epochs + 1):
        order = rng.permutation(len(x_tr))
        for i in range(0, len(x_tr), bs):
            idx = order[i : i + bs]
            xb = x_tr[idx]
            yb = y_tr[idx]
            y_hat, (z1, h, _z2) = forward(xb, params["w1"], params["b1"], params["w2"], params["b2"])
            grads = backward_mse(xb, yb, y_hat, z1, h, params["w2"])
            opt.step(grads)

        y_va_hat, _ = forward(x_va, params["w1"], params["b1"], params["w2"], params["b2"])
        vl = mse_loss(y_va_hat, y_va)
        if vl < best_val:
            best_val = vl
            export_json(
                args.out,
                params["w1"],
                params["b1"],
                params["w2"],
                params["b2"],
                codebook_size=codebook_size,
                gw=gw,
                gh=gh,
                hidden=hdim,
                dec=spec0["decoder"],
            )

        if ep == 1 or ep % 20 == 0 or ep == args.epochs:
            y_tr_hat, _ = forward(x_tr, params["w1"], params["b1"], params["w2"], params["b2"])
            print(f"epoch {ep:4d}  train_mse={mse_loss(y_tr_hat, y_tr):.6f}  val_mse={vl:.6f}  best_val={best_val:.6f}")

    elapsed = time.time() - t0
    print(f"Wrote best checkpoint to {args.out}  (best_val_mse={best_val:.6f}, {elapsed:.1f}s)")


if __name__ == "__main__":
    main()
