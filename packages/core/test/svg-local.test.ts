import { describe, expect, it } from "vitest";
import { parseSvgIr } from "@wittgenstein/codec-svg";
import { buildSvgLocalGeneration } from "../src/runtime/svg-local.js";

describe("svg-local", () => {
  it("emits parseable SVG JSON with no text elements and a black background", () => {
    const gen = buildSvgLocalGeneration({
      modality: "svg",
      prompt: "test-prompt-α",
      source: "local",
    });
    const parsed = parseSvgIr(gen.text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const svg = parsed.value.svg.toLowerCase();
    expect(svg).toContain("<svg");
    expect(svg).toContain('fill="#000000"');
    expect(svg).not.toMatch(/<text[\s>]/);
    expect(svg).not.toMatch(/<tspan[\s>]/);
    expect(svg).not.toMatch(/font-family/);
  });

  it("reports null costUsd with no-llm-call reason — pure-local renderer (Issue #363)", () => {
    const gen = buildSvgLocalGeneration({
      modality: "svg",
      prompt: "honesty-check",
      source: "local",
    });
    expect(gen.costUsd).toBeNull();
    expect(gen.costUsdReason).toBe("no-llm-call");
    expect(gen.tokens).toEqual({ input: 0, output: 0 });
  });
});
