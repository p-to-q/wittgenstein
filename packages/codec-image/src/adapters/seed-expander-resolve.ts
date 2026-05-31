import {
  BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
  blockCausalMaskgitSeedExpander,
} from "./seed-expander-block-causal-maskgit.js";
import { tileMosaicSeedExpander } from "./seed-expander-tile-mosaic.js";
import { placeholderSeedExpander, type SeedExpander } from "./seed-expander.js";

export const PLACEHOLDER_SEED_EXPANDER_ID = "placeholder-seed-expander/v0";
export const TILE_MOSAIC_SEED_EXPANDER_ID = "tile-mosaic-seed-expander/v0";

export interface SeedExpanderSelection {
  readonly id: string;
  readonly expander: SeedExpander;
}

const SEED_EXPANDERS: Record<string, SeedExpanderSelection> = {
  placeholder: {
    id: PLACEHOLDER_SEED_EXPANDER_ID,
    expander: placeholderSeedExpander,
  },
  "placeholder-seed-expander": {
    id: PLACEHOLDER_SEED_EXPANDER_ID,
    expander: placeholderSeedExpander,
  },
  "placeholder-seed-expander/v0": {
    id: PLACEHOLDER_SEED_EXPANDER_ID,
    expander: placeholderSeedExpander,
  },
  "tile-mosaic": {
    id: TILE_MOSAIC_SEED_EXPANDER_ID,
    expander: tileMosaicSeedExpander,
  },
  "tile-mosaic-seed-expander": {
    id: TILE_MOSAIC_SEED_EXPANDER_ID,
    expander: tileMosaicSeedExpander,
  },
  "tile-mosaic-seed-expander/v0": {
    id: TILE_MOSAIC_SEED_EXPANDER_ID,
    expander: tileMosaicSeedExpander,
  },
  "block-causal-maskgit": {
    id: BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
    expander: blockCausalMaskgitSeedExpander,
  },
  "block-causal-maskgit-expander": {
    id: BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
    expander: blockCausalMaskgitSeedExpander,
  },
  "block-causal-maskgit-expander/v0": {
    id: BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
    expander: blockCausalMaskgitSeedExpander,
  },
};

export function supportedSeedExpanderIds(): string[] {
  return [
    PLACEHOLDER_SEED_EXPANDER_ID,
    TILE_MOSAIC_SEED_EXPANDER_ID,
    BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
  ];
}

export function selectSeedExpander(
  rawValue = process.env.WITTGENSTEIN_IMAGE_SEED_EXPANDER,
): SeedExpanderSelection {
  const value = rawValue?.trim().toLowerCase();
  if (!value) {
    return SEED_EXPANDERS.placeholder!;
  }
  const selected = SEED_EXPANDERS[value];
  if (selected) {
    return selected;
  }
  throw new Error(
    `Unsupported WITTGENSTEIN_IMAGE_SEED_EXPANDER "${rawValue}". Expected one of: ${supportedSeedExpanderIds().join(
      ", ",
    )}.`,
  );
}
