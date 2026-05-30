"""Wittgenstein-native VQGAN tokenizer training entrypoint.

Phase 1.1 of the research-program (docs/research/2026-05-13-wittgenstein-research-program.md §1.1).

Design choices per #441 (training-stack re-audit):
  - Plain PyTorch + native DDP via torchrun (NOT Lightning, NOT Accelerate
    as the source of truth — these are launcher conveniences only).
  - Manifest writes are explicit — every checkpoint emits a Wittgenstein
    training manifest via _shared/manifest.py.
  - FSDP2 deferred — a 72M-param VQGAN fits comfortably on a single A800.

Launch (single-node multi-GPU):
    cd "$WITT_REPO"
    torchrun --nproc-per-node 8 -m research.training.tokenizer.train \\
        --train-data-root "$DATA_ROOT/imagenet/train" \\
        --out-root "$OUT_ROOT/runs"

Smoke (1 GPU, synthetic data, no actual deps installed beyond torch):
    python -m research.training.tokenizer.smoke_test
"""

from __future__ import annotations

import argparse
import math
import os
import sys
import time
from dataclasses import replace
from pathlib import Path

import torch
import torch.distributed as dist
import torch.nn as nn
from torch.nn.parallel import DistributedDataParallel as DDP
from torch.utils.data import DataLoader, DistributedSampler

# Resolve _shared/ for imports
_HERE = Path(__file__).resolve().parent
_REPO_ROOT = _HERE.parent.parent.parent  # research/training/tokenizer/.. = repo
_SHARED = _HERE.parent / "_shared"
for p in (_REPO_ROOT, _SHARED):
    if str(p) not in sys.path:
        sys.path.insert(0, str(p))

from research.training._shared.manifest import (  # noqa: E402
    EvalSnapshot,
    TrainingManifest,
    capture_dataset_fingerprint,
    capture_optimizer_checkpoint,
    capture_runtime_fingerprint,
    capture_training_checkpoint,
    new_run_id,
    write_training_manifest,
)
from research.training._shared.dataset import (  # noqa: E402
    ImageFolderDataset,
    SyntheticImageDataset,
)
from research.training.tokenizer.config import OptimConfig, TrainConfig, smoke_config  # noqa: E402
from research.training.tokenizer.losses import LossWeights, TokenizerLoss  # noqa: E402
from research.training.tokenizer.model import (  # noqa: E402
    TokenizerConfig,
    build_tokenizer,
    latent_grid,
    param_count,
)


# ---------- DDP plumbing ----------


def init_distributed() -> tuple[int, int, int, torch.device]:
    """Returns (rank, world_size, local_rank, device).

    Falls back to single-process if torchrun env vars are absent (smoke).
    """
    if "RANK" in os.environ and "WORLD_SIZE" in os.environ:
        dist.init_process_group(backend="nccl")
        rank = dist.get_rank()
        world = dist.get_world_size()
        local = int(os.environ["LOCAL_RANK"])
        torch.cuda.set_device(local)
        device = torch.device("cuda", local)
        return rank, world, local, device
    if torch.cuda.is_available():
        return 0, 1, 0, torch.device("cuda", 0)
    return 0, 1, 0, torch.device("cpu")


def is_main(rank: int) -> bool:
    return rank == 0


def cleanup_distributed():
    if dist.is_initialized():
        dist.destroy_process_group()


# ---------- Determinism ----------


def set_determinism(cfg: TrainConfig, rank: int):
    seed = cfg.seed + rank  # different per-rank to avoid duplicate batches
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = cfg.cudnn_deterministic
        torch.backends.cudnn.benchmark = cfg.cudnn_benchmark
    os.environ.setdefault("PYTHONHASHSEED", str(seed))


# ---------- LR schedule ----------


def warmup_then_constant(step: int, warmup: int, base_lr: float) -> float:
    if warmup <= 0:
        return base_lr
    if step < warmup:
        return base_lr * (step + 1) / warmup
    return base_lr


