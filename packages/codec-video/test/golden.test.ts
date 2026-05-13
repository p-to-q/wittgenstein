/**
 * Byte-stable golden coverage for codec-video (Issue #347).
 *
 * Locks the deterministic slideshow HTML output against a SHA-256 digest.
 * `buildPlayableSlideshowHtml` is a pure function — given identical SVG
 * inputs and durations, it must emit identical HTML bytes. Any drift in
 * template assembly, attribute ordering, or CSS animation strings will
 * trip the assertion.
 *
 * To regenerate after an intentional template change: replace the expected
 * digest with the value the test prints when it fails.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPlayableSlideshowHtml } from "../src/playable-slideshow-html.js";

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

describe("codec-video golden parity (Issue #347)", () => {
  it("buildPlayableSlideshowHtml is byte-stable for canonical input (looping)", () => {
    const html = buildPlayableSlideshowHtml({
      svgs: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>',
      ],
      durationsSec: [2, 2],
      title: "Golden",
    });
    expect(sha256(html)).toBe(
      "2bf1979576b1143bec0606deb8bfbfbe034dfbcd04a9aa3dae1a23355ea975e1",
    );
  });

  it("buildPlayableSlideshowHtml is byte-stable for canonical input (play-once)", () => {
    const html = buildPlayableSlideshowHtml({
      svgs: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2"/></svg>',
      ],
      durationsSec: [1],
      loop: false,
    });
    expect(sha256(html)).toBe(
      "a2f9571f9c8c3b87d7b61fdb5fb52959abf297e460e8708f755c045c38ca3e88",
    );
  });
});
