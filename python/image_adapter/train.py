#!/usr/bin/env python3
"""Train small MLP: ImageSceneSpec features -> normalized token targets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset

from features import FEATURE_SCHEMA_SHA256, scene_dict_to_feature_vector

MLP_VERSION = "witt.image.adapter.mlp/v0.1"


class MlpAdapter(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, num_tokens: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, num_tokens)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = torch.relu(self.fc1(x))
        return torch.sigmoid(self.fc2(h))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "train" / "encoded.jsonl",
    )
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--hidden", type=int, default=256)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "data" / "image_adapter" / "artifacts" / "adapter_mlp.json",
    )
    args = parser.parse_args()

    if not args.data.is_file():
        raise SystemExit(f"Missing training file: {args.data}")

    rows: list[dict] = []
    with args.data.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    if len(rows) < 2:
        raise SystemExit("Need at least 2 encoded rows to train.")

    spec0 = rows[0]["image_scene_spec"]
    gw, gh = spec0["decoder"]["latentResolution"]
    num_tokens = gw * gh
    codebook_size = int(rows[0].get("codebook_size", 8192))

    xs: list[list[float]] = []
    ys: list[list[float]] = []
    for row in rows:
        spec = row["image_scene_spec"]
        toks = row["target_tokens"]
        if len(toks) != num_tokens:
            raise SystemExit(f"token length mismatch for {row.get('id')}")
        xs.append(scene_dict_to_feature_vector(spec))
        max_idx = max(0, codebook_size - 1)
        ys.append([t / max_idx for t in toks])

    x_t = torch.tensor(xs, dtype=torch.float32)
    y_t = torch.tensor(ys, dtype=torch.float32)

    device = torch.device("mps" if torch.backends.mps.is_available() else "cpu")
    model = MlpAdapter(128, args.hidden, num_tokens).to(device)
    opt = torch.optim.Adam(model.parameters(), lr=args.lr)
    loss_fn = nn.MSELoss()

    ds = TensorDataset(x_t, y_t)
    loader = DataLoader(ds, batch_size=min(args.batch_size, len(ds)), shuffle=True)

    model.train()
    for _epoch in range(args.epochs):
        total = 0.0
        for xb, yb in loader:
            xb = xb.to(device)
            yb = yb.to(device)
            opt.zero_grad()
            pred = model(xb)
            loss = loss_fn(pred, yb)
            loss.backward()
            opt.step()
            total += float(loss.detach().cpu())
        # print(f"epoch {_epoch+1} loss={total/len(loader):.6f}")

    model.eval()
    with torch.no_grad():
        w1 = model.fc1.weight.detach().cpu().numpy().reshape(-1).tolist()
        b1 = model.fc1.bias.detach().cpu().numpy().tolist()
        w2 = model.fc2.weight.detach().cpu().numpy().reshape(-1).tolist()
        b2 = model.fc2.bias.detach().cpu().numpy().tolist()

    dec = spec0["decoder"]
    payload = {
        "version": MLP_VERSION,
        "featureSchema": FEATURE_SCHEMA_SHA256,
        "codebookSize": codebook_size,
        "tokenGrid": [gw, gh],
        "inputDim": 128,
        "hiddenDim": args.hidden,
        "w1": w1,
        "b1": b1,
        "w2": w2,
        "b2": b2,
        "family": dec["family"],
        "codebook": dec["codebook"],
        "codebookVersion": dec["codebookVersion"],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
