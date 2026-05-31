---
date: 2026-05-31
status: closeout note
labels: [research-derived, m1b-image, training, python, reproducibility, maintainer-audit]
tracks: [#441, #435, #396, #397, #398, #399, #400]
---

# Phase 1 Training Stack Re-audit Closeout

This closes the actionable #441 re-audit surface without approving an
expensive training run. The durable boundary is:

- `research/training/` remains the canonical home for tokenizer, adapter, and
  LLM-head GPU training programs.
- `python/image_adapter/` remains a narrow M1B scene-spec-to-latent bridge, not
  a second general Phase 1 training stack.
- `packages/schemas/src/training-manifest.ts` owns the canonical
  `witt.training.run-manifest/v0.1` receipt contract.
- Python training loops must emit that schema directly, rather than a separate
  Python-only receipt shape.

## Dated Sources Checked

- 2026-05-16 local re-audit:
  `docs/research/2026-05-16-training-stack-re-audit.md`.
- 2026-05-27 pre-training readiness:
  `docs/research/2026-05-27-pre-training-readiness.md`.
- 2026-05-31 training-homes decision:
  `docs/research/2026-05-31-training-homes-decision.md`.
- PyTorch FSDP2 `fully_shard` docs, checked 2026-05-31:
  https://docs.pytorch.org/docs/main/distributed.fsdp.fully_shard.html.
- PyTorch `torchrun` docs, checked 2026-05-31:
  https://docs.pytorch.org/docs/main/elastic/run.html.
- DeepSpeed ZeRO docs, checked 2026-05-31:
  https://deepspeed.readthedocs.io/en/stable/zero3.html.
- DVC remote-storage docs, checked 2026-05-31:
  https://doc.dvc.org/user-guide/data-management/remote-storage.
- Hugging Face model-card docs, checked 2026-05-31:
  https://huggingface.co/docs/hub/en/model-cards.

## Decisions

- **Framework base:** plain PyTorch plus `torchrun`/DDP remains the first
  executable contract. FSDP2 and DeepSpeed remain escalation paths for memory
  pressure, not the receipt owner.
- **Receipt contract:** the TypeScript `TrainingRunManifestSchema` is canonical.
  The Python helper now mirrors it, including optimizer state SHA-256,
  checkpoint byte/SHA/license fields, dataset SHA, hardware, and config
  reference.
- **CPU smoke honesty:** schema hardware now permits `gpuCount: 0`. CPU-only
  smoke receipts should say they are CPU receipts instead of inventing a GPU.
- **Reuse strategy:** LlamaGen tokenizer reuse remains limited to the audited
  shim already under `_shared/_third_party`. TiTok, Open-MAGVIT2, MaskGIT, or
  broader VQGAN reuse still needs license and model-owner review before
  becoming training code.
- **Data and eval:** #400 still owns DVC remote/dataset snapshot policy. #394,
  #399, and the Phase 1 trackers still own metric wrappers, tracker wiring, and
  empirical model-quality gates.

## Safe Before GPU

The following is safe to merge before lab compute:

- stdlib-only `research.training._shared.smoke_manifest`;
- `research.training._shared.test_manifest`;
- canonical Python manifest writer updates;
- schema tests for optimizer receipts and CPU-only smoke;
- tokenizer smoke validation that fails if the emitted manifest shape drifts.

These changes are receipt-floor work. They do not claim model quality, dataset
readiness, or checkpoint publishability.

## Must Wait

The following still require maintainer/model-owner review or real lab evidence:

- final FSDP2/DeepSpeed/Fabric/Accelerate composition;
- ImageNet/CC12M dataset snapshot, DVC remote provider, and credentials;
- learned tokenizer/adapter/LLM-head quality claims;
- Hugging Face org/repo layout and model-card publication;
- any reuse expansion beyond the currently vendored LlamaGen-compatible shim.

## Issue Acceptance Impact

No #396-#400 acceptance text changes are required from this closeout. Their
training/eval/data scopes remain correct; this PR only replaces an ambiguous
manifest skeleton with a runnable, schema-aligned receipt floor.

This note is ready for maintainer/model-owner sign-off on the Phase 1
training-stack boundary. It does not approve expensive training, checkpoint
publication, or quality claims.
