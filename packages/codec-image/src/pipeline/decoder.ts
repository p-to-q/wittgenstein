// Image decoder orchestrator — builds scalar fields from latent tokens, runs
// the placeholder/landscape pixel synthesizer, and encodes the resulting RGBA
// buffer as PNG. The landscape-specific rendering lives in
// `./landscape-renderer.ts` (extracted per #325 / #288); shared math helpers
// live in `./internal-math.ts`.
//
// Two decode lanes (S7b): without an injected bridge the procedural
// placeholder path runs exactly as before; with an injected
// `ImageDecoderBridge` (already loaded by the caller — the pipeline never
// imports `loadLlamagenDecoderBridge` and never parses env/config) the
// raster comes from `bridge.decode()` and any failure is a typed error, not
// a placeholder fallback.

import type { RenderCtx } from "@wittgenstein/schemas";
import type { ImageLatentCodes } from "../schema.js";
import type {
  DecoderDeterminismClass,
  DecoderRuntimeIdentity,
  DecoderShapeSupport,
  ImageDecoderBridge,
  ImageDecoderCapabilities,
  ImageDecoderResult,
} from "../decoders/types.js";
import type { ImageDecoderReceipt } from "../types.js";

import {
  buildSceneProfile,
  buildPalette,
  FIELD_SALTS,
  renderSky,
  renderTerrain,
  tryDecodeReferenceLandscape,
} from "./landscape-renderer.js";
import { encodeRgbaAsPng } from "../png.js";
import {
  clamp01,
  clampByte,
  clampInt,
  hash01,
  sampleField,
} from "./internal-math.js";

/** Receipt for a raster produced by an injected decoder bridge (S7b wiring). */
export interface BridgeDecodeReceipt {
  /** Stable decoder identifier from `ImageDecoderCapabilities.decoderId`. */
  readonly decoderId: string;
  /** Weights/tokenizer/adapter hash stamped by the bridge (Issue #384 replay). */
  readonly decoderHash: string;
  /** Determinism contract the bridge advertises (`byte-parity` | `structural-parity`). */
  readonly determinismClass: DecoderDeterminismClass;
  /** Non-fatal warnings the bridge surfaced during decode. */
  readonly warnings: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
    readonly detail?: unknown;
  }>;
  /**
   * Runtime identity of the loaded bridge (S7e): resolved version +
   * requested execution providers. Absent when the bridge's runtime could
   * not report a version (the loader then attaches a decode warning) or
   * for bridge implementations that predate S7e.
   */
  readonly runtime?: DecoderRuntimeIdentity;
}

export interface DecodedRaster {
  pngBytes: Uint8Array;
  width: number;
  height: number;
  /** Present only when an injected `ImageDecoderBridge` produced the raster. */
  readonly bridge?: BridgeDecodeReceipt;
}

export interface DecodeLatentsToRasterOptions {
  /**
   * Already-loaded decoder bridge (S7b DI seam). When present, the
   * raster comes from `bridge.decode()` and any failure is a typed
   * error — never a fall-through to the procedural placeholder. The
   * pipeline never loads bridges itself: the caller (CLI / entry
   * layer) owns loading, and env / config resolution stays outside
   * this package's pipeline.
   */
  readonly bridge?: ImageDecoderBridge;
}

/** Build the artifact-level decoder receipt from a bridge decode result. */
export function toImageDecoderReceipt(bridge: BridgeDecodeReceipt): ImageDecoderReceipt {
  return {
    lane: "injected-bridge",
    decoderId: bridge.decoderId,
    decoderHash: bridge.decoderHash,
    determinismClass: bridge.determinismClass,
    ...(bridge.runtime ? { runtime: bridge.runtime } : {}),
  };
}

