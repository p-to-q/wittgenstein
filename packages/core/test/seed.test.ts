import { describe, expect, it } from "vitest";
import { createDeterministicRandom, createRunId, resolveSeed } from "../src/runtime/seed.js";

describe("resolveSeed", () => {
  it("prefers an explicit requested seed over the default", () => {
    expect(resolveSeed(7, 99)).toBe(7);
  });

  it("treats requested seed of 0 as a real value, not a missing one", () => {
    expect(resolveSeed(0, 42)).toBe(0);
  });

  it("falls through to the default when no requested seed is provided", () => {
    expect(resolveSeed(undefined, 42)).toBe(42);
  });

  it("returns null when neither requested nor default seed is present", () => {
    expect(resolveSeed(undefined, undefined)).toBeNull();
    expect(resolveSeed(undefined, null)).toBeNull();
  });

  it("treats an explicit null requested seed as the user asking for null", () => {
    // The fallthrough is on undefined only; an explicit null is honored.
    // This matters for "--seed=null" (or its programmatic equivalent) where
    // the user is opting out of seeding rather than letting the default fire.
    expect(resolveSeed(null, 42)).toBeNull();
  });
});

describe("createRunId", () => {
  it("starts with the ISO-8601 stamp with separators replaced", () => {
    const fixed = new Date("2026-05-04T13:00:00.000Z");
    const id = createRunId(fixed);
    expect(id.startsWith("2026-05-04T13-00-00-000Z-")).toBe(true);
  });

  it("appends a 6-character random suffix", () => {
    const id = createRunId(new Date("2026-05-04T13:00:00.000Z"));
    const suffix = id.split("-").pop();
    expect(suffix?.length).toBe(6);
  });

  it("produces unique ids when called rapidly with the same timestamp", () => {
    const fixed = new Date("2026-05-04T13:00:00.000Z");
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      ids.add(createRunId(fixed));
    }
    // 50 random suffixes from a 36^6 space — collision probability is
    // ~2e-7 per pair, so a clean run essentially never collides. If this
    // ever flakes, the random source has changed in a non-trivial way.
    expect(ids.size).toBe(50);
  });
});

describe("createDeterministicRandom", () => {
  it("is reproducible — same seed yields the same sequence", () => {
    const a = createDeterministicRandom(42);
    const b = createDeterministicRandom(42);
    const sequenceA = [a(), a(), a(), a(), a()];
    const sequenceB = [b(), b(), b(), b(), b()];
    expect(sequenceA).toEqual(sequenceB);
  });

  it("differentiates seeds — different seeds yield different sequences", () => {
    const a = createDeterministicRandom(7);
    const b = createDeterministicRandom(8);
    const sequenceA = [a(), a(), a()];
    const sequenceB = [b(), b(), b()];
    expect(sequenceA).not.toEqual(sequenceB);
  });

  it("returns values in the [0, 1) interval", () => {
    const rand = createDeterministicRandom(123);
    for (let i = 0; i < 100; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("does not collapse to a fixed point — successive calls vary", () => {
    const rand = createDeterministicRandom(999);
    const samples = new Set<number>();
    for (let i = 0; i < 32; i++) {
      samples.add(rand());
    }
    // 32 outputs of a non-degenerate PRNG should produce more than a
    // single distinct value. This catches the "lcg got stuck" failure mode.
    expect(samples.size).toBeGreaterThan(20);
  });
});
