#!/usr/bin/env python3
"""Report token MAE on an encoded JSONL (same format as train/encoded.jsonl)."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
import torch.nn as nn

from features import scene_dict_to_feature_vector


class MlpAdapter(nn.Module):
    def __init__(self, input_dim: int, hidden_dim: int, num_tokens: int) -> None:
        super().__init__()
        self.fc1 = nn.Linear(input_dim, hidden_dim)
        self.fc2 = nn.Linear(hidden_dim, num_tokens)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        h = torch.relu(self.fc1(x))
        return torch.sigmoid(self.fc2(h))


def load_weights(path: Path) -> tuple[MlpAdapter, dict]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if raw.get("version") != "witt.image.adapter.mlp/v0.1":
        raise SystemExit("Unsupported adapter file")
    gw, gh = raw["tokenGrid"]
    num_tokens = gw * gh
    hidden = raw["hiddenDim"]
    m = MlpAdapter(128, hidden, num_tokens)
    w1 = torch.tensor(raw["w1"], dtype=torch.float32).reshape(hidden, 128)
    b1 = torch.tensor(raw["b1"], dtype=torch.float32)
    w2 = torch.tensor(raw["w2"], dtype=torch.float32).reshape(num_tokens, hidden)
    b2 = torch.tensor(raw["b2"], dtype=torch.float32)
    m.fc1.weight.data = w1
    m.fc1.bias.data = b1
    m.fc2.weight.data = w2
    m.fc2.bias.data = b2
    m.eval()
    return m, raw


def evaluate_token_metrics(weights: Path, data: Path) -> dict:
    model, meta = load_weights(weights)
    codebook_size = int(meta["codebookSize"])
    max_idx = max(0, codebook_size - 1)

    rows = []
    with data.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                rows.append(json.loads(line))

    device = torch.device("cpu")
    model = model.to(device)
    total_abs = 0.0
    total_exact = 0
    count = 0
    with torch.no_grad():
        for row in rows:
            spec = row["image_scene_spec"]
            tgt = row["target_tokens"]
            x = torch.tensor([scene_dict_to_feature_vector(spec)], dtype=torch.float32, device=device)
            pred = model(x)[0].cpu().numpy()
            pred_tok = (pred * max_idx).round().astype(int)
            for a, b in zip(pred_tok, tgt):
                total_abs += abs(int(a) - int(b))
                if int(a) == int(b):
                    total_exact += 1
                count += 1

    mae = total_abs / max(1, count)
    acc = total_exact / max(1, count)
    return {
        "samples": len(rows),
        "token_mae": float(mae),
        "token_exact_rate": float(acc),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--data", type=Path, required=True)
    args = parser.parse_args()

    metrics = evaluate_token_metrics(args.weights, args.data)
    print(
        f"samples={metrics['samples']} "
        f"token_mae={metrics['token_mae']:.4f} "
        f"token_exact_rate={metrics['token_exact_rate']:.4f}"
    )


if __name__ == "__main__":
    main()
