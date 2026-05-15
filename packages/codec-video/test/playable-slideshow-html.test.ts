import { describe, expect, it } from "vitest";
import { buildPlayableSlideshowHtml } from "../src/playable-slideshow-html.js";

describe("playable-slideshow-html", () => {
  it("emits looping CSS animation by default", () => {
    const html = buildPlayableSlideshowHtml({
      svgs: [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>',
      ],
      durationsSec: [2, 2],
      title: "Test",
    });
    expect(html).toContain("linear infinite both");
    expect(html).toContain('fill="red"');
    expect(html).toContain('fill="blue"');
  });

  it("can play once", () => {
    const html = buildPlayableSlideshowHtml({
      svgs: ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2"/></svg>'],
      durationsSec: [1],
      loop: false,
    });
    expect(html).toContain("linear 1 both");
    expect(html).not.toContain("linear infinite both");
  });

  it("refuses an empty slide list", () => {
    expect(() => buildPlayableSlideshowHtml({ svgs: [] })).toThrow(
      "buildPlayableSlideshowHtml requires at least one SVG.",
    );
  });

  it("refuses mismatched slide duration lists", () => {
    expect(() =>
      buildPlayableSlideshowHtml({
        svgs: [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><rect width="2" height="2"/></svg>',
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>',
        ],
        durationsSec: [1],
      }),
    ).toThrow("buildPlayableSlideshowHtml: durationsSec length must match svgs length.");
  });
});
