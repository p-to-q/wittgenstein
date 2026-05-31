import { describe, expect, it } from "vitest";
import {
  BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
  blockCausalMaskgitSeedExpander,
  buildBlockCausalMaskPlan,
  maskgitRemainingMaskRatio,
} from "../src/adapters/seed-expander-block-causal-maskgit.js";
import { selectSeedExpander } from "../src/adapters/seed-expander-resolve.js";
import { placeholderSeedExpander } from "../src/adapters/seed-expander.js";
import { ImageVisualSeedCodeSchema, type ImageSceneSpec } from "../src/schema.js";

describe("blockCausalMaskgitSeedExpander", () => {
  const decoder: ImageSceneSpec["decoder"] = {
    family: "llamagen",
    codebook: "stub-codebook",
    codebookVersion: "v0",
    latentResolution: [4, 4],
  };

  const seedCode = ImageVisualSeedCodeSchema.parse({
    family: "vqvae",
    mode: "prefix",
    tokens: [3, 17, 9, 220],
  });

  it("returns latent codes whose tokenGrid matches decoder.latentResolution", () => {
    const result = blockCausalMaskgitSeedExpander.expand({
      seedCode,
      decoder,
      seed: 7,
    });

    expect(result.tokenGrid).toEqual([4, 4]);
    expect(result.tokens.length).toBe(16);
    expect(result.family).toBe("llamagen");
    expect(result.codebook).toBe("stub-codebook");
    expect(result.codebookVersion).toBe("v0");
  });

  it("is deterministic for the same input triple", () => {
    const a = blockCausalMaskgitSeedExpander.expand({
      seedCode,
      decoder,
      seed: 7,
    });
    const b = blockCausalMaskgitSeedExpander.expand({
      seedCode,
      decoder,
      seed: 7,
    });

    expect(a.tokens).toEqual(b.tokens);
  });

  it("produces a distinct placeholder-class baseline from the original placeholder expander", () => {
    const placeholder = placeholderSeedExpander.expand({
      seedCode,
      decoder,
      seed: 7,
    });
    const blockCausal = blockCausalMaskgitSeedExpander.expand({
      seedCode,
      decoder,
      seed: 7,
    });

    expect(blockCausal.tokens).not.toEqual(placeholder.tokens);
  });

  it("preserves clean-repaint known positions exactly", () => {
    const result = blockCausalMaskgitSeedExpander.expand({
      seedCode,
      decoder,
      seed: 7,
      knownPositions: [
        true,
        false,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        true,
      ],
      knownTokens: [1111, 0, 0, 0, 0, 0, 2222, 0, 0, 0, 0, 0, 0, 0, 0, 3333],
    });

    expect(result.tokens[0]).toBe(1111);
    expect(result.tokens[6]).toBe(2222);
    expect(result.tokens[15]).toBe(3333);
    expect(result.tokens.every((token) => token >= 0 && token < 8192)).toBe(true);
  });

  it("builds a monotonic eight-step MaskGIT reveal plan", () => {
    const plan = buildBlockCausalMaskPlan({
      totalTokens: 16,
      knownPositions: [
        true,
        false,
        false,
        false,
        false,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ],
      knownTokens: [1, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      blockSize: 4,
      iterations: 8,
      seed: 7,
    });

    const scheduled = plan.steps.flatMap((step) => step.positions);
    expect(plan.knownCount).toBe(2);
    expect(new Set(scheduled).size).toBe(14);
    expect(scheduled).not.toContain(0);
    expect(scheduled).not.toContain(5);
    expect(scheduled.every((position) => position >= 0 && position < 16)).toBe(true);

    const order = new Map(scheduled.map((position, index) => [position, index]));
    const lastBlock0Order = Math.max(order.get(1)!, order.get(2)!, order.get(3)!);
    const firstBlock1Order = Math.min(order.get(4)!, order.get(6)!, order.get(7)!);
    expect(lastBlock0Order).toBeLessThan(firstBlock1Order);

    for (let index = 1; index < plan.steps.length; index += 1) {
      expect(plan.steps[index]!.remainingMaskRatio).toBeLessThanOrEqual(
        plan.steps[index - 1]!.remainingMaskRatio,
      );
    }
  });

  it("uses the expected cosine/arccos-family mask ratio endpoints", () => {
    expect(maskgitRemainingMaskRatio(0, 8)).toBe(1);
    expect(maskgitRemainingMaskRatio(8, 8)).toBeCloseTo(0, 10);
    expect(maskgitRemainingMaskRatio(4, 8)).toBeLessThan(1);
    expect(maskgitRemainingMaskRatio(4, 8)).toBeGreaterThan(0);
  });
});

describe("seed expander selection", () => {
  it("selects the block-causal MaskGIT expander by id or alias", () => {
    expect(selectSeedExpander("block-causal-maskgit").id).toBe(
      BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
    );
    expect(selectSeedExpander("block-causal-maskgit-expander/v0").id).toBe(
      BLOCK_CAUSAL_MASKGIT_SEED_EXPANDER_ID,
    );
  });

  it("fails loudly on an unsupported seed expander selector", () => {
    expect(() => selectSeedExpander("does-not-exist")).toThrow(
      /Unsupported WITTGENSTEIN_IMAGE_SEED_EXPANDER/,
    );
  });
});
