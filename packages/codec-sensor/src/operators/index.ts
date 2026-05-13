// Sensor operator dispatch — one strategy per `SensorOperator["type"]`. Extracted
// from `pipeline/render.ts` per #326 / #288. Each operator file owns its own
// expansion logic; this index threads the shared `OperatorContext` and routes
// to the right strategy.
//
// Behavior is intended to be byte-identical to the pre-refactor switch
// statement — the existing sensor goldens are the regression baseline.

import type { SensorOperator } from "../schema.js";
import { applyOscillator } from "./oscillator.js";
import { applyNoise } from "./noise.js";
import { applyDrift } from "./drift.js";
import { applyPulse } from "./pulse.js";
import { applyStep } from "./step.js";
import { applyEcgTemplate } from "./ecg-template.js";
import { applyPatchGrammar } from "./patch-grammar.js";

/**
 * Shared arguments every operator strategy receives.
 *
 * - `signal` is the (already-allocated) output buffer; operators add into it.
 * - `startFrame` / `endFrame` define the half-open frame window
 *   `[startFrame, endFrame)` the operator should write into.
 * - `sampleRateHz` and `rng` are shared across operators in a render.
 * - `timeOriginFrame` defines the local zero of the operator's time axis.
 *   At the top level it is `0` (operators see absolute time). Inside a patch
 *   it is the patch start, so `step.atSec` / `pulse.centerSec` /
 *   `oscillator.phaseRad` / `drift.slopePerSec` / `ecgTemplate` phase are
 *   interpreted patch-local. See the original `expandOperator` doc comment
 *   in `render.ts` for the contract pinned by #247.
 */
export interface OperatorContext {
  signal: Float32Array;
  startFrame: number;
  endFrame: number;
  sampleRateHz: number;
  rng: () => number;
  timeOriginFrame: number;
}

/**
 * Dispatch a single operator to its strategy implementation.
 *
 * Re-exported by render.ts (and re-used recursively from patch-grammar.ts
 * for inner operators).
 */
export function dispatchOperator(operator: SensorOperator, ctx: OperatorContext): void {
  switch (operator.type) {
    case "oscillator":
      applyOscillator(operator, ctx);
      return;
    case "noise":
      applyNoise(operator, ctx);
      return;
    case "drift":
      applyDrift(operator, ctx);
      return;
    case "pulse":
      applyPulse(operator, ctx);
      return;
    case "step":
      applyStep(operator, ctx);
      return;
    case "ecgTemplate":
      applyEcgTemplate(operator, ctx);
      return;
    case "patchGrammar":
      applyPatchGrammar(operator, ctx);
      return;
  }
}

export { applyOscillator } from "./oscillator.js";
export { applyNoise, whiteNoise, pinkNoise } from "./noise.js";
export { applyDrift } from "./drift.js";
export { applyPulse } from "./pulse.js";
export { applyStep } from "./step.js";
export { applyEcgTemplate } from "./ecg-template.js";
export { applyPatchGrammar } from "./patch-grammar.js";
