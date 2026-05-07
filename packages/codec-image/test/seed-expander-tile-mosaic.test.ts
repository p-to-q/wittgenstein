import { describe, expect, it } from "vitest";
import { placeholderSeedExpander } from "../src/adapters/seed-expander.js";
import { tileMosaicSeedExpander } from "../src/adapters/seed-expander-tile-mosaic.js";
import { ImageVisualSeedCodeSchema, type ImageSceneSpec } from "../src/schema.js";

describe("tileMosaicSeedExpander", () => {
  const decoder: ImageSceneSpec["decoder"] = {
    family: "llamagen",
    codebook: "stub-codebook",
    codebookVersion: "v0",
    latentResolution: [4, 4],
  };

  const baseSeedCode = ImageVisualSeedCodeSchema.parse({
    family: "vqvae",
    mode: "prefix",
    tokens: [3, 17, 9, 220],
  });

  it("returns latent codes whose tokenGrid matches decoder.latentResolution", () => {
    const result = tileMosaicSeedExpander.expand({
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
    const a = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const b = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    expect(a.tokens).toEqual(b.tokens);
  });

  it("varies output when the per-spec seed changes", () => {
    const a = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const b = tileMosaicSeedExpander.expand({
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
    const a = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const b = tileMosaicSeedExpander.expand({
      seedCode: variantSeedCode,
      decoder,
      seed: 7,
    });
    expect(a.tokens).not.toEqual(b.tokens);
  });

  it("respects target latent resolution from decoder hint", () => {
    const wideDecoder: ImageSceneSpec["decoder"] = { ...decoder, latentResolution: [8, 4] };
    const result = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder: wideDecoder,
      seed: 7,
    });
    expect(result.tokenGrid).toEqual([8, 4]);
    expect(result.tokens.length).toBe(32);
  });

  it("emits codebook indices within the placeholder codebook size (8192)", () => {
    const result = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    for (const token of result.tokens) {
      expect(token).toBeGreaterThanOrEqual(0);
      expect(token).toBeLessThan(8192);
    }
  });

  // The whole point of having a second expander is to prove the seam swaps.
  // If both expanders produced byte-identical output for a non-trivial input
  // they would be the same algorithm, the seam would be cosmetic, and #243
  // would only be a refactor — not the ABI it claims to be. This test pins
  // that they are genuinely distinct.
  it("produces output distinct from placeholderSeedExpander for the same input", () => {
    const placeholder = placeholderSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    const tileMosaic = tileMosaicSeedExpander.expand({
      seedCode: baseSeedCode,
      decoder,
      seed: 7,
    });
    expect(tileMosaic.tokens).not.toEqual(placeholder.tokens);
    // Both must still hit the same grid + codebook surface — the seam
    // doesn't let an expander redefine the decoder shape.
    expect(tileMosaic.tokenGrid).toEqual(placeholder.tokenGrid);
    expect(tileMosaic.family).toBe(placeholder.family);
    expect(tileMosaic.codebook).toBe(placeholder.codebook);
    expect(tileMosaic.codebookVersion).toBe(placeholder.codebookVersion);
  });

  // Adjacent target cells that fall inside the same coarse seed tile should
  // share the same `base` token; the per-position salt is the *only* thing
  // that differs between them. This is the structural claim of the
  // tile-mosaic algorithm — without it the expander would just be the
  // placeholder under another name.
  it("adjacent cells inside the same tile differ only by the per-position salt", () => {
    const seedFour = ImageVisualSeedCodeSchema.parse({
      family: "vqvae",
      mode: "prefix",
      tokens: [10, 20, 30, 40], // 2×2 coarse grid
    });
    const decoder8x8: ImageSceneSpec["decoder"] = { ...decoder, latentResolution: [8, 8] };
    const result = tileMosaicSeedExpander.expand({
      seedCode: seedFour,
      decoder: decoder8x8,
      seed: 0,
    });
    // The top-left 4×4 quadrant maps to coarse tile (0,0) → base = 10.
    // Cell (0,0): base + (0*17 + 0*31 + 0*1009) = 10
    // Cell (1,0): base + (1*17 + 0*31 + 0*1009) = 27
    // Cell (0,1): base + (0*17 + 1*31 + 0*1009) = 41
    expect(result.tokens[0]).toBe(10);
    expect(result.tokens[1]).toBe(27);
    expect(result.tokens[8]).toBe(41); // y=1, x=0 → index 8 in row-major 8-wide grid

    // The top-right 4×4 quadrant maps to coarse tile (1,0) → base = 20.
    // Cell (4,0): base + (4*17 + 0*31 + 0*1009) = 88
    expect(result.tokens[4]).toBe(88);
  });
});
