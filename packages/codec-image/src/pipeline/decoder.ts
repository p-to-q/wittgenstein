// Image decoder orchestrator — builds scalar fields from latent tokens, runs
// the placeholder/landscape pixel synthesizer, and encodes the resulting RGBA
// buffer as PNG. The landscape-specific rendering lives in
// `./landscape-renderer.ts` (extracted per #325 / #288); shared math helpers
// live in `./internal-math.ts`.
//
// The `loadLlamagenDecoderBridge` wiring under `../decoders/llamagen.ts` is
// what eventually replaces the placeholder path here; M1B is gated on the
// per-candidate radar audits in #283.

import type { RenderCtx } from "@wittgenstein/schemas";
import type { ImageLatentCodes } from "../schema.js";

import {
  buildSceneProfile,
  buildPalette,
  FIELD_SALTS,
  renderSky,
  renderTerrain,
  tryDecodeReferenceLandscape,
} from "./landscape-renderer.js";
import {
  clamp01,
  clampByte,
  clampInt,
  hash01,
  sampleField,
} from "./internal-math.js";

export interface DecodedRaster {
  pngBytes: Uint8Array;
  width: number;
  height: number;
}

export async function decodeLatentsToRaster(
  codes: ImageLatentCodes,
  ctx: RenderCtx,
  // M1B will wire this seam to streaming / parallel decoder chunks.
  onChunk?: (chunk: unknown) => void,
): Promise<DecodedRaster> {
  void onChunk;
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

function encodeRgbaAsPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const scanlineLength = width * 4 + 1;
  const raw = new Uint8Array(scanlineLength * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * scanlineLength;
    raw[rowStart] = 0;
    const sourceStart = y * width * 4;
    raw.set(rgba.subarray(sourceStart, sourceStart + width * 4), rowStart + 1);
  }

  const idat = encodeZlibStored(raw);
  const ihdrChunk = createChunk("IHDR", ihdr);
  const idatChunk = createChunk("IDAT", idat);
  const iendChunk = createChunk("IEND", new Uint8Array(0));

  return concatUint8Arrays(signature, ihdrChunk, idatChunk, iendChunk);
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const output = new Uint8Array(8 + data.length + 4);
  writeU32(output, 0, data.length);
  output[4] = type.charCodeAt(0);
  output[5] = type.charCodeAt(1);
  output[6] = type.charCodeAt(2);
  output[7] = type.charCodeAt(3);
  output.set(data, 8);
  const crc = crc32(output.subarray(4, 8 + data.length));
  writeU32(output, 8 + data.length, crc);
  return output;
}

function concatUint8Arrays(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 255;
  target[offset + 1] = (value >>> 16) & 255;
  target[offset + 2] = (value >>> 8) & 255;
  target[offset + 3] = value & 255;
}

function writeU16Le(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 255;
  target[offset + 1] = (value >>> 8) & 255;
}

function encodeZlibStored(raw: Uint8Array): Uint8Array {
  const maxBlockLength = 65_535;
  const blockCount = Math.max(1, Math.ceil(raw.length / maxBlockLength));
  const output = new Uint8Array(2 + blockCount * 5 + raw.length + 4);
  let cursor = 0;

  // CMF/FLG for zlib + deflate with the fastest algorithm. The subsequent
  // stored blocks avoid platform-specific compressor choices while remaining
  // a standards-compliant PNG IDAT payload.
  output[cursor] = 0x78;
  output[cursor + 1] = 0x01;
  cursor += 2;

  for (let block = 0; block < blockCount; block += 1) {
    const start = block * maxBlockLength;
    const end = Math.min(raw.length, start + maxBlockLength);
    const length = end - start;
    const finalBlock = block === blockCount - 1;
    output[cursor] = finalBlock ? 0x01 : 0x00;
    writeU16Le(output, cursor + 1, length);
    writeU16Le(output, cursor + 3, (~length) & 0xffff);
    cursor += 5;
    output.set(raw.subarray(start, end), cursor);
    cursor += length;
  }

  writeU32(output, cursor, adler32(raw));
  return output;
}

function adler32(data: Uint8Array): number {
  const modulus = 65_521;
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % modulus;
    b = (b + a) % modulus;
  }
  return ((b << 16) | a) >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = -1;
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    if (byte === undefined) {
      continue;
    }
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ -1) >>> 0;
}
