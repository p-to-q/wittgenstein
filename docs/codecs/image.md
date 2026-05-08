# Image Codec

Image is the strictest modality in Wittgenstein. It has one path and one path only:

`LLM -> Visual Seed Code-bearing image contract -> seed expander / adapter -> frozen decoder -> PNG`

## Position

This codec is intentionally closer to a **VQ / discrete latent token** view of images than to a direct pixel-emission or local diffusion view.

That means:

- the canonical image contract should carry **Visual Seed Token / Visual Code** as a first-class layer
- `Semantic IR` may travel beside it to activate / organize concepts, expose intent, improve diagnosis, or condition a higher-quality compile
- a small seed expander / adapter should map compact visual code into fuller discrete latent codes
- a frozen decoder should turn those codes into raster pixels

The project is explicitly trying to move as much modality-specific work as possible out of the paid text-token loop and into a local portability layer.

## What the LLM Emits

The model emits a **Visual Seed Code-bearing image contract**. In the default lane it should carry:

- a `seedCode` layer:
  - compact visual code / seed tokens
  - emitted by next-token prediction
  - closer to decoder token space than prose
- an optional `semantic` layer:
  - intent and subject
  - composition and framing
  - lighting and mood
  - style cues
  - human-readable constraints
- optional `coarseVq` / `providerLatents`:
  - when the model or provider can already emit decoder-facing code
- decoder hints such as family and latent resolution

The model does not emit SVG, HTML, Canvas programs, or raw pixels.

`Visual Seed Token` is the primary image research layer. `Semantic IR` remains supported
because pure seed-token output can be opaque, brittle, or hard to debug. Its role is
model-side concept activation / semantic organization, user-facing inspection, optional
auxiliary conditioning for seed expansion or later decoder-side networks, and a legal
fallback / high-quality compile support layer.

## One-shot and two-pass lanes

Two image lanes are legal:

- **one-shot VSC** — emit `seedCode` and any optional `semantic` layer in one output object
- **two-pass compile** — pass 1 emits semantic IR; pass 2 consumes that IR and emits `seedCode` / VQ hints

One-shot VSC is the default lane to optimize first.
Two-pass compile is the explicit high-quality lane.

## CLI inspection surface

The default CLI output stays compact. Image-specific inspection flags expose the already
recorded receipt fields without changing generation behavior:

```bash
wittgenstein image "otter portrait" --dry-run --show-image-code --show-semantic --show-seed-summary
```

- `--show-image-code` prints the manifest `image.code` receipt: fired path, semantic
  source, seed family / mode / length, and any coarse / provider latent grids.
- `--show-semantic` prints the emitted or effective Semantic IR with its receipt source.
  This is the human-inspection layer; it is not proof that semantic fallback was the active
  backend path.
- `--show-seed-summary` prints a compact execution summary for the decoder-facing layer.

These flags intentionally do not add `--mode`, `--quality`, or two-pass orchestration yet.
They expose path honesty first; generation-mode controls belong with the prompt-stack /
eval work once the acceptance cases are settled.

## Optional `providerLatents` (MiniMax / API extensions)

If the text API can return discrete VQ indices in the same object, include them under `providerLatents` using the `witt.image.latents/v0.1` shape (`family`, `codebook`, `codebookVersion`, `tokenGrid`, `tokens`). When valid, the runtime **skips** seed expansion and decodes those tokens directly.

This is the cleanest version of the thesis:

`text-first LLM -> latent tokens -> frozen decoder -> PNG`

## Pipeline Stages

- `pipeline/expand.ts`
  Expands or normalizes semantic IR and image-code sections after parsing.
- `pipeline/adapter.ts`
  Adapter routing: `adaptSceneToLatents` runs a 4-tier fall-through (`providerLatents` → `coarseVq` → `seedCode` → learned MLP → placeholder) and returns `{ latents, outcome }`. The outcome surfaces in the manifest as `renderPath` (see _Manifest receipts_ below), distinct from `imageCode.path` which records the spec _intent_.