export async function decodeLatentsToRaster(
  codes: ImageLatentCodes,
  ctx: RenderCtx,
  options?: DecodeLatentsToRasterOptions,
): Promise<DecodedRaster> {
  if (options?.bridge) {
    return decodeViaInjectedBridge(codes, options.bridge);
  }
  const [tokenWidth, tokenHeight] = codes.tokenGrid;
  const pixelWidth = tokenWidth * 16;
  const pixelHeight = tokenHeight * 16;
  const profile = buildSceneProfile(codes.tokens);
  const referencePng = await tryDecodeReferenceLandscape(profile, ctx);
  if (referencePng) {
    ctx.logger.warn(
      "Using narrow-domain reference decoder bridge; output quality is higher, but still stands in for a real pretrained decoder family.",
    );
    return { pngBytes: referencePng, width: pixelWidth, height: pixelHeight };
  }

  const pixelCount = pixelWidth * pixelHeight;
  const rgba = new Uint8Array(pixelCount * 4);

  const normalizedTokens = normalizeTokens(codes.tokens);
  const elevation = blurField(
    buildField(normalizedTokens, FIELD_SALTS.elevation),
    tokenWidth,
    tokenHeight,
    2,
  );
  const moisture = blurField(
    buildField(normalizedTokens, FIELD_SALTS.moisture),
    tokenWidth,
    tokenHeight,
    2,
  );
  const warmth = blurField(
    buildField(normalizedTokens, FIELD_SALTS.warmth),
    tokenWidth,
    tokenHeight,
    2,
  );
  const detail = blurField(
    buildField(normalizedTokens, FIELD_SALTS.detail),
    tokenWidth,
    tokenHeight,
    1,
  );

  const averageElevation = averageField(elevation);
  const averageMoisture = averageField(moisture);
  const averageWarmth = averageField(warmth);
  const palette = buildPalette(profile, averageWarmth, averageMoisture);

  for (let y = 0; y < pixelHeight; y += 1) {
    for (let x = 0; x < pixelWidth; x += 1) {
      const nx = x / Math.max(1, pixelWidth - 1);
      const ny = y / Math.max(1, pixelHeight - 1);
      const elev = sampleField(elevation, tokenWidth, tokenHeight, nx, ny);
      const moist = sampleField(moisture, tokenWidth, tokenHeight, nx, ny);
      const warm = sampleField(warmth, tokenWidth, tokenHeight, nx, ny);
      const det = sampleField(detail, tokenWidth, tokenHeight, nx, ny);

      const ridge = sampleField(elevation, tokenWidth, tokenHeight, nx, 0.28);
      const distant = sampleField(moisture, tokenWidth, tokenHeight, nx, 0.55);
      const horizon = clamp01(
        0.33 +
          (averageElevation - 0.5) * 0.14 +
          (ridge - 0.5) * (0.18 + profile.ruggedness * 0.12) +
          (distant - 0.5) * 0.08,
      );

      const base = (y * pixelWidth + x) * 4;
      const color =
        ny <= horizon
          ? renderSky(
              nx,
              ny,
              horizon,
              warm,
              moist,
              det,
              palette.skyTop,
              palette.skyHorizon,
              profile,
            )
          : renderTerrain(
              nx,
              ny,
              horizon,
              elev,
              moist,
              warm,
              det,
              palette.rockBase,
              palette.grassBase,
              palette.waterBase,
              palette.skyHorizon,
              elevation,
              tokenWidth,
              tokenHeight,
              profile,
            );

      const vignette = 1 - 0.12 * distanceToCenter(nx, ny);
      rgba[base] = clampByte(color[0] * vignette);
      rgba[base + 1] = clampByte(color[1] * vignette);
      rgba[base + 2] = clampByte(color[2] * vignette);
      rgba[base + 3] = 255;
    }
  }

  ctx.logger.warn(
    "Using dense placeholder frozen-decoder bridge; output is more legible, but still not representative of a real pretrained decoder family.",
  );
  return {
    pngBytes: encodeRgbaAsPng(pixelWidth, pixelHeight, rgba),
    width: pixelWidth,
    height: pixelHeight,
  };
}

// --- Injected decoder bridge lane (S7b wiring: DI seam, no silent fallback) ---

