import { describe, expect, it } from "vitest";
import { priceModel, pricedModels } from "../src/llm/pricing.js";

describe("priceModel", () => {
  it("returns computed cost for a known anthropic model", () => {
    const result = priceModel("anthropic", "claude-sonnet-4-7", { input: 1_000, output: 500 });
    expect(result.costUsdReason).toBe("computed");
    // claude-sonnet-4-7: $3/M input, $15/M output
    // 1000 * 3 / 1_000_000 + 500 * 15 / 1_000_000 = 0.003 + 0.0075 = 0.0105
    expect(result.costUsd).toBeCloseTo(0.0105, 6);
  });

  it("returns computed cost for a known openai-compatible model", () => {
    const result = priceModel("openai-compatible", "gpt-4o", { input: 2_000, output: 1_000 });
    expect(result.costUsdReason).toBe("computed");
    // gpt-4o: $2.5/M input, $10/M output
    // 2000 * 2.5 / 1_000_000 + 1000 * 10 / 1_000_000 = 0.005 + 0.01 = 0.015
    expect(result.costUsd).toBeCloseTo(0.015, 6);
  });

  it("returns null + unknown-model for an unpriced model", () => {
    const result = priceModel("anthropic", "claude-future-2030", { input: 1_000, output: 500 });
    expect(result.costUsd).toBeNull();
    expect(result.costUsdReason).toBe("unknown-model");
  });

  it("returns null + unknown-model for an unknown provider", () => {
    const result = priceModel("not-a-provider", "any-model", { input: 100, output: 100 });
    expect(result.costUsd).toBeNull();
    expect(result.costUsdReason).toBe("unknown-model");
  });

  it("returns 0 + computed for zero-token usage (no LLM round-trip)", () => {
    const result = priceModel("anthropic", "claude-future-2030", { input: 0, output: 0 });
    // Even an unknown model is honestly $0 when no tokens consumed.
    expect(result.costUsd).toBe(0);
    expect(result.costUsdReason).toBe("computed");
  });

  it("returns null + missing-usage when tokens are undefined", () => {
    const result = priceModel("anthropic", "claude-sonnet-4-7", undefined);
    expect(result.costUsd).toBeNull();
    expect(result.costUsdReason).toBe("missing-usage");
  });

  it("pins the 2026-10-16 refreshed Anthropic lineup (primary source)", () => {
    // platform.claude.com model pages, 2026-10-16: opus-5-5 $4/$20,
    // sonnet-5-5 $2/$10, haiku-5-5 from $0.10/$0.50, fable-5-1 $10/$50.
    expect(priceModel("anthropic", "claude-opus-5-5", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(24, 6);
    expect(priceModel("anthropic", "claude-sonnet-5-5", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(12, 6);
    expect(priceModel("anthropic", "claude-haiku-5-5", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(0.6, 6);
    expect(priceModel("anthropic", "claude-fable-5-1", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(60, 6);
  });

  it("pins the 2026-10-16 refreshed OpenAI + MiniMax rows", () => {
    expect(priceModel("openai-compatible", "gpt-4.1", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(10, 6);
    expect(priceModel("openai-compatible", "gpt-5", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(11.25, 6);
    expect(priceModel("minimax", "MiniMax-M2", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(1.5, 6);
    expect(priceModel("minimax", "MiniMax-M3", { input: 1_000_000, output: 1_000_000 }).costUsd).toBeCloseTo(1.5, 6);
  });

  it("keeps conflicting-source OpenAI tiers unpinned (honest unknown-model)", () => {
    // Aggregators disagree on gpt-5.4/5.5/5.6/6.x rates; they must stay out
    // of the table until pinned against platform.openai.com.
    for (const model of ["gpt-5.4", "gpt-5.5", "gpt-5.6", "gpt-6"]) {
      expect(priceModel("openai-compatible", model, { input: 1, output: 1 }).costUsdReason).toBe("unknown-model");
    }
  });

  it("computes minimax-01 cost correctly", () => {
    const result = priceModel("minimax", "minimax/minimax-01", { input: 5_000, output: 2_500 });
    expect(result.costUsdReason).toBe("computed");
    // minimax-01: $0.2/M input, $1.1/M output
    // 5000 * 0.2 / 1_000_000 + 2500 * 1.1 / 1_000_000 = 0.001 + 0.00275 = 0.00375
    expect(result.costUsd).toBeCloseTo(0.00375, 6);
  });
});

describe("pricedModels", () => {
  it("enumerates at least Anthropic + openai-compatible + minimax priced entries", () => {
    const entries = pricedModels();
    const providers = new Set(entries.map((e) => e.provider));
    expect(providers.has("anthropic")).toBe(true);
    expect(providers.has("openai-compatible")).toBe(true);
    expect(providers.has("minimax")).toBe(true);
  });

  it("has every entry round-trip through priceModel as computed (non-zero tokens)", () => {
    const entries = pricedModels();
    for (const { provider, model } of entries) {
      const result = priceModel(provider, model, { input: 1, output: 1 });
      expect(result.costUsdReason).toBe("computed");
      expect(result.costUsd).not.toBeNull();
      expect(result.costUsd).toBeGreaterThan(0);
    }
  });
});
