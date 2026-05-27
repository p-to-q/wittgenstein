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
  /**
   * Optional binary mask for clean-repaint conditioning (Cola-DLM-inspired).
   * When provided, `knownPositions[i] = true` means the token at position `i`
   * in the target latent grid is already known and must NOT be overwritten by
   * the expander. The known value is taken from `knownTokens[i]`.
   *
   * This enables partial seed expansion: the LLM provides a few anchor tokens,
   * and the expander fills the remaining positions while preserving the anchors.
   *
   * @see docs/research/2026-05-22-cola-dlm-implications.md §2 (clean-repaint)
   * @see docs/research/2026-05-22-seed-code-stability-analysis.md §Mitigation 2
   * @see https://github.com/p-to-q/wittgenstein/issues/453
   */
  readonly knownPositions?: readonly boolean[];
  readonly knownTokens?: readonly number[];
}

export interface SeedExpander {
  expand(input: SeedExpansionInput): ImageLatentCodes;
}

const PLACEHOLDER_CODEBOOK_SIZE = 8192;

export function validateCleanRepaintInputs(
  knownPositions: readonly boolean[] | undefined,
  knownTokens: readonly number[] | undefined,
  totalTokens: number,
): void {
  if (knownPositions && knownPositions.length !== totalTokens) {
    throw new Error(
      `knownPositions length ${knownPositions.length} does not match totalTokens ${totalTokens}`,
    );
  }
  if (knownTokens && knownTokens.length !== totalTokens) {
    throw new Error(
      `knownTokens length ${knownTokens.length} does not match totalTokens ${totalTokens}`,
    );
  }
}

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
  expand({ seedCode, decoder, seed, knownPositions, knownTokens }) {
    const [width, height] = decoder.latentResolution;
    const totalTokens = width * height;
    validateCleanRepaintInputs(knownPositions, knownTokens, totalTokens);
    const tokens = new Array<number>(totalTokens);

    for (let index = 0; index < totalTokens; index += 1) {
      // Clean-repaint: if this position is pinned, preserve the known token.
      const knownToken = knownTokens?.[index];
      if (knownPositions?.[index] && knownToken !== undefined) {
        tokens[index] = knownToken;
        continue;
      }
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
