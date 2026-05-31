"""Generate tokenizer training closeout artifacts.

This wraps the existing read-only audit tools:
  - plot_training.py -> loss/codebook figures + parsed JSON
  - integrity_check.py -> checkpoint hash/tensor/codebook audit
  - recon_check.py -> one-image reconstruction spot-check

It also writes a short CLOSEOUT.md with command outputs embedded so the result
is reviewable without re-running every tool.
"""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


def run(cmd: list[str], cwd: Path, out_file: Path) -> int:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(cwd) + os.pathsep + env.get("PYTHONPATH", "")
    proc = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    out_file.write_text(proc.stdout)
    return proc.returncode


def latest_checkpoint(run_root: Path) -> Path:
    candidates = sorted(run_root.glob("**/ckpts/step_*.pt"))
    candidates.extend(sorted(run_root.glob("**/ckpts/final.pt")))
    if not candidates:
        raise FileNotFoundError(f"no step_*.pt or final.pt under {run_root}")
    return max(candidates, key=lambda p: p.stat().st_mtime)


def main() -> int:
    parser = argparse.ArgumentParser(description="Close out a tokenizer training run.")
    parser.add_argument("--repo-root", default=".")
    parser.add_argument("--log", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--ckpt", default="")
    parser.add_argument("--run-root", default="")
    parser.add_argument("--data", default="", help="Image folder for recon spot-check.")
    parser.add_argument("--title", default="")
    args = parser.parse_args()

    repo = Path(args.repo_root).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    log = Path(args.log).resolve()
    if args.ckpt:
        ckpt = Path(args.ckpt).resolve()
    elif args.run_root:
        ckpt = latest_checkpoint(Path(args.run_root).resolve())
    else:
        raise SystemExit("--ckpt or --run-root is required")

    plot_out = out / "plots"
    plot_out.mkdir(parents=True, exist_ok=True)
    plot_log = out / "plot_training.txt"
    integ_log = out / "integrity_check.txt"
    recon_log = out / "recon_check.txt"

    commands: list[tuple[str, int, Path]] = []
    plot_cmd = [
        sys.executable,
        "research/training/plot_training.py",
        "--log",
        str(log),
        "--out",
        str(plot_out),
    ]
    if args.title:
        plot_cmd += ["--title", args.title]
    commands.append(("plot_training", run(plot_cmd, repo, plot_log), plot_log))

    integ_cmd = [
        sys.executable,
        "research/training/integrity_check.py",
        "--ckpt",
        str(ckpt),
    ]
    commands.append(("integrity_check", run(integ_cmd, repo, integ_log), integ_log))

    if args.data:
        recon_dir = out / "recon"
        recon_cmd = [
            sys.executable,
            "research/training/recon_check.py",
            "--ckpt",
            str(ckpt),
            "--data",
            str(Path(args.data).resolve()),
            "--out",
            str(recon_dir),
        ]
        commands.append(("recon_check", run(recon_cmd, repo, recon_log), recon_log))
    else:
        recon_log.write_text("[closeout] skipped: --data not provided\n")
        commands.append(("recon_check", 0, recon_log))

    md = out / "CLOSEOUT.md"
    lines = [
        "# Tokenizer Training Closeout",
        "",
        f"- generatedAt: {datetime.now(timezone.utc).isoformat()}",
        f"- log: `{log}`",
        f"- checkpoint: `{ckpt}`",
        f"- outputDir: `{out}`",
        "",
        "## Boundary",
        "",
        "This is a training/audit closeout. A checkpoint trained on research-only data is not publishable unless the manifest explicitly records a permissive weights license and downstream release gates pass.",
        "",
        "## Command Results",
        "",
    ]
    failed = False
    for name, rc, path in commands:
        failed = failed or rc != 0
        lines += [
            f"### {name}",
            "",
            f"- exitCode: {rc}",
            f"- output: `{path}`",
            "",
            "```text",
            path.read_text()[-8000:].rstrip(),
            "```",
            "",
        ]
    lines += [
        "## Artifacts",
        "",
        f"- plots: `{plot_out}`",
        f"- parsed series: `{plot_out / 'training_series.json'}`",
        f"- loss plot: `{plot_out / 'loss_components.png'}`",
        f"- codebook plot: `{plot_out / 'codebook_usage.png'}`",
    ]
    if args.data:
        lines.append(f"- reconstruction spot-check: `{out / 'recon'}`")
    md.write_text("\n".join(lines) + "\n")
    print(f"[closeout] wrote {md}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
