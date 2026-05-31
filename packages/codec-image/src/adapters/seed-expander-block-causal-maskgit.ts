import { ImageLatentCodesSchema, type ImageVisualSeedCode } from "../schema.js";
import { validateCleanRepaintInputs, type SeedExpander } from "./seed-expander.js";

export const BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID = "block-causal-maskgit-expander/v0";

const PLACEHOLDER_CODEBOOK_SIZE = 8192;
const DEFAULT_ITERATIONS = 8;
const MIN_BLOCK_SIZE = 4;

export interface BlockCausalMaskPlanStep {
  readonly step: number;
  readonly remainingMaskRatio: number;
  readonly positions: readonly number[];
}

export interface BlockCausalMaskPlan {
  readonly totalTokens: number;
  readonly blockSize: number;
  readonly iterations: number;
  readonly knownCount: number;
  readonly steps: readonly BlockCausalMaskPlanStep[];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * MaskGIT/TiTok-style deterministic mask schedule.
 *
 * The trained adapter will use model confidence to decide which positions to
 * reveal. This placeholder-class variant has no logits, so it preserves the
 * same schedule shape and uses a deterministic confidence proxy instead.
 */
export function maskgitRemainingMaskRatio(step: number, iterations = DEFAULT_ITERATIONS): number {
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error(`iterations must be a positive integer, got ${iterations}`);
  }
  const progress = clamp01(step / iterations);
  return Math.cos((Math.PI / 2) * progress);
}

function defaultBlockSize(totalTokens: number, iterations: number): number {
  if (totalTokens <= 64) {
    return MIN_BLOCK_SIZE;
  }
  return Math.max(MIN_BLOCK_SIZE, Math.ceil(totalTokens / iterations));
}

function isPinned(
  index: number,
  knownPositions: readonly boolean[] | undefined,
  knownTokens: readonly number[] | undefined,
): boolean {
  return knownPositions?.[index] === true && knownTokens?.[index] !== undefined;
}

function confidenceProxy(position: number, seed: number): number {
  let x = (position + 1) * 0x9e3779b1;
  x ^= seed >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return (x ^ (x >>> 16)) >>> 0;
}

export function buildBlockCausalMaskPlan({
  totalTokens,
  knownPositions,
  knownTokens,
  blockSize: requestedBlockSize,
  iterations = DEFAULT_ITERATIONS,
  seed = 0,
}: {
  readonly totalTokens: number;
  readonly knownPositions?: readonly boolean[];
  readonly knownTokens?: readonly number[];
  readonly blockSize?: number;
  readonly iterations?: number;
  readonly seed?: number;
}): BlockCausalMaskPlan {
  if (!Number.isInteger(totalTokens) || totalTokens <= 0) {
    throw new Error(`totalTokens must be a positive integer, got ${totalTokens}`);
  }
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error(`iterations must be a positive integer, got ${iterations}`);
  }
  const blockSize = requestedBlockSize ?? defaultBlockSize(totalTokens, iterations);
  if (!Number.isInteger(blockSize) || blockSize <= 0) {
    throw new Error(`blockSize must be a positive integer, got ${blockSize}`);
  }
  validateCleanRepaintInputs(knownPositions, knownTokens, totalTokens);

  const unrevealed = new Set<number>();
  let knownCount = 0;
  for (let index = 0; index < totalTokens; index += 1) {
    if (isPinned(index, knownPositions, knownTokens)) {
      knownCount += 1;
      continue;
    }
    unrevealed.add(index);
  }

  const initialUnknownCount = unrevealed.size;
  const steps: BlockCausalMaskPlanStep[] = [];

  for (let step = 1; step <= iterations && unrevealed.size > 0; step += 1) {
    const remainingMaskRatio =
      step === iterations ? 0 : maskgitRemainingMaskRatio(step, iterations);
    const targetRemaining =
      step === iterations ? 0 : Math.ceil(initialUnknownCount * remainingMaskRatio);
    const revealBudget = Math.max(1, unrevealed.size - targetRemaining);

    const candidates = [...unrevealed].sort((a, b) => {
      const blockA = Math.floor(a / blockSize);
      const blockB = Math.floor(b / blockSize);
      if (blockA !== blockB) {
        return blockA - blockB;
      }
      return confidenceProxy(b, seed) - confidenceProxy(a, seed);
    });

    const positions = candidates.slice(0, revealBudget);
    for (const position of positions) {
      unrevealed.delete(position);
    }
    steps.push({ step, remainingMaskRatio, positions });
  }

  return {
    totalTokens,
    blockSize,
    iterations,
    knownCount,
    steps,
  };
}