# ---------- Train loop ----------


def train(cfg: TrainConfig) -> dict:
    rank, world, local_rank, device = init_distributed()
    set_determinism(cfg, rank)

    if is_main(rank):
        print(f"[init] rank={rank} world={world} device={device} cfg.smoke={cfg.smoke}")

    # ---- Data ----
    if cfg.smoke or not cfg.train_data_root:
        train_ds = SyntheticImageDataset(n=64, image_size=cfg.image_size, seed=cfg.seed)
        if is_main(rank):
            print("[data] using SyntheticImageDataset (smoke / no real data)")
    else:
        train_ds = ImageFolderDataset(
            Path(cfg.train_data_root), image_size=cfg.image_size, with_labels=False
        )
        if is_main(rank):
            print(f"[data] {cfg.train_data_root}: {len(train_ds)} images")

    if world > 1:
        sampler = DistributedSampler(train_ds, num_replicas=world, rank=rank, shuffle=True, seed=cfg.seed)
        shuffle = False
    else:
        sampler = None
        shuffle = True

    train_loader = DataLoader(
        train_ds,
        batch_size=cfg.batch_size_per_gpu,
        shuffle=shuffle,
        sampler=sampler,
        num_workers=cfg.num_workers,
        pin_memory=device.type == "cuda",
        drop_last=True,
        persistent_workers=cfg.num_workers > 0,
    )

    # ---- Model ----
    model = build_tokenizer(cfg.tokenizer).to(device)
    n_params = param_count(model)
    if is_main(rank):
        H, W = latent_grid(cfg.tokenizer)
        print(
            f"[model] WittgensteinVQGAN params={n_params:,} "
            f"({n_params/1e6:.1f}M) latent_grid={H}x{W} "
            f"K={cfg.tokenizer.codebook_size} D={cfg.tokenizer.codebook_embed_dim}"
        )

    if world > 1:
        model = DDP(model, device_ids=[local_rank], output_device=local_rank, find_unused_parameters=False)

    # ---- Loss ----
    lpips_mod = None
    if cfg.lpips_enabled and not cfg.smoke:
        try:
            import lpips
            lpips_mod = lpips.LPIPS(net=cfg.lpips_net).to(device)
        except ImportError:
            if is_main(rank):
                print("[loss] lpips not installed; continuing with L2-only")
    loss_fn = TokenizerLoss(
        weights=LossWeights(),
        lpips_module=lpips_mod,
        discriminator=None,  # GAN added in a follow-up after warmup_iters
        gan_on_step=cfg.gan_on_step if cfg.gan_enabled else 10**18,
    ).to(device)

    # ---- Optimizer ----
    optim = torch.optim.AdamW(
        (model.module if world > 1 else model).parameters(),
        lr=cfg.optim.lr,
        betas=(cfg.optim.beta1, cfg.optim.beta2),
        weight_decay=cfg.optim.weight_decay,
    )

    # ---- Output paths ----
    # In DDP, only rank 0 invents the run_id; broadcast so all ranks agree
    # on the same run_dir (matters when other ranks want to read the manifest
    # back, e.g. in smoke_test).
    if is_main(rank):
        run_id = new_run_id("tokenizer")
    else:
        run_id = ""  # will be filled by broadcast below
    if world > 1:
        rid_obj = [run_id]
        dist.broadcast_object_list(rid_obj, src=0)
        run_id = rid_obj[0]
    out_root = Path(cfg.out_root) if cfg.out_root else (_REPO_ROOT / "research" / "training" / "_shared" / "runs")
    run_dir = out_root / run_id
    if is_main(rank):
        (run_dir / "ckpts").mkdir(parents=True, exist_ok=True)
        print(f"[out] run_dir={run_dir}")

    # ---- Capture once: runtime fingerprint + dataset fingerprint ----
    if is_main(rank):
        runtime_fp = capture_runtime_fingerprint(
            repo_root=_REPO_ROOT,
            lockfile=_REPO_ROOT / "research" / "training" / "requirements.txt",
        )
        if cfg.smoke or not cfg.train_data_root:
            dataset_fp = capture_dataset_fingerprint(
                "synthetic", files=[], revision="synthetic-smoke",
                notes="SyntheticImageDataset; no on-disk files",
            )
        else:
            file_list = train_ds.file_list_for_manifest()[:1000]  # sample for cheap fingerprint
            dataset_fp = capture_dataset_fingerprint(
                Path(cfg.train_data_root).name,
                files=file_list,
                revision="uncommitted",
                notes=f"first 1000 files of {len(train_ds)}; full DVC pin pending #400",
                cache_per_file=False,
            )

    # ---- Train loop ----
    t0 = time.perf_counter()
    step = 0
    model.train()
    epoch_iter = iter(train_loader)
    last_log_t = t0

    summary = {
        "final_step": 0,
        "final_components": {},
        "run_dir": str(run_dir),
        "acceptance": {
            "smoke_mode": cfg.smoke,
            "manifest_written": False,
            "final_checkpoint_written": False,
            "used_synthetic_data": bool(cfg.smoke or not cfg.train_data_root),
            "dataset_corrupt_count": 0,
        },
    }

    while step < cfg.max_steps:
        try:
            batch = next(epoch_iter)
        except StopIteration:
            if world > 1 and sampler is not None:
                sampler.set_epoch(int(step // max(1, len(train_loader))))
            epoch_iter = iter(train_loader)
            batch = next(epoch_iter)

        img, _ = batch
        img = img.to(device, non_blocking=True)

        # LR schedule
        lr = warmup_then_constant(step, cfg.optim.warmup_steps, cfg.optim.lr)
        for pg in optim.param_groups:
            pg["lr"] = lr

        # Forward.
        # `encode()` returns `(quant, (vq_loss, commit_loss, entropy_loss,
        # codebook_usage), (perplexity, min_encodings, min_encoding_indices))`.
        # During training all loss components are scalar tensors; during eval
        # they are None. `commit_loss` here is already β-weighted internally
        # by the quantizer (see VectorQuantizer.forward), so we pass the sum
        # of (vq + commit + entropy) as the quantizer-side loss term.
        quant, vq_components, _info = (model.module if world > 1 else model).encode(img)
        vq_loss, commit_loss, entropy_loss, codebook_usage = vq_components
        zero = torch.zeros((), device=device, dtype=img.dtype)
        vq_total = (
            (vq_loss if vq_loss is not None else zero)
            + (commit_loss if commit_loss is not None else zero)
            + (entropy_loss if entropy_loss is not None else zero)
        )
        recon = (model.module if world > 1 else model).decode(quant)
        total_loss, components = loss_fn(img, recon, vq_total, global_step=step)
        components["codebook_usage"] = float(codebook_usage if codebook_usage is not None else 0.0)

        # Backward
        optim.zero_grad(set_to_none=True)
        total_loss.backward()
        if cfg.optim.grad_clip_norm > 0:
            nn.utils.clip_grad_norm_(
                (model.module if world > 1 else model).parameters(),
                cfg.optim.grad_clip_norm,
            )
        optim.step()

        # Log
        if is_main(rank) and (step % cfg.log_every == 0 or step == cfg.max_steps - 1):
            elapsed = time.perf_counter() - t0
            inter = time.perf_counter() - last_log_t
            ips = (cfg.batch_size_per_gpu * world * cfg.log_every) / max(inter, 1e-6) if step > 0 else 0
            print(
                f"[step {step:>7d}/{cfg.max_steps}] "
                f"lr={lr:.2e} "
                + " ".join(f"{k}={v:.4f}" for k, v in components.items())
                + f" | imgs/s={ips:.1f} elapsed={elapsed:.1f}s"
            )
            last_log_t = time.perf_counter()
            summary["final_components"] = components

        # Checkpoint
        if is_main(rank) and step > 0 and step % cfg.checkpoint_every == 0:
            _write_checkpoint(run_dir, model, optim, cfg, step, t0, run_id, runtime_fp, dataset_fp)

        step += 1

    summary["final_step"] = step

    # ---- Final checkpoint + manifest ----
    if is_main(rank):
        _write_checkpoint(run_dir, model, optim, cfg, step, t0, run_id, runtime_fp, dataset_fp, final=True)
        final_ckpt = run_dir / "ckpts" / "final.pt"
        final_manifest = run_dir / "ckpts" / "final.manifest.json"
        summary["acceptance"]["final_checkpoint_written"] = final_ckpt.exists()
        summary["acceptance"]["manifest_written"] = final_manifest.exists()
        summary["acceptance"]["dataset_corrupt_count"] = int(
            getattr(train_ds, "corrupt_count", 0)
        )
        elapsed = time.perf_counter() - t0
        print(f"[done] step={step} elapsed={elapsed:.1f}s run_dir={run_dir}")

    cleanup_distributed()
    return summary


def _write_checkpoint(run_dir, model, optim, cfg, step, t0, run_id, runtime_fp, dataset_fp, final=False):
    from research.training.tokenizer.config import to_dict as cfg_to_dict
    ckpt_path = run_dir / "ckpts" / (f"final.pt" if final else f"step_{step:08d}.pt")
    state = (model.module if hasattr(model, "module") else model).state_dict()
    torch.save({"model": state, "step": step}, ckpt_path)
    manifest = TrainingManifest(
        schema_version="witt.training/v0.1",
        program="tokenizer",
        family="wittgenstein-native-vqgan",
        runtime=runtime_fp,
        dataset=dataset_fp,
        optimizer=capture_optimizer_checkpoint(optim, name="AdamW"),
        checkpoint=capture_training_checkpoint(
            run_id=run_id, step=step, epoch=0.0,
            wall_clock_s=time.perf_counter() - t0, seed=cfg.seed,
            weights_path=ckpt_path,
        ),
        eval=EvalSnapshot(eval_set="not-yet-evaluated", eval_set_sha256="pending", metrics={}),
        config=cfg_to_dict(cfg),
        notes=("final checkpoint" if final else f"checkpoint at step {step}"),
    )
    write_training_manifest(manifest, run_dir / "ckpts" / (ckpt_path.stem + ".manifest.json"))


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="Train Wittgenstein-native VQGAN tokenizer.")
    p.add_argument("--train-data-root", default="", help="ImageNet train folder; empty = synthetic")
    p.add_argument("--out-root", default="", help="Output root (default: research/training/_shared/runs)")
    p.add_argument("--max-steps", type=int, default=200_000)
    p.add_argument("--batch-size-per-gpu", type=int, default=128)
    p.add_argument("--image-size", type=int, default=256)
    p.add_argument("--codebook-embed-dim", type=int, default=32)
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--smoke", action="store_true", help="Run smoke config (5 steps, synthetic)")
    p.add_argument("--num-workers", type=int, default=8)
    return p


def main():
    args = _build_arg_parser().parse_args()
    if args.smoke:
        cfg = smoke_config()
    else:
        cfg = TrainConfig(
            train_data_root=args.train_data_root,
            out_root=args.out_root,
            max_steps=args.max_steps,
            batch_size_per_gpu=args.batch_size_per_gpu,
            image_size=args.image_size,
            seed=args.seed,
            num_workers=args.num_workers,
        )
        cfg.tokenizer = TokenizerConfig(codebook_embed_dim=args.codebook_embed_dim, image_size=args.image_size)
        cfg.optim = OptimConfig(lr=args.lr)
    train(cfg)


if __name__ == "__main__":
    main()
