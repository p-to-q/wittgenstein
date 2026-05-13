import type { LlmGenerationResult } from "../llm/adapter.js";
import type { WittgensteinRequest } from "@wittgenstein/schemas";

export function buildVideoCompositionFromInlineSvgs(
  request: Extract<WittgensteinRequest, { modality: "video" }>,
): LlmGenerationResult {
  const inlineSvgs = request.inlineSvgs;
  if (!inlineSvgs?.length) {
    throw new Error("buildVideoCompositionFromInlineSvgs requires non-empty inlineSvgs.");
  }

  const n = inlineSvgs.length;
  const totalSec =
    request.durationSec && request.durationSec > 0 ? request.durationSec : Math.max(n * 3, 0.25);
  const each = Math.max(0.25, totalSec / n);

  const scenes = inlineSvgs.map((_, i) => ({
    name: `slide-${i + 1}`,
    description: "",
    durationSec: each,
  }));

  const composition = {
    durationSec: each * n,
    fps: 24,
    scenes,
    inlineSvgs,
  };

  return {
    text: JSON.stringify(composition),
    tokens: { input: 0, output: 0 },
    costUsd: null,
    costUsdReason: "no-llm-call",
    raw: { videoInlineSvgs: true as const },
  };
}