function sumResolvedBefore(tokens: readonly number[], position: number): number {
  const blockStart = Math.max(0, position - MIN_BLOCK_SIZE);
  let sum = 0;
  for (let index = blockStart; index < position; index += 1) {
    const token = tokens[index];
    if (token !== undefined && token >= 0) {
      sum = (sum + token * (index + 17)) >>> 0;
    }
  }
  return sum;
}

function sumResolvedInBlock(
  tokens: readonly number[],
  position: number,
  blockSize: number,
): number {
  const blockStart = Math.floor(position / blockSize) * blockSize;
  const blockEnd = Math.min(tokens.length, blockStart + blockSize);
  let sum = 0;
  for (let index = blockStart; index < blockEnd; index += 1) {
    const token = tokens[index];
    if (token !== undefined && token >= 0) {
      sum = (sum + token * (index - blockStart + 1)) >>> 0;
    }
  }
  return sum;
}

function predictPlaceholderToken({
  seedCode,
  tokensSnapshot,
  seed,
  position,
  step,
  blockSize,
}: {
  readonly seedCode: ImageVisualSeedCode;
  readonly tokensSnapshot: readonly number[];
  readonly seed: number;
  readonly position: number;
  readonly step: number;
  readonly blockSize: number;
}): number {
  const seedToken = seedCode.tokens[(position + step) % seedCode.tokens.length] ?? 0;
  const prefixInfluence = sumResolvedBefore(tokensSnapshot, position);
  const blockInfluence = sumResolvedInBlock(tokensSnapshot, position, blockSize);
  const mixed =
    seedToken * 131 +
    seed * 1009 +
    position * 9176 +
    step * 65537 +
    prefixInfluence * 31 +
    blockInfluence * 17;
  return Math.abs(mixed) % PLACEHOLDER_CODEBOOK_SIZE;
}

/**
 * Placeholder-class block-causal MaskGIT expander.
 *
 * This is intentionally not a trained projector. It makes the Cola-DLM /
 * MaskGIT scheduling decision executable and receipt-visible while #397 owns
 * the learned adapter. Clean-repaint pins are preserved exactly; unknown
 * positions are revealed in block-causal order over an eight-step schedule.
 */
export const blockCausalMaskgitSeedExpander: SeedExpander = {
  expand({ seedCode, decoder, seed, knownPositions, knownTokens }) {
    const [width, height] = decoder.latentResolution;
    const totalTokens = width * height;
    validateCleanRepaintInputs(knownPositions, knownTokens, totalTokens);

    const planInput: {
      totalTokens: number;
      knownPositions?: readonly boolean[];
      knownTokens?: readonly number[];
      seed: number;
    } = {
      totalTokens,
      seed,
    };
    if (knownPositions) {
      planInput.knownPositions = knownPositions;
    }
    if (knownTokens) {
      planInput.knownTokens = knownTokens;
    }
    const plan = buildBlockCausalMaskPlan(planInput);

    const tokens = new Array<number>(totalTokens).fill(-1);
    for (let index = 0; index < totalTokens; index += 1) {
      const knownToken = knownTokens?.[index];
      if (isPinned(index, knownPositions, knownTokens) && knownToken !== undefined) {
        tokens[index] = knownToken;
      }
    }

    for (const step of plan.steps) {
      const snapshot = [...tokens];
      for (const position of step.positions) {
        tokens[position] = predictPlaceholderToken({
          seedCode,
          tokensSnapshot: snapshot,
          seed,
          position,
          step: step.step,
          blockSize: plan.blockSize,
        });
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
