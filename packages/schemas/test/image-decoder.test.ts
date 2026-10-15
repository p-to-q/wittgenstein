import { describe, expect, it } from "vitest";
import { codecV2 } from "../src/index.js";

/**
 * `image.decoder` receipt schema (S7e value promotion): the typed contract
 * the row channel now enforces. Backward compatibility is load-bearing —
 * receipts written before S7e carry no `runtime` and must keep parsing.
 */
describe("image.decoder receipt schema (S7e promotion)", () => {
  const receipt = {
    lane: "injected-bridge",
    decoderId: "llamagen-frozen-vq-v0",
    decoderHash: "a".repeat(64),
    determinismClass: "structural-parity",
  };

  it("parses a pre-S7e receipt without runtime", () => {
    expect(codecV2.ImageDecoderReceiptSchema.parse(receipt)).toEqual(receipt);
  });

  it("parses a receipt with runtime identity", () => {
    const withRuntime = {
      ...receipt,
      runtime: {
        name: "onnxruntime-node",
        version: "1.30.0",
        executionProviders: ["cpu"],
      },
    };
    expect(codecV2.ImageDecoderReceiptSchema.parse(withRuntime)).toEqual(withRuntime);
  });

  it("strips unknown fields but refuses malformed known fields", () => {
    const parsed = codecV2.ImageDecoderReceiptSchema.safeParse({ ...receipt, extra: 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("extra" in parsed.data).toBe(false);
    }
    expect(codecV2.ImageDecoderReceiptSchema.safeParse({ ...receipt, decoderId: 42 }).success).toBe(
      false,
    );
    expect(
      codecV2.ImageDecoderReceiptSchema.safeParse({ ...receipt, determinismClass: "sure" }).success,
    ).toBe(false);
    expect(
      codecV2.ImageDecoderReceiptSchema.safeParse({ ...receipt, lane: "placeholder" }).success,
    ).toBe(false);
  });

  it("requires at least one execution provider when runtime is present", () => {
    const emptyProviders = {
      ...receipt,
      runtime: { name: "onnxruntime-node", version: "1.30.0", executionProviders: [] },
    };
    expect(codecV2.ImageDecoderReceiptSchema.safeParse(emptyProviders).success).toBe(false);
    const emptyVersion = {
      ...receipt,
      runtime: { name: "onnxruntime-node", version: "", executionProviders: ["cpu"] },
    };
    expect(codecV2.ImageDecoderReceiptSchema.safeParse(emptyVersion).success).toBe(false);
  });
});
