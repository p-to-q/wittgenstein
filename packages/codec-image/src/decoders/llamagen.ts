/**
 * LlamaGen frozen-decoder bridge (M1B canonical, Phase 0 floor).
 *
 * The four M1B gates (#283) all PASS (Gates A+B: 2026-05-13 audit; Gates C+D:
 * 2026-05-27 audit — structural parity, ONNX CPU median 0.824 s). This file is
 * the contract-fill those audits authorized:
 *
 *   1. Read the bundled pin record (`./llamagen/manifest.json`).
 *   2. Resolve weights through the shared cache + sha256 resolver
 *      (`./weights.ts`): cache-hit, or fetch + verify + atomic promote when a
 *      `weightsBaseUrl` is configured (cache-only otherwise — see below).
 *   3. Load `onnxruntime-node` (optional peer) via `./runtime.ts` and build a
 *      CPU inference session.
 *   4. Advertise capabilities and expose `decode(codes)` per `./types.ts`.
 *
 * Decode math (evidence-pinned, upstream commit `ce98ec4`):
 *   - input:  int64 token grid [1, 16, 16] (static shape baked by the export
 *     wrapper, Gate D receipt);
 *   - output: float32 [1, 3, 256, 256] in [-1, 1]
 *     (`tokenizer/tokenizer_image/vq_demo.py` documents the output range);
 *   - PNG:   `clamp(127.5 * x + 128, 0, 255)` then a truncating `uint8`
 *     cast, per `tokenizer/tokenizer_image/reconstruction_vq_ddp.py` and
 *     `vq_demo.py` (torch `.to(dtype=torch.uint8)` truncates, it does not
 *     round).
 *
 * Hosting note: the shipped `.onnx` is a derivative export (upstream ships
 * `.pt` only) and has no canonical SHA-pinnable URL yet (#402). Until that
 * URL is blessed, the loader runs cache-only and a cache miss surfaces
 * `WEIGHTS_NOT_INSTALLED` with `installHint: "wittgenstein install image"`.
 * Activating the fetcher is a config change, not a code change: pass
 * `weightsBaseUrl` or set `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL` to a
 * HuggingFace-style base (`https://huggingface.co`); the fetcher then
 * resolves `<base>/<repoId>/resolve/<revision>/<filename>`.
 *
 * Refs:
 *   - Bridge contract: `./types.ts`
 *   - Audit C+D: `docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`
 *   - Replay verifier for the wired path: `wittgenstein replay` (#384)
 */
import manifestJson from "./llamagen/manifest.json" with { type: "json" };
import type { ImageLatentCodes } from "../schema.js";
import { encodeRgbaAsPng } from "../png.js";
import { ensureOnnxRuntime, type OnnxRuntime } from "./runtime.js";
import {
  DecoderWeightsManifestSchema,
  resolveDecoderWeights,
  type DecoderWeightsManifest,
} from "./weights.js";
import type {
  ImageDecoderBridge,
  ImageDecoderCapabilities,
  ImageDecoderResult,
  LoadDecoderBridgeOptions,
} from "./types.js";

/**
 * Stable identifier for this bridge family. Recorded on every manifest as
 * `decoderId` so receipts can be filtered / replayed per-family.
 */
export const LLAMAGEN_DECODER_ID = "llamagen-frozen-vq-v0" as const;

/** The bundled pin record, validated against the canonical schema at load. */
export const LLAMAGEN_MANIFEST: DecoderWeightsManifest = DecoderWeightsManifestSchema.parse(manifestJson);

const CODEBOOK = "vq_ds16_c2i" as const;
const CODEBOOK_VERSION = "FoundationVision/LlamaGen@81e41139" as const;
const TOKEN_GRID = [16, 16] as const;
const OUTPUT_PIXELS = [256, 256] as const;
const WEIGHTS_URL_ENV = "WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL";

/** Structural surface of the ONNX session the bridge actually uses. */
type SessionLike = {
  readonly inputNames: ReadonlyArray<string>;
  readonly outputNames: ReadonlyArray<string>;
  run(feeds: Record<string, unknown>): Promise<Record<string, unknown> | Map<string, unknown>>;
  release(): Promise<void>;
};

