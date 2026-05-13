import type { SensorOperator } from "../schema.js";
import { dispatchOperator, type OperatorContext } from "./index.js";

/**
 * Expand a `patchGrammar` operator across `[startFrame, endFrame)`.
 *
 * Each patch occupies `floor(patchLengthSec * sampleRateHz)` consecutive frames,
 * starting from `startFrame`. Patches that would extend past `endFrame` are
 * truncated; patches whose start frame is past `endFrame` are skipped. Within
 * each patch:
 *   - Pre-patch signal values in the patch range are snapshotted.
 *   - Inner operators run with `timeOriginFrame = patchStart` so all time-based
 *     parameters (oscillator phase reference, drift origin, step.atSec,
 *     pulse.centerSec, ecgTemplate phase) are interpreted patch-local. Noise
 *     consumption is sequential against the parent RNG so a single-patch
 *     full-duration `patchGrammar` stays byte-identical to the equivalent flat
 *     operator list (the recursion-seam invariant).
 *   - If `affineNormalize` is set, the patch's *contribution* (post-pre) is
 *     min-max normalized to `[minOutput, maxOutput]` before being added back
 *     onto the pre-patch values. The schema rejects `minOutput >= maxOutput`
 *     so a degenerate range can never reach this code (#247 item 4).
 *
 * Nested `patchGrammar` is rejected at the schema level (#247 item 3); inner
 * operators are typed as `SensorBaseOperator` so this function never recurses
 * into another patchGrammar.
 */
export function applyPatchGrammar(
  operator: Extract<SensorOperator, { type: "patchGrammar" }>,
  ctx: OperatorContext,
): void {
  const { signal, startFrame, endFrame, sampleRateHz, rng } = ctx;
  const patchFrames = Math.max(1, Math.floor(operator.patchLengthSec * sampleRateHz));
  for (let patchIdx = 0; patchIdx < operator.patches.length; patchIdx += 1) {
    const patch = operator.patches[patchIdx];
    if (!patch) {
      continue;
    }
    const patchStart = startFrame + patchIdx * patchFrames;
    if (patchStart >= endFrame) {
      break;
    }
    const patchEnd = Math.min(endFrame, patchStart + patchFrames);

    const span = patchEnd - patchStart;
    const preValues = new Float32Array(span);
    for (let i = 0; i < span; i += 1) {
      preValues[i] = signal[patchStart + i] ?? 0;
    }

    for (const inner of patch.operators) {
      dispatchOperator(inner, {
        signal,
        startFrame: patchStart,
        endFrame: patchEnd,
        sampleRateHz,
        rng,
        timeOriginFrame: patchStart,
      });
    }

    if (patch.affineNormalize) {
      const contribution = new Float32Array(span);
      let min = Infinity;
      let max = -Infinity;
      for (let i = 0; i < span; i += 1) {
        const c = (signal[patchStart + i] ?? 0) - (preValues[i] ?? 0);
        contribution[i] = c;
        if (c < min) min = c;
        if (c > max) max = c;
      }
      const range = max - min;
      const targetMin = patch.affineNormalize.minOutput;
      const targetMax = patch.affineNormalize.maxOutput;
      const targetRange = targetMax - targetMin;
      const fallbackCenter = (targetMin + targetMax) / 2;
      for (let i = 0; i < span; i += 1) {
        const normalized =
          range > 0 ? ((contribution[i]! - min) / range) * targetRange + targetMin : fallbackCenter;
        signal[patchStart + i] = (preValues[i] ?? 0) + normalized;
      }
    }
  }
}
