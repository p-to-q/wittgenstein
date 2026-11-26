/**
 * #402 contract-fill coverage for the LlamaGen decoder bridge — runs without
 * onnxruntime-node (the weights resolver and ONNX runtime are mocked).
 *
 * Covers:
 *   - `onnxOutputToPng`: the upstream-pinned conversion
 *     `torch.clamp(127.5 * x + 128, 0, 255) → dtype=torch.uint8` (a
 *     truncating cast) plus its typed refusal of non-Float32 / wrong-length
 *     outputs. Pixel values are verified by inflating the produced IDAT with
 *     Node zlib — an independent decode, not a second copy of the encoder.
 *   - `buildHuggingFaceAssetFetcher`: URL shape, trailing-slash handling,
 *     unref'ed-timeout fetch contract, HTTP + network error surfaces.
 *   - `decode()` via the full bridge: cache-only default (no fetcher when
 *     unconfigured), int64 `BigInt64Array` feed construction, Map/object
 *     run-output reading, shape/codebook refusals before inference, session
 *     failure wrapping, `decoderHash` stamping, idempotent unload.
 */
import http from "node:http";
import { inflateSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHuggingFaceAssetFetcher,
  LLAMAGEN_DECODER_ID,
  loadLlamagenDecoderBridge,
  onnxOutputToPng,
} from "../src/decoders/llamagen.js";
import type { DecoderWeightsManifest } from "../src/decoders/weights.js";
import type * as weightsModule from "../src/decoders/weights.js";
import type { ImageLatentCodes } from "../src/schema.js";
import type * as runtimeModule from "../src/decoders/runtime.js";

const mocks = vi.hoisted(() => {
  const run = vi.fn();
  const release = vi.fn(async () => undefined);
  const session = {
    inputNames: ["latent_grid"],
    outputNames: ["recon_rgb"],
    run,
    release,
  };
  class FakeTensor {
    readonly type: string;
    readonly data: unknown;
    readonly dims: readonly number[];
    constructor(type: string, data: unknown, dims: readonly number[]) {
      this.type = type;
      this.data = data;
      this.dims = dims;
    }
  }
  const runtime = {
    InferenceSession: { create: vi.fn(async () => session) },
    Tensor: FakeTensor,
    env: { versions: { common: "1.30.0", node: "1.30.0" } },
  };
  const ensureOnnxRuntime = vi.fn(async () => runtime);
  const resolveDecoderWeights = vi.fn(async (options: { manifest: DecoderWeightsManifest }) => ({
    weightsPath: "/fake/llamagen_vq_ds16_decoder.onnx",
    weightsSha256: options.manifest.weightsSha256,
    source: "cache-hit" as const,
  }));
  return { run, release, runtime, ensureOnnxRuntime, resolveDecoderWeights };
});

vi.mock("../src/decoders/weights.js", async (importOriginal) => {
  const mod = (await importOriginal()) as typeof weightsModule;
  return { ...mod, resolveDecoderWeights: mocks.resolveDecoderWeights };
});

vi.mock("../src/decoders/runtime.js", async (importOriginal) => {
  const mod = (await importOriginal()) as typeof runtimeModule;
  return { ...mod, ensureOnnxRuntime: mocks.ensureOnnxRuntime };
});

const SHIPPED_SHA = "fd6800b3df8193968656e3e6b01ab48bd8899ebede829dfd1166da5f5b9f9389";

function manifestFixture(): DecoderWeightsManifest {
  return {
    family: "llamagen",
    repoId: "FoundationVision/LlamaGen",
    revision: "81e41139272c038412e4fe8f1c52a51ebbf95b8b",
    weightsFilename: "llamagen_vq_ds16_decoder.onnx",
    weightsSha256: SHIPPED_SHA,
    license: { code: "MIT", weights: "permissive" },
  };
}

function validLatents(overrides?: Partial<ImageLatentCodes>): ImageLatentCodes {
  return {
    schemaVersion: "witt.image.latents/v0.1",
    family: "llamagen",
    codebook: "vq_ds16_c2i",
    codebookVersion: "FoundationVision/LlamaGen@81e41139",
    tokenGrid: [16, 16],
    tokens: Array.from({ length: 256 }, () => 7),
    ...overrides,
  };
}

