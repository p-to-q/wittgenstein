# benchmarks/tools/

Phase-4 quality-metric runners (per `docs/roadmap.md` Phase 4). Model-backed metric
runners still land one PR at a time; implemented runners write score receipts or
charts, while unimplemented runners raise `NotImplementedError` instead of silently
passing.

## Contract

Per-artifact metric runners are invoked as:

```bash
python benchmarks/tools/<runner>.py \
  --artifact <artifact-path> \
  --manifest <run-manifest.json> \
  --out <score-receipt.json>
```

- `--artifact` — path to a single artifact (e.g. `.png`, `.wav`, `.csv`) under `artifacts/runs/<run-id>/`.
- `--manifest` — path to the run manifest at `artifacts/runs/<run-id>/manifest.json` (the runner inspects modality / route / seed for context).
- `--out` — path to write a structured **score receipt** JSON. If the runner is not yet implemented it raises `NotImplementedError` and writes nothing; the caller can detect this from the missing file and fall back to the structural smoke proxy.

The aggregate chart runner is invoked as:

```bash
python benchmarks/tools/chart.py \
  --receipts-dir artifacts/benchmarks/<tag> \
  --tag <tag> \
  --out artifacts/benchmarks/<tag>.png
```

## Score receipt shape

Implemented runners write receipt JSON in the shared shape enforced by
`score_receipt.py`:

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

This is now a code boundary for benchmark tools: `score_receipt.py` validates the common
fields (`tool`, `version`, `metric`, `model`, `inputs`, `generatedAt`) before downstream
tools consume a receipt. A future TypeScript / Zod mirror can land when score receipts
become part of the public schema package.

## Runners

| File            | Modality       | Metric                                                         | Status  |
| --------------- | -------------- | -------------------------------------------------------------- | ------- |
| `clipscore.py`  | image          | CLIPScore (image-text cosine)                                  | 🔴 Stub |
| `wer.py`        | audio (speech) | Whisper WER                                                    | 🔴 Stub |
| `disc_score.py` | sensor         | discriminative-score classifier                                | 🔴 Stub |
| `chart.py`      | all            | aggregate score chart from `artifacts/benchmarks/<tag>/*.json` | ✅ PNG chart |

## Why scaffolding-only first

Per docs/roadmap.md Phase 4 plan: the metric runners land at v0.4. Without scaffolding, the first contributor to wire CLIP has to discover the file layout, dependency choice, manifest contract, and CI integration from scratch. With scaffolding, that contributor only has to fill in the model call.

Each unimplemented runner:

- Validates argparse inputs.
- Reads the run manifest and asserts the modality matches what the runner expects.
- Raises `NotImplementedError` with a one-line "wire X here" message.
- A test under `benchmarks/tools/test_*` asserts the `NotImplementedError` fires (so that "still a stub" is itself a checked invariant — silent success here would be the worst failure mode).

`chart.py` is implemented now: it reads score receipts, validates the common
receipt shape through `score_receipt.py`, and writes a matplotlib PNG with one panel per
raw metric unit. Values are intentionally not normalized across metrics.

## Out of scope

- Real model dependencies (`transformers` / `openai-whisper` / `torch`) are NOT added to `polyglot-mini/requirements.txt`. They land per-runner when the first implementation PR lands.
- CI integration. The runners are runnable from shell today; whether they become a CI gate is a separate decision tied to model-cost / runtime budgets.
- Backfilling historical receipts. The score receipts are forward-looking — runs after v0.4 land get them; pre-v0.4 runs do not.

## Related

- `docs/roadmap.md` Phase 4 — metric runner list
- `benchmarks/harness.ts` — the structural smoke proxy that runs today
- Issue #187 — this scaffolding's filing
- Issue #189 — manifest schema discriminated union (coordinates with the score-receipt shape lock)
