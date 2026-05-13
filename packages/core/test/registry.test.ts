import { describe, expect, it } from "vitest";
import { z } from "zod";
import { WittgensteinError } from "../src/runtime/errors.js";
import { CodecRegistry } from "../src/runtime/registry.js";

const validV1Codec = {
  name: "test-svg",
  modality: "svg" as const,
  schemaPreamble: () => "",
  requestSchema: z.any(),
  outputSchema: z.any(),
  parse: () => ({ ok: true as const, value: {} }),
  render: async () => ({
    artifactPath: "/tmp/x.svg",
    mimeType: "image/svg+xml",
    bytes: 0,
    metadata: {
      codec: "test-svg",
      llmTokens: { input: 0, output: 0 },
      costUsd: 0,
      durationMs: 0,
      seed: null,
    },
  }),
};

const validV2Codec = {
  id: "test-image",
  modality: "image" as const,
  routes: [],
  schema: { ["~standard"]: {} },
  produce: async () => ({ outPath: "/tmp/x.png", mime: "image/png", metadata: {} }),
  manifestRows: () => [],
};

describe("CodecRegistry.register (Issue #344)", () => {
  it("accepts a well-formed v1 codec", () => {
    const registry = new CodecRegistry();
    expect(() => registry.register(validV1Codec as never)).not.toThrow();
    expect(registry.get("svg")).toBeDefined();
  });

  it("accepts a well-formed v2 codec", () => {
    const registry = new CodecRegistry();
    expect(() => registry.register(validV2Codec as never)).not.toThrow();
    expect(registry.get("image")).toBeDefined();
  });

  it("rejects a non-object value with INVALID_CODEC_REGISTRATION", () => {
    const registry = new CodecRegistry();
    expect(() => registry.register(null as never)).toThrow(WittgensteinError);
    expect(() => registry.register(42 as never)).toThrow(/non-object/);
  });

  it("rejects a codec with no modality field", () => {
    const registry = new CodecRegistry();
    const bad = { ...validV1Codec, modality: undefined };
    expect(() => registry.register(bad as never)).toThrow(/missing a string `modality`/);
  });

  it("rejects a codec with an unknown modality string", () => {
    const registry = new CodecRegistry();
    const bad = { ...validV1Codec, modality: "not-a-modality" };
    let caught: unknown;
    try {
      registry.register(bad as never);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WittgensteinError);
    expect((caught as WittgensteinError).code).toBe("INVALID_CODEC_REGISTRATION");
    expect((caught as WittgensteinError).message).toContain("not-a-modality");
  });

  it("rejects a v2 codec missing `manifestRows`", () => {
    const registry = new CodecRegistry();
    const bad = { ...validV2Codec, manifestRows: undefined };
    expect(() => registry.register(bad as never)).toThrow(
      /v2 codec.*missing.*manifestRows/i,
    );
  });

  it("rejects a v1 codec missing `parse`", () => {
    const registry = new CodecRegistry();
    const bad = { ...validV1Codec, parse: undefined };
    expect(() => registry.register(bad as never)).toThrow(/v1 codec.*missing.*parse/i);
  });

  it("rejects a v1 codec missing `render`", () => {
    const registry = new CodecRegistry();
    const bad = { ...validV1Codec, render: undefined };
    expect(() => registry.register(bad as never)).toThrow(/v1 codec.*missing.*render/i);
  });
});
