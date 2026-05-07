import {
  ImageLatentCodesSchema,
  type ImageLatentCodes,
  type ImageSceneSpec,
  type ImageVisualSeedCode,
} from "../schema.js";
import type { SeedExpander } from "./seed-expander.js";

const PLACEHOLDER_CODEBOOK_SIZE = 8192;

/**
 * Pick a near-square `coarseW × coarseH` layout for `seedCode.tokens` so the
 * seed acts as a 2D mosaic of tile bases rather than a 1D ring. Width
 * dominates by one when the count is not a perfect square so a 4-token
 * seedCode lays out as 2×2, a 32-token seedCode as 6×6 (with two unused
 * cells, harmless because we wrap modulo `tokens.length`), etc.
 */
function pickCoarseLayout(tokenCount: number): { coarseW: number; coarseH: number } {
  const root = Math.max(1, Math.round(Math.sqrt(tokenCount)));
  const coarseW = root;
  const coarseH = Math.max(1, Math.ceil(tokenCount / coarseW));
  return { coarseW, coarseH };
}

/**
 * Deterministic, dependency-free SeedExpander that demonstrates the
 * `SeedExpander` seam (#243) is an ABI rather than a refactor. Distinct
 * algorithm from `placeholderSeedExpander`:
 *
 *   - placeholder: linear `seedCode.tokens[i mod len]` plus a positional
 *     salt — treats the target grid as 1D.
 *   - tile-mosaic: lays the seed tokens out as a near-square coarse grid,
 *     then for each target cell looks up the *enclosing tile's* base token
 *     and adds a per-target-position salt. Adjacent target cells inside the
 *     same tile share the same base, so the output has 2D block structure
 *     visible as token-value plateaus that differ per region.
 *
 * Like the placeholder, this is **not a trained projector** — it makes no
 * decoder-quality claim. It exists so future SeedExpanders (LoRA-trained
 * projector under #70 reframed M1B; frozen-projector candidates per
 * ADR-0018 §"Adapter is redefined primarily as a seed expander") have a
 * working ABI peer to compare against, and so codec consumers can verify
 * via `WITTGENSTEIN_IMAGE_SEED_EXPANDER` (when selection ships, #251 Lane
 * 1A follow-up) that the seam actually swaps.
 *
 * Determinism contract is identical to the placeholder: same
 * `(seedCode, decoder, seed)` triple → byte-identical `ImageLatentCodes`.
 */
export const tileMosaicSeedExpander: SeedExpander = {
  expand({ seedCode, decoder, seed }: {
    seedCode: ImageVisualSeedCode;
    decoder: ImageSceneSpec["decoder"];
    seed: number;
  }): ImageLatentCodes {
    const [width, height] = decoder.latentResolution;
    const totalTokens = width * height;
    const tokens = new Array<number>(totalTokens);
    const { coarseW, coarseH } = pickCoarseLayout(seedCode.tokens.length);

    for (let y = 0; y < height; y += 1) {
      // Map target row to coarse-grid row.
      const yc = Math.min(coarseH - 1, Math.floor((y * coarseH) / Math.max(1, height)));
      for (let x = 0; x < width; x += 1) {
        const xc = Math.min(coarseW - 1, Math.floor((x * coarseW) / Math.max(1, width)));
        // Wrap modulo tokens.length so non-square layouts (e.g. 6×6 over 32
        // tokens) still resolve to a valid base.
        const tileIndex = (yc * coarseW + xc) % seedCode.tokens.length;
        const base = seedCode.tokens[tileIndex] ?? 0;
        const localSalt = x * 17 + y * 31 + seed * 1009;
        const targetIndex = y * width + x;
        tokens[targetIndex] = (base + localSalt) % PLACEHOLDER_CODEBOOK_SIZE;
      }
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