type TensorLike = {
  readonly data: unknown;
  readonly dims: readonly number[];
};

export class DecoderSessionFailedError extends Error {
  readonly code = "DECODER_SESSION_FAILED";
  readonly details: Record<string, unknown>;

  constructor(manifest: DecoderWeightsManifest, cause: unknown) {
    super(
      `Failed to build an ONNX inference session for ${manifest.family} decoder weights. ` +
        `The bytes passed sha256 verification, so this is a runtime/format failure, not a fetch failure.`,
    );
    this.name = "WittgensteinError";
    this.cause = cause;
    this.details = {
      family: manifest.family,
      decoderId: LLAMAGEN_DECODER_ID,
      weightsSha256: manifest.weightsSha256,
    };
  }
}

export class DecoderShapeUnsupportedError extends Error {
  readonly code = "DECODER_SHAPE_UNSUPPORTED";
  readonly details: Record<string, unknown>;

  constructor(received: { tokenGrid: readonly [number, number]; tokens: number }) {
    super(
      `LlamaGen bridge decodes 2D grids of ${TOKEN_GRID[0]}×${TOKEN_GRID[1]} tokens; ` +
        `received ${received.tokenGrid[0]}×${received.tokenGrid[1]} (${received.tokens} tokens).`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: "llamagen",
      decoderId: LLAMAGEN_DECODER_ID,
      supportedShapes: [{ shape: "2D", tokenGrid: TOKEN_GRID, outputPixels: OUTPUT_PIXELS }],
      received: received.tokenGrid,
    };
  }
}

export class DecoderCodebookMismatchError extends Error {
  readonly code = "DECODER_CODEBOOK_MISMATCH";
  readonly details: Record<string, unknown>;

