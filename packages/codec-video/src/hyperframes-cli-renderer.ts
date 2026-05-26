import { spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import { runProcess } from "@wittgenstein/process-runner";
import type { VideoRenderManifest } from "@wittgenstein/schemas";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./compositions/shared.js";
import type { InternalMp4RenderParams, InternalMp4RenderResult } from "./mp4-renderer.js";

export async function renderHtmlToMp4WithHyperframesCli(
  params: InternalMp4RenderParams,
): Promise<InternalMp4RenderResult> {
  const args = buildHyperframesCliRenderArgs({
    outputMp4: params.outputMp4,
    fps: params.fps,
    quality: params.quality,
  });

  await runProcess(
    "npx",
    args,
    {
      cwd: params.runDir,
      env: {
        ...process.env,
        HYPERFRAMES_NO_TELEMETRY: process.env.HYPERFRAMES_NO_TELEMETRY ?? "1",
        HYPERFRAMES_NO_UPDATE_CHECK: process.env.HYPERFRAMES_NO_UPDATE_CHECK ?? "1",
      },
      timeoutHint: "(set WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS).",
    },
    params.timeoutMs,
    "hyperframes cli render",
  );

  const bytes = (await stat(params.outputMp4)).size;
  return {
    bytes,
    receipt: buildHyperframesCliReceipt(params),
  };
}

export function buildHyperframesCliRenderArgs(params: {
  outputMp4: string;
  fps: 24 | 30 | 60;
  quality: "draft" | "standard" | "high";
}): string[] {
  return [
    "--no-install",
    "hyperframes",
    "render",
    ".",
    "--composition",
    "index.html",
    "-o",
    params.outputMp4,
    "--fps",
    String(params.fps),
    "--quality",
    params.quality,
    "--quiet",
  ];
}

export function readHyperframesCliVersion(): string {
  const result = spawnSync("npx", ["--no-install", "hyperframes", "--version"], {
    encoding: "utf8",
    timeout: 10_000,
    env: {
      ...process.env,
      HYPERFRAMES_NO_TELEMETRY: process.env.HYPERFRAMES_NO_TELEMETRY ?? "1",
      HYPERFRAMES_NO_UPDATE_CHECK: process.env.HYPERFRAMES_NO_UPDATE_CHECK ?? "1",
    },
  });
  if (result.status === 0) {
    return firstOutputLine(result.stdout, result.stderr) || "hyperframes";
  }
  return "hyperframes";
}

function buildHyperframesCliReceipt(params: InternalMp4RenderParams): VideoRenderManifest {
  return {
    renderPath: "hyperframes-mp4",
    backend: "npx-hyperframes-cli",
    backendVersion: readHyperframesCliVersion(),
    determinismClass: "structural-parity-cross-platform",
    fps: params.fps,
    quality: params.quality,
    frameCount: Math.max(1, Math.ceil(params.durationSec * params.fps)),
    width: STAGE_WIDTH,
    height: STAGE_HEIGHT,
    durationSec: params.durationSec,
    outputKind: "mp4",
  };
}

function firstOutputLine(stdout: string, stderr: string): string {
  return (stdout || stderr).split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
}
