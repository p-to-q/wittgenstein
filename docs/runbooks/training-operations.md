# Tokenizer Training Operations Runbook

## When to use

Running a multi-GPU tokenizer (or adapter) training job on a shared cluster
node and needing it to (a) fit in memory, (b) survive crashes/preemption for a
fixed wall-clock budget, and (c) leave a trustworthy receipt. Distilled from a
6h Phase-1.1 tokenizer run on a shared 8×A800-80GB node.

## Symptoms

- **OOM at batch sizes the config claims are fine.** The VQGAN's conv
  activation maps — not the ~72M params — dominate memory at 256². The backward
  pass retains every layer's activations, so a large per-GPU batch can need ~78
  GB and die even on an empty 80 GB card. The "128/GPU is comfortable" figure is
  an A100/LlamaGen recipe assumption, not a measured value for this arch+res.
- **Run dies mid-epoch with NCCL "connection refused" / rank cascade.** On a
  shared node, a co-tenant job that lands GBs on every GPU *after* you start can
  push your run into OOM; one rank dies and NCCL tears down all ranks.
- **`AttributeError` on a config field that exists in the source.** A stale
  `__pycache__` from an older code revision shadows the new field.
- **Logs are frozen / empty until the job ends.** `torchrun` child stdout is
  block-buffered; nothing flushes until a buffer fills or the process exits.
- **`git_sha: "unknown"` in the manifest.** The code was copied to the node
  without its `.git` dir, so `capture_git_sha()` can't read the revision.

## Procedure

1. **Pick a per-GPU batch by measurement, not by recipe.** At 256² on
   A800-80GB, ~16/GPU is verified-runnable (~20 GB/GPU); scale down further to
   coexist with tenants. Reach the research-program effective-batch target with
   gradient accumulation / AMP / more GPUs (tracked in #251 / #198), not a big
   single-GPU batch.
2. **Run under a wall-clock supervisor that resumes from the latest
   checkpoint.** Loop: pick the emptiest GPUs, launch `torchrun … --resume-from
   <latest step_*.pt>`, and relaunch on non-zero exit until the deadline. Use
   `checkpoint_every` small enough (e.g. 1000) that a crash loses little. Launch
   detached (`setsid nohup …`) so it survives an SSH disconnect. The checked-in
   launcher for this is `research/training/supervise_tokenizer_run.py`.
3. **Always export these before `torchrun`:**
   - `PYTHONUNBUFFERED=1` — live logs (otherwise child stdout is block-buffered).
   - `PYTHONDONTWRITEBYTECODE=1` and clear `__pycache__` — avoid stale-pyc field shadowing.
   - `PYTORCH_ALLOC_CONF=expandable_segments:True` — reduces fragmentation OOM.
   - `WITT_GIT_SHA=$(git rev-parse HEAD)` — inject the revision when the node
     has no `.git` (honored by `capture_git_sha`), so the manifest stays
     traceable.
4. **Coexist politely on shared nodes.** Select the emptiest GPUs at launch,
   keep the footprint small, and never touch other tenants' processes when
   cleaning up — match your own process patterns exactly (`pkill -f
   <your-supervisor>` / `-f <your-train-module>`), then confirm.

## Verification

- **Progress is real** only if `step_*.pt` files are advancing on disk and the
  log step lines increase — GPU-util alone is misleading on a shared node
  (a tenant's job shows util on "your" card).
- **Checkpoint is sound**: `integrity_check.py` recomputes the checkpoint SHA256,
  byte-compares it against the manifest's `weights_sha256`, scans for NaN/inf,
  and reports codebook row-norm / dead-code stats.
- **Reconstruction sanity**: `recon_check.py` loads the checkpoint, encode→decode
  one image, and reports L2/PSNR + before/after PNGs.
- **Closeout pack**: `closeout_tokenizer_run.py` wraps the plot, integrity, and
  reconstruction tools and writes a `CLOSEOUT.md` with command outputs embedded.
- **Loss is healthy, not just decreasing**: a VQGAN total loss can be negative by
  design when an entropy anti-collapse term is in the sum — check l2 and lpips
  are falling and codebook usage is rising, rather than reading the total alone.
- **Clean shutdown**: confirm your supervisor and train processes are gone
  (bracket-grep `ps -eo cmd | grep "[t]rain-module"` to avoid the pattern
  matching its own grep) and GPUs are released.

## Rollback

- Kill only your own processes (`pkill -f <supervisor>` then `-f <train
  module>`), verify `0` remain, and confirm GPU memory is freed. Never signal
  co-tenant jobs.
- A checkpoint trained on research-only data is **validation-only** — do not
  publish it (no HF upload, no "model done" claim). The manifest's dataset
  license/`revision` field is the gate.

## References

- `research/training/tokenizer/train.py`, `config.py` — training entrypoint + config.
- `research/training/_shared/manifest.py` — the receipt schema (`WITT_GIT_SHA` fallback).
- `research/training/supervise_tokenizer_run.py` — resumable wall-clock launcher.
- `research/training/integrity_check.py`, `recon_check.py`, `plot_training.py`,
  `closeout_tokenizer_run.py` — offline audit tooling.
- Issues: #251 (grad accumulation), #198 (AMP), #181 (checkpoint rotation),
  #405 (reproducibility test), #270 (PatchGAN), #400 (license-clean data + DVC).