async function decodeViaInjectedBridge(
  codes: ImageLatentCodes,
  bridge: ImageDecoderBridge,
): Promise<DecodedRaster> {
  const capabilities = bridge.capabilities;
  // Preflight BEFORE calling the bridge: family / shape / codebook mismatches
  // are deterministic typed errors here, so even a bridge that skips its own
  // assertions cannot silently decode the wrong latents.
  assertDecoderFamilyMatches(capabilities, codes);
  const shapeSupport = assertDecoderShapeSupported(capabilities, codes);
  assertDecoderCodebookMatches(capabilities, codes);

  let result: ImageDecoderResult;
  try {
    result = await bridge.decode(codes);
  } catch (error) {
    throw asTypedDecoderBridgeFailure(capabilities.decoderId, error);
  }
  assertDecoderOutputMatches(result.raster, shapeSupport.outputPixels, capabilities.decoderId);

  return {
    pngBytes: result.raster.pngBytes,
    width: result.raster.width,
    height: result.raster.height,
    bridge: {
      decoderId: capabilities.decoderId,
      decoderHash: result.decoderHash,
      determinismClass: capabilities.determinismClass,
      warnings: result.warnings,
      ...(capabilities.runtime ? { runtime: capabilities.runtime } : {}),
    },
  };
}

export class DecoderBridgeFamilyMismatchError extends Error {
  readonly code = "DECODER_FAMILY_MISMATCH";
  readonly details: Record<string, unknown>;

  constructor(capabilities: ImageDecoderCapabilities, received: ImageLatentCodes) {
    super(
      `Injected decoder bridge ${capabilities.decoderId} implements family "${capabilities.family}"; ` +
        `received latents declared family "${received.family}".`,
    );
    this.name = "WittgensteinError";
    this.details = {
      decoderId: capabilities.decoderId,
      expected: capabilities.family,
      received: received.family,
    };
  }
}

export class DecoderBridgeShapeUnsupportedError extends Error {
  readonly code = "DECODER_SHAPE_UNSUPPORTED";
  readonly details: Record<string, unknown>;

  constructor(capabilities: ImageDecoderCapabilities, received: ImageLatentCodes) {
    super(
      `Injected decoder bridge ${capabilities.decoderId} does not support ` +
        `${received.tokenGrid[0]}×${received.tokenGrid[1]} latents (${received.tokens.length} tokens).`,
    );
    this.name = "WittgensteinError";
    this.details = {
      decoderId: capabilities.decoderId,
      supportedShapes: capabilities.supportedShapes,
      received: { tokenGrid: received.tokenGrid, tokens: received.tokens.length },
    };
  }
}

export class DecoderBridgeCodebookMismatchError extends Error {
  readonly code = "DECODER_CODEBOOK_MISMATCH";
  readonly details: Record<string, unknown>;

  constructor(capabilities: ImageDecoderCapabilities, received: ImageLatentCodes) {
    super(
      `Injected decoder bridge ${capabilities.decoderId} expects codebook "${capabilities.codebook}" ` +
        `(${capabilities.codebookVersion}); received "${received.codebook}" (${received.codebookVersion}). ` +
        `Mismatched codebooks decode to garbage, so the pipeline refuses before running inference.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      decoderId: capabilities.decoderId,
      expected: { codebook: capabilities.codebook, codebookVersion: capabilities.codebookVersion },
      received: { codebook: received.codebook, codebookVersion: received.codebookVersion },
    };
  }
}

export class DecoderBridgeOutputMismatchError extends Error {
  readonly code = "DECODER_OUTPUT_MISMATCH";
  readonly details: Record<string, unknown>;

  constructor(
    decoderId: string,
    advertised: readonly [number, number],
    received: { width: number; height: number },
  ) {
    super(
      `Injected decoder bridge ${decoderId} advertised ${advertised[0]}×${advertised[1]} output for the ` +
        `matched shape but produced ${received.width}×${received.height}.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      decoderId,
      advertised: { width: advertised[0], height: advertised[1] },
      received: { width: received.width, height: received.height },
    };
  }
}

export class DecoderBridgeFailedError extends Error {
  readonly code = "DECODER_BRIDGE_FAILED";
  readonly details: Record<string, unknown>;

  constructor(decoderId: string, cause: unknown) {
    super(
      `Injected decoder bridge ${decoderId} failed without a typed error code; ` +
        `the placeholder lane was NOT used.`,
    );
    this.name = "WittgensteinError";
    this.cause = cause;
    this.details = { decoderId };
  }
}

