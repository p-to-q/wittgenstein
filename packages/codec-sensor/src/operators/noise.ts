import type { SensorOperator } from "../schema.js";
import type { OperatorContext } from "./index.js";

/**
 * Additive white or pink noise. Noise has no time dependence and is unaffected
 * by `timeOriginFrame`; it consumes the shared RNG sequentially so the
 * recursion-seam invariant (single-patch full-duration patchGrammar matches
 * the equivalent flat operator list byte-for-byte) holds.
 */
export function applyNoise(
  operator: Extract<SensorOperator, { type: "noise" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, rng } = ctx;
  const span = endFrame - startFrame;
  const noise = operator.color === "pink" ? pinkNoise(span, rng) : whiteNoise(span, rng);
  for (let i = 0; i < span; i += 1) {
    signal[startFrame + i] = (signal[startFrame + i] ?? 0) + (noise[i] ?? 0) * operator.amplitude;
  }
}

export function whiteNoise(frameCount: number, rng: () => number): Float32Array {
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    samples[i] = rng() * 2 - 1;
  }
  return samples;
}

export function pinkNoise(frameCount: number, rng: () => number): Float32Array {
  const white = whiteNoise(frameCount, rng);
  const pink = new Float32Array(frameCount);
  let prev = 0;
  for (let i = 0; i < frameCount; i += 1) {
    prev = 0.985 * prev + 0.15 * (white[i] ?? 0);
    pink[i] = prev;
  }
  return pink;
}
