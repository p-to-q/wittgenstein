/**
 * Minimal dependency-free RGBA→PNG encoder (RGBA8, color type 6, stored
 * deflate blocks). Extracted from `pipeline/decoder.ts` (2026-10-16) so the
 * decoder bridge (`decoders/llamagen.ts`) can reuse the exact same encoder
 * for ONNX-decoded rasters — one byte-format definition for every raster
 * this codec emits.
 *
 * Behavior is byte-for-byte identical to the previous inline copy; the
 * image pipeline tests + golden serve as the regression net.
 */

export function encodeRgbaAsPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
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
