/**
 * Phase 0b: Seed code degradation test (Semantic IR field sensitivity).
 *
 * Tests whether varying semantic fields produces structured differences in
 * the placeholder adapter output, establishing a baseline for measuring
 * information-carrying capacity of the IR.
 *
 * @see docs/research/2026-05-22-ir-reliability-validation.md §Phase 0b
 * @see https://github.com/p-to-q/wittgenstein/issues/452
 */
import { describe, expect, it } from "vitest";
import { placeholderSeedExpander } from "../src/adapters/seed-expander.js";
import { ImageVisualSeedCodeSchema, ImageSceneSpecSchema, type ImageSceneSpec } from "../src/schema.js";

/** Build a minimal ImageSceneSpec with overrides. */
function makeSpec(overrides: Partial<ImageSceneSpec> = {}): ImageSceneSpec {
  return ImageSceneSpecSchema.parse({
    mode: "one-shot-vsc",
    intent: "test scene",
    subject: "test subject",
    ...overrides,
  });
}

describe("Phase 0b — Semantic IR field sensitivity (placeholder baseline)", () => {
  const seedCode = ImageVisualSeedCodeSchema.parse({
    family: "vqvae",
    mode: "prefix",
    tokens: [42, 17, 88, 201, 15, 33, 77, 100],
  });

  it("different intent fields produce different adapter outputs", () => {
    const specA = makeSpec({ intent: "stormy ocean at midnight" });
    const specB = makeSpec({ intent: "sunny meadow at noon" });

    const tokensA = placeholderSeedExpander.expand({
      seedCode,
      decoder: specA.decoder,
      seed: hashSpec(specA),
    }).tokens;

    const tokensB = placeholderSeedExpander.expand({
      seedCode,
      decoder: specB.decoder,
      seed: hashSpec(specB),
    }).tokens;

    // Different specs should produce different outputs via different hash seeds
    expect(tokensA).not.toEqual(tokensB);
  });

  it("different lighting moods produce different adapter outputs", () => {
    const specA = makeSpec({ lighting: { mood: "warm golden", key: "low side" } });
    const specB = makeSpec({ lighting: { mood: "cold fluorescent", key: "overhead" } });

    const tokensA = placeholderSeedExpander.expand({
      seedCode,
      decoder: specA.decoder,
      seed: hashSpec(specA),
    }).tokens;

    const tokensB = placeholderSeedExpander.expand({
      seedCode,
      decoder: specB.decoder,
      seed: hashSpec(specB),
    }).tokens;

    expect(tokensA).not.toEqual(tokensB);
  });

  it("seed code prefix truncation produces structured degradation", () => {
    const spec = makeSpec({ intent: "coastal cliffs at sunset", subject: "rocky cliffs" });
    const seed = hashSpec(spec);

    const results: { length: number; tokens: number[] }[] = [];

    for (const prefixLen of [8, 4, 2, 1]) {
      const truncatedSeedCode = ImageVisualSeedCodeSchema.parse({
        family: "vqvae",
        mode: "prefix",
        tokens: seedCode.tokens.slice(0, prefixLen),
      });

      const result = placeholderSeedExpander.expand({
        seedCode: truncatedSeedCode,
        decoder: spec.decoder,
        seed,
      });

      results.push({ length: prefixLen, tokens: [...result.tokens] });
    }

    // All prefix lengths should produce valid latent grids
    for (const r of results) {
      expect(r.tokens.length).toBe(32 * 32); // default latentResolution
      expect(r.tokens.every((t) => t >= 0 && t < 8192)).toBe(true);
    }

    // Different prefix lengths should produce different outputs
    // (verifying the seed code actually influences the result)
    expect(results[0]!.tokens).not.toEqual(results[1]!.tokens);
    expect(results[1]!.tokens).not.toEqual(results[2]!.tokens);
  });

  it("identical specs produce identical outputs (baseline determinism)", () => {
    const spec = makeSpec({ intent: "test determinism" });
    const seed = hashSpec(spec);

    const a = placeholderSeedExpander.expand({ seedCode, decoder: spec.decoder, seed });
    const b = placeholderSeedExpander.expand({ seedCode, decoder: spec.decoder, seed });

    expect(a.tokens).toEqual(b.tokens);
  });
});

/** Reproduce the FNV-1a hash from adapter.ts for test isolation. */
function hashSpec(parsed: ImageSceneSpec): number {
  const source = JSON.stringify({
    intent: parsed.intent,
    subject: parsed.subject,
    composition: parsed.composition,
    lighting: parsed.lighting,
    style: parsed.style,
    constraints: parsed.constraints,
    renderHints: parsed.renderHints,
    decoder: parsed.decoder,
  });
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
