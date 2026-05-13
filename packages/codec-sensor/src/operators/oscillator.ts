import type { SensorOperator } from "../schema.js";
import type { OperatorContext } from "./index.js";

/**
 * Additive sinusoidal oscillator. Phase reference is `timeOriginFrame` so a
 * patch-local oscillator's `phaseRad` is interpreted at the patch boundary.
 */
export function applyOscillator(
  operator: Extract<SensorOperator, { type: "oscillator" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, sampleRateHz, timeOriginFrame } = ctx;
  for (let i = startFrame; i < endFrame; i += 1) {
    const localTimeSec = (i - timeOriginFrame) / sampleRateHz;
    signal[i] =
      (signal[i] ?? 0) +
      Math.sin(2 * Math.PI * operator.frequencyHz * localTimeSec + operator.phaseRad) *
        operator.amplitude;
  }
}