/** Inflate the first IDAT of a dependency-free PNG and return scanline-filtered RGBA rows. */
function inflatePngRgba(png: Uint8Array, width: number, height: number): Uint8Array {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let cursor = 8;
  const idatParts: Uint8Array[] = [];
  while (cursor + 8 <= png.length) {
    const length =
      ((png[cursor]! << 24) | (png[cursor + 1]! << 16) | (png[cursor + 2]! << 8) | png[cursor + 3]!) >>> 0;
    const type = String.fromCharCode(png[cursor + 4]!, png[cursor + 5]!, png[cursor + 6]!, png[cursor + 7]!);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + length;
    if (type === "IDAT") {
      idatParts.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    cursor = dataEnd + 4; // skip CRC
  }
  const raw = inflateSync(Buffer.concat(idatParts));
  const scanlineLength = width * 4 + 1;
  expect(raw.length).toBe(scanlineLength * height);
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * scanlineLength;
    expect(raw[rowStart]).toBe(0); // filter type 0 (None)
    rgba.set(raw.subarray(rowStart + 1, rowStart + 1 + width * 4), y * width * 4);
  }
  return rgba;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL;
});

describe("onnxOutputToPng (upstream formula pin)", () => {
  it("applies clamp(127.5*x + 128, 0, 255) with a truncating uint8 cast", () => {
    const { pngBytes } = onnxOutputToPng({ data: new Float32Array([-1, 0, 1]), dims: [1, 3, 1, 1] }, 1, 1);
    // R: trunc(127.5*-1 + 128 = 0.5) = 0 · G: trunc(128) = 128 · B: trunc(clamp(255.5→255)) = 255
    expect([...inflatePngRgba(pngBytes, 1, 1)]).toEqual([0, 128, 255, 255]);
  });

  it("clamps out-of-range inputs and truncates fractional levels like torch uint8", () => {
    const { pngBytes } = onnxOutputToPng({ data: new Float32Array([-2, 2, 0.5]), dims: [1, 3, 1, 1] }, 1, 1);
    // R: clamp(-127→0) = 0 · G: clamp(383→255) = 255 · B: trunc(191.75) = 191
    expect([...inflatePngRgba(pngBytes, 1, 1)]).toEqual([0, 255, 191, 255]);
  });

  it("produces a 256×256 RGBA PNG at the advertised output size", () => {
    const data = new Float32Array(3 * 256 * 256); // all zeros → mid-gray 128
    const result = onnxOutputToPng({ data, dims: [1, 3, 256, 256] });
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
    const rgba = inflatePngRgba(result.pngBytes, 256, 256);
    expect(rgba[0]).toBe(128);
    expect(rgba[1]).toBe(128);
    expect(rgba[2]).toBe(128);
    expect(rgba[3]).toBe(255);
    expect(rgba[256 * 256 * 4 - 1]).toBe(255); // last alpha
  });

  it("refuses non-Float32 output with DECODER_INFERENCE_FAILED", () => {
    expect(() =>
      onnxOutputToPng({ data: new Int32Array(3), dims: [1, 3, 1, 1] }, 1, 1),
    ).toThrowError(expect.objectContaining({ code: "DECODER_INFERENCE_FAILED" }) as Error);
  });

  it("refuses wrong-length output with DECODER_INFERENCE_FAILED", () => {
    expect(() =>
      onnxOutputToPng({ data: new Float32Array(6), dims: [1, 3, 1, 1] }, 1, 1),
    ).toThrowError(expect.objectContaining({ code: "DECODER_INFERENCE_FAILED" }) as Error);
  });
});

