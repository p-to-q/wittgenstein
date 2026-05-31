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

from research.training._shared.experiment_tracking import (  # noqa: E402
    JsonlExperimentTracker,
    TrainingExperimentManifestReference,
)
from research.training._shared.manifest import (  # noqa: E402
    TRAINING_RUN_MANIFEST_SCHEMA_VERSION,
    TrainingRunManifest,
    TrainingRunEvalDataset,
    TrainingRunEvalMetric,
    TrainingRunEvalSnapshot,
    capture_dataset_fingerprint,
    capture_docker_image_sha,
    capture_git_sha,
    capture_hardware,
    capture_lockfile_sha256,
    capture_optimizer_checkpoint,
    capture_training_checkpoint,
    new_run_id,
    sha256_file,
    utc_now_iso,
    write_training_config_snapshot,
    write_training_run_manifest,
)
from research.training._shared.eval import (  # noqa: E402
    TokenizerEvalConfig,
    evaluate_tokenizer_reconstruction,
)
from research.training._shared.dataset import (  # noqa: E402
    ImageFolderDataset,
    SyntheticImageDataset,
)
from research.training.tokenizer.config import (  # noqa: E402
    OptimConfig,
    TrainConfig,
    smoke_config,
    to_dict as cfg_to_dict,
)
from research.training.tokenizer.losses import LossWeights, TokenizerLoss  # noqa: E402
from research.training.tokenizer.discriminator import (  # noqa: E402
    PatchGANDiscriminator,
    discriminator_loss,
)
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
    # ---- Discriminator (PatchGAN) ----
    # The reconstruction-only stack (L2+LPIPS+commit) converges soft; the GAN
    # term sharpens texture. Built only when enabled so a reconstruction-only
    # run carries no idle params. `gan_on_step` keeps it off during warmup.
    discriminator = None
    d_optim = None
    gan_on_step = cfg.gan_on_step if cfg.gan_enabled else 10**18
    if cfg.gan_enabled:
        disc_core = PatchGANDiscriminator(
            in_channels=3,
            base_channels=cfg.disc_base_channels,
            n_layers=cfg.disc_n_layers,
            use_batchnorm=not cfg.smoke,  # BN stats are unstable at smoke batch sizes
        ).to(device)
        d_optim = torch.optim.AdamW(
            disc_core.parameters(),
            lr=cfg.disc_lr,
            betas=(cfg.optim.beta1, cfg.optim.beta2),
        )
        discriminator = (
            DDP(disc_core, device_ids=[local_rank], output_device=local_rank)
            if world > 1
            else disc_core
        )
        if is_main(rank):
            dn = sum(p.numel() for p in disc_core.parameters())
            print(f"[gan] PatchGAN discriminator params={dn:,} gan_on_step={gan_on_step} "
                  f"gan_weight={cfg.gan_weight}")

    loss_fn = TokenizerLoss(
        weights=LossWeights(gan=cfg.gan_weight),
        lpips_module=lpips_mod,
        discriminator=discriminator,
        gan_on_step=gan_on_step,
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

    # ---- Capture once: manifest invariants + dataset fingerprint ----
    if is_main(rank):
        started_at = utc_now_iso()
        git_sha = capture_git_sha(_REPO_ROOT)
        lockfile_sha = capture_lockfile_sha256(
            _REPO_ROOT / "research" / "training" / "requirements.txt"
        )
        docker_image_sha = capture_docker_image_sha()
        hardware = capture_hardware()
        experiment_tracker = JsonlExperimentTracker(run_dir, run_id)
        experiment_tracker.log_params({"subprogram": "tokenizer", "config": cfg_to_dict(cfg)})
        config_payload = cfg_to_dict(cfg)
        config_payload["experimentTracking"] = experiment_tracker.config_reference()
        config_ref = write_training_config_snapshot(run_dir / "config.json", config_payload)
        if cfg.smoke or not cfg.train_data_root:
            dataset_fp = capture_dataset_fingerprint(
                "synthetic", files=[], revision="synthetic-smoke",
                notes="SyntheticImageDataset; no on-disk files",
            )
        else:
            train_data_root = Path(cfg.train_data_root)
            file_list = train_ds.file_list_for_manifest()
            dataset_fp = capture_dataset_fingerprint(
                train_data_root.name,
                files=file_list,
                revision="uncommitted",
                notes=f"content fingerprint for {len(train_ds)} files; DVC pin pending #400",
                cache_per_file=True,
                root=train_data_root,
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

        # Generator backward. When the GAN term is active, total_loss includes
        # softplus(-D(recon)); its backward also populates grads on D (via the
        # shared graph) which we discard by zero_grad'ing d_optim below.
        optim.zero_grad(set_to_none=True)
        total_loss.backward()
        if cfg.optim.grad_clip_norm > 0:
            nn.utils.clip_grad_norm_(
                (model.module if world > 1 else model).parameters(),
                cfg.optim.grad_clip_norm,
            )
        optim.step()

        # Discriminator step (after warmup): train D on real vs. detached recon
        # so D's update doesn't flow back into the generator.
        if discriminator is not None and step >= gan_on_step:
            d_optim.zero_grad(set_to_none=True)
            real_logits = discriminator(img)
            fake_logits = discriminator(recon.detach())
            d_loss = discriminator_loss(real_logits, fake_logits)
            d_loss.backward()
            d_optim.step()
            components["d_loss"] = float(d_loss.detach().cpu())

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
            experiment_tracker.log_metrics(
                step,
                {
                    "lr": lr,
                    "imgsPerSec": ips,
                    **components,
                },
            )

        # Checkpoint
        if is_main(rank) and step > 0 and step % cfg.checkpoint_every == 0:
            _write_checkpoint(
                run_dir,
                model,
                optim,
                cfg,
                step,
                t0,
                run_id,
                started_at,
                git_sha,
                lockfile_sha,
                docker_image_sha,
                hardware,
                dataset_fp,
                config_ref,
                discriminator=discriminator,
            )

        step += 1

    summary["final_step"] = step

    # ---- Final eval (best-effort) + checkpoint + manifest ----
    if is_main(rank):
        eval_snapshots = _maybe_run_eval(cfg, model, device, step, world)
        summary["acceptance"]["eval_snapshot_count"] = len(eval_snapshots)
        if eval_snapshots:
            summary["final_eval_metrics"] = {
                m.name: m.value for m in eval_snapshots[0].metrics
            }
        final_manifest_path = _write_checkpoint(
            run_dir,
            model,
            optim,
            cfg,
            step,
            t0,
            run_id,
            started_at,
            git_sha,
            lockfile_sha,
            docker_image_sha,
            hardware,
            dataset_fp,
            config_ref,
            discriminator=discriminator,
            eval_snapshots=eval_snapshots,
            final=True,
        )
        final_ckpt = run_dir / "ckpts" / "final.pt"
        final_manifest = run_dir / "ckpts" / "final.manifest.json"
        experiment_tracker.finish(
            TrainingExperimentManifestReference(
                runId=run_id,
                manifestPath=str(final_manifest_path),
                manifestSha256=sha256_file(final_manifest_path),
                checkpointSha256=sha256_file(final_ckpt),
            )
        )
        summary["acceptance"]["final_checkpoint_written"] = final_ckpt.exists()
        summary["acceptance"]["manifest_written"] = final_manifest.exists()
        summary["acceptance"]["experiment_receipt_written"] = (run_dir / "experiment.json").exists()
        summary["acceptance"]["experiment_metrics_written"] = (
            run_dir / "experiment-metrics.jsonl"
        ).exists()
        summary["acceptance"]["dataset_corrupt_count"] = int(
            getattr(train_ds, "corrupt_count", 0)
        )
        elapsed = time.perf_counter() - t0
        print(f"[done] step={step} elapsed={elapsed:.1f}s run_dir={run_dir}")

    cleanup_distributed()
    return summary


# Metric direction for manifest snapshots: True = higher is better.
_EVAL_METRIC_HIGHER_BETTER = {
    "psnr": True,
    "ssim": True,
    "lpips": False,
    "rfid": False,
    "codebook_used_pct": True,
}


def _eval_dataset_sha(ds_name: str, split: str, files=None) -> str:
    """Deterministic 64-hex identity for the eval set.

    The manifest schema requires `evalSnapshots[].dataset.sha256` to be a real
    sha256. This identifies WHICH eval set produced the metrics (label + sorted
    file names when a real folder is used); it is NOT a content lock of the
    training data (that is the separate dataset fingerprint). Stable across runs
    for the same eval set, and never empty.
    """
    import hashlib

    h = hashlib.sha256()
    h.update(f"{ds_name}:{split}".encode("utf-8"))
    if files:
        for p in sorted(str(x) for x in files):
            h.update(b"\0")
            h.update(p.encode("utf-8"))
    return h.hexdigest()


def _maybe_run_eval(cfg, model, device, step, world) -> list:
    """Run reconstruction eval on a val set; return [] on any failure.

    Eval must never kill a training run, so every path is guarded. Uses
    `val_data_root` when set, else a small synthetic set for smoke. Heavy
    metrics (rFID) are left to the eval harness's own dependency degradation.
    """
    try:
        eval_files = None
        if cfg.val_data_root:
            val_ds = ImageFolderDataset(
                Path(cfg.val_data_root), image_size=cfg.image_size, with_labels=False
            )
            split = "val"
            ds_name = Path(cfg.val_data_root).name
            eval_files = val_ds.file_list_for_manifest()
        elif cfg.smoke or not cfg.train_data_root:
            val_ds = SyntheticImageDataset(n=8, image_size=cfg.image_size, seed=cfg.seed + 1)
            split = "synthetic-val"
            ds_name = "synthetic"
        else:
            return []  # real training run with no val set declared — skip

        loader = DataLoader(
            val_ds,
            batch_size=cfg.batch_size_per_gpu,
            shuffle=False,
            num_workers=0,
            drop_last=False,
        )
        eval_cfg = TokenizerEvalConfig(
            eval_set_name=ds_name,
            batch_size=cfg.batch_size_per_gpu,
            compute_rfid=not cfg.smoke,  # rFID is slow + needs clean-fid; skip in smoke
        )
        core = model.module if world > 1 else model
        was_training = core.training
        core.eval()
        metrics = evaluate_tokenizer_reconstruction(core, loader, device, eval_cfg)
        if was_training:
            core.train()

        metric_objs = [
            TrainingRunEvalMetric(
                name=k,
                value=float(v),
                higherIsBetter=_EVAL_METRIC_HIGHER_BETTER.get(k),
            )
            for k, v in metrics.items()
            if isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(float(v))
        ]
        snapshot = TrainingRunEvalSnapshot(
            modality="image",
            dataset=TrainingRunEvalDataset(
                name=ds_name, split=split, sha256=_eval_dataset_sha(ds_name, split, eval_files)
            ),
            step=step,
            generatedAt=utc_now_iso(),
            metrics=metric_objs,
        )
        return [snapshot]
    except Exception as exc:  # eval is best-effort; never fail the run
        print(f"[eval] skipped due to error: {type(exc).__name__}: {exc}")
        return []


def _write_checkpoint(
    run_dir,
    model,
    optim,
    cfg,
    step,
    t0,
    run_id,
    started_at,
    git_sha,
    lockfile_sha,
    docker_image_sha,
    hardware,
    dataset_fp,
    config_ref,
    discriminator=None,
    eval_snapshots=None,
    final=False,
):
    ckpt_path = run_dir / "ckpts" / (f"final.pt" if final else f"step_{step:08d}.pt")
    state = (model.module if hasattr(model, "module") else model).state_dict()
    payload = {"model": state, "step": step}
    if discriminator is not None:
        payload["discriminator"] = (
            discriminator.module if hasattr(discriminator, "module") else discriminator
        ).state_dict()
    torch.save(payload, ckpt_path)
    # Smoke / synthetic data has no license encumbrance. For real data, the
    # operator must declare the corpus license; default research-only keeps an
    # undeclared run un-publishable. Anything other than "permissive" is
    # treated as research-only (fail safe).
    if cfg.smoke or not cfg.train_data_root:
        weights_license = "permissive"
    else:
        weights_license = "permissive" if cfg.dataset_license == "permissive" else "research-only"
    manifest = TrainingRunManifest(
        schemaVersion=TRAINING_RUN_MANIFEST_SCHEMA_VERSION,
        runId=run_id,
        subprogram="tokenizer",
        startedAt=started_at,
        finishedAt=utc_now_iso(),
        harnessGitSha=git_sha,
        trainingCodeGitSha=git_sha,
        dockerImageSha=docker_image_sha,
        lockfileSha256=lockfile_sha,
        dataset=dataset_fp,
        seed=cfg.seed,
        stepCount=step,
        wallClockSec=time.perf_counter() - t0,
        hardware=hardware,
        optimizer=capture_optimizer_checkpoint(optim, name="AdamW"),
        evalSnapshots=eval_snapshots or [],
        checkpoint=capture_training_checkpoint(ckpt_path, weights_license=weights_license),
        trainingConfig=config_ref,
    )
    manifest_path = run_dir / "ckpts" / (ckpt_path.stem + ".manifest.json")
    write_training_run_manifest(manifest, manifest_path)
    return manifest_path


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
    p.add_argument("--val-data-root", default="", help="Validation image folder for end-of-run eval")
    p.add_argument(
        "--dataset-license",
        default="research-only",
        choices=["research-only", "permissive"],
        help="Corpus license. 'permissive' marks the checkpoint publishable; "
             "use ONLY for verified license-clean data. Default research-only.",
    )
    gan_group = p.add_mutually_exclusive_group()
    gan_group.add_argument("--gan", dest="gan_enabled", action="store_true", default=None,
                           help="Enable the PatchGAN adversarial term.")
    gan_group.add_argument("--no-gan", dest="gan_enabled", action="store_false",
                           help="Disable the GAN term (reconstruction-only).")
    p.add_argument("--gan-on-step", type=int, default=None,
                   help="Step at which the GAN term turns on (warmup recon-only before).")
    return p


def main():
    args = _build_arg_parser().parse_args()
    if args.smoke:
        cfg = smoke_config()
    else:
        cfg = TrainConfig(
            train_data_root=args.train_data_root,
            val_data_root=args.val_data_root,
            out_root=args.out_root,
            max_steps=args.max_steps,
            batch_size_per_gpu=args.batch_size_per_gpu,
            image_size=args.image_size,
            seed=args.seed,
            num_workers=args.num_workers,
            dataset_license=args.dataset_license,
        )
        cfg.tokenizer = TokenizerConfig(codebook_embed_dim=args.codebook_embed_dim, image_size=args.image_size)
        cfg.optim = OptimConfig(lr=args.lr)
        if args.gan_enabled is not None:
            cfg.gan_enabled = args.gan_enabled
        if args.gan_on_step is not None:
            cfg.gan_on_step = args.gan_on_step
    train(cfg)


if __name__ == "__main__":
    main()
