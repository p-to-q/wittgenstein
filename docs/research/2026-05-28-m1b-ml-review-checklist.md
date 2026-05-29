# M1B ML review checklist

Status: draft  
Date: 2026-05-28

## Purpose

ML review must not stop at singular values, SVD, or low-rank intuition. Those can be useful diagnostics, but M1B validation requires evidence across the full interface.

## Checklist

### 1. Visual Seed Code emission

- [ ] fixed prompt set;
- [ ] provider/model/temperature/seed recorded;
- [ ] schema-valid rate measured;
- [ ] repair rate measured;
- [ ] invalid-output taxonomy written;
- [ ] token entropy and usage measured;
- [ ] paraphrase stability measured;
- [ ] failures write receipts.

Reject: hand-picked prompts, hidden repair loops, or prose claims without schema stats.

### 2. Decoder candidate

- [ ] source commit pinned;
- [ ] weights sha256 pinned;
- [ ] codebook sha256 pinned;
- [ ] runtime artifact sha256 pinned where applicable;
- [ ] license recorded;
- [ ] runtime tier recorded;
- [ ] determinism class recorded;
- [ ] CPU/GPU environment recorded.

Reject: unpinned local paths or unclear redistribution rights.

### 3. Tokenizer reconstruction

- [ ] dataset license and split recorded;
- [ ] preprocessing recorded;
- [ ] rFID/FID or owner-approved metric recorded;
- [ ] LPIPS/SSIM/PSNR considered;
- [ ] codebook usage/perplexity recorded;
- [ ] collapse rate recorded;
- [ ] latency/memory recorded.

Reject: "loss went down" without reconstruction and codebook metrics.

### 4. Seed-length / capacity sweep

- [ ] S=4/16/64/256 or project-approved grid tested;
- [ ] 1D and/or 2D shape compared;
- [ ] VSC-only vs Semantic IR-conditioned compared;
- [ ] adapter sensitivity measured;
- [ ] minimum useful seed budget identified.

Reject: adapter training before information budget is understood.

### 5. Adapter / seed expander

- [ ] deterministic baseline;
- [ ] semantic-only baseline;
- [ ] learned adapter;
- [ ] invalid latent rate;
- [ ] quality delta over baseline;
- [ ] latency;
- [ ] determinism class.

Reject: no baseline comparison.

### 6. End-to-end artifact

- [ ] run manifest includes prompt, raw output, VSC, adapter, decoder, hashes, determinism class, artifact sha;
- [ ] failure cases write receipts;
- [ ] real-decoder tier cannot fall back silently;
- [ ] replay or structural validation exists.

Reject: "PNG exists" without manifest-backed trace.

## Final ML-owner questions

1. Which candidate is accepted, rejected, or conditionally accepted?
2. Which metrics are decisive?
3. Which thresholds are required?
4. Which claims remain lab-only?
5. Which PRs can merge without implying model success?
6. Which release-note phrases are forbidden?

## Source anchors

This draft pack was written from a GitHub-only static review on 2026-05-28. Recheck referenced issues/PRs before merge.

- Repository / README: https://github.com/p-to-q/wittgenstein
- README.md: https://github.com/p-to-q/wittgenstein/blob/main/README.md
- CHANGELOG.md: https://github.com/p-to-q/wittgenstein/blob/main/CHANGELOG.md
- docs/implementation-status.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/implementation-status.md
- docs/exec-plans/active/codec-v2-port.md: https://github.com/p-to-q/wittgenstein/blob/main/docs/exec-plans/active/codec-v2-port.md
- Issue #507: https://github.com/p-to-q/wittgenstein/issues/507
- Issue #402: https://github.com/p-to-q/wittgenstein/issues/402
- PR #457: https://github.com/p-to-q/wittgenstein/pull/457
- PR #491: https://github.com/p-to-q/wittgenstein/pull/491
- PR #492: https://github.com/p-to-q/wittgenstein/pull/492
- PR #493: https://github.com/p-to-q/wittgenstein/pull/493
- PR #455: https://github.com/p-to-q/wittgenstein/pull/455
