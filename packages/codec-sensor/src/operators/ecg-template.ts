import type { SensorOperator } from "../schema.js";
import type { OperatorContext } from "./index.js";

/**
 * Deterministic ECG-shaped template (P / QRS / T components per beat) at
 * `bpm` beats per minute, scaled by `amplitude`. Beat phase is measured in
 * local time so a patch-local ECG starts a new beat at the patch boundary.
 */
export function applyEcgTemplate(
  operator: Extract<SensorOperator, { type: "ecgTemplate" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, sampleRateHz, timeOriginFrame } = ctx;
  const beatPeriod = 60 / operator.bpm;
  for (let i = startFrame; i < endFrame; i += 1) {
    const localTimeSec = (i - timeOriginFrame) / sampleRateHz;
    const phase = (localTimeSec % beatPeriod) / beatPeriod;
    const p = Math.exp(-Math.pow((phase - 0.16) * 22, 2)) * 0.08;
    const qrs =
      Math.exp(-Math.pow((phase - 0.34) * 55, 2)) * 0.92 -
      Math.exp(-Math.pow((phase - 0.31) * 80, 2)) * 0.22;
    const t = Math.exp(-Math.pow((phase - 0.58) * 15, 2)) * 0.18;
    signal[i] = (signal[i] ?? 0) + (p + qrs + t) * operator.amplitude;
  }
}
