import { describe, expect, it } from "vitest";
import { buildVideoCompositionFromInlineSvgs } from "../src/runtime/video-inline-svgs.js";

describe("video-inline-svgs", () => {
  it("builds JSON composition with inlineSvgs and matching scene timing", () => {
    const gen = buildVideoCompositionFromInlineSvgs({
      modality: "video",
      prompt: "slideshow",
      durationSec: 6,
      inlineSvgs: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>',
      ],
    });
    const parsed = JSON.parse(gen.text) as {
      inlineSvgs: string[];
      scenes: Array<{ durationSec: number }>;
      durationSec: number;
    };
    expect(parsed.inlineSvgs).toHaveLength(2);
    expect(parsed.scenes).toHaveLength(2);
    expect(parsed.scenes[0].durationSec).toBe(3);
    expect(parsed.scenes[1].durationSec).toBe(3);
    expect(parsed.durationSec).toBe(6);
  });

  it("reports null costUsd with no-llm-call reason — inline-svgs is a pure-local composition (Issue #363)", () => {
    const gen = buildVideoCompositionFromInlineSvgs({
      modality: "video",
      prompt: "honesty-check",
      durationSec: 2,
      inlineSvgs: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
      ],
    });
    expect(gen.costUsd).toBeNull();
    expect(gen.costUsdReason).toBe("no-llm-call");
    expect(gen.tokens).toEqual({ input: 0, output: 0 });
  });
});
