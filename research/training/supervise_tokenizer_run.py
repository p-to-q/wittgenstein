"""Wall-clock supervisor for long tokenizer training runs.

Runs `research.training.tokenizer.train` under torchrun, resumes from the
latest step checkpoint, and stops cleanly when the wall-clock budget expires.
Designed for shared single-node GPU boxes where SSH sessions may disconnect.

Example:
  setsid nohup python -m research.training.supervise_tokenizer_run \
    --repo-root /nfsdata/wxu/wittgenstein \
    --train-data-root /nfsdata/wxu/datasets/LLaVA-Pretrain/images \
    --out-root /nfsdata/wxu/wittgenstein/runs/run6h \
    --resume-from /nfsdata/wxu/wittgenstein/runs/run6h/tokenizer-20260530T214518Z-9f2c6a84/ckpts/step_00054000.pt \
    --gpus 0,2,1,3 --nproc-per-node 4 --batch-size-per-gpu 12 \
    --max-steps 200000 --entropy-loss-ratio 0.05 --checkpoint-every 1000 \
    --deadline-hours 18 --log /nfsdata/wxu/wittgenstein/run_resume.log &
"""

from __future__ import annotations

import argparse
import os
import re
import signal
import subprocess
import sys
import time
from pathlib import Path


STEP_RE = re.compile(r"step_(\d+)\.pt$")


def checkpoint_step(path: Path) -> int:
    match = STEP_RE.match(path.name)
    if not match:
        return -1
    return int(match.group(1))


def latest_step_checkpoint(out_root: Path, fallback: Path | None) -> Path | None:
    candidates = [p for p in out_root.glob("**/ckpts/step_*.pt") if checkpoint_step(p) >= 0]
    if fallback is not None and fallback.exists() and checkpoint_step(fallback) >= 0:
        candidates.append(fallback)
    if not candidates:
        return fallback if fallback is not None and fallback.exists() else None
    return max(candidates, key=lambda p: (checkpoint_step(p), p.stat().st_mtime))


