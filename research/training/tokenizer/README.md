# Tokenizer training subprogram

Phase 1.1 deliverable: a Wittgenstein-native VQGAN-class image tokenizer
trained on ImageNet + CC12M, per
[`docs/research/2026-05-13-wittgenstein-research-program.md`](../../../docs/research/2026-05-13-wittgenstein-research-program.md) §1.1.

## Status

Scaffold and DDP training loop **shipped and smoke-validated on
qiyuan node1048 (A800-SXM4-80GB ×2, NCCL 2.18.5, CUDA 12.8, torch
2.9.1)**. Real-data launch is gated on dataset prep
([#400](https://github.com/p-to-q/wittgenstein/issues/400) DVC remote)
and the training-stack re-audit close
([#441](https://github.com/p-to-q/wittgenstein/issues/441)).

See receipt files: `_shared/runs/smoke/tokenizer-*/ckpts/*.manifest.json`.

## Layout

```
tokenizer/
├── README.md         # this file
├── config.py         # TrainConfig, TokenizerConfig, smoke_config()
├── model.py          # build_tokenizer() factory; uses _shared/_third_party/llamagen_vq_model
├── losses.py         # TokenizerLoss: L2 + LPIPS + GAN-when-on + commit pass-through
├── train.py          # DDP-native training loop (torchrun)
├── smoke_test.py     # validates loop end-to-end in <60s on a single GPU
└── __init__.py
```

Shared infrastructure (`research/training/_shared/`):

```
_shared/
├── manifest.py        # TrainingManifest emitter (Wittgenstein receipt spine)
├── dataset.py         # ImageFolderDataset, SyntheticImageDataset, LlamaGen-canonical preproc
└── _third_party/
    ├── README.md
    ├── LICENSE.llamagen
    └── llamagen_vq_model.py   # vendored from FoundationVision/LlamaGen@ce98ec41 (MIT)
```

## Quick smoke (validates the loop)

```bash
# Single GPU
python -m research.training.tokenizer.smoke_test

# Multi-GPU DDP (uses CUDA_VISIBLE_DEVICES if set)
torchrun --nproc-per-node 2 -m research.training.tokenizer.smoke_test
```

Expected: 5 train steps in <30s, `[smoke] PASS` printed, a
`final.manifest.json` written under `_shared/runs/smoke/tokenizer-*/`.

## Phase 1.1 launch (real)

Once dataset prep lands, launch on qiyuan as:

```bash
cd /nfsdata/wxu/wittgenstein/witt-repo

# 8× A800-80GB single-node DDP — effective batch 1024 at bs=128/GPU
torchrun --nproc-per-node 8 --master-port 29500 \
    -m research.training.tokenizer.train \
    --train-data-root /nfsdata/wxu/datasets/imagenet/train \
    --out-root /nfsdata/wxu/wittgenstein/runs \
    --max-steps 200000 \
    --batch-size-per-gpu 128 \
    --codebook-embed-dim 32 \
    --lr 1e-4 \
    --seed 0 \
    --num-workers 8
```

Target: rFID ≤ 2.0 on ImageNet val 50k (matches LlamaGen baseline corridor;
own-trained advantage is from D=32 vs D=8 + our license posture).

## Architecture choices vs LlamaGen baseline

| Knob | LlamaGen `vq_ds16_c2i.pt` (audited) | Wittgenstein-native (this scaffold) | Why |
|---|---|---|---|
| Codebook K | 16384 | 16384 | Match audited baseline shape |
| Embed dim D | 8 | **32** | Richer per-site latents for our learned MaskGIT adapter (LlamaGen's D=8 was intentionally low because their AR head carried semantic load — we don't have that constraint) |
| Downsample p | 16 | 16 | Match audited baseline; 256² → 16×16 = 256 tokens |
| Encoder ch_mult | [1,1,2,2,4] | [1,1,2,2,4] | Match |
| Losses | L2 + LPIPS + PatchGAN + commit | Same | Match recipe |
| Determinism class | structural-parity (Gate C) | structural-parity (planned) | Matches ADR-0015 precedent |

## Receipt-first design (per #441)

Every checkpoint emits a `TrainingManifest` capturing:

- **runtime**: `git_sha`, `lockfile_sha256`, torch/CUDA/cudnn versions, hostname, A800 device name
- **dataset**: `name`, `root_sha256` (over sorted file enumeration + sizes), `file_count`, `total_bytes`, `revision`
- **optimizer**: `state_hash` (SHA-256 over state_dict bytes), `lr`, `weight_decay`, `betas`
- **checkpoint**: `run_id`, `step`, `epoch`, `wall_clock_s`, `seed`, `weights_path`, `weights_sha256`
- **eval**: `eval_set`, `eval_set_sha256`, `metrics` (filled by eval pass)
- **config**: full hyperparameter dump (snapshot of TrainConfig)

This matches Wittgenstein's inference-side `RunManifest` shape so
`wittgenstein replay` works equivalently for inference + training
receipts. No silent fallbacks; the harness can verify any checkpoint
back to the exact configuration and data slice that produced it.

## Owning issues

- [#396](https://github.com/p-to-q/wittgenstein/issues/396) — Train
  Wittgenstein-native VQGAN-class image tokenizer on ImageNet + CC12M
- [#400](https://github.com/p-to-q/wittgenstein/issues/400) — DVC remote
  for dataset hash pinning
- [#441](https://github.com/p-to-q/wittgenstein/issues/441) — Training-stack re-audit (gate)
- [#329](https://github.com/p-to-q/wittgenstein/issues/329) / [#334](https://github.com/p-to-q/wittgenstein/issues/334) / [#335](https://github.com/p-to-q/wittgenstein/issues/335) —
  VQGAN-class audit (baseline reference, all PASS as of `docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`)

## Not in here yet (follow-ups)

- **PatchGAN discriminator** — discriminator architecture + warmup-aware
  GAN training loop. The losses.py module is already shaped for this.
- **Eval pass (rFID / PSNR / SSIM / LPIPS / codebook usage on val 50k)** —
  fills `manifest.eval.metrics` at every `eval_every` step.
- **Resume-from-checkpoint** — `--resume <ckpt>` flag, restores model +
  optim + step counter, preserves run_id continuity.
- **Aim/W&B tracker integration** — `manifest.experiment_uri` is the
  hook; currently empty.
- **DVC dataset pin** — train script reads dataset SHA from a DVC
  `.dvc` file rather than the cheap file-enumeration fingerprint.
- **FSDP2 sharding** — only needed if larger tokenizer variants are
  trained. The current 72M model fits comfortably on one A800.