  constructor(received: { codebook: string; codebookVersion: string }) {
    super(
      `LlamaGen bridge expects codebook "${CODEBOOK}" (${CODEBOOK_VERSION}); ` +
        `received "${received.codebook}" (${received.codebookVersion}). ` +
        `Mismatched codebooks decode to garbage, so the bridge refuses before running inference.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: "llamagen",
      decoderId: LLAMAGEN_DECODER_ID,
      expected: { codebook: CODEBOOK, codebookVersion: CODEBOOK_VERSION },
      received,
    };
  }
}

export class DecoderInferenceFailedError extends Error {
  readonly code = "DECODER_INFERENCE_FAILED";
  readonly details: Record<string, unknown>;

  constructor(context: { inputName: string | null; outputName: string | null; stage: string }, cause: unknown) {
    super(`LlamaGen bridge inference failed during ${context.stage}.`);
    this.name = "WittgensteinError";
    this.cause = cause;
    this.details = {
      family: "llamagen",
      decoderId: LLAMAGEN_DECODER_ID,
      ...context,
    };
  }
}

/**
 * Load the LlamaGen frozen decoder bridge.
 *
 * Cache-only by default (no canonical asset URL yet — #402). When
 * `options.weightsBaseUrl` or `WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL` is set,
 * cache misses fetch `<base>/<repoId>/resolve/<revision>/<filename>` and are
 * sha256-verified before promotion (never cache bad bytes). With
 * `options.cacheOnly`, every fetch path — explicit URL, ambient env, and
 * injected fetcher — is suppressed (S7d replay: verification never
 * downloads).
 */
export async function loadLlamagenDecoderBridge(
  options: LoadDecoderBridgeOptions = {},
): Promise<ImageDecoderBridge> {
  const manifest = options.manifest ?? LLAMAGEN_MANIFEST;

  // Weights first, runtime second: a cache miss without a configured URL
  // fails as WEIGHTS_NOT_INSTALLED even on machines without
  // onnxruntime-node — the install CLI (#403) is the fix for both.
  const fetcher =
    options.cacheOnly === true
      ? undefined
      : (options.fetcher ?? buildHuggingFaceAssetFetcher(resolveWeightsBaseUrl(options)));
  const resolved = fetcher
    ? await resolveDecoderWeights({ ...options, manifest, fetcher })
    : await resolveDecoderWeights({ ...options, manifest });

  const runtime = await ensureOnnxRuntime();
  const session = await createSession(runtime, resolved.weightsPath, manifest);
  let releasePromise: Promise<void> | null = null;
  const unload = (): Promise<void> => {
    releasePromise ??= Promise.resolve(session.release()).catch(() => undefined);
    return releasePromise;
  };

  return {
    capabilities: llamagenCapabilities(manifest),
    async decode(codes: ImageLatentCodes): Promise<ImageDecoderResult> {
      assertShapeSupported(codes);
      assertCodebookMatches(codes);

      const feeds = buildInputFeeds(runtime, session.inputNames[0] ?? null, codes);
      let output: TensorLike;
      try {
        const results = await session.run(feeds);
        const outputName = session.outputNames[0] ?? null;
        const found = readRunOutput(results, outputName);
        if (!found) {
          throw new Error(`session produced no readable output under name "${String(outputName)}"`);
        }
        output = found;
      } catch (error) {
        throw new DecoderInferenceFailedError(
          { inputName: session.inputNames[0] ?? null, outputName: session.outputNames[0] ?? null, stage: "session.run" },
          error,
        );
      }

      return {
        raster: onnxOutputToPng(output),
        warnings: [],
        decoderHash: manifest.weightsSha256,
      };
    },
    unload,
  };
}

function resolveWeightsBaseUrl(options: LoadDecoderBridgeOptions): string | undefined {
  return options.weightsBaseUrl ?? process.env[WEIGHTS_URL_ENV] ?? undefined;
}

/**
 * Build a HuggingFace-style asset fetcher: `<base>/<repoId>/resolve/<revision>/<filename>`.
 * Timeout posture mirrors the core harness `fetchWithTimeout` contract
 * (AbortController + *unref'ed* timer, cleared once the fetch settles) so a
 * hung download can neither block a run forever nor keep the process alive;
 * this package cannot import core — codec packages depend on schemas only —
 * so the four-line pattern is reimplemented locally and pinned here.
 */
export function buildHuggingFaceAssetFetcher(
  baseUrl: string | undefined,
  timeoutMs = 120_000,
): ((asset: { kind: "weights" | "codebook"; filename: string }, manifest: DecoderWeightsManifest) => Promise<Uint8Array>) | undefined {
  if (!baseUrl) {
    return undefined;
  }
  const base = baseUrl.replace(/\/+$/, "");
  return async (asset, manifest) => {
    const url = `${base}/${manifest.repoId}/resolve/${manifest.revision}/${asset.filename}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    timer.unref?.();

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    } catch (error) {
      throw new Error(`network error fetching ${url}`, { cause: error });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };
}

async function createSession(
  runtime: OnnxRuntime,
  weightsPath: string,
  manifest: DecoderWeightsManifest,
): Promise<SessionLike> {
  try {
    const created = await runtime.InferenceSession.create(weightsPath);
    return created as unknown as SessionLike;
  } catch (error) {
    throw new DecoderSessionFailedError(manifest, error);
  }
}

/** Advertise the locked capability table from the bridge README + audits. */
export function llamagenCapabilities(manifest: DecoderWeightsManifest): ImageDecoderCapabilities {
  return {
    family: "llamagen",
    decoderId: LLAMAGEN_DECODER_ID,
    supportedShapes: [{ shape: "2D", tokenGrid: TOKEN_GRID, outputPixels: OUTPUT_PIXELS }],
    codebook: CODEBOOK,
    codebookVersion: CODEBOOK_VERSION,
    determinismClass: "structural-parity",
    runtimeTier: "node-onnx-cpu",
    codeLicense: manifest.license.code,
    weightsLicense: manifest.license.weights,
  };
}

function assertShapeSupported(codes: ImageLatentCodes): void {
  if (
    codes.tokenGrid[0] !== TOKEN_GRID[0] ||
    codes.tokenGrid[1] !== TOKEN_GRID[1] ||
    codes.tokens.length !== TOKEN_GRID[0] * TOKEN_GRID[1]
  ) {
    throw new DecoderShapeUnsupportedError({ tokenGrid: codes.tokenGrid, tokens: codes.tokens.length });
  }
}

function assertCodebookMatches(codes: ImageLatentCodes): void {
  if (codes.codebook !== CODEBOOK || codes.codebookVersion !== CODEBOOK_VERSION) {
    throw new DecoderCodebookMismatchError({ codebook: codes.codebook, codebookVersion: codes.codebookVersion });
  }
}

/** Build the [1, 16, 16] int64 feed (ONNX int64 = BigInt64Array). */
function buildInputFeeds(
  runtime: OnnxRuntime,
  inputName: string | null,
  codes: ImageLatentCodes,
): Record<string, unknown> {
  if (!inputName) {
    throw new DecoderInferenceFailedError({ inputName: null, outputName: null, stage: "feed-construction" }, new Error("ONNX session declares no input names"));
  }
  const data = new BigInt64Array(codes.tokens.length);
  for (let i = 0; i < codes.tokens.length; i += 1) {
    data[i] = BigInt(codes.tokens[i]!);
  }
  const tensor = new runtime.Tensor("int64", data, [1, TOKEN_GRID[0], TOKEN_GRID[1]]);
  return { [inputName]: tensor };
}

function readRunOutput(
  results: Record<string, unknown> | Map<string, unknown>,
  outputName: string | null,
): TensorLike | null {
  if (!outputName) {
    return null;
  }
  const raw =
    results instanceof Map ? results.get(outputName) : (results as Record<string, unknown>)[outputName];
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw as { data?: unknown; dims?: readonly number[] };
  if (candidate.data === undefined || !Array.isArray(candidate.dims)) {
    return null;
  }
  return candidate as TensorLike;
}

/**
 * Convert an ONNX float32 [1, 3, H, W] output (range [-1, 1]) into an RGBA PNG.
 * Conversion is the upstream reconstruction formula (pinned commit `ce98ec4`).
 * Exported for direct evidence-pinned tests.
 */
export function onnxOutputToPng(
  output: TensorLike,
  height: number = OUTPUT_PIXELS[0],
  width: number = OUTPUT_PIXELS[1],
): { pngBytes: Uint8Array; width: number; height: number } {
  const data = output.data;
  if (!(data instanceof Float32Array)) {
    throw new DecoderInferenceFailedError(
      { inputName: null, outputName: null, stage: "output-conversion" },
      new Error(`expected Float32Array output, got ${data?.constructor?.name ?? typeof data}`),
    );
  }
  const expectedLength = 3 * height * width;
  if (data.length !== expectedLength) {
    throw new DecoderInferenceFailedError(
      { inputName: null, outputName: null, stage: "output-conversion" },
      new Error(`expected output length ${expectedLength}, got ${data.length}`),
    );
  }

  const rgba = new Uint8Array(height * width * 4);
  const channelStride = height * width;
  for (let pixel = 0; pixel < height * width; pixel += 1) {
    // Upstream formula (vq_demo.py + reconstruction_vq_ddp.py at the pinned
    // commit): torch.clamp(127.5 * samples + 128.0, 0, 255) then
    // `.to(dtype=torch.uint8)` — a truncating cast, so trunc (not round).
    const r = clampByte(Math.trunc(127.5 * data[pixel]! + 128));
    const g = clampByte(Math.trunc(127.5 * data[pixel + channelStride]! + 128));
    const b = clampByte(Math.trunc(127.5 * data[pixel + 2 * channelStride]! + 128));
    const out = pixel * 4;
    rgba[out] = r;
    rgba[out + 1] = g;
    rgba[out + 2] = b;
    rgba[out + 3] = 255;
  }
  return { pngBytes: encodeRgbaAsPng(width, height, rgba), width, height };
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, value));
}
