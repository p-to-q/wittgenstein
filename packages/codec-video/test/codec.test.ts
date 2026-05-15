import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { videoCodec } from "../src/index.js";

describe("@wittgenstein/codec-video", () => {
  let prevHyperframesRender: string | undefined;

  beforeEach(() => {
    prevHyperframesRender = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER;
    process.env.WITTGENSTEIN_HYPERFRAMES_RENDER = "0";
  });

  afterEach(() => {
    if (prevHyperframesRender === undefined) {
      delete process.env.WITTGENSTEIN_HYPERFRAMES_RENDER;
    } else {
      process.env.WITTGENSTEIN_HYPERFRAMES_RENDER = prevHyperframesRender;
    }
  });

  it("exposes the video codec contract", () => {
    expect(videoCodec.name).toBe("video");
    expect(videoCodec.parse("{}").ok).toBe(true);
  });

  it("returns a structured parse error for non-JSON output", () => {
    const parsed = videoCodec.parse("not json");
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }
    expect(parsed.error.code).toBe("VIDEO_SCHEMA_PARSE_FAILED");
    expect(parsed.error.message).toBe("Video composition was not valid JSON.");
  });

  it("returns a structured validation error for invalid timing", () => {
    const parsed = videoCodec.parse(JSON.stringify({ durationSec: 0, fps: -1 }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }
    expect(parsed.error.code).toBe("VIDEO_SCHEMA_INVALID");
    expect(parsed.error.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["durationSec"] }),
        expect.objectContaining({ path: ["fps"] }),
      ]),
    );
  });

  it("rejects malformed inline SVG slides at parse time", () => {
    const parsed = videoCodec.parse(
      JSON.stringify({
        inlineSvgs: ["<svg><rect /></svg>", "<div>not svg</div>"],
      }),
    );
    expect(parsed.ok).toBe(false);
    if (parsed.ok) {
      return;
    }
    expect(parsed.error.code).toBe("VIDEO_SCHEMA_INVALID");
    expect(parsed.error.details?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "inlineSvgs[1] must be a full SVG document (<svg …>…</svg>).",
          path: ["inlineSvgs", 1],
        }),
      ]),
    );
  });

  it("renders a HyperFrames-shaped HTML composition", async () => {
    const parsed = videoCodec.parse(
      JSON.stringify({
        durationSec: 2,
        fps: 24,
        scenes: [{ name: "intro", description: "Hello", durationSec: 2 }],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), "wittgenstein-video-"));
    try {
      const outMp4 = join(dir, "output.mp4");
      const result = await videoCodec.render(parsed.value, {
        runId: "test-run",
        runDir: dir,
        seed: 1,
        outPath: outMp4,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      });

      expect(result.mimeType).toContain("text/html");
      expect(result.artifactPath.endsWith(".hyperframes.html")).toBe(true);

      const html = await readFile(result.artifactPath, "utf8");
      expect(html).toContain('data-composition-id="wittgenstein-test-run"');
      expect(html).toContain('data-duration="2"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("embeds multiple inline SVG slides in HyperFrames HTML", async () => {
    const parsed = videoCodec.parse(
      JSON.stringify({
        durationSec: 4,
        fps: 24,
        scenes: [
          { name: "a", description: "", durationSec: 2 },
          { name: "b", description: "", durationSec: 2 },
        ],
        inlineSvgs: [
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>',
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>',
        ],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), "wittgenstein-video-svg-"));
    try {
      const outMp4 = join(dir, "out.mp4");
      const result = await videoCodec.render(parsed.value, {
        runId: "svg-slides",
        runDir: dir,
        seed: null,
        outPath: outMp4,
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      });

      const html = await readFile(result.artifactPath, "utf8");
      expect(html).toContain("hf-svg-slide");
      expect(html).toContain('fill="red"');
      expect(html).toContain('fill="blue"');
      expect(html).toContain('data-duration="4"');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
