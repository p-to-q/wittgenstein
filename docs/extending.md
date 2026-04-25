# Extending Wittgenstein

Wittgenstein has two surfaces that share one architecture:

- **TypeScript monorepo** (`packages/*`) — production harness with typed contracts,
  schema validation, CI gates, and the manifest spine
- **Python prototype** (`polyglot-mini/`) — rapid iteration surface for new codecs and
  adapters before they are ported

The five layers are identical on both sides. Most new work starts on the Python side
(fast to iterate) and graduates to the TypeScript side (typed, shipped).

This document is the contract for extending either surface.

---

## 1. Add a new codec (TypeScript)

The cleanest template is `packages/codec-sensor/` — it has real rendering, no external
service dependencies, and shows every layer.

### Step 1. Create the package

```bash
cp -r packages/codec-sensor packages/codec-<modality>
```

Rename references in `package.json` and `tsconfig.json`.

### Step 2. Define the IR schema

`packages/codec-<modality>/src/schema.ts` — this is L2. Use zod:

```ts
import { z } from "zod";

export const MyIrSchema = z.object({
  subject: z.string(),
  // ... codec-specific fields
});

export type MyIr = z.infer<typeof MyIrSchema>;

export const myCodecSchemaPreamble = (req: MyRequest): string => `
You are emitting JSON matching this contract: ...
Return ONLY the JSON object.
`;
```

### Step 3. Implement the codec

`packages/codec-<modality>/src/codec.ts` — implement `WittgensteinCodec<Req, Parsed>`:

```ts
import { Modality, type WittgensteinCodec } from "@wittgenstein/schemas";

export const myCodec: WittgensteinCodec<MyRequest, MyIr> = {
  name: "my-modality",
  modality: Modality.MyModality,
  schemaPreamble: myCodecSchemaPreamble,
  requestSchema: MyRequestSchema,
  outputSchema: MyIrSchema,
  parse: parseMyIr,
  async render(parsed, ctx) {
    // L3: JSON → real file
    return renderMyArtifact(parsed, ctx);
  },
};
```

### Step 4. Wire it into the harness

Add the codec to `packages/core/src/codecs/my-modality.ts` and register in the harness
bootstrap sequence.

### Step 5. Add a CLI subcommand

`packages/cli/src/commands/my-modality.ts` — pattern matches the existing `sensor.ts`.

### Step 6. Add tests

At minimum: a vitest that instantiates the codec and verifies it matches the
`WittgensteinCodec` type contract. See `packages/schemas/test/contract.test.ts` for
the pattern.

### Step 7. Add a docs page

`docs/codecs/my-modality.md` — must cover IR shape, render guarantees, token budget,
and failure modes.

### Step 8. Register in CODEOWNERS

Add the codec path to `.github/CODEOWNERS` with the owning team.

---

## 2. Add a new codec (Python / polyglot-mini)

Lower-ceremony, higher-velocity. Use this path when iterating on codec design before
committing to a typed TS implementation.

### Step 1. Create the codec module

`polyglot-mini/polyglot/my_codec.py`:

```python
def generate_my_modality(prompt: str, out_path: str, **kwargs) -> dict:
    # L1: optionally call LLM
    # L2: extract / validate JSON IR
    # L3: render IR to file at out_path
    return {
        "ok": True,
        "codec": "my-modality:procedural",
        "artifact_path": out_path,
        # ... other manifest fields
    }
```

### Step 2. Wire the CLI

In `polyglot-mini/polyglot/cli.py`, add a subparser block mirroring the existing `sensor`
command pattern.

### Step 3. Document the IR shape

Add a section to `polyglot-mini/README.md` under "What Ships" and include the JSON shape.

### Step 4. Optional — train an adapter

If the codec benefits from a tiny learned component, create `polyglot-mini/train/train_<modality>.py`
following the pattern in `train_audio.py`. Keep the MLP under 100 parameters-per-output-dim if possible.

---

## 3. Train a new adapter

Adapters are the only trained components. They translate LLM semantics into codec-friendly
parameter spaces. They are tiny by design.

### Design rules

- **Pure numpy, no torch.** The existing adapters train in single-digit seconds on CPU.
  If your adapter needs torch, it is probably doing too much work — consider moving the
  intelligence into the codec's renderer instead.
- **Hashed bag-of-words embedding.** See `polyglot-mini/train/train.py::embed()`. Double-hash
  - bigrams + L2 norm gets you dim 256–512 feature vectors with zero vocab to maintain.
