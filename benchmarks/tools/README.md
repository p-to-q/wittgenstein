# benchmarks/tools/

Phase-4 quality-metric runners (per `ROADMAP.md` Phase 4). Today every entrypoint here is a typed Python skeleton that raises `NotImplementedError` — landing the contract first so that wiring CLIP / Whisper / discriminative classifiers can happen one PR at a time without rediscovering the file layout.

## Contract

Every runner is invoked as:

```bash
python benchmarks/tools/<runner>.py \
  --artifact <artifact-path> \
  --manifest <run-manifest.json> \
  --out <score-receipt.json>
```

- `--artifact` — path to a single artifact (e.g. `.png`, `.wav`, `.csv`) under `artifacts/runs/<run-id>/`.
- `--manifest` — path to the run manifest at `artifacts/runs/<run-id>/manifest.json` (the runner inspects modality / route / seed for context).
- `--out` — path to write a structured **score receipt** JSON. If the runner is not yet implemented it raises `NotImplementedError` and writes nothing; the caller can detect this from the missing file and fall back to the structural smoke proxy.

## Score receipt shape

When a runner is implemented, the receipt JSON has this shape (tighter typing TBD when the first real runner lands):

```json
{
  "tool": "clipscore",
  "version": "0.0.1",
  "metric": {
    "name": "CLIPScore",
    "value": 0.832,
    "unit": "cosine"
  },
  "model": {
    "id": "openai/clip-vit-base-patch32",
    "deterministic": true
  },
  "inputs": {
    "artifact": "artifacts/runs/2026-04-20T14-52-33_a3f9b2/artifact.png",
    "manifest": "artifacts/runs/2026-04-20T14-52-33_a3f9b2/manifest.json",
    "prompt": "stormy ocean at midnight"
  },
  "generatedAt": "2026-05-06T12:34:56Z"
}
```

The shape is **not yet a zod-validated boundary** — it solidifies when the first runner lands and the actual data shape is known.

## Runners

| File | Modality | Metric | Status |
| --- | --- | --- | --- |
| `clipscore.py` | image | CLIPScore (image-text cosine) | 🔴 Stub |
| `wer.py` | audio (speech) | Whisper WER | 🔴 Stub |
| `disc_score.py` | sensor | discriminative-score classifier | 🔴 Stub |
| `chart.py` | all | aggregate score chart from `artifacts/benchmarks/<tag>/*.json` | 🔴 Stub |

## Why scaffolding-only first

Per ROADMAP.md Phase 4 plan: the metric runners land at v0.4. Without scaffolding, the first contributor to wire CLIP has to discover the file layout, dependency choice, manifest contract, and CI integration from scratch. With scaffolding, that contributor only has to fill in the model call.

Each stub:

- Validates argparse inputs.
- Reads the run manifest and asserts the modality matches what the runner expects.
- Raises `NotImplementedError` with a one-line "wire X here" message.
- A test under `benchmarks/tools/test_*` asserts the `NotImplementedError` fires (so that "still a stub" is itself a checked invariant — silent success here would be the worst failure mode).

## Out of scope

- Real model dependencies (`transformers` / `openai-whisper` / `torch`) are NOT added to `polyglot-mini/requirements.txt`. They land per-runner when the first implementation PR lands.
- CI integration. The runners are runnable from shell today; whether they become a CI gate is a separate decision tied to model-cost / runtime budgets.
- Backfilling historical receipts. The score receipts are forward-looking — runs after v0.4 land get them; pre-v0.4 runs do not.

## Related

- `ROADMAP.md` Phase 4 — metric runner list
- `benchmarks/harness.ts` — the structural smoke proxy that runs today
- Issue #187 — this scaffolding's filing
- Issue #189 — manifest schema discriminated union (coordinates with the score-receipt shape lock)
