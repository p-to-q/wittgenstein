/**
 * S7b wiring tests — injected decoder bridge lane in `decodeLatentsToRaster`
 * / `ImageCodec.decode()` (exec-plan `m1b-image-implementation-slices.md`).
 *
 * Pins the no-silent-fallback contract:
 *   - an injected bridge produces the raster + a lane receipt;
 *   - family / shape / codebook mismatches are typed preflight errors raised
 *     BEFORE `bridge.decode()` runs;
 *   - bridge failures propagate (typed as-is, untyped wrapped) and NEVER fall
 *     through to the procedural placeholder;
 *   - the placeholder lane (no bridge) is unchanged — golden.test.ts still
 *     locks the dry-run PNG digest and the placeholder row-key set.
 */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { codecV2, type RenderCtx } from "@wittgenstein/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { imageCodec, imageV2Codec } from "../src/codec.js";
import {
  LLAMAGEN_DECODER_ID,
  LLAMAGEN_MANIFEST,
  loadLlamagenDecoderBridge,
} from "../src/decoders/llamagen.js";
import type {
  ImageDecoderBridge,
  ImageDecoderCapabilities,
  ImageDecoderResult,
} from "../src/decoders/types.js";
import {
  DecoderBridgeCodebookMismatchError,
  DecoderBridgeFailedError,
  DecoderBridgeFamilyMismatchError,
  DecoderBridgeOutputMismatchError,
  DecoderBridgeShapeUnsupportedError,
  decodeLatentsToRaster,
  toImageDecoderReceipt,
  type BridgeDecodeReceipt,
} from "../src/pipeline/decoder.js";
import { encodeRgbaAsPng } from "../src/png.js";
import type { ImageLatentCodes } from "../src/schema.js";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47] as const;

const silentLogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
} as const;

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRenderCtx(label: string, warnings?: string[]): Promise<RenderCtx> {
  const runDir = await mkdtemp(resolve(tmpdir(), `witt-s7b-${label}-`));
  scratchDirs.push(runDir);
  return {
    runId: "s7b-test",
    runDir,
    seed: null,
    outPath: resolve(runDir, "out.png"),
    logger: warnings
      ? {
          debug: () => undefined,
          info: () => undefined,
          warn: (message) => warnings.push(message),
          error: () => undefined,
        }
      : silentLogger,
  };
}

function makeLatents(overrides: Partial<ImageLatentCodes> = {}): ImageLatentCodes {
  return {
    schemaVersion: "witt.image.latents/v0.1",
    family: "llamagen",
    codebook: "stub-codebook",
    codebookVersion: "v0",
    tokenGrid: [4, 4],
    tokens: Array.from({ length: 16 }, (_, index) => index),
    ...overrides,
  };
}

function makePng(width: number, height: number): Uint8Array {
  const rgba = new Uint8Array(width * height * 4).fill(120);
  return encodeRgbaAsPng(width, height, rgba);
}

interface StubBridgeControls {
  capabilities?: Partial<ImageDecoderCapabilities>;
  decodeError?: unknown;
  decodeResult?: ImageDecoderResult;
}

function makeStubBridge(controls: StubBridgeControls = {}): {
  bridge: ImageDecoderBridge;
  calls: ImageLatentCodes[];
} {
  const calls: ImageLatentCodes[] = [];
  const capabilities: ImageDecoderCapabilities = {
    family: "llamagen",
    decoderId: "stub-bridge",
    supportedShapes: [{ shape: "2D", tokenGrid: [4, 4], outputPixels: [64, 64] }],
    codebook: "stub-codebook",
    codebookVersion: "v0",
    determinismClass: "byte-parity",
    runtimeTier: "node-onnx-cpu",
    codeLicense: "Apache-2.0",
    weightsLicense: "permissive",
    ...controls.capabilities,
  };
  const bridge: ImageDecoderBridge = {
    capabilities,
    async decode(codes) {
      calls.push(codes);
      if (controls.decodeError !== undefined) {
        throw controls.decodeError;
      }
      return (
        controls.decodeResult ?? {
          raster: { pngBytes: makePng(64, 64), width: 64, height: 64 },
          warnings: [],
          decoderHash: "stub-weights-sha256",
        }
      );
    },
    async unload() {
      /* no-op */
    },
  };
  return { bridge, calls };
}

function errorCode(error: unknown): string | undefined {
  return (error as Error & { code?: string }).code;
}