- **One-hop MLP.** Two to three hidden layers is enough. Adam with gradient clipping.
- **Save as `.npz`.** Load via `np.load()`. No pickle, no custom serialisation.

### Checklist

- [ ] Dataset is real (COCO captions, keyword-seeded synthetic, etc.), not toy
- [ ] Train script reports val loss every N epochs and saves best checkpoint
- [ ] Inference function `predict(prompt, adapter_path)` returns a dict matching the codec's
      expected parameter space
- [ ] Training completes in under one minute on CPU
- [ ] Checkpoint committed to the repo (npz files are small)
- [ ] Architecture, embedding, training time, and val loss go into `docs/benchmark-standards.md`

---

## 4. Add a new LLM provider

Provider routing lives in `polyglot-mini/polyglot/llm.py` (Python) and
`packages/core/src/llm/` (TypeScript). Both support OpenAI-compatible endpoints by default;
custom providers need a small adapter.

### Python

In `polyglot-mini/polyglot/llm.py`, add to the provider autodetect chain:

```python
if os.environ.get("MY_PROVIDER_API_KEY"):
    return _call_my_provider(messages, ...)
```

Implement `_call_my_provider` using stdlib `urllib` — no SDK imports.

### TypeScript

In `packages/core/src/llm/`, create a new adapter file implementing `LlmAdapter`:

```ts
export class MyProviderAdapter implements LlmAdapter {
  provider = "my-provider";
  async generate(req: LlmGenerationRequest): Promise<LlmGenerationResult> { ... }
}
```

Register it in the config resolution chain.

Both paths must:

1. Normalise input to the standard message array format
2. Report `{ input_tokens, output_tokens }` in the result
3. Redact the API key from any logged error

---

## 5. Add a new benchmark case

In `benchmarks/cases.json`, add a case matching the `BenchmarkCase` shape:

```json
{
  "id": "my-case-id",
  "modality": "my-modality",
  "prompt": "A short descriptive prompt",
  "out": "artifacts/benchmarks/my-case.ext",
  "dryRun": true
}
```

If the modality has a custom quality proxy, add its scoring function to
`benchmarks/harness.ts::scoreQuality()`.

Update `docs/benchmark-standards.md` with the baseline measurement after running
`pnpm benchmark` once.

---

## 6. Philosophical rules (non-negotiable)

- **Decoder, not generator.** Renderers are deterministic given IR + seed. Sampling happens
  in the LLM call (where it is logged), not in the codec (where it would break reproducibility).
- **Schema at every boundary.** IR between L1 and L2, request into the CLI, output from the
  codec — all validated by zod (TS) or explicit parsing (Python).
- **Fail loudly.** Structured errors with codes. No magic strings. Every failure writes a
  manifest.
- **No silent fallbacks.** If the neural codec fails, the CLI returns a structured error.
  Do not add a "temporary" SVG or canvas path. This is enforced architecturally in the
  image codec; apply the same standard to new codecs.

---

## 7. Doc checklist before merging

A new codec is not done until these are updated:

- [ ] `docs/codecs/<modality>.md` — full IR spec and render guarantees
- [ ] `docs/implementation-status.md` — Ships / Partial / Stub row
- [ ] `docs/benchmark-standards.md` — per-modality standard metrics and local proxy
- [ ] `benchmarks/README.md` — baseline row if dry-run case added
- [ ] `CHANGELOG.md` — entry under `[Unreleased]`
- [ ] `.github/CODEOWNERS` — path and owner
- [ ] `packages/cli/README.md` — new CLI subcommand usage
- [ ] root `README.md` — if this adds a new shipping modality, update the "What Ships" table

---

## Where to look for precedent

| You want to...                                            | Read this first                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Understand the repo's engineering standard before editing | `docs/engineering-discipline.md`                                           |
| Add a new codec in TS                                     | `packages/codec-sensor/src/` (end-to-end real renderer, no external deps)  |
| Add a new codec in Python                                 | `polyglot-mini/polyglot/sensor.py` (same codec, Python surface)            |
| Train a small adapter                                     | `polyglot-mini/train/train_audio.py` (cleanest, smallest, fastest)         |
| Add an LLM provider                                       | `polyglot-mini/polyglot/llm.py::_call_kimi_k2()` (stdlib urllib, no SDK)   |
| Add a sandbox boundary                                    | `polyglot-mini/polyglot/sandbox.py` (subprocess with pre-injected globals) |
| Shape a new IR schema                                     | `packages/codec-sensor/src/schema.ts` (zod + preamble generator)           |
