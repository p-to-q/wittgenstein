// HyperFrames wrapper — orchestrator for the video codec's MP4 / HTML output.
// Builds the composition HTML (delegating to the per-composition modules
// under `./compositions/`) and, when `WITTGENSTEIN_HYPERFRAMES_RENDER=1`,
// invokes `npx hyperframes render` to encode the MP4.
//
// Per-composition HTML builders live in `./compositions/{svg-slide,scene-card}.ts`
// (extracted per #327 / #288). The subprocess plumbing lives in
// `@wittgenstein/process-runner` (lifted from this package per #356 so future
// codec subprocess work — audio's Kokoro path — can reuse it without coupling
// codecs back to the core package). This file owns dispatch + MP4 wiring only.

import { mkdir, writeFile, stat } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import { runProcess } from "@wittgenstein/process-runner";
import type { VideoComposition } from "./schema.js";
import { buildSvgSlideHtml } from "./compositions/svg-slide.js";
import { buildSceneCardHtml } from "./compositions/scene-card.js";

export async function renderWithHyperFrames(
  composition: VideoComposition,
  ctx: RenderCtx,
): Promise<RenderResult> {
  const startedAt = Date.now();
  const html = buildHyperFramesHtml(composition, ctx);
  const wantsMp4 = extname(ctx.outPath).toLowerCase() === ".mp4";
  const encodeMp4 = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER === "1";

  if (wantsMp4 && encodeMp4) {
    const indexPath = join(ctx.runDir, "index.html");
    await mkdir(ctx.runDir, { recursive: true });
    await mkdir(dirname(ctx.outPath), { recursive: true });
    await writeFile(indexPath, html, "utf8");

    ctx.logger.info("hyperframes: running local MP4 encode (npx hyperframes render)", {
      cwd: ctx.runDir,
      output: ctx.outPath,
    });

    await runHyperframesRenderToMp4({
      cwd: ctx.runDir,
      outputMp4: ctx.outPath,
      fps: composition.fps,
    });

    const bytes = (await stat(ctx.outPath)).size;

    return {
      artifactPath: ctx.outPath,
      mimeType: "video/mp4",
      bytes,
      metadata: {
        codec: "video",
        route: "hyperframes-mp4",
        llmTokens: { input: 0, output: 0 },
        costUsd: 0,
        durationMs: Date.now() - startedAt,
        seed: ctx.seed,
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
    },
  };
}

async function runHyperframesRenderToMp4(params: {
  cwd: string;
  outputMp4: string;
  fps: number;
}): Promise<void> {
  const fps = snapHyperframesFps(params.fps);
  const timeoutMs = Number.parseInt(
    process.env.WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS ?? "600000",
    10,
  );
  const args = [
    "-y",
    "hyperframes",
    "render",
    "--output",
    params.outputMp4,
    "--fps",
    String(fps),
    "--quality",
    process.env.WITTGENSTEIN_HYPERFRAMES_QUALITY?.trim() || "standard",
    "--quiet",
  ];

  await runProcess(
    "npx",
    args,
    {
      cwd: params.cwd,
      env: {
        ...process.env,
        HYPERFRAMES_NO_TELEMETRY: process.env.HYPERFRAMES_NO_TELEMETRY ?? "1",
        HYPERFRAMES_NO_UPDATE_CHECK: process.env.HYPERFRAMES_NO_UPDATE_CHECK ?? "1",
      },
      timeoutHint: "(set WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS).",
    },
    timeoutMs,
    "hyperframes render",
  );

  try {
    await stat(params.outputMp4);
  } catch {
    throw new Error(
      "hyperframes render exited but output MP4 was not found. Install HyperFrames + FFmpeg + Chrome, run `npx hyperframes doctor`, or unset WITTGENSTEIN_HYPERFRAMES_RENDER to emit HTML only.",
    );
  }
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

function buildHyperFramesHtml(composition: VideoComposition, ctx: RenderCtx): string {
  const inlineSvgs =
    composition.inlineSvgs && composition.inlineSvgs.length > 0 ? composition.inlineSvgs : null;

  if (inlineSvgs) {
    return buildSvgSlideHtml(composition, ctx, inlineSvgs).html;
  }
  return buildSceneCardHtml(composition, ctx).html;
}