- `adapters/seed-expander.ts`
  The `SeedExpander` seam — the contract that turns a Visual Seed Code into decoder-native `ImageLatentCodes`. Today's implementations are placeholder-class, not trained projectors:
  - `placeholderSeedExpander` (PR #243) — deterministic 1D modulo fill that preserves the prior in-line behavior; the seam was extracted so future trained projectors drop in by changing one import.
  - `tileMosaicSeedExpander` (PR #252) — a second deterministic implementation that exercises the seam as an ABI peer rather than a refactor; uses a 2D coarse mosaic instead of linear modulo. Both are placeholder-class — neither makes a decoder-quality claim.
- `pipeline/decoder.ts`
  Calls a frozen pretrained decoder bridge.
- `pipeline/package.ts`
  Packages the decoded raster bytes into the final PNG artifact.

## Manifest receipts

The image codec records two distinct path facts so a maintainer can tell intent from outcome:

- `manifest["image.code"].path` — _intent_: which hint did the LLM-emitted spec carry? One of `provider-latents` / `coarse-vq` / `visual-seed-code` / `semantic-fallback`.
- `manifest.renderPath` — _outcome_: which adapter tier actually produced the latents? One of `provider-latents` / `coarse-vq` / `visual-seed-code` / `learned-mlp` / `placeholder`. Plumbed via `ImageAdapterOutcome` (PR #250). A bogus `providerLatents` that fails validation now surfaces as `renderPath: coarse-vq` (or further down the fall-through), not as a silent path swap.

Both fields are written through the harness manifest spine. The important parity with audio and sensor is not the field name: audio reports its concrete backend under `audioRender.decoderId` / `determinismClass`, sensor reports its dashboard route through `renderPath`, and image reports adapter-tier outcome through `renderPath`. In all three cases, the manifest names the path that actually fired instead of silently swapping behavior.

## Adapter Role

The adapter is the small learned **seed expander / visual-code compiler** between the LLM-facing Visual Seed Code contract and the decoder's latent vocabulary. It is the only trainable part of the image stack in this scaffold.

Planned training shape:

- dataset: image-aligned semantic/seed pairs or tokenizer-derived seed/code pairs
- target: decoder codebook indices
- objective: seed-to-latent token prediction
- form factor: LoRA or compact translator, not a full image model

In other words, the repo is not trying to train “another image model” here. It is trying to train the smallest possible bridge between:

- compact visual seed code (optionally conditioned on semantic IR)
- decoder-native latent codes

## Decoder Candidates

- `llamagen`
- `seed`
- `dvae`-style bridge for smaller ablations

All of these are treated as frozen decoders. The project does not admit diffusion or general text-to-image generators here.

That distinction matters:

- a **generator** samples from a learned image distribution
- a **decoder** deterministically reconstructs pixels from a code representation

Wittgenstein is designed around the latter.

## Failure Modes

- the model emits invalid structured image code
- the semantic layer validates but seed code is absent or malformed
- the seed code validates but the expander cannot map it to usable latents
- the decoder family does not match the expected codebook
- packaging receives bytes in the wrong shape

## Honest Risk Statement

The scaffold now includes:

- a deterministic semantic-to-latent baseline path for validating end-to-end wiring, manifests, and artifact packaging
- direct provider-latent passthrough for the cleanest text-first-to-decoder thesis
- a narrow-domain reference decoder bridge for higher-quality local showcase output on the same Visual Seed Code path

This still does **not** represent the final image thesis. Real generation quality ultimately depends on a properly wired frozen decoder family and a stronger seed-expansion path than the current scaffold uses.

## Training the seed-expansion adapter (v1 placeholder scaffold)

> **Status:** the procedure below is the _placeholder MLP scaffold_ preserved from before the SeedExpander seam (#243) and the tokenizer/decoder radar (#258). It exists so the codec has an end-to-end runnable path during scaffolding; it is **not** the target architecture for the trained projector that M1B (#70) will eventually deliver.
>
> The real trained projector is gated on the radar (#258) picking a tokenizer family with: (a) verified `MIT-or-Apache` license, (b) downloadable + SHA-pinnable weights, (c) deterministic round-trip empirically tested, (d) Node/ONNX feasibility confirmed. Until those gates trip, the placeholder scaffold below is what runs.

1. Prepare `data/image_adapter/raw/metadata.jsonl` and images — see [`data/image_adapter/README.md`](../../data/image_adapter/README.md).
2. Run `python/image_adapter/prepare_dataset.py` then `encode_offline.py` then `train.py` — see [`python/image_adapter/README.md`](../../python/image_adapter/README.md).
3. Point **preferred** weights at the exported `adapter_mlp.json` when running the harness:
   - **`WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH`** — new / better model (tried first)
   - **`WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH`** — older backup (tried if preferred fails load or grid match)
   - Legacy aliases: `WITTGENSTEIN_IMAGE_ADAPTER_MLP_PATH` (first slot) and `WITTGENSTEIN_IMAGE_ADAPTER_MLP_FALLBACK_PATH` (second slot)

Quick PNG preview (no LLM):

```bash
export WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH=data/image_adapter/artifacts/adapter_mlp.json
export WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH=data/image_adapter/artifacts/adapter_mlp_legacy.json
pnpm exec tsx scripts/render-image-adapter-demo.ts artifacts/demo/mlp-adapter-demo-forest.png forest
```

The default training stack uses a **small MLP** (no LLM fine-tuning) and a **stub offline encoder** for targets; swap the encoder for a real frozen tokenizer when you wire a production decoder. Semantic-only scene-to-latent training is baseline / fallback work, not the target architecture story.

## Lineage receipt

For agents reading this doc cold, the lineage from scene-spec doctrine to today's main HEAD:

| Step                           | Surface                                                            | Note                                                                                                |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Scene-spec doctrine (pre-VSC)  | `docs/research/hybrid-image-code.md`                               | Original framing; superseded but preserved as historical receipt                                    |
| VSC reframe                    | RFC-0006, ADR-0018                                                 | Visual Seed Token as first-class image research layer; adapter redefined primarily as seed expander |
| SeedExpander seam              | PR #243                                                            | Pure abstraction; placeholder behavior preserved byte-for-byte                                      |
| Two-pass acceptance test cases | PR #242                                                            | Cases 8 / 9 / 8b / collapsed pinned per `docs/research/2026-05-07-vsc-acceptance-cases.md`          |
| Fall-through warning symmetry  | PR #241                                                            | `coarseVq` and `seedCode` validation failures emit `ctx.logger.warn` like `providerLatents`         |
| Adapter outcome → `renderPath` | PR #250                                                            | Manifest now records _outcome_ (which tier fired) distinct from _intent_ (`imageCode.path`)         |
| Second SeedExpander            | PR #252                                                            | `tileMosaicSeedExpander` demonstrates the seam swaps                                                |
| Theoretical anchor             | `docs/research/2026-05-08-vsc-as-compression-prior.md`             | Why VSC is a defensible research bet, family-agnostic                                               |
| Tokenizer/decoder radar        | `docs/research/2026-05-08-image-tokenizer-decoder-radar.md` (#258) | 11-family survey; gates trained-projector wiring                                                    |
| M1B trained projector          | #70 (umbrella)                                                     | Gated on radar's four-step pre-wire audit (license / weights / determinism / Node-ONNX)             |

The lineage is intentionally additive: each step is reversible (no commit erased the prior framing) and citation-backed (every claim above resolves to a PR or a docs path). New work that touches the image code-layer should extend this table, not silently rewrite earlier rows.
