// Internal math helpers shared between the placeholder/landscape renderer and the
// decoder orchestrator. Deliberately small and dependency-free so both sides can
// import without circular concerns. Not part of the public API.

export type Rgb = [number, number, number];

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(edge1 - edge0, 0.00001));
  return t * t * (3 - 2 * t);
}

export function hash01(input: number): number {
  let x = input | 0;
  x = Math.imul(x ^ 0x7feb352d, 0x846ca68b);
  x ^= x >>> 15;
  x = Math.imul(x ^ 0xc2b2ae35, 0x27d4eb2d);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967295;
}

export function sampleNoise(x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;

  const n00 = hash01(x0 * 374761393 + y0 * 668265263);
  const n10 = hash01((x0 + 1) * 374761393 + y0 * 668265263);
  const n01 = hash01(x0 * 374761393 + (y0 + 1) * 668265263);
  const n11 = hash01((x0 + 1) * 374761393 + (y0 + 1) * 668265263);

  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  return lerp(lerp(n00, n10, sx), lerp(n01, n11, sx), sy);
}

export function mixColor(a: Rgb, b: Rgb, t: number): Rgb {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

export function scaleColor(color: Rgb, factor: number): Rgb {
  return [color[0] * factor, color[1] * factor, color[2] * factor];
}

// Bilinear sampler over a 2D scalar field stored row-major. Used by both the
// decoder orchestrator (when reading fields during the pixel loop) and the
// landscape renderer (inside `terrainShade`). Kept here to avoid duplicating
// the bilinear math in two places.
export function sampleField(
  field: Float32Array,
  width: number,
  height: number,
  nx: number,
  ny: number,
): number {
  const x = clamp01(nx) * (width - 1);
  const y = clamp01(ny) * (height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;

  const c00 = field[y0 * width + x0] ?? 0;
  const c10 = field[y0 * width + x1] ?? 0;
  const c01 = field[y1 * width + x0] ?? 0;
  const c11 = field[y1 * width + x1] ?? 0;

  const top = lerp(c00, c10, tx);
  const bottom = lerp(c01, c11, tx);
  return lerp(top, bottom, ty);
}
