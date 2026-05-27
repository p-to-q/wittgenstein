import { statSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { firstOutputLine, runProcess } from "@wittgenstein/process-runner";
import type { VideoRenderManifest } from "@wittgenstein/schemas";
import { STAGE_HEIGHT, STAGE_WIDTH } from "./compositions/shared.js";
import { ensurePuppeteerCore } from "./mp4-renderer-runtime.js";

export interface InternalMp4RenderParams {
  htmlPath: string;
  outputMp4: string;
  runDir: string;
  durationSec: number;
  fps: 24 | 30 | 60;
  quality: "draft" | "standard" | "high";
  timeoutMs: number;
}

export interface InternalMp4RenderResult {
  bytes: number;
  receipt: VideoRenderManifest;
}

export class VideoMp4RendererError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "VideoMp4RendererError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export async function renderHtmlToMp4(
  params: InternalMp4RenderParams,
): Promise<InternalMp4RenderResult> {
  const frameDir = join(params.runDir, "video-frames");
  await mkdir(frameDir, { recursive: true });

  const frameCount = Math.max(1, Math.ceil(params.durationSec * params.fps));
  const chromeVersion = await captureFrames({
    ...params,
    frameDir,
    frameCount,
  });
  const ffmpegVersion = await encodeFrames({
    ...params,
    frameDir,
    frameCount,
  });
  const bytes = (await stat(params.outputMp4)).size;

  return {
    bytes,
    receipt: {
      renderPath: "hyperframes-mp4",
      backend: "distilled-internal",
      backendVersion: "internal",
      determinismClass: "structural-parity-cross-platform",
      fps: params.fps,
      quality: params.quality,
      frameCount,
      width: STAGE_WIDTH,
      height: STAGE_HEIGHT,
      durationSec: params.durationSec,
      outputKind: "mp4",
      ffmpegVersion,
      chromeVersion,
    },
  };
}

async function captureFrames(params: InternalMp4RenderParams & {
  frameDir: string;
  frameCount: number;
}): Promise<string> {
  const puppeteer = await ensurePuppeteerCore();
  const executablePath = resolveChromeExecutable();
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: STAGE_WIDTH, height: STAGE_HEIGHT, deviceScaleFactor: 1 });
    for (let index = 0; index < params.frameCount; index += 1) {
      const time = Math.min(params.durationSec, index / params.fps);
      const url = `${pathToFileURL(resolve(params.htmlPath)).href}?wittgensteinFrameTime=${time.toFixed(6)}`;
      await page.goto(url, { waitUntil: "networkidle0" });
      const stage = await page.$("#stage");
      if (!stage) {
        throw new VideoMp4RendererError(
          "MP4_RENDERER_MISSING_STAGE",
          "Video MP4 renderer could not find #stage in composition HTML.",
          { htmlPath: params.htmlPath, frameIndex: index, frameTimeSec: time },
        );
      }
      await stage.screenshot({
        path: join(params.frameDir, `${String(index).padStart(6, "0")}.png`),
        omitBackground: false,
      });
    }
    return await browser.version();
  } finally {
    await browser.close();
  }
}

async function encodeFrames(params: InternalMp4RenderParams & {
  frameDir: string;
  frameCount: number;
}): Promise<string> {
  await mkdir(dirname(params.outputMp4), { recursive: true });
  const version = await readFfmpegVersion(params.runDir, params.timeoutMs);
  const args = [
    "-y",
    "-framerate",
    String(params.fps),
    "-i",
    join(params.frameDir, "%06d.png"),
    "-frames:v",
    String(params.frameCount),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-preset",
    ffmpegPreset(params.quality),
    "-crf",
    ffmpegCrf(params.quality),
    params.outputMp4,
  ];

  await runProcess(
    "ffmpeg",
    args,
    {
      cwd: params.runDir,
      env: process.env,
      timeoutHint: "(set WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS).",
    },
    params.timeoutMs,
    "wittgenstein video ffmpeg encode",
  );

  const generatedFrames = await readdir(params.frameDir);
  if (generatedFrames.length < params.frameCount) {
    throw new VideoMp4RendererError(
      "MP4_RENDERER_FRAME_COUNT_MISMATCH",
      `Video MP4 renderer expected ${params.frameCount} PNG frames, found ${generatedFrames.length}.`,
      {
        frameDir: params.frameDir,
        expectedFrameCount: params.frameCount,
        actualFrameCount: generatedFrames.length,
      },
    );
  }
  return version;
}

async function readFfmpegVersion(cwd: string, timeoutMs: number): Promise<string> {
  try {
    const { spawnSync } = await import("node:child_process");
    const result = spawnSync("ffmpeg", ["-version"], {
      cwd,
      env: process.env,
      encoding: "utf8",
      timeout: timeoutMs,
    });
    if (result.status === 0) {
      return firstOutputLine(result.stdout, result.stderr) || "ffmpeg";
    }
  } catch {
    // The encode step below will raise the structured process error.
  }
  return "ffmpeg";
}

function resolveChromeExecutable(): string {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && explicit.trim().length > 0) {
    return explicit;
  }
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];
  for (const candidate of candidates) {
    try {
      statSync(candidate);
      return candidate;
    } catch {
      // Try the next platform-specific path.
    }
  }
  throw new VideoMp4RendererError(
    "MP4_RENDERER_CHROME_NOT_FOUND",
    "Video MP4 renderer requires Chrome/Chromium. Install Chrome or set PUPPETEER_EXECUTABLE_PATH.",
    { checkedCandidates: candidates },
  );
}

function ffmpegPreset(quality: InternalMp4RenderParams["quality"]): string {
  if (quality === "draft") {
    return "veryfast";
  }
  if (quality === "high") {
    return "slow";
  }
  return "medium";
}

function ffmpegCrf(quality: InternalMp4RenderParams["quality"]): string {
  if (quality === "draft") {
    return "28";
  }
  if (quality === "high") {
    return "18";
  }
  return "23";
}
