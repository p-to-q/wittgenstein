import type { SensorOperator } from "../schema.js";
import type { OperatorContext } from "./index.js";

/**
 * Linear drift along the local time axis. `slopePerSec` is interpreted in
 * local time (relative to `timeOriginFrame`); a patch-local drift starts at
 * zero at the patch boundary.
 */
export function applyDrift(
  operator: Extract<SensorOperator, { type: "drift" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, sampleRateHz, timeOriginFrame } = ctx;
  for (let i = startFrame; i < endFrame; i += 1) {
    const localTimeSec = (i - timeOriginFrame) / sampleRateHz;
    signal[i] = (signal[i] ?? 0) + localTimeSec * operator.slopePerSec;
  }
}
