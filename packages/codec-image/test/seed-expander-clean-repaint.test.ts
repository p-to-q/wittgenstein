import { describe, expect, it } from "vitest";
import { placeholderSeedExpander } from "../src/adapters/seed-expander.js";
import { tileMosaicSeedExpander } from "../src/adapters/seed-expander-tile-mosaic.js";
import { ImageVisualSeedCodeSchema, type ImageSceneSpec } from "../src/schema.js";

describe("clean-repaint conditioning", () => {
  const decoder: ImageSceneSpec["decoder"] = {
    family: "llamagen",
    codebook: "stub-codebook",
    codebookVersion: "v0",
    latentResolution: [4, 4], // 16-token target grid
  };

  const baseSeedCode = ImageVisualSeedCodeSchema.parse({
    family: "vqvae",
    mode: "prefix",
    tokens: [3, 17, 9, 220],
  });

  const knownPositions = [
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
  ];

  const knownTokens = [1111, 0, 0, 0, 0, 0, 2222, 0, 0, 0, 0, 0, 0, 0, 0, 3333];

  describe("placeholderSeedExpander", () => {
    it("preserves known positions exactly", () => {
      const result = placeholderSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions,
        knownTokens,
      });

      expect(result.tokens[0]).toBe(1111);
      expect(result.tokens[6]).toBe(2222);
      expect(result.tokens[15]).toBe(3333);
    });

    it("still fills unknown positions deterministically", () => {
      const result = placeholderSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions,
        knownTokens,
      });

      // Unknown positions should not be the known values
      expect(result.tokens[1]).not.toBe(0); // position 1 is unknown, gets filled
      expect(result.tokens.length).toBe(16);
    });

    it("produces identical output for same inputs (determinism)", () => {
      const a = placeholderSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions,
        knownTokens,
      });
      const b = placeholderSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions,
        knownTokens,
      });
      expect(a.tokens).toEqual(b.tokens);
    });

    it("behaves identically to baseline when no mask is provided", () => {
      const withMask = placeholderSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
      });
      const withoutMask = placeholderSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions: undefined,
        knownTokens: undefined,
      });
      expect(withMask.tokens).toEqual(withoutMask.tokens);
    });

    it("rejects clean-repaint arrays that do not match the latent grid", () => {
      expect(() =>
        placeholderSeedExpander.expand({
          seedCode: baseSeedCode,
          decoder,
          seed: 7,
          knownPositions: [true],
          knownTokens,
        }),
      ).toThrow(/knownPositions length 1 does not match totalTokens 16/);
      expect(() =>
        placeholderSeedExpander.expand({
          seedCode: baseSeedCode,
          decoder,
          seed: 7,
          knownPositions,
          knownTokens: [1111],
        }),
      ).toThrow(/knownTokens length 1 does not match totalTokens 16/);
    });
  });

  describe("tileMosaicSeedExpander", () => {
    it("preserves known positions exactly", () => {
      const result = tileMosaicSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions,
        knownTokens,
      });

      expect(result.tokens[0]).toBe(1111);
      expect(result.tokens[6]).toBe(2222);
      expect(result.tokens[15]).toBe(3333);
    });

    it("fills unknown positions with tile-mosaic algorithm", () => {
      const result = tileMosaicSeedExpander.expand({
        seedCode: baseSeedCode,
        decoder,
        seed: 7,
        knownPositions,
        knownTokens,
      });

      expect(result.tokens.length).toBe(16);
      // All tokens should be non-negative
      for (const token of result.tokens) {
        expect(token).toBeGreaterThanOrEqual(0);
      }
    });

    it("rejects clean-repaint arrays that do not match the latent grid", () => {
      expect(() =>
        tileMosaicSeedExpander.expand({
          seedCode: baseSeedCode,
          decoder,
          seed: 7,
          knownPositions: [true],
          knownTokens,
        }),
      ).toThrow(/knownPositions length 1 does not match totalTokens 16/);
    });
  });
});