describe("decode bridge wiring (S7b) — injected bridge lane", () => {
  it("injected bridge produces the raster and stamps the lane receipt", async () => {
    const ctx = await makeRenderCtx("injected");
    const { bridge, calls } = makeStubBridge();
    const codes = makeLatents();

    const raster = await decodeLatentsToRaster(codes, ctx, { bridge });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual(codes);
    expect(Array.from(raster.pngBytes.subarray(0, 4))).toEqual([...PNG_MAGIC]);
    expect(raster.width).toBe(64);
    expect(raster.height).toBe(64);
    expect(raster.bridge).toEqual({
      decoderId: "stub-bridge",
      decoderHash: "stub-weights-sha256",
      determinismClass: "byte-parity",
      warnings: [],
    } satisfies BridgeDecodeReceipt);
  });

  it("carries the bridge runtime identity onto the lane receipt (S7e)", async () => {
    const ctx = await makeRenderCtx("runtime-identity");
    const runtime = {
      name: "onnxruntime-node" as const,
      version: "1.30.0",
      executionProviders: ["cpu"],
    };
    const { bridge } = makeStubBridge({ capabilities: { runtime } });

    const raster = await decodeLatentsToRaster(makeLatents(), ctx, { bridge });

    expect(raster.bridge).toEqual({
      decoderId: "stub-bridge",
      decoderHash: "stub-weights-sha256",
      determinismClass: "byte-parity",
      warnings: [],
      runtime,
    } satisfies BridgeDecodeReceipt);
  });

  it("toImageDecoderReceipt copies runtime only when present (S7e)", () => {
    const runtime = {
      name: "onnxruntime-node" as const,
      version: "1.30.0",
      executionProviders: ["cpu"],
    };
    const base = {
      decoderId: "stub-bridge",
      decoderHash: "stub-weights-sha256",
      determinismClass: "byte-parity" as const,
      warnings: [],
    };

    expect(toImageDecoderReceipt({ ...base, runtime })).toEqual({
      lane: "injected-bridge",
      decoderId: "stub-bridge",
      decoderHash: "stub-weights-sha256",
      determinismClass: "byte-parity",
      runtime,
    });
    const withoutRuntime = toImageDecoderReceipt(base);
    expect("runtime" in withoutRuntime).toBe(false);
  });

  it("no bridge → placeholder lane unchanged, no lane receipt", async () => {
    const warnings: string[] = [];
    const ctx = await makeRenderCtx("placeholder", warnings);
    const codes = makeLatents();

    const raster = await decodeLatentsToRaster(codes, ctx);

    expect("bridge" in raster).toBe(false);
    expect(Array.from(raster.pngBytes.subarray(0, 4))).toEqual([...PNG_MAGIC]);
    expect(
      warnings.some((message) => message.includes("dense placeholder frozen-decoder bridge")),
    ).toBe(true);

    // Placeholder path stays deterministic: identical bytes on a re-run.
    const again = await decodeLatentsToRaster(makeLatents(), ctx);
    expect(Buffer.from(again.pngBytes).equals(Buffer.from(raster.pngBytes))).toBe(true);
  });

  it("family mismatch is a typed preflight error; bridge.decode never runs", async () => {
    const ctx = await makeRenderCtx("family");
    const { bridge, calls } = makeStubBridge({ capabilities: { family: "dvae" } });

    let caught: unknown;
    try {
      await decodeLatentsToRaster(makeLatents(), ctx, { bridge });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DecoderBridgeFamilyMismatchError);
    expect(errorCode(caught)).toBe("DECODER_FAMILY_MISMATCH");
    expect(calls).toHaveLength(0);
  });

  it("shape mismatch is refused before decode", async () => {
    const ctx = await makeRenderCtx("shape");
    const { bridge, calls } = makeStubBridge();

    let caught: unknown;
    try {
      await decodeLatentsToRaster(
        makeLatents({ tokenGrid: [8, 8], tokens: Array.from({ length: 64 }, (_, i) => i) }),
        ctx,
        { bridge },
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DecoderBridgeShapeUnsupportedError);
    expect(errorCode(caught)).toBe("DECODER_SHAPE_UNSUPPORTED");
    expect(calls).toHaveLength(0);
  });

  it("codebook mismatch is refused before decode", async () => {
    const ctx = await makeRenderCtx("codebook");
    const { bridge, calls } = makeStubBridge();

    let caught: unknown;
    try {
      await decodeLatentsToRaster(makeLatents({ codebook: "other-codebook" }), ctx, {
        bridge,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DecoderBridgeCodebookMismatchError);
    expect(errorCode(caught)).toBe("DECODER_CODEBOOK_MISMATCH");
    expect(calls).toHaveLength(0);
  });

  it("typed bridge failure propagates as-is — never falls through to placeholder", async () => {
    const ctx = await makeRenderCtx("typed-failure");
    const typed = Object.assign(new Error("session blew up"), {
      name: "WittgensteinError",
      code: "DECODER_INFERENCE_FAILED",
    });
    const { bridge, calls } = makeStubBridge({ decodeError: typed });

    await expect(decodeLatentsToRaster(makeLatents(), ctx, { bridge })).rejects.toBe(typed);
    expect(calls).toHaveLength(1);
  });

  it("untyped bridge failure is wrapped as DECODER_BRIDGE_FAILED", async () => {
    const ctx = await makeRenderCtx("untyped-failure");
    const { bridge, calls } = makeStubBridge({ decodeError: new Error("untyped boom") });

    let caught: unknown;
    try {
      await decodeLatentsToRaster(makeLatents(), ctx, { bridge });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DecoderBridgeFailedError);
    expect(errorCode(caught)).toBe("DECODER_BRIDGE_FAILED");
    expect((caught as DecoderBridgeFailedError).details.decoderId).toBe("stub-bridge");
    expect((caught as DecoderBridgeFailedError).cause).toBeInstanceOf(Error);
    expect(calls).toHaveLength(1);
  });

  it("output dims contradicting the advertised shape are a typed error", async () => {
    const ctx = await makeRenderCtx("output-mismatch");
    const { bridge } = makeStubBridge({
      decodeResult: {
        raster: { pngBytes: makePng(32, 32), width: 32, height: 32 },
        warnings: [],
        decoderHash: "stub-weights-sha256",
      },
    });

    let caught: unknown;
    try {
      await decodeLatentsToRaster(makeLatents(), ctx, { bridge });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(DecoderBridgeOutputMismatchError);
    expect(errorCode(caught)).toBe("DECODER_OUTPUT_MISMATCH");
  });
});

describe("decode bridge wiring (S7b) — codec-level receipts", () => {
  it("produce with an injected bridge records lane, warnings, and the image.decoder row", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-s7b-produce-"));
    scratchDirs.push(runDir);
    const stubBytes = makePng(64, 64);
    const stubWarning = {
      code: "image/bridge-advisory",
      message: "bridge advisory",
      detail: { kind: "test" },
    };
    const { bridge, calls } = makeStubBridge({
      capabilities: {
        supportedShapes: [{ shape: "2D", tokenGrid: [32, 32], outputPixels: [64, 64] }],
      },
      decodeResult: {
        raster: { pngBytes: stubBytes, width: 64, height: 64 },
        warnings: [stubWarning],
        decoderHash: "stub-weights-sha256",
      },
    });

    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "bridge lane" },
      {
        runId: "s7b-produce",
        parentRunId: null,
        runDir,
        seed: null,
        outPath: resolve(runDir, "out.png"),
        logger: silentLogger,
        clock: { now: () => 0, iso: () => new Date(0).toISOString() },
        sidecar: codecV2.createRunSidecar(),
        services: {
          dryRun: true,
          telemetry: { writeText: async () => {} },
          decoderBridge: bridge,
        },
        fork: (childRunId) => ({
          runId: childRunId,
          parentRunId: "s7b-produce",
          runDir,
          seed: null,
          outPath: resolve(runDir, "out.png"),
          logger: silentLogger,
          clock: { now: () => 0, iso: () => new Date(0).toISOString() },
          sidecar: codecV2.createRunSidecar(),
          services: { dryRun: true, telemetry: { writeText: async () => {} } },
          fork: () => {
            throw new Error("Nested fork is not exercised by this test.");
          },
        }),
      },
    );

    expect(calls).toHaveLength(1);
    // Dry-run adapter emits a 32×32 llamagen / stub-codebook grid; the bridge
    // preflight matched it and the bridge decoded exactly those latents.
    expect(calls[0]?.tokenGrid).toEqual([32, 32]);
    expect(calls[0]?.codebook).toBe("stub-codebook");

    expect(art.metadata.decoderReceipt).toEqual({
      lane: "injected-bridge",
      decoderId: "stub-bridge",
      decoderHash: "stub-weights-sha256",
      determinismClass: "byte-parity",
    });
    expect(art.metadata.decoderHash).toEqual({
      value: "stub-weights-sha256",
      frozen: true,
      slot: "stub-bridge",
    });
    expect(art.metadata.warnings).toContainEqual({ ...stubWarning, phase: "decode" });
    expect(Buffer.from(art.bytes ?? new Uint8Array()).equals(Buffer.from(stubBytes))).toBe(true);
    expect(art.metadata.artifactSha256).toBe(createHash("sha256").update(stubBytes).digest("hex"));

    const rows = imageV2Codec.manifestRows(art);
    expect(rows.find((row) => row.key === "image.decoder")?.value).toEqual(
      art.metadata.decoderReceipt,
    );
  });

  it("produce without a bridge emits no image.decoder row (placeholder row set intact)", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-s7b-placeholder-"));
    scratchDirs.push(runDir);

    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "placeholder lane" },
      {
        runId: "s7b-placeholder",
        parentRunId: null,
        runDir,
        seed: null,
        outPath: resolve(runDir, "out.png"),
        logger: silentLogger,
        clock: { now: () => 0, iso: () => new Date(0).toISOString() },
        sidecar: codecV2.createRunSidecar(),
        services: { dryRun: true, telemetry: { writeText: async () => {} } },
        fork: (childRunId) => ({
          runId: childRunId,
          parentRunId: "s7b-placeholder",
          runDir,
          seed: null,
          outPath: resolve(runDir, "out.png"),
          logger: silentLogger,
          clock: { now: () => 0, iso: () => new Date(0).toISOString() },
          sidecar: codecV2.createRunSidecar(),
          services: { dryRun: true, telemetry: { writeText: async () => {} } },
          fork: () => {
            throw new Error("Nested fork is not exercised by this test.");
          },
        }),
      },
    );

    expect(art.metadata.decoderReceipt).toBeUndefined();
    expect(art.metadata.decoderHash.slot).toBe("LFQ-family-decoder");
    expect(imageV2Codec.manifestRows(art).map((row) => row.key)).not.toContain(
      "image.decoder",
    );
  });

  it("imageCodec.render (v1 surface) routes an injected bridge end-to-end", async () => {
    const ctx = await makeRenderCtx("v1");
    const parsed = imageCodec.parse(
      JSON.stringify({
        intent: "test",
        subject: "x",
        decoder: {
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          latentResolution: [4, 4],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const { bridge } = makeStubBridge();
    const result = await imageCodec.render(parsed.value, ctx, { bridge });

    expect(result.mimeType).toBe("image/png");
    const bytes = await readFile(ctx.outPath);
    expect(Array.from(bytes.subarray(0, 4))).toEqual([...PNG_MAGIC]);
    expect(Buffer.from(bytes).equals(Buffer.from(makePng(64, 64)))).toBe(true);
  });
});

describe("decode bridge wiring (S7b) — real bridge smoke behind the install lane", () => {
  it("decodeLatentsToRaster with the real LlamaGen bridge (skips unless installed)", async (context) => {
    let bridge: ImageDecoderBridge;
    try {
      bridge = await loadLlamagenDecoderBridge();
    } catch (error) {
      const code = errorCode(error);
      if (code === "WEIGHTS_NOT_INSTALLED" || code === "DECODER_RUNTIME_UNAVAILABLE") {
        context.skip(
          `install lane not present locally (${code}); runs behind \`wittgenstein install image\``,
        );
        return;
      }
      throw error;
    }

    try {
      const ctx = await makeRenderCtx("real");
      const codes: ImageLatentCodes = {
        schemaVersion: "witt.image.latents/v0.1",
        family: "llamagen",
        // Pinned to the private constants in src/decoders/llamagen.ts
        // (CODEBOOK / CODEBOOK_VERSION); the manifest itself does not carry
        // the codebook identity.
        codebook: "vq_ds16_c2i",
        codebookVersion: "FoundationVision/LlamaGen@81e41139",
        tokenGrid: [16, 16],
        tokens: Array.from({ length: 256 }, (_, index) => index % 16384),
      };

      const raster = await decodeLatentsToRaster(codes, ctx, { bridge });

      expect(raster.width).toBe(256);
      expect(raster.height).toBe(256);
      expect(Array.from(raster.pngBytes.subarray(0, 4))).toEqual([...PNG_MAGIC]);
      expect(raster.bridge?.decoderId).toBe(LLAMAGEN_DECODER_ID);
      expect(raster.bridge?.determinismClass).toBe("structural-parity");
      expect(raster.bridge?.decoderHash).toBe(LLAMAGEN_MANIFEST.weightsSha256);
      // S7e: real installs must record the resolved runtime identity, and
      // the pipeline must carry it onto the decode receipt.
      const runtimeIdentity = bridge.capabilities.runtime;
      expect(runtimeIdentity?.name).toBe("onnxruntime-node");
      expect(runtimeIdentity?.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(runtimeIdentity?.executionProviders).toEqual(["cpu"]);
      expect(raster.bridge?.runtime).toEqual(runtimeIdentity);
    } finally {
      await bridge.unload();
    }
  });
});
