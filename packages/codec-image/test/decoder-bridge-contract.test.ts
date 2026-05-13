/**
 * Contract tests for the M1B decoder bridge interface.
 *
 * Two goals:
 *
 * 1. **Stub current behavior** — the canonical M1B loader
 *    (`loadLlamagenDecoderBridge`) and the alternate (`loadSeedDecoderBridge`)
 *    today MUST throw a typed error with a stable error code citing the
 *    blocker tracker issues. The CLI / pipeline reads `error.code` to surface
 *    the structured failure with a receipt; that contract is brittle without a
 *    regression baseline.
 *
 * 2. **Prove the contract is implementable** — a tiny test-only conforming
 *    bridge (`StubBridge`) satisfies `ImageDecoderBridge`. This catches
 *    type-level drift when someone widens the interface without updating
 *    the impl checklist in `packages/codec-image/src/decoders/README.md`.
 */
import { describe, expect, it } from "vitest";
import { LLAMAGEN_DECODER_ID, loadLlamagenDecoderBridge } from "../src/decoders/llamagen.js";
import { SEED_DECODER_ID, loadSeedDecoderBridge } from "../src/decoders/seed.js";
import type { ImageDecoderBridge, ImageDecoderCapabilities } from "../src/decoders/types.js";

describe("decoder bridge contract (M1B prep)", () => {
  it("loadLlamagenDecoderBridge throws LLAMAGEN_BRIDGE_NOT_IMPLEMENTED with blocker links", async () => {
    let caught: unknown;
    try {
      await loadLlamagenDecoderBridge();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string; details?: Record<string, unknown> };
    expect(err.code).toBe("LLAMAGEN_BRIDGE_NOT_IMPLEMENTED");
    expect(err.details?.family).toBe("llamagen");
    expect(err.details?.decoderId).toBe(LLAMAGEN_DECODER_ID);
    const blockers = err.details?.blockers as Record<string, string> | undefined;
    expect(blockers?.gateC).toMatch(/issues\/334/);
    expect(blockers?.gateD).toMatch(/issues\/335/);
  });

  it("loadSeedDecoderBridge throws SEED_BRIDGE_NOT_IMPLEMENTED with audit link", async () => {
    let caught: unknown;
    try {
      await loadSeedDecoderBridge();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const err = caught as Error & { code?: string; details?: Record<string, unknown> };
    expect(err.code).toBe("SEED_BRIDGE_NOT_IMPLEMENTED");
    expect(err.details?.family).toBe("seed");
    expect(err.details?.decoderId).toBe(SEED_DECODER_ID);
    const blockers = err.details?.blockers as Record<string, string> | undefined;
    expect(blockers?.audit).toMatch(/^https:\/\/github\.com\/p-to-q\/wittgenstein\/issues\/331$/);
  });

  it("the bridge contract is implementable — a stub satisfies ImageDecoderBridge", async () => {
    const capabilities: ImageDecoderCapabilities = {
      family: "llamagen",
      decoderId: "stub-for-contract-test",
      supportedShapes: [{ shape: "2D", tokenGrid: [16, 16], outputPixels: [256, 256] }],
      codebook: "stub-codebook",
      codebookVersion: "v0",
      determinismClass: "byte-parity",
      runtimeTier: "node-onnx-cpu",
      codeLicense: "Apache-2.0",
      weightsLicense: "permissive",
    };

    class StubBridge implements ImageDecoderBridge {
      readonly capabilities = capabilities;
      async decode() {
        return {
          raster: {
            pngBytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
            width: 256,
            height: 256,
          },
          warnings: [] as const,
          decoderHash: "stub-hash",
        };
      }
      async unload() {
        /* no-op */
      }
    }

    const bridge: ImageDecoderBridge = new StubBridge();
    expect(bridge.capabilities.family).toBe("llamagen");
    expect(bridge.capabilities.supportedShapes[0]?.shape).toBe("2D");

    // Type-level sanity: a 1D-shape variant is in the discriminated union.
    const oneDShape: ImageDecoderCapabilities["supportedShapes"][number] = {
      shape: "1D",
      sequenceLength: 256,
      outputPixels: [256, 256],
    };
    expect(oneDShape.shape).toBe("1D");

    // Functional sanity: decode() returns a PNG-shaped payload.
    const result = await bridge.decode();
    expect(result.raster.pngBytes[0]).toBe(0x89);
    expect(result.raster.pngBytes[1]).toBe(0x50); // P
    expect(result.warnings).toEqual([]);

    await bridge.unload();
  });
});
