"""Post-training integrity audit for a tokenizer checkpoint.

Read-only. Verifies a step_*.pt against its sibling manifest and itself:
  - SHA256 of the .pt (recompute) vs a manifest digest field if one exists
  - state_dict loads; param/tensor counts; scan EVERY float tensor for NaN/inf
  - report training step recorded in ckpt vs manifest
  - codebook embedding norm stats (sanity: not all-zero / not exploded)

No repo imports -> runs anywhere with torch. Prints a report to stdout.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os

import torch


def sha256(path: str, buf: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(buf), b""):
            h.update(chunk)
    return h.hexdigest()


def find_digest(m: dict) -> tuple[str, str] | None:
    keys = ("sha256", "sha", "digest", "checkpoint_sha256", "hash", "weights_sha256")
    for k in keys:
        if isinstance(m.get(k), str):
            return (k, m[k])
    for parent in ("checkpoint", "artifact", "receipt"):
        sub = m.get(parent)
        if isinstance(sub, dict):
            for k in keys:
                if isinstance(sub.get(k), str):
                    return (f"{parent}.{k}", sub[k])
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    args = ap.parse_args()
    ck = args.ckpt

    print(f"[integ] ckpt={ck}")
    print(f"[integ] size_bytes={os.path.getsize(ck)}")
    digest = sha256(ck)
    print(f"[integ] sha256={digest}")

    # checkpoints are step_XXXX.pt with sibling step_XXXX.manifest.json
    man = (ck[:-3] if ck.endswith(".pt") else ck) + ".manifest.json"
    if os.path.exists(man):
        with open(man) as f:
            m = json.load(f)
        print(f"[integ] manifest_keys={sorted(m.keys())}")
        print(f"[integ] manifest_step={m.get('step')}")
        found = find_digest(m)
        if found:
            match = found[1] == digest
            print(f"[integ] manifest_digest[{found[0]}]={found[1]} MATCH={match}")
        else:
            print("[integ] manifest has NO stored digest -> byte-compare impossible (GAP to fix)")
    else:
        print(f"[integ] NO manifest at {man}")

    ckpt = torch.load(ck, map_location="cpu", weights_only=True)
    print(f"[integ] ckpt_top_keys={sorted(ckpt.keys())}")
    print(f"[integ] step_in_ckpt={ckpt.get('step')}")

    sd = ckpt["model"]
    sd = {k[len('module.'):] if k.startswith('module.') else k: v for k, v in sd.items()}
    tensors = [(k, v) for k, v in sd.items() if torch.is_tensor(v)]
    n_params = sum(v.numel() for _, v in tensors)
    bad = []
    for k, v in tensors:
        if v.is_floating_point() and (torch.isnan(v).any() or torch.isinf(v).any()):
            bad.append(k)
    print(f"[integ] tensors={len(tensors)} params={n_params:,}")
    print(f"[integ] nan_or_inf_tensors={len(bad)} {bad[:8]}")

    cb = next((sd[k] for k in sd if k.endswith('quantize.embedding.weight')), None)
    if cb is not None:
        norms = cb.float().norm(dim=1)
        zero = int((norms == 0).sum())
        print(f"[integ] codebook shape={tuple(cb.shape)} "
              f"norm[min/mean/max]={norms.min():.4f}/{norms.mean():.4f}/{norms.max():.4f} "
              f"zero_norm_rows={zero}")

    print("[integ] DONE")


if __name__ == "__main__":
    main()
