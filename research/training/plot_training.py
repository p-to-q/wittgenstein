"""Plot training curves from a supervisor.log (offline, read-only).

Parses the per-step log lines emitted by research.training.tokenizer.train and
renders two figures + dumps the parsed series as JSON so every number on a plot
is traceable to source.

  python plot_training.py --log supervisor.log --out <dir>

Line format parsed:
  [step   33100/200000] lr=1.00e-04 l2=0.0506 lpips=0.1183 commit=-0.3594 \
      total=-0.1906 codebook_usage=0.9724 | imgs/s=135.3 elapsed=13781.0s
"""

from __future__ import annotations

import argparse
import json
import os
import re

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

LINE = re.compile(
    r"\[step\s+(?P<step>\d+)/\d+\].*?"
    r"l2=(?P<l2>[-\d.eE]+)\s+"
    r"lpips=(?P<lpips>[-\d.eE]+)\s+"
    r"commit=(?P<commit>[-\d.eE]+)\s+"
    r"total=(?P<total>[-\d.eE]+)\s+"
    r"codebook_usage=(?P<cb>[-\d.eE]+).*?"
    r"imgs/s=(?P<ips>[-\d.eE]+)"
)


def parse(path: str) -> dict[str, list[float]]:
    cols: dict[str, list[float]] = {k: [] for k in
                                    ("step", "l2", "lpips", "commit", "total", "cb", "ips")}
    with open(path) as f:
        for ln in f:
            m = LINE.search(ln)
            if not m:
                continue
            for k in cols:
                cols[k].append(float(m.group(k)))
    return cols


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--log", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    c = parse(args.log)
    n = len(c["step"])
    if n == 0:
        raise SystemExit("no step lines parsed — check log format")
    print(f"[plot] parsed {n} step records, step {c['step'][0]:.0f}..{c['step'][-1]:.0f}")

    with open(os.path.join(args.out, "training_series.json"), "w") as f:
        json.dump(c, f)

    # Figure 1: loss components
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.plot(c["step"], c["l2"], label="l2 (recon MSE)", lw=1)
    ax.plot(c["step"], c["lpips"], label="lpips (perceptual)", lw=1)
    ax.plot(c["step"], c["commit"], label="commit (VQ)", lw=1)
    ax.plot(c["step"], c["total"], label="total (incl. entropy term)", lw=1.4, color="k")
    ax.axhline(0, color="grey", lw=0.5, ls="--")
    ax.set_xlabel("step")
    ax.set_ylabel("loss")
    ax.set_title("Wittgenstein Phase-1.1 tokenizer — loss components (run 9f2c6a84, 54k steps)")
    ax.legend()
    ax.grid(alpha=0.3)
    f1 = os.path.join(args.out, "loss_components.png")
    fig.tight_layout()
    fig.savefig(f1, dpi=120)
    plt.close(fig)

    # Figure 2: codebook usage trajectory
    fig, ax = plt.subplots(figsize=(10, 4.5))
    ax.plot(c["step"], [v * 100 for v in c["cb"]], color="tab:green", lw=1)
    ax.set_ylim(0, 100)
    ax.set_xlabel("step")
    ax.set_ylabel("codebook usage (%)")
    ax.set_title("Codebook usage trajectory (anti-collapse: entropy_loss_ratio=0.05)")
    ax.grid(alpha=0.3)
    f2 = os.path.join(args.out, "codebook_usage.png")
    fig.tight_layout()
    fig.savefig(f2, dpi=120)
    plt.close(fig)

    # Console summary (so claims are evidence-backed)
    def at(step_target: float) -> int:
        return min(range(n), key=lambda i: abs(c["step"][i] - step_target))

    for s in (0, 1000, 8000, 22000, 44000, c["step"][-1]):
        i = at(s)
        print(f"[plot] step {c['step'][i]:6.0f}: l2={c['l2'][i]:.4f} "
              f"lpips={c['lpips'][i]:.4f} commit={c['commit'][i]:.4f} "
              f"total={c['total'][i]:.4f} cb={c['cb'][i]*100:.1f}% ips={c['ips'][i]:.1f}")
    print(f"[plot] wrote {f1}")
    print(f"[plot] wrote {f2}")
    print("[plot] DONE")


if __name__ == "__main__":
    main()