function assertDecoderFamilyMatches(
  capabilities: ImageDecoderCapabilities,
  codes: ImageLatentCodes,
): void {
  if (capabilities.family !== codes.family) {
    throw new DecoderBridgeFamilyMismatchError(capabilities, codes);
  }
}

function assertDecoderShapeSupported(
  capabilities: ImageDecoderCapabilities,
  codes: ImageLatentCodes,
): DecoderShapeSupport & { shape: "2D" } {
  const area = codes.tokenGrid[0] * codes.tokenGrid[1];
  const match = capabilities.supportedShapes.find(
    (entry): entry is DecoderShapeSupport & { shape: "2D" } =>
      entry.shape === "2D" &&
      entry.tokenGrid[0] === codes.tokenGrid[0] &&
      entry.tokenGrid[1] === codes.tokenGrid[1],
  );
  if (!match || codes.tokens.length !== area) {
    throw new DecoderBridgeShapeUnsupportedError(capabilities, codes);
  }
  return match;
}

function assertDecoderCodebookMatches(
  capabilities: ImageDecoderCapabilities,
  codes: ImageLatentCodes,
): void {
  if (
    codes.codebook !== capabilities.codebook ||
    codes.codebookVersion !== capabilities.codebookVersion
  ) {
    throw new DecoderBridgeCodebookMismatchError(capabilities, codes);
  }
}

function assertDecoderOutputMatches(
  raster: DecodedRaster,
  advertised: readonly [number, number],
  decoderId: string,
): void {
  if (
    raster.pngBytes.length === 0 ||
    raster.width !== advertised[0] ||
    raster.height !== advertised[1]
  ) {
    throw new DecoderBridgeOutputMismatchError(decoderId, advertised, raster);
  }
}

/**
 * Preserve bridge-authored typed receipts (name "WittgensteinError" + string
 * `code`); wrap anything else so an injected bridge failure is never a bare,
 * code-less rejection — and never triggers the placeholder lane.
 */
function asTypedDecoderBridgeFailure(decoderId: string, error: unknown): Error {
  const shaped = error as Error & { code?: unknown };
  if (shaped instanceof Error && shaped.name === "WittgensteinError" && typeof shaped.code === "string") {
    return shaped;
  }
  return new DecoderBridgeFailedError(decoderId, error);
}

// --- Field operations (private to the decoder orchestrator) ---

function normalizeTokens(tokens: number[]): Float32Array {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const token of tokens) {
    if (token < min) {
      min = token;
    }
    if (token > max) {
      max = token;
    }
  }
  const range = Math.max(1, max - min);
  const out = new Float32Array(tokens.length);
  for (let i = 0; i < tokens.length; i += 1) {
    out[i] = ((tokens[i] ?? 0) - min) / range;
  }
  return out;
}

function buildField(tokens: Float32Array, salt: number): Float32Array {
  const out = new Float32Array(tokens.length);
  for (let i = 0; i < tokens.length; i += 1) {
    const base = tokens[i] ?? 0;
    const hashed = hash01(Math.floor(base * 1_000_003) ^ salt ^ i);
    out[i] = clamp01(base * 0.62 + hashed * 0.38);
  }
  return out;
}

function blurField(
  field: Float32Array,
  width: number,
  height: number,
  passes: number,
): Float32Array {
  let current = field;
  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(current.length);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        let sum = 0;
        let weightSum = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const sx = clampInt(x + ox, 0, width - 1);
            const sy = clampInt(y + oy, 0, height - 1);
            const weight = ox === 0 && oy === 0 ? 4 : ox === 0 || oy === 0 ? 2 : 1;
            sum += (current[sy * width + sx] ?? 0) * weight;
            weightSum += weight;
          }
        }
        next[y * width + x] = sum / Math.max(1, weightSum);
      }
    }
    current = next;
  }
  return current;
}

function averageField(field: Float32Array): number {
  let sum = 0;
  for (const value of field) {
    sum += value;
  }
  return sum / Math.max(1, field.length);
}

function distanceToCenter(nx: number, ny: number): number {
  const dx = nx - 0.5;
  const dy = ny - 0.5;
  return clamp01(Math.sqrt(dx * dx + dy * dy) / 0.72);
}

// --- PNG encoding (private to the decoder orchestrator) ---