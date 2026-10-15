# Reproducibility

Every CLI invocation creates `artifacts/runs/<run-id>/manifest.json`.

## Manifest Fields

- git SHA
- lockfile hash
- Node version
- Wittgenstein version
- command and args
- seed
- codec and route
- provider and model
- prompt raw and prompt expanded
- raw model output and parsed output
- artifact path and artifact hash
- duration, success flag, structured error

## Sibling Files

- `llm-input.txt`
- `llm-output.txt`
- final artifact when rendering succeeds

## Seed Rules

- CLI can pass `--seed`.
- Config can provide `runtime.defaultSeed`.
- The resolved seed is written to the manifest even on failure.

## Training-data sampling lock

The `polyglot-mini` adapter-training data pipeline emits its own deterministic receipt: `polyglot-mini/train/data_manifest.json` records the seed, the requested sample count, the actual write count, the SHA-256 of the produced `data.jsonl`, and the SHA-256 of the canonical (sorted) prompt list. Re-running `build_dataset_coco.py` against the same Karpathy split with the same seed reproduces the same hashes. See `polyglot-mini/train/data_manifest.py` for the helper and Issue #114 for context.

## The manifest spine is Wittgenstein's session contract

Per Brief K §K.1 (ratified by ADR-0017), the manifest spine is functionally the equivalent of [Anthropic Managed Agents](https://www.anthropic.com/engineering/managed-agents)' Brain / Hands / Session split, with the durable append-only **Session** mapping to `artifacts/runs/<id>/manifest.json`:

- **Brain** = the harness (`packages/core/src/runtime/`) — decision loop.
- **Hands** = the codecs (`packages/codec-*`) and `packages/sandbox` — uniform `Codec<Req, Art>.produce` is our `execute(name, input) → string` analog.
- **Session** = manifest spine — append-only durable trace; replay via `--manifest <path>` per RFC-0002.

The mapping is currently **per-run**, not cross-run: each CLI invocation writes one manifest. Anthropic's `wake(sessionId)` cross-run linkage would require a `parentRunId` field and an explicit `events[]` slot in the manifest schema; both are deferred to v0.4 per Brief K. The equivalence above is honest about the gap.

## The manifest row channel

v2 codecs author `ManifestRow`s and the harness folds them into the manifest. Two rules keep that channel honest (2026-10-16 closeout review, decisions CR1–CR3):

- **Closed set, single source.** `MANIFEST_ROW_KEYS` (`packages/schemas/src/codec/v2/manifest-rows.ts`) is the only allow-list; `foldManifestRows` refuses anything else with `MANIFEST_ROW_KEY_REJECTED`, and `ManifestRow.key` is typed by the same union.
- **Declared, then promoted.** Every key is declared in `RunManifestSchema`, so a canonical parse preserves the persisted receipts instead of stripping them. Values stay permissive (`unknown`) until a contract is promoted to a typed schema in place — first promotion landed with S7e (`8288bda`): `image.decoder` is the typed decoder receipt (runtime identity included), and a malformed row refuses the canonical parse (`MANIFEST_SCHEMA_INVALID`) instead of sliding through `unknown`. One serialization location per fact; promotion never duplicates a row into a second place.

## Replay verification

`wittgenstein replay <manifest-path>` re-executes a recorded run and checks its reproducibility claim instead of trusting it:

- **Deterministic local routes** (sensor, svg-local, asciipng-local): the recorded request is re-run; `REPLAY_OK` records artifact-SHA equality.
- **Image runs** (S7d, 2026-10-16, `23f2055`): the recorded `manifest.llmOutputRaw` is re-executed through the codec via the `services.recordedGeneration` seam — no LLM call and no dry-run-stub substitution (a recording that does not parse is `MANIFEST_LLM_OUTPUT_INVALID`). The recorded `image.decoder` row selects the decoder, which is loaded **cache-only** (replay never fetches; unknown id → `REPLAY_DECODER_UNSUPPORTED`, cache miss → `REPLAY_DECODER_UNAVAILABLE`). The chain, first violation wins: decoder identity (`decoderId` / `decoderHash` / `determinismClass`) → decode-input identity (`image.adapter.latentsSha256` re-digested; a bridge-lane manifest without the digest is `MANIFEST_MISSING_LATENTS_DIGEST`) → artifact parity at the decoder's declared class (`byte-parity` requires SHA equality; `structural-parity` — e.g. LlamaGen — verifies PNG signature + IHDR dimensions with bytes advisory). Completed image verdicts also report the recorded vs replayed runtime identity as advisory evidence (`baselineRuntime` / `replayRuntime` / `runtimeParity`, S7e) — runtime drift is reported, never a violation.
- **No silent greens**: placeholder-lane image manifests (no `image.decoder` row) still verify byte-for-byte by replaying the recorded scene; completed comparisons print their verdict on stdout, refusals print structured JSON on stderr with exit 1.

## Why This Exists

The manifest spine is the main quality bar in this scaffold. A failing run is still useful if it leaves a complete trace.
