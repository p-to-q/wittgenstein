import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { videoCodec } from "../src/index.js";
import { buildHyperframesCliRenderArgs } from "../src/hyperframes-cli-renderer.js";

describe("@wittgenstein/codec-video", () => {
  let prevHyperframesRender: string | undefined;
  let prevHyperframesBackend: string | undefined;

  beforeEach(() => {
    prevHyperframesRender = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER;
    prevHyperframesBackend = process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND;
    process.env.WITTGENSTEIN_HYPERFRAMES_RENDER = "0";
    delete process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND;
  });

  afterEach(() => {
    if (prevHyperframesRender === undefined) {
      delete process.env.WITTGENSTEIN_HYPERFRAMES_RENDER;
    } else {
      process.env.WITTGENSTEIN_HYPERFRAMES_RENDER = prevHyperframesRender;
    }
    if (prevHyperframesBackend === undefined) {
      delete process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND;
    } else {
      process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND = prevHyperframesBackend;
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
      expect(result.metadata.renderPath).toBe("hyperframes-html");
      expect(result.metadata.videoRender).toMatchObject({
        renderPath: "hyperframes-html",
        backend: "distilled-internal",
        determinismClass: "byte-parity-on-platform",
        outputKind: "html",
        fps: 24,
      });

      const html = await readFile(result.artifactPath, "utf8");
      expect(html).toContain('data-composition-id="wittgenstein-test-run"');
      expect(html).toContain('data-duration="2"');
      expect(html).toContain("wittgensteinFrameTime");
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
      expect(result.metadata.videoRender?.durationSec).toBe(4);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("keeps HTML output on the distilled backend by default", async () => {
    const parsed = videoCodec.parse(JSON.stringify({ durationSec: 1, fps: 60 }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const dir = await mkdtemp(join(tmpdir(), "wittgenstein-video-backend-"));
    try {
      const result = await videoCodec.render(parsed.value, {
        runId: "backend-default",
        runDir: dir,
        seed: 4,
        outPath: join(dir, "out.html"),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
      });
      expect(result.metadata.videoRender?.backend).toBe("distilled-internal");
      expect(result.metadata.videoRender?.fps).toBe(60);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("builds the documented HyperFrames CLI render command shape", () => {
    expect(
      buildHyperframesCliRenderArgs({
        outputMp4: "/tmp/out.mp4",
        fps: 24,
        quality: "standard",
      }),
    ).toEqual([
      "--no-install",
      "hyperframes",
      "render",
      ".",
      "--composition",
      "index.html",
      "-o",
      "/tmp/out.mp4",
      "--fps",
      "24",
      "--quality",
      "standard",
      "--quiet",
    ]);
  });
});