def git_sha(repo_root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"],
            cwd=repo_root,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except Exception:
        return ""


def build_train_cmd(args: argparse.Namespace, resume: Path | None) -> list[str]:
    cmd = [
        "torchrun",
        "--nproc-per-node",
        str(args.nproc_per_node),
        "--master-port",
        str(args.master_port),
        "-m",
        "research.training.tokenizer.train",
        "--train-data-root",
        args.train_data_root,
        "--out-root",
        args.out_root,
        "--max-steps",
        str(args.max_steps),
        "--batch-size-per-gpu",
        str(args.batch_size_per_gpu),
        "--codebook-embed-dim",
        str(args.codebook_embed_dim),
        "--lr",
        str(args.lr),
        "--seed",
        str(args.seed),
        "--num-workers",
        str(args.num_workers),
        "--checkpoint-every",
        str(args.checkpoint_every),
        "--dataset-license",
        args.dataset_license,
    ]
    if args.val_data_root:
        cmd += ["--val-data-root", args.val_data_root]
    if args.entropy_loss_ratio is not None:
        cmd += ["--entropy-loss-ratio", str(args.entropy_loss_ratio)]
    if args.gan:
        cmd += ["--gan", "--gan-on-step", str(args.gan_on_step)]
    else:
        cmd += ["--no-gan"]
    if args.no_lpips:
        cmd += ["--no-lpips"]
    if resume is not None:
        cmd += ["--resume-from", str(resume)]
    return cmd


def terminate_process_group(proc: subprocess.Popen[bytes], log) -> int:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return proc.poll() or 0
    except Exception as exc:
        print(f"[supervise] failed to SIGTERM process group: {exc}", file=log, flush=True)
    try:
        return proc.wait(timeout=30)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        return proc.wait()


def run_once(args: argparse.Namespace, cmd: list[str], env: dict[str, str], remain: float, log) -> int:
    print(f"[supervise] launching timeout={remain:.0f}s cmd={' '.join(cmd)}", file=log, flush=True)
    proc = subprocess.Popen(
        cmd,
        cwd=args.repo_root,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    try:
        return proc.wait(timeout=remain)
    except subprocess.TimeoutExpired:
        print("[supervise] deadline timeout; sending SIGTERM to torchrun", file=log, flush=True)
        terminate_process_group(proc, log)
        return 124


def main() -> int:
    parser = argparse.ArgumentParser(description="Resume and supervise tokenizer training.")
    parser.add_argument("--repo-root", required=True)
    parser.add_argument("--train-data-root", required=True)
    parser.add_argument("--out-root", required=True)
    parser.add_argument("--resume-from", default="")
    parser.add_argument("--val-data-root", default="")
    parser.add_argument("--log", required=True)
    parser.add_argument("--deadline-hours", type=float, required=True)
    parser.add_argument("--restart-delay-sec", type=float, default=30.0)
    parser.add_argument("--gpus", default="")
    parser.add_argument("--nproc-per-node", type=int, default=4)
    parser.add_argument("--master-port", type=int, default=29701)
    parser.add_argument("--max-steps", type=int, default=200_000)
    parser.add_argument("--batch-size-per-gpu", type=int, default=12)
    parser.add_argument("--codebook-embed-dim", type=int, default=32)
    parser.add_argument("--entropy-loss-ratio", type=float, default=0.05)
    parser.add_argument("--checkpoint-every", type=int, default=1000)
    parser.add_argument("--lr", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--num-workers", type=int, default=8)
    parser.add_argument(
        "--dataset-license",
        choices=["research-only", "permissive"],
        default="research-only",
    )
    parser.add_argument("--gan", action="store_true")
    parser.add_argument("--gan-on-step", type=int, default=20_000)
    parser.add_argument("--no-lpips", action="store_true")
    args = parser.parse_args()

    args.repo_root = Path(args.repo_root).resolve()
    out_root = Path(args.out_root).resolve()
    fallback = Path(args.resume_from).resolve() if args.resume_from else None
    log_path = Path(args.log).resolve()
    log_path.parent.mkdir(parents=True, exist_ok=True)
    initial_resume = latest_step_checkpoint(out_root, fallback)
    if args.resume_from and initial_resume is None:
        message = (
            f"[supervise] requested --resume-from {fallback} but no usable "
            f"step checkpoint exists under {out_root}; refusing to start fresh"
        )
        with open(log_path, "a", buffering=1) as log:
            print(message, file=log, flush=True)
        print(message, file=sys.stderr)
        return 2

    env = os.environ.copy()
    env.setdefault("PYTHONUNBUFFERED", "1")
    env.setdefault("PYTHONDONTWRITEBYTECODE", "1")
    env.setdefault("PYTORCH_ALLOC_CONF", "expandable_segments:True")
    if args.gpus:
        env["CUDA_VISIBLE_DEVICES"] = args.gpus
    env.setdefault("WITT_GIT_SHA", git_sha(args.repo_root))
    env["PYTHONPATH"] = str(args.repo_root) + os.pathsep + env.get("PYTHONPATH", "")

    deadline = time.monotonic() + args.deadline_hours * 3600.0
    attempt = 0
    last_rc = 1
    with open(log_path, "a", buffering=1) as log:
        print(f"[supervise] start repo={args.repo_root} out_root={out_root}", file=log, flush=True)
        print(f"[supervise] gpus={env.get('CUDA_VISIBLE_DEVICES', '<unset>')} git={env.get('WITT_GIT_SHA', '')}", file=log, flush=True)
        while time.monotonic() < deadline:
            attempt += 1
            remain = max(1.0, deadline - time.monotonic())
            resume = latest_step_checkpoint(out_root, fallback)
            print(
                f"[supervise] attempt={attempt} remain={remain:.0f}s resume={resume or 'none'}",
                file=log,
                flush=True,
            )
            cmd = build_train_cmd(args, resume)
            last_rc = run_once(args, cmd, env, remain, log)
            latest = latest_step_checkpoint(out_root, fallback)
            print(f"[supervise] attempt={attempt} exited rc={last_rc} latest={latest or 'none'}", file=log, flush=True)
            if last_rc == 0:
                print("[supervise] training command completed successfully", file=log, flush=True)
                return 0
            if time.monotonic() >= deadline:
                break
            time.sleep(min(args.restart_delay_sec, max(0.0, deadline - time.monotonic())))
        latest = latest_step_checkpoint(out_root, fallback)
        print(f"[supervise] deadline reached. FINAL latest checkpoint: {latest or 'none'}", file=log, flush=True)
    return 124 if last_rc == 124 else last_rc


if __name__ == "__main__":
    raise SystemExit(main())
