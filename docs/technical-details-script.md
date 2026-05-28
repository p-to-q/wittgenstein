# Wittgenstein Technical Details + Speaker Script

Last updated: 2026-04-19

## 0) Project status in one line

Wittgenstein is currently in **scaffold phase**: core runtime, typed contracts, CLI surface, manifest/reproducibility spine, docs system, and presentation pages are implemented; modality renderers are mostly stubs that intentionally throw `NotImplementedError`.

Reference: `README.md`

---

## 1) System architecture (implemented)

### 1.1 Monorepo and toolchain

- Package manager: `pnpm` workspace (`pnpm-workspace.yaml`)
- Runtime baseline: Node `>=20.19.0`
- Language: TypeScript + zod contracts
- Root scripts:
  - `pnpm build`
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm dev:site`
  - `pnpm dev:presentation`

Reference: `package.json`

### 1.2 Five-layer harness model

Implemented architecture maps work to explicit layers:

1. **L1 Runtime/Harness**: routing, run-id, seed resolution, budget checks, telemetry, manifest writing
2. **L2 IR/Codec**: modality JSON schemas + prompt preambles + parse contracts
3. **L3 Renderer/Decoder**: IR -> output bytes (currently mostly stubbed)
4. **L4 Optional Adapter**: latent translators for neural image path (stubbed)
5. **L5 Packaging/Distribution**: CLI, docs, install scripts, CI, ownership boundaries

Reference: `docs/architecture.md`

---

## 2) Core runtime details (implemented)

### 2.1 End-to-end request flow

`Wittgenstein.run()` does the following:

1. Load codec via modality router
2. Create `runId` and `runDir`
3. Collect runtime fingerprint (`gitSha`, lockfile hash, Node version, app version)
4. Inject schema preamble into expanded prompt
5. Save `llm-input.txt`
6. Generate model output (or dry-run `{}`)
7. Save `llm-output.txt`
8. Parse via codec schema
9. Render artifact via codec renderer
10. Hash artifact and write `manifest.json`

References:

- `packages/core/src/runtime/harness.ts`
- `packages/core/src/runtime/manifest.ts`
- `packages/core/src/runtime/telemetry.ts`

### 2.2 LLM adapter layer

- Supports OpenAI-compatible providers with provider-specific default base URLs:
  - `openai-compatible`, `minimax`, `moonshot`, `deepseek`, `qwen`
- Supports Anthropic adapter branch
- Reads API key from configured env var (`apiKeyEnv`)
- Uses JSON response mode for structured output (`response_format: json_object`)

References:

- `packages/core/src/llm/openai-compatible.ts`
- `packages/core/src/llm/anthropic.ts`

### 2.3 Config merge strategy

Config resolution order:

1. built-in defaults
2. optional `wittgenstein.config.(ts|mts|js|mjs)`
3. env override (`WITTGENSTEIN_LLM_PROVIDER`, etc.)

References:

- `packages/schemas/src/config.ts`
- `packages/core/src/runtime/config.ts`

### 2.4 Safety and bookkeeping

- Budget tracker enforces token/cost ceilings
- Structured error serialization (`VALIDATION_ERROR`, `BUDGET_EXCEEDED`, `NOT_IMPLEMENTED`)
- Manifest schema is strongly typed (`RunManifestSchema`)

References:

- `packages/core/src/runtime/budget.ts`
- `packages/core/src/runtime/errors.ts`
- `packages/schemas/src/manifest.ts`

---

## 3) Schema and codec contract (implemented)

### 3.1 Request schema layer

Supported first-class modalities (locked):

- `image`
- `audio`
- `video`
- `sensor`

Each request extends `BaseRequest` (`prompt`, optional `out`, optional `seed`).

Reference: `packages/schemas/src/modality.ts`

### 3.2 Codec interface contract

Every codec must implement:

- `schemaPreamble(req)`
- `requestSchema`
- `outputSchema`
- `parse(llmRaw)`
- `render(parsed, ctx)`

Reference: `packages/schemas/src/codec.ts`

---

## 4) Per-modality implementation status

### 4.1 Image codec

#### Implemented

- Image request schema and scene-spec parser
- Prompt contract forbids SVG/HTML/Canvas/pixel arrays
- Pipeline shape fixed as:
  - `expandSceneSpec` -> `adaptSceneToLatents` -> `decodeLatentsToRaster` -> `packageRasterAsPng`
- Packaging to PNG bytes exists (`packageRasterAsPng` writes file + metadata)
- `adaptSceneToLatents` encodes a deterministic stub latent envelope (no stock-photo shortcuts)

#### Not implemented yet (intentional stubs)

- `decodeLatentsToRaster` (frozen neural decoder only; throws `NotImplementedError` until wired)

References:

- `packages/codec-image/src/schema.ts`
- `packages/codec-image/src/pipeline/index.ts`
- `packages/codec-image/src/pipeline/adapter.ts`
- `packages/codec-image/src/pipeline/decoder.ts`
- `packages/codec-image/src/pipeline/package.ts`

### 4.15 SVG codec (grammar engine path)

#### Implemented

- `svg` request + IR schema (`{"svg": "<svg ...>...</svg>"}`)
- CLI `wittgenstein svg` and harness branch that POSTs to `config.svg` HTTP engine (Outlines-side), then parses + writes `output.svg`
- Training/serve recipes under `research/chat2svg-lora/`

References:

- `packages/codec-svg/src/codec.ts`
- `packages/core/src/runtime/svg-generation.ts`
- `research/chat2svg-lora/README.md`

### 4.2 Audio codec

#### Implemented

- JSON audio plan schema
- Route selection contract: `speech | soundscape | music`
- Route dispatch logic in codec

#### Not implemented yet

- all three route renderers currently throw `NotImplementedError`

References:

- `packages/codec-audio/src/schema.ts`
- `packages/codec-audio/src/codec.ts`
- `packages/codec-audio/src/routes/*/index.ts`

### 4.3 Video codec

#### Implemented

- Video composition schema and parse
- HyperFrames wrapper seam

#### Not implemented yet

- actual HyperFrames render execution path

References:

- `packages/codec-video/src/schema.ts`
- `packages/codec-video/src/codec.ts`
- `packages/codec-video/src/hyperframes-wrapper.ts`

### 4.4 Sensor codec

#### Implemented

- Procedural signal schema (`ecg`, `gyro`, `temperature`)
- route dispatch by signal family

#### Not implemented yet

- concrete signal renderers

References:

- `packages/codec-sensor/src/schema.ts`
- `packages/codec-sensor/src/codec.ts`
- `packages/codec-sensor/src/signals/*.ts`

---

## 5) CLI surface (implemented)

Commands:

- `wittgenstein init`
- `wittgenstein image <prompt>`
- `wittgenstein audio <prompt>`
- `wittgenstein video <prompt>`
- `wittgenstein sensor <prompt>`
- `wittgenstein doctor`

All codec commands share:

- root auto-discovery (walk up to `pnpm-workspace.yaml`)
- unified harness invocation
- JSON outcome print (`ok`, `runId`, `runDir`, `artifactPath`, `error`)

References:

- `packages/cli/src/index.ts`
- `packages/cli/src/commands/shared.ts`
- `packages/cli/src/commands/*.ts`

---

## 6) Docs, research, and presentation assets (implemented)

### 6.1 Aquin clone bootstrap assets

Prepared extraction workspace:

- `docs/research/www.aquin.app/index.raw.html`
- `docs/research/www.aquin.app/index.rendered.html`
- `docs/research/www.aquin.app/index.html` (localhost-friendly asset URL patch)
- `docs/research/www.aquin.app/screenshot.png`
- `docs/research/www.aquin.app/capture-page.mjs`
- `docs/research/www.aquin.app/patch-for-localhost.mjs`

Reference: `docs/research/www.aquin.app/README.md`

### 6.2 Presentation page (Aquin-inspired UI)

A standalone one-page deck exists at:

- `apps/presentation/index.html`
- run with: `pnpm dev:presentation`
- URL: `http://127.0.0.1:4280/`

---

## 7) Test status snapshot

Unit tests exist for:

- codec registry surface (`@wittgenstein/core`)
- CLI command registration (`@wittgenstein/cli`)
- schema contract validation (`@wittgenstein/schemas`)

Note: running `pnpm -r test` currently fails in this environment because some workspaces have missing local `node_modules`/`vitest` binaries (`spawn ENOENT`).

References:

- `packages/core/test/harness.test.ts`
- `packages/cli/test/index.test.ts`
- `packages/schemas/test/contract.test.ts`

---

## 8) Easy-to-understand speaker script (10-12 min)

Use this as a literal narration script.

### Opening (45s)

"Wittgenstein is a modality harness for text-first LLMs. We do not claim the base model is a native multimodal giant. Instead, we enforce structured JSON IR and compile it into files through codec pipelines."

### Architecture (2 min)

"The project is split into five explicit layers so contributors cannot put logic in the wrong place:
L1 runtime orchestration, L2 schema/IR, L3 renderer/decoder, L4 optional adapters, L5 packaging and distribution.
This is codified in `docs/architecture.md` and mapped directly to package boundaries."

### Runtime spine (2 min)

"For each run, the harness creates a run ID, writes expanded prompt and raw model output, validates the codec parse result, attempts rendering, then writes a full manifest with tokens, cost, hashes, and error state. Even failures are first-class artifacts under `artifacts/runs/<runId>/`."

### Codec contract (2 min)

"Every modality package implements the same interface: preamble, request schema, output schema, parse, render.
This gives us shared control flow with per-modality specialization and makes testing predictable."

### Modality status (2 min)

"Image has the strongest shape today: the sole neural path is now framed as Visual Seed Code-bearing contract to seed expander / adapter to frozen decoder to PNG.
Semantic IR remains useful for model-side organization and user inspection, but it is not the terminal image research object. Audio, video, and sensor have typed schemas and dispatch seams, with maturity called out per modality."

### Product/UX assets (1 min)

"We also prepared an Aquin-inspired presentation web page under `apps/presentation` and a research extraction workspace for `www.aquin.app`, including rendered DOM capture and localhost URL patching."

### Honest close (1 min)

"So what is implemented today is the scaffold that guarantees correctness and reproducibility at system level. What remains is modality renderer depth: adapter/decoder for image and route renderers for audio/video/sensor. The architecture is locked; the heavy lifting now is backend realization."

---

## 9) Demo commands script (copy-paste)

```bash
# 1) init config
pnpm --filter @wittgenstein/cli exec wittgenstein init

# 2) health check
pnpm --filter @wittgenstein/cli exec wittgenstein doctor

# 3) dry-run image (tests manifest spine without API)
pnpm --filter @wittgenstein/cli exec wittgenstein image "minimal poster about modality harness" --dry-run

# 4) dry-run audio
pnpm --filter @wittgenstein/cli exec wittgenstein audio "calm narrative intro" --dry-run

# 5) start presentation page
pnpm dev:presentation
# open http://127.0.0.1:4280/
```

If you run without `--dry-run`, ensure API key env is set according to `wittgenstein.config.ts` (`apiKeyEnv`).
