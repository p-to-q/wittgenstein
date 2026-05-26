// HyperFrames-shaped wrapper — orchestrator for the video codec's MP4 / HTML
// output. Builds the composition HTML (delegating to the per-composition
// modules under `./compositions/`) and, when
// `WITTGENSTEIN_HYPERFRAMES_RENDER=1`, invokes the repo-owned MP4 renderer.
//
// Per-composition HTML builders live in `./compositions/{svg-slide,scene-card}.ts`
// (extracted per #327 / #288). The subprocess plumbing lives in
// `@wittgenstein/process-runner` (lifted from this package per #356 so future
// codec subprocess work — audio's Kokoro path — can reuse it without coupling
// codecs back to the core package). This file owns dispatch + MP4 wiring only.

import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./compositions/shared.js";
import type { VideoComposition } from "./schema.js";
import { buildSvgSlideHtml } from "./compositions/svg-slide.js";
import { buildSceneCardHtml } from "./compositions/scene-card.js";
import { renderHtmlToMp4 } from "./mp4-renderer.js";
import { renderHtmlToMp4WithHyperframesCli } from "./hyperframes-cli-renderer.js";

export async function renderWithHyperFrames(
  composition: VideoComposition,
  ctx: RenderCtx,
): Promise<RenderResult> {
  const startedAt = Date.now();
  const compositionHtml = buildHyperFramesHtml(composition, ctx);
  const html = compositionHtml.html;
  const wantsMp4 = extname(ctx.outPath).toLowerCase() === ".mp4";
  const encodeMp4 = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER === "1";
  const fps = snapHyperframesFps(composition.fps);
  const quality = readHyperframesQuality();
  const backend = readHyperframesBackend();

  if (wantsMp4 && encodeMp4) {
    const indexPath = join(ctx.runDir, "index.html");
    await mkdir(ctx.runDir, { recursive: true });
    await mkdir(dirname(ctx.outPath), { recursive: true });
    await writeFile(indexPath, html, "utf8");

    ctx.logger.info("hyperframes: running local MP4 encode", {
      cwd: ctx.runDir,
      output: ctx.outPath,
      backend,
    });

    const params = {
      htmlPath: indexPath,
      runDir: ctx.runDir,
      outputMp4: ctx.outPath,
      durationSec: compositionHtml.totalDurationSec,
      fps,
      quality,
      timeoutMs: renderTimeoutMs(),
    };
    const render =
      backend === "npx-cli"
        ? await renderHtmlToMp4WithHyperframesCli(params)
        : await renderHtmlToMp4(params);

    return {
      artifactPath: ctx.outPath,
      mimeType: "video/mp4",
      bytes: render.bytes,
      metadata: {
        codec: "video",
        route: "hyperframes-mp4",
        llmTokens: { input: 0, output: 0 },
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        seed: ctx.seed,
        renderPath: "hyperframes-mp4",
        videoRender: render.receipt,
      },
    };
  }

  const artifactPath = resolveHyperFramesArtifactPath(ctx.outPath);

  await mkdir(dirname(artifactPath), { recursive: true });
  await writeFile(artifactPath, html, "utf8");

  const bytes = (await stat(artifactPath)).size;

  return {
    artifactPath,
    mimeType: "text/html; charset=utf-8",
    bytes,
    metadata: {
      codec: "video",
      route: "hyperframes-html",
      llmTokens: { input: 0, output: 0 },
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      seed: ctx.seed,
      renderPath: "hyperframes-html",
      videoRender: {
        renderPath: "hyperframes-html",
        backend: "distilled-internal",
        backendVersion: "internal",
        determinismClass: "byte-parity-on-platform",
        fps,
        quality,
        frameCount: 0,
        width: STAGE_WIDTH,
        height: STAGE_HEIGHT,
        durationSec: compositionHtml.totalDurationSec,
        outputKind: "html",
      },
    },
  };
}

function snapHyperframesFps(fps: number): 24 | 30 | 60 {
  if (!Number.isFinite(fps) || fps <= 0) {
    return 30;
  }
  if (fps <= 27) {
    return 24;
  }
  if (fps <= 45) {
    return 30;
  }
  return 60;
}

function renderTimeoutMs(): number {
  const fallback = 600_000;
  const raw = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS;
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function readHyperframesQuality(): "draft" | "standard" | "high" {
  const value = process.env.WITTGENSTEIN_HYPERFRAMES_QUALITY?.trim();
  if (value === "draft" || value === "standard" || value === "high") {
    return value;
  }
  return "standard";
}

function readHyperframesBackend(): "distilled-internal" | "npx-cli" {
  const value = process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND?.trim();
  if (value === "npx-cli") {
    return "npx-cli";
  }
  return "distilled-internal";
}

function resolveHyperFramesArtifactPath(outPath: string): string {
  const ext = extname(outPath);
  if (ext.toLowerCase() === ".html" || ext.toLowerCase() === ".htm") {
    return outPath;
  }

  // The harness default for video is still `output.mp4`, but this codec stage emits a
  // HyperFrames-style HTML composition (render-to-mp4 happens via HyperFrames CLI).
  if (ext.toLowerCase() === ".mp4") {
    return `${outPath.slice(0, -".mp4".length)}.hyperframes.html`;
  }

  return `${outPath}.hyperframes.html`;
}

function buildHyperFramesHtml(
  composition: VideoComposition,
  ctx: RenderCtx,
): { html: string; totalDurationSec: number } {
  const inlineSvgs =
    composition.inlineSvgs && composition.inlineSvgs.length > 0 ? composition.inlineSvgs : null;

  if (inlineSvgs) {
    return buildSvgSlideHtml(composition, ctx, inlineSvgs);
  }
  return buildSceneCardHtml(composition, ctx);
}
