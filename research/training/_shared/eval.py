"""Tokenizer reconstruction eval — Rung 1 of the Phase 1 eval matrix.

Per `docs/research/2026-05-13-wittgenstein-research-program.md` §1.4 the
Phase 1 ablation matrix is:

  Rung 1 — Reconstruction (tokenizer round-trip):
      PSNR / SSIM / LPIPS / rFID on ImageNet val 50k @ 256×256 center-crop
  Rung 2 — Adapter round-trip (seed-length sweep)
  Rung 3 — End-to-end generative (COCO FID-30K / CLIP-score / human eval)

This module owns Rung 1. Rungs 2/3 build on the same primitives (rFID +
LPIPS) but with different inputs; they live under `adapter/eval.py` and
`llm-head/eval.py` respectively.

Design:
  - All metrics are computed by streaming through the val set ONCE; no
    intermediate giant tensors held in RAM.
  - rFID uses clean-fid (CVPR 2022, the explicit-preprocessing wrapper
    around the original FID) because the audit-doc convention is that
    metric choices must pin their preprocessing exactly.
  - PSNR / SSIM use torchmetrics (deterministic, well-tested).
  - LPIPS uses the lpips package with AlexNet backbone (cheap CPU/GPU
    fallback if frozen).
  - Optional: codebook-usage histogram over the eval set (sanity check
    that the trained tokenizer isn't collapsed).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader


@dataclass
class TokenizerEvalConfig:
    eval_set_name: str = "imagenet-val-50k"
    eval_set_sha256: str = "pending"  # DVC-pinned at production time
    batch_size: int = 64
    num_workers: int = 4
    compute_rfid: bool = True   # slowest; controls clean-fid dep
    compute_psnr_ssim: bool = True
    compute_lpips: bool = True
    compute_codebook_hist: bool = True


def _to_uint8_chw(tensor: torch.Tensor) -> torch.Tensor:
    """Convert [-1,1] float to [0,255] uint8 NCHW."""
    return torch.clamp(127.5 * tensor + 128.0, 0, 255).to(dtype=torch.uint8)


@torch.no_grad()
def evaluate_tokenizer_reconstruction(
    model,
    eval_loader: DataLoader,
    device: torch.device,
    cfg: TokenizerEvalConfig | None = None,
) -> dict[str, Any]:
    """Run reconstruction eval; returns metric dict for manifest.eval.metrics.

    Caller is responsible for setting `model.eval()` (we don't toggle here
    so the caller's state stays explicit).
    """
    cfg = cfg or TokenizerEvalConfig()

    # Lazy imports — these libs aren't on the floor requirements; allow
    # eval to run with partial metric coverage if some are missing.
    psnr_metric = None
    ssim_metric = None
    degradation_reasons: list[str] = []
    if cfg.compute_psnr_ssim:
        try:
            from torchmetrics.image import PeakSignalNoiseRatio, StructuralSimilarityIndexMeasure
            psnr_metric = PeakSignalNoiseRatio(data_range=255.0).to(device)
            ssim_metric = StructuralSimilarityIndexMeasure(data_range=255.0).to(device)
        except ImportError:
            print("[eval] torchmetrics not installed; skipping PSNR/SSIM")
            degradation_reasons.append("torchmetrics-missing:psnr-ssim")

    lpips_metric = None
    lpips_sum = 0.0      # batch-size-weighted running sum for an exact streaming mean
    lpips_count = 0
    if cfg.compute_lpips:
        try:
            import lpips
            lpips_metric = lpips.LPIPS(net="alex").to(device)
            for p in lpips_metric.parameters():
                p.requires_grad = False
        except ImportError:
            print("[eval] lpips not installed; skipping LPIPS")
            degradation_reasons.append("lpips-missing")

    # rFID: defer the heavy clean-fid dependency to runtime. We accumulate
    # real/fake stats then call clean_fid.fid.compute_fid at the end.
    rfid_real_paths = []
    rfid_fake_paths = []
    rfid_tmpdir = None
    if cfg.compute_rfid:
        try:
            import tempfile
            rfid_tmpdir = Path(tempfile.mkdtemp(prefix="witt_rfid_"))
            (rfid_tmpdir / "real").mkdir()
            (rfid_tmpdir / "fake").mkdir()
        except Exception as e:
            print(f"[eval] rFID tmpdir setup failed; skipping rFID: {e}")
            degradation_reasons.append(f"rfid-tmpdir-unavailable:{type(e).__name__}")
            cfg = TokenizerEvalConfig(**{**cfg.__dict__, "compute_rfid": False})

    # Codebook usage histogram
    codebook_hist = None
    if cfg.compute_codebook_hist and hasattr(model, "quantize"):
        n_codes = model.quantize.n_e
        codebook_hist = torch.zeros(n_codes, dtype=torch.int64, device=device)

    n_images = 0
    for batch_idx, (img, _label) in enumerate(eval_loader):
        img = img.to(device, non_blocking=True)
        quant, _vq_components, info = model.encode(img)
        recon = model.decode(quant)

        if psnr_metric is not None:
            img_u8 = _to_uint8_chw(img)
            rec_u8 = _to_uint8_chw(recon)
            psnr_metric.update(rec_u8.float(), img_u8.float())
            if ssim_metric is not None:
                ssim_metric.update(rec_u8.float(), img_u8.float())

        if lpips_metric is not None:
            # LPIPS expects [-1, 1], which is what we have. Accumulate a
            # batch-size-weighted running SUM so the final mean is exact even
            # when the last batch is short (a plain mean-of-batch-means is not).
            per_image = lpips_metric(recon, img)  # shape [N,1,1,1]
            lpips_sum += float(per_image.sum().detach().cpu())
            lpips_count += img.shape[0]

        if rfid_tmpdir is not None:
            from PIL import Image
            for j in range(img.shape[0]):
                idx_str = f"{n_images + j:08d}.png"
                Image.fromarray(_to_uint8_chw(img[j]).permute(1, 2, 0).cpu().numpy()).save(
                    rfid_tmpdir / "real" / idx_str
                )
                Image.fromarray(_to_uint8_chw(recon[j]).permute(1, 2, 0).cpu().numpy()).save(
                    rfid_tmpdir / "fake" / idx_str
                )

        if codebook_hist is not None:
            indices = info[2]  # min_encoding_indices
            codebook_hist += torch.bincount(indices.flatten().long(), minlength=codebook_hist.numel())

        n_images += img.shape[0]

    metrics: dict[str, Any] = {
        "n_images_evaluated": n_images,
        "degraded": len(degradation_reasons) > 0,
        "degradation_reasons": degradation_reasons,
        "requested_metrics": {
            "psnr_ssim": cfg.compute_psnr_ssim,
            "lpips": cfg.compute_lpips,
            "rfid": cfg.compute_rfid,
            "codebook_hist": cfg.compute_codebook_hist,
        },
        "computed_metrics": {
            "psnr": psnr_metric is not None,
            "ssim": ssim_metric is not None,
            "lpips": lpips_metric is not None,
            "rfid": rfid_tmpdir is not None,
            "codebook_hist": codebook_hist is not None,
        },
    }

    if psnr_metric is not None:
        metrics["psnr"] = float(psnr_metric.compute().cpu())
    if ssim_metric is not None:
        metrics["ssim"] = float(ssim_metric.compute().cpu())
    if lpips_metric is not None and lpips_count > 0:
        # Exact dataset-mean LPIPS = sum(per-image LPIPS) / n_images.
        metrics["lpips"] = lpips_sum / lpips_count
    elif lpips_metric is not None:
        metrics["lpips_error"] = "no images evaluated"
        degradation_reasons.append("lpips-no-images")

    if rfid_tmpdir is not None:
        try:
            from cleanfid import fid as cleanfid
            metrics["rfid"] = float(cleanfid.compute_fid(
                str(rfid_tmpdir / "real"),
                str(rfid_tmpdir / "fake"),
                mode="clean",
                device=device.type,
                verbose=False,
            ))
        except ImportError:
            metrics["rfid_error"] = "clean-fid not installed"
            degradation_reasons.append("clean-fid-missing")
        except Exception as e:
            metrics["rfid_error"] = f"{type(e).__name__}: {e}"
            degradation_reasons.append(f"rfid-failed:{type(e).__name__}")
        finally:
            import shutil
            shutil.rmtree(rfid_tmpdir, ignore_errors=True)

    if codebook_hist is not None:
        used = (codebook_hist > 0).sum().item()
        metrics["codebook_used_count"] = int(used)
        metrics["codebook_used_pct"] = float(used) / float(codebook_hist.numel())

    metrics["degraded"] = len(degradation_reasons) > 0
    metrics["degradation_reasons"] = degradation_reasons

    return metrics
