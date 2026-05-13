import type { SensorOperator } from "../schema.js";
import type { OperatorContext } from "./index.js";

/**
 * Step (Heaviside) at `atSec` in local time. Patch-local step semantics
 * follow `timeOriginFrame`.
 */
export function applyStep(
  operator: Extract<SensorOperator, { type: "step" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, sampleRateHz, timeOriginFrame } = ctx;
  const start = Math.max(startFrame, timeOriginFrame + Math.floor(operator.atSec * sampleRateHz));
  for (let i = start; i < endFrame; i += 1) {
    signal[i] = (signal[i] ?? 0) + operator.amplitude;
  }
}
