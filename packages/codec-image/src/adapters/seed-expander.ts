import {
  ImageLatentCodesSchema,
  type ImageLatentCodes,
  type ImageSceneSpec,
  type ImageVisualSeedCode,
} from "../schema.js";

/**
 * SeedExpander — the seam that turns a Visual Seed Code (compact, decoder-agnostic
 * tokens emitted by the LLM) into decoder-native ImageLatentCodes.
 *
 * Today the only implementation is `placeholderSeedExpander`, which deterministically
 * fills the target latent grid by mixing seedCode tokens with a per-spec hash. This is
 * the same logic that previously lived inline in `pipeline/adapter.ts` — extracted to
 * its own module so future SeedExpanders (LoRA-trained projectors, frozen-model adapters
 * per ADR-0018 §"Adapter is redefined primarily as a seed expander", #70 reframed M1B
 * umbrella) drop in without touching adapter routing.
 *
 * The seam intentionally separates three concerns:
 *   1. seed material (the model's compact code) — `seedCode`
 *   2. decoder shape (target latent grid + codebook identity) — `decoder`
 *   3. determinism source (per-run seed, derived by adapter.ts from the spec hash)
 *      — `seed`
 *
 * adapter.ts owns the derivation; the expander is pure given its inputs.
 */
export interface SeedExpansionInput {
  readonly seedCode: ImageVisualSeedCode;
  readonly decoder: ImageSceneSpec["decoder"];
  readonly seed: number;
}

export interface SeedExpander {
  expand(input: SeedExpansionInput): ImageLatentCodes;
}

const PLACEHOLDER_CODEBOOK_SIZE = 8192;

/**
 * Deterministic, dependency-free SeedExpander used in v0.3 scaffolding.
 *
 * Behavior is preserved exactly from the prior in-line `expandSeedToLatents` helper:
 * for each target latent slot, take `seedCode.tokens[i mod len]` and mix in the
 * per-spec deterministic seed plus a per-position salt. Bytes are reproducible across
 * invocations with the same `(seedCode, decoder, seed)` triple.
 *
 * This is a placeholder, not a trained projector. A real SeedExpander (#70 M1B
 * reframed) would consume seed tokens and emit decoder-native VQ indices via a learned
 * mapping. Until that lands, this expander gives the codec an end-to-end deterministic
 * path from `seedCode` to `ImageLatentCodes` so manifests, receipts, and tests can rely
 * on the visual-seed-code branch firing.
 */
export const placeholderSeedExpander: SeedExpander = {
  expand({ seedCode, decoder, seed }) {
    const [width, height] = decoder.latentResolution;
    const totalTokens = width * height;
    const tokens = new Array<number>(totalTokens);

    for (let index = 0; index < totalTokens; index += 1) {
      const base = seedCode.tokens[index % seedCode.tokens.length] ?? 0;
      tokens[index] = (base + seed + index * 31) % PLACEHOLDER_CODEBOOK_SIZE;
    }

    return ImageLatentCodesSchema.parse({
      schemaVersion: "witt.image.latents/v0.1",
      family: decoder.family,
      codebook: decoder.codebook,
      codebookVersion: decoder.codebookVersion,
      tokenGrid: [width, height],
      tokens,
    });
  },
};
