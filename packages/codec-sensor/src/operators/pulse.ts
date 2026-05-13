import type { SensorOperator } from "../schema.js";
import type { OperatorContext } from "./index.js";

/**
 * Half-sine pulse centered at `centerSec` (in local time) with `widthSec`
 * span. Clipped to the operator's frame window. Patch-local pulse semantics
 * follow `timeOriginFrame`.
 */
export function applyPulse(
  operator: Extract<SensorOperator, { type: "pulse" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, sampleRateHz, timeOriginFrame } = ctx;
  const start = Math.max(
    startFrame,
    timeOriginFrame + Math.floor((operator.centerSec - operator.widthSec / 2) * sampleRateHz),
  );
  const end = Math.min(
    endFrame,
    timeOriginFrame + Math.ceil((operator.centerSec + operator.widthSec / 2) * sampleRateHz),
  );
  for (let i = start; i < end; i += 1) {
    const phase = (i - start) / Math.max(1, end - start);
    signal[i] = (signal[i] ?? 0) + Math.sin(Math.PI * phase) * operator.amplitude;
  }
}
