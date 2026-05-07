import { describe, expect, it } from "vitest";
import { placeholderSeedExpander } from "../src/adapters/seed-expander.js";
import { ImageVisualSeedCodeSchema, type ImageSceneSpec } from "../src/schema.js";

describe("placeholderSeedExpander", () => {
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

  it("returns latent codes whose tokenGrid matches decoder.latentResolution", () => {
    const result = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });

    expect(result.tokenGrid).toEqual([4, 4]);
    expect(result.tokens.length).toBe(16);
    expect(result.family).toBe("llamagen");
    expect(result.codebook).toBe("stub-codebook");
    expect(result.codebookVersion).toBe("v0");
  });

  it("is deterministic — same input triple produces identical output bytes", () => {
    const a = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const b = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    expect(a.tokens).toEqual(b.tokens);
  });

  it("varies output when the per-spec seed changes", () => {
    const a = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const b = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 13,
    });
    expect(a.tokens).not.toEqual(b.tokens);
  });

  it("varies output when the seedCode tokens change", () => {
    const variantSeedCode = ImageVisualSeedCodeSchema.parse({
      family: "vqvae",
      mode: "prefix",
      tokens: [99, 100, 101, 102],
    });
    const a = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const b = placeholderSeedExpander.expand({
      seedCode: variantSeedCode,
      decoder,
      seed: 7,
    });
    expect(a.tokens).not.toEqual(b.tokens);
  });

  it("respects target latent resolution from decoder hint", () => {
    const wideDecoder: ImageSceneSpec["decoder"] = { ...decoder, latentResolution: [8, 4] };
    const result = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder: wideDecoder,
      seed: 7,
    });
    expect(result.tokenGrid).toEqual([8, 4]);
    expect(result.tokens.length).toBe(32);
  });

  it("emits codebook indices within the placeholder codebook size (8192)", () => {
    const result = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    for (const token of result.tokens) {
      expect(token).toBeGreaterThanOrEqual(0);
      expect(token).toBeLessThan(8192);
    }
  });
});