describe("buildHuggingFaceAssetFetcher", () => {
  it("is undefined when no base URL is configured (cache-only posture)", () => {
    expect(buildHuggingFaceAssetFetcher(undefined)).toBeUndefined();
    expect(buildHuggingFaceAssetFetcher("")).toBeUndefined();
  });

  it("resolves <base>/<repoId>/resolve/<revision>/<filename> with a timeout signal", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return new Response(new Uint8Array([9, 8, 7]), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const fetcher = buildHuggingFaceAssetFetcher("https://huggingface.co/", 5_000);
    const bytes = await fetcher!({ kind: "weights", filename: "m.onnx" }, manifestFixture());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://huggingface.co/FoundationVision/LlamaGen/resolve/81e41139272c038412e4fe8f1c52a51ebbf95b8b/m.onnx",
    );
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: "follow" });
    expect([...bytes]).toEqual([9, 8, 7]);
  });

  it("wraps fetch rejections with a network error carrying the cause", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const fetcher = buildHuggingFaceAssetFetcher("https://huggingface.co");
    let caught: Error | null = null;
    try {
      await fetcher!({ kind: "weights", filename: "m.onnx" }, manifestFixture());
    } catch (error) {
      caught = error as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toMatch(/network error fetching/);
    expect((caught as Error & { cause?: unknown }).cause).toMatchObject({ message: "ECONNREFUSED" });
  });

  it("throws an HTTP status error on non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" })));
    const fetcher = buildHuggingFaceAssetFetcher("https://huggingface.co");
    await expect(fetcher!({ kind: "weights", filename: "m.onnx" }, manifestFixture())).rejects.toThrow(
      /HTTP 404 Not Found/,
    );
  });

  // Real `node:http` servers (not fetch stubs): undici `fetch()` resolves when
  // headers arrive, so these pin that the ~162MB weights-body read
  // (`arrayBuffer()`) happens inside the armed-timeout window — a server
  // that writes headers and then stalls the body aborts within the
  // configured ms instead of hanging the download forever.
  it("aborts a stalled weights body within the configured timeout", async () => {
    let headersSent = false;
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      // flushHeaders() sends the headers immediately, so `fetch()` resolves
      // and only the BODY read stalls — the exact defect shape.
      res.flushHeaders();
      headersSent = true;
      // no write, no end — the body never arrives
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const fetcher = buildHuggingFaceAssetFetcher(baseUrl, 100);
      const startedAt = Date.now();

      await expect(
        fetcher!({ kind: "weights", filename: "m.onnx" }, manifestFixture()),
      ).rejects.toMatchObject({ name: "AbortError" });

      // The headers DID arrive (fetch resolved); the stall was in the body.
      expect(headersSent).toBe(true);
      const elapsed = Date.now() - startedAt;
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(5_000);
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("returns the full body bytes when the weights body arrives", async () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const server = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/octet-stream" });
      res.end(payload);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const fetcher = buildHuggingFaceAssetFetcher(baseUrl, 5_000);

      const bytes = await fetcher!({ kind: "weights", filename: "m.onnx" }, manifestFixture());

      expect([...bytes]).toEqual([...payload]);
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe("loadLlamagenDecoderBridge (#402 contract-fill)", () => {
  it("advertises the locked capability table", async () => {
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    expect(bridge.capabilities).toEqual({
      family: "llamagen",
      decoderId: LLAMAGEN_DECODER_ID,
      supportedShapes: [{ shape: "2D", tokenGrid: [16, 16], outputPixels: [256, 256] }],
      codebook: "vq_ds16_c2i",
      codebookVersion: "FoundationVision/LlamaGen@81e41139",
      determinismClass: "structural-parity",
      runtimeTier: "node-onnx-cpu",
      runtime: { name: "onnxruntime-node", version: "1.30.0", executionProviders: ["cpu"] },
      codeLicense: "MIT",
      weightsLicense: "permissive",
    });
  });

  it("stays cache-only by default and activates a fetcher via weightsBaseUrl or the env var", async () => {
    await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    const cacheOnlyOptions = mocks.resolveDecoderWeights.mock.calls[0]![0] as Record<string, unknown>;
    expect(cacheOnlyOptions.fetcher).toBeUndefined();

    await loadLlamagenDecoderBridge({ manifest: manifestFixture(), weightsBaseUrl: "https://mirror.example" });
    const urlOptions = mocks.resolveDecoderWeights.mock.calls[1]![0] as Record<string, unknown>;
    expect(typeof urlOptions.fetcher).toBe("function");

    process.env.WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL = "https://huggingface.co";
    await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    const envOptions = mocks.resolveDecoderWeights.mock.calls[2]![0] as Record<string, unknown>;
    expect(typeof envOptions.fetcher).toBe("function");
  });

  it("builds an int64 BigInt64Array feed with dims [1, 16, 16] and stamps decoderHash", async () => {
    mocks.run.mockResolvedValue({ recon_rgb: { data: new Float32Array(3 * 256 * 256), dims: [1, 3, 256, 256] } });
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    const result = await bridge.decode(validLatents());

    const feed = mocks.run.mock.calls[0]![0] as Record<
      string,
      { data: unknown; dims: readonly number[]; type: string }
    >;
    const tensor = feed["latent_grid"]!;
    expect(tensor.type).toBe("int64");
    expect(tensor.data).toBeInstanceOf(BigInt64Array);
    expect([...(tensor.data as BigInt64Array)].map(String)).toEqual(Array.from({ length: 256 }, () => "7"));
    expect(tensor.dims).toEqual([1, 16, 16]);

    expect(result.raster.width).toBe(256);
    expect(result.raster.height).toBe(256);
    expect([...result.raster.pngBytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(result.decoderHash).toBe(SHIPPED_SHA);
    expect(result.warnings).toEqual([]);
  });

  it("reads the run output when the session returns a Map", async () => {
    mocks.run.mockResolvedValue(
      new Map([["recon_rgb", { data: new Float32Array(3 * 256 * 256), dims: [1, 3, 256, 256] }]]),
    );
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    const result = await bridge.decode(validLatents());
    expect(result.raster.width).toBe(256);
  });

  it("refuses wrong token grids before running inference", async () => {
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    await expect(
      bridge.decode(validLatents({ tokenGrid: [8, 8], tokens: Array.from({ length: 64 }, () => 1) })),
    ).rejects.toMatchObject({ code: "DECODER_SHAPE_UNSUPPORTED", details: { supportedShapes: [{ shape: "2D" }] } });
    await expect(
      bridge.decode(validLatents({ tokens: Array.from({ length: 100 }, () => 1) })),
    ).rejects.toMatchObject({ code: "DECODER_SHAPE_UNSUPPORTED" });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("refuses mismatched codebook identity before running inference", async () => {
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    await expect(bridge.decode(validLatents({ codebook: "other-codebook" }))).rejects.toMatchObject({
      code: "DECODER_CODEBOOK_MISMATCH",
      details: { expected: { codebook: "vq_ds16_c2i" }, received: { codebook: "other-codebook" } },
    });
    await expect(
      bridge.decode(validLatents({ codebookVersion: "FoundationVision/LlamaGen@deadbeef" })),
    ).rejects.toMatchObject({ code: "DECODER_CODEBOOK_MISMATCH" });
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it("wraps session.run failures as DECODER_INFERENCE_FAILED with the cause", async () => {
    mocks.run.mockRejectedValue(new Error("onnx blew up"));
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    await expect(bridge.decode(validLatents())).rejects.toMatchObject({
      code: "DECODER_INFERENCE_FAILED",
      details: { stage: "session.run", inputName: "latent_grid", outputName: "recon_rgb" },
    });
  });

  it("fails typed when the session produces no readable output", async () => {
    mocks.run.mockResolvedValue({});
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    await expect(bridge.decode(validLatents())).rejects.toMatchObject({
      code: "DECODER_INFERENCE_FAILED",
    });
  });

  it("pins the CPU execution provider on the ONNX session (S7e)", async () => {
    await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    expect(mocks.runtime.InferenceSession.create).toHaveBeenCalledWith(
      "/fake/llamagen_vq_ds16_decoder.onnx",
      { executionProviders: ["cpu"] },
    );
  });

  it("omits runtime identity and warns when the runtime cannot report a version (S7e)", async () => {
    mocks.ensureOnnxRuntime.mockResolvedValueOnce({
      InferenceSession: mocks.runtime.InferenceSession,
      Tensor: mocks.runtime.Tensor,
    });
    mocks.run.mockResolvedValue({ recon_rgb: { data: new Float32Array(3 * 256 * 256), dims: [1, 3, 256, 256] } });
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    expect(bridge.capabilities.runtime).toBeUndefined();
    const result = await bridge.decode(validLatents());
    expect(result.warnings).toEqual([
      expect.objectContaining({ code: "image/decoder-runtime-identity-missing" }),
    ]);
  });

  it("unload is idempotent and releases the session once", async () => {
    mocks.run.mockResolvedValue({ recon_rgb: { data: new Float32Array(3 * 256 * 256), dims: [1, 3, 256, 256] } });
    const bridge = await loadLlamagenDecoderBridge({ manifest: manifestFixture() });
    await bridge.decode(validLatents());
    await bridge.unload();
    await bridge.unload();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
});
