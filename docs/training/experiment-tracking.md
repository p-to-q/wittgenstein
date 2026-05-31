# Training experiment tracking

This is the repository-side tracking contract for Phase 1 training runs. It
does not deploy the shared Aim service requested by
[#399](https://github.com/p-to-q/wittgenstein/issues/399); that still needs a
lab-owned endpoint, credentials, and contributor-access validation.

## Receipt model

`TrainingRunManifest` stays the canonical checkpoint receipt and remains
strict. Do not add a freeform top-level `experiment` block to it. Tracker
linkage lives next to the run as a sibling receipt:

- `config.json` contains an `experimentTracking` reference with tracker name,
  run id, receipt path, metrics-log path, and URI.
- `experiment-metrics.jsonl` contains append-only params and metrics records.
- `experiment.json` is the final `witt.training.experiment/v0.1` receipt. It
  records the tracker, metrics-log SHA-256/byte count, training run id, and the
  final training-manifest/checkpoint hashes when the run finishes.

This keeps the checkpoint receipt stable while allowing Aim, W&B, MLflow, or
the local JSONL floor to point back to the same training run.

## Local JSONL floor

`research.training._shared.experiment_tracking.JsonlExperimentTracker` is the
stdlib implementation used by CPU smoke tests and offline training runs. It is
not a replacement for a shared tracking service; it is the minimum executable
receipt floor so CI can prove that every tokenizer smoke run emits tracker
evidence without requiring a network service.

Tokenizer smoke runs now write:

```text
research/training/_shared/runs/smoke/<run-id>/config.json
research/training/_shared/runs/smoke/<run-id>/experiment-metrics.jsonl
research/training/_shared/runs/smoke/<run-id>/experiment.json
research/training/_shared/runs/smoke/<run-id>/ckpts/final.manifest.json
research/training/_shared/runs/smoke/<run-id>/ckpts/final.pt
```

The generated `research/training/_shared/runs/` tree is ignored by git.

## External trackers

External tracker adapters should emit the same `experiment.json` receipt. The
schema already accepts `aim`, `wandb`, and `mlflow` tracker ids, but a tracker
adapter is not complete until it writes:

- the tracker URI and remote run id;
- the metrics-log or exported event-log digest;
- the matching final `TrainingRunManifest` reference;
- enough setup docs for a contributor to view the run from a fresh checkout.

Aim remains the intended lab default for #399, but the repo contract does not
claim that a shared Aim endpoint exists. Before closing #399, validate the
current Aim deployment instructions, endpoint access, retention policy, and
sample tokenizer run against the lab environment.

## Verification

Run the receipt-floor checks locally:

```bash
python3 -m unittest research.training._shared.test_manifest \
  research.training._shared.test_experiment_tracking
python3 -m research.training._shared.smoke_manifest
python3 -m research.training.tokenizer.smoke_test
pnpm --filter @wittgenstein/schemas test -- training
```

These checks prove schema and smoke-run receipt shape only. They do not prove
ImageNet/CC12M data availability, lab GPU performance, model quality, or shared
tracker access.
