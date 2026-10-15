/**
 * `wittgenstein image --decoder llamagen` happy path at the CLI layer.
 *
 * `loadLlamagenDecoderBridge` is mocked so this test pins the CLI's loader
 * contract (options forwarded, bridge surfaced) without touching the real
 * weight cache. The real loader's failure surface is pinned in image.test.ts
 * (WEIGHTS_NOT_INSTALLED with an empty cache), and the full
 * services → codec → manifest loop is pinned end-to-end in
 * `packages/core/test/harness.test.ts` (entry-layer services passthrough).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImageDecoderBridge } from "@wittgenstein/codec-image";
import { loadLlamagenDecoderBridge } from "@wittgenstein/codec-image";
import { loadImageDecoderBridgeForRun } from "../src/commands/decoder-bridge.js";

vi.mock("@wittgenstein/codec-image", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, loadLlamagenDecoderBridge: vi.fn() };
});

const mockedLoader = vi.mocked(loadLlamagenDecoderBridge);

function stubBridge(): ImageDecoderBridge {
  return {
    capabilities: {
      family: "llamagen",
      decoderId: "stub-bridge",
      supportedShapes: [{ shape: "2D", tokenGrid: [32, 32], outputPixels: [64, 64] }],
      codebook: "stub-codebook",
      codebookVersion: "v0",
      determinismClass: "byte-parity",
      runtimeTier: "node-onnx-cpu",
      codeLicense: "Apache-2.0",
      weightsLicense: "permissive",
    },
    async decode() {
      throw new Error("not exercised by this test");
    },
    async unload() {
      /* no-op */
    },
  };
}

beforeEach(() => {
  mockedLoader.mockReset();
});

describe("image --decoder flag (S7c entry layer)", () => {
  it("loads the llamagen bridge and forwards loader options", async () => {
    const bridge = stubBridge();
    mockedLoader.mockResolvedValueOnce(bridge);

    const outcome = await loadImageDecoderBridgeForRun({
      decoder: "llamagen",
      allowResearchWeights: true,
      cacheDir: "/tmp/witt-test-cache",
    });

    expect(outcome.bridge).toBe(bridge);
    expect(outcome.error).toBeUndefined();
    expect(mockedLoader).toHaveBeenCalledWith({
      allowResearchWeights: true,
      cacheDir: "/tmp/witt-test-cache",
    });
  });

  it("wraps untyped loader failures as IMAGE_DECODER_LOAD_FAILED", async () => {
    mockedLoader.mockRejectedValueOnce(new Error("raw loader boom"));

    const outcome = await loadImageDecoderBridgeForRun({ decoder: "llamagen" });

    expect(outcome.bridge).toBeUndefined();
    expect(outcome.error?.code).toBe("IMAGE_DECODER_LOAD_FAILED");
    expect(outcome.error?.message).toContain("raw loader boom");
  });

  it("preserves typed loader errors (code + details + installHint)", async () => {
    const typed = Object.assign(new Error("weights not installed"), {
      name: "WittgensteinError",
      code: "WEIGHTS_NOT_INSTALLED",
      details: { installHint: "wittgenstein install image", family: "llamagen" },
    });
    mockedLoader.mockRejectedValueOnce(typed);

    const outcome = await loadImageDecoderBridgeForRun({ decoder: "llamagen" });

    expect(outcome.error?.code).toBe("WEIGHTS_NOT_INSTALLED");
    expect(outcome.error?.installHint).toBe("wittgenstein install image");
    expect(outcome.error?.details).toEqual({
      installHint: "wittgenstein install image",
      family: "llamagen",
    });
  });
});
