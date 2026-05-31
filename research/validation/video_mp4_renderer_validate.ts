import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { mkdtemp } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { videoCodec } from "../../packages/codec-video/src/index.js";
import type { VideoComposition } from "../../packages/codec-video/src/schema.js";

const composition = {
  durationSec: 3,
  fps: 24,
  scenes: [
    { name: "red", description: "red slide", durationSec: 1 },
    { name: "green", description: "green slide", durationSec: 1 },
    { name: "blue", description: "blue slide", durationSec: 1 },
  ],
  inlineSvgs: [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#d72638"/><text x="960" y="560" text-anchor="middle" font-size="120" fill="white">red</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#1b998b"/><text x="960" y="560" text-anchor="middle" font-size="120" fill="white">green</text></svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080"><rect width="1920" height="1080" fill="#2e294e"/><text x="960" y="560" text-anchor="middle" font-size="120" fill="white">blue</text></svg>',
  ],
};

const logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function main(): Promise<void> {
  const parsed = videoCodec.parse(JSON.stringify(composition));
  if (!parsed.ok) {
    throw new Error(`Fixture failed to parse: ${parsed.error.message}`);
  }

  const dir = await createValidationDir();
  const previousRender = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER;
  const previousBackend = process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND;
  try {
    process.env.WITTGENSTEIN_HYPERFRAMES_RENDER = "0";
    const html = await videoCodec.render(parsed.value, {
      runId: "validation-html",
      runDir: join(dir, "html"),
      seed: 11,
      outPath: join(dir, "html", "out.mp4"),
      logger,
    });
    const htmlText = await readFile(html.artifactPath, "utf8");
    const htmlReceipt = {
      artifactPath: html.artifactPath,
      sha256: sha256(Buffer.from(htmlText)),
      bytes: html.bytes,
      videoRender: html.metadata.videoRender,
      hasFrameTimeHook: htmlText.includes("wittgensteinFrameTime"),
    };

    if (process.env.WITTGENSTEIN_VALIDATE_VIDEO_MP4 !== "1") {
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: "html-only",
            environment: environmentReceipt(),
            skippedMp4:
              "Set WITTGENSTEIN_VALIDATE_VIDEO_MP4=1 and WITTGENSTEIN_HYPERFRAMES_RENDER=1 with Chrome + FFmpeg installed to run MP4 validation.",
            html: htmlReceipt,
          },
          null,
          2,
        ),
      );
      return;
    }

    process.env.WITTGENSTEIN_HYPERFRAMES_RENDER = "1";
    const backends = (process.env.WITTGENSTEIN_VALIDATE_VIDEO_BACKENDS ?? "distilled-internal")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value === "distilled-internal" || value === "npx-cli");
    if (backends.length === 0) {
      throw new Error("No valid MP4 backends selected. Use distilled-internal and/or npx-cli.");
    }
    const mp4 = [];
    for (const backend of backends) {
      process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND = backend;
      const first = await renderMp4(parsed.value, dir, `${backend}-first`);
      const second = await renderMp4(parsed.value, dir, `${backend}-second`);
      const verdict = validateMp4Pair(first, second);
      mp4.push({
        backend,
        first,
        second,
        verdict,
      });
    }
    const failed = mp4.filter((result) => result.verdict !== "byte-parity-on-platform");
    const ok = failed.length === 0 && mp4.length > 0;
    console.log(
      JSON.stringify(
        {
          ok,
          mode: "mp4-double-render",
          environment: environmentReceipt(),
          validatedBackends: mp4.length,
          html: htmlReceipt,
          mp4,
          portability: {
            policy:
              "same-platform byte parity is required per backend; cross-platform MP4 bytes are informational; cross-platform structural parity is the portability floor.",
            backends: mp4.map((result) => portabilitySummary(result)),
          },
        },
        null,
        2,
      ),
    );
    if (!ok) {
      process.exitCode = 1;
    }
  } finally {
    restoreEnv("WITTGENSTEIN_HYPERFRAMES_RENDER", previousRender);
    restoreEnv("WITTGENSTEIN_HYPERFRAMES_BACKEND", previousBackend);
    if (process.env.WITTGENSTEIN_KEEP_VIDEO_VALIDATION_ARTIFACTS !== "1") {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function environmentReceipt() {
  return {
    os: {
      platform: platform(),
      release: release(),
      arch: arch(),
    },
    nodeVersion: process.version,
    ffmpegVersion: toolVersion("ffmpeg"),
    ffprobeVersion: toolVersion("ffprobe"),
    ci: process.env.CI === "1" || process.env.CI === "true",
    environmentId: process.env.WITTGENSTEIN_VALIDATION_ENVIRONMENT_ID,
  };
}

async function renderMp4(value: VideoComposition, dir: string, label: string) {
  const outPath = join(dir, label, "out.mp4");
  const result = await videoCodec.render(value, {
    runId: `validation-${label}`,
    runDir: join(dir, label),
    seed: 11,
    outPath,
    logger,
  });
  const data = await readFile(result.artifactPath);
  const file = await stat(result.artifactPath);
  return {
    artifactPath: result.artifactPath,
    sha256: sha256(data),
    bytes: file.size,
    structure: probeVideo(result.artifactPath),
    videoRender: result.metadata.videoRender,
  };
}

function portabilitySummary(result: {
  backend: string;
  first: Awaited<ReturnType<typeof renderMp4>>;
  second: Awaited<ReturnType<typeof renderMp4>>;
  verdict: "byte-parity-on-platform" | "failed";
}) {
  const firstStructure = videoStructureSignature(result.first.structure);
  const secondStructure = videoStructureSignature(result.second.structure);
  const firstReceipt = videoReceiptSignature(result.first.videoRender);
  const secondReceipt = videoReceiptSignature(result.second.videoRender);
  return {
    backend: result.backend,
    samePlatformByteParity: result.verdict === "byte-parity-on-platform",
    samePlatformStructuralParity: sameJson(firstStructure, secondStructure),
    samePlatformPortableReceiptParity: sameJson(firstReceipt, secondReceipt),
    firstStructure,
    secondStructure,
    firstReceipt,
    secondReceipt,
  };
}

function validateMp4Pair(
  first: Awaited<ReturnType<typeof renderMp4>>,
  second: Awaited<ReturnType<typeof renderMp4>>,
): "byte-parity-on-platform" | "failed" {
  if (first.sha256 !== second.sha256) {
    return "failed";
  }
  if (!validVideoStructure(first.structure) || !validVideoStructure(second.structure)) {
    return "failed";
  }
  return "byte-parity-on-platform";
}

function validVideoStructure(structure: ReturnType<typeof probeVideo>): boolean {
  if (!structure.ok) {
    return false;
  }
  const stream = structure.value.streams?.[0];
  return (
    stream?.codec_name === "h264" &&
    stream.width === 1920 &&
    stream.height === 1080 &&
    stream.r_frame_rate === "24/1" &&
    stream.duration === "3.000000" &&
    stream.nb_frames === "72"
  );
}

function videoStructureSignature(structure: ReturnType<typeof probeVideo>) {
  if (!structure.ok) {
    return {
      ok: false,
      message: structure.message,
    };
  }
  const stream = structure.value.streams?.[0];
  return {
    ok: true,
    codec: stream?.codec_name ?? null,
    width: stream?.width ?? null,
    height: stream?.height ?? null,
    fps: stream?.r_frame_rate ?? null,
    duration: stream?.duration ?? null,
    frameCount: stream?.nb_frames ?? null,
  };
}

function videoReceiptSignature(receipt: Awaited<ReturnType<typeof renderMp4>>["videoRender"]) {
  return {
    renderPath: receipt?.renderPath ?? null,
    backend: receipt?.backend ?? null,
    backendVersion: receipt?.backendVersion ?? null,
    determinismClass: receipt?.determinismClass ?? null,
    fps: receipt?.fps ?? null,
    quality: receipt?.quality ?? null,
    frameCount: receipt?.frameCount ?? null,
    width: receipt?.width ?? null,
    height: receipt?.height ?? null,
    durationSec: receipt?.durationSec ?? null,
    outputKind: receipt?.outputKind ?? null,
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function toolVersion(command: "ffmpeg" | "ffprobe"): string {
  const result = spawnSync(command, ["-version"], { encoding: "utf8", timeout: 5_000 });
  if (result.status !== 0) {
    return result.stderr.trim() || `${command} unavailable`;
  }
  return firstLine(result.stdout, result.stderr) || command;
}

function firstLine(...values: string[]): string {
  for (const value of values) {
    const line = value
      .split(/\r?\n/u)
      .map((entry) => entry.trim())
      .find((entry) => entry.length > 0);
    if (line !== undefined) {
      return line;
    }
  }
  return "";
}

function probeVideo(path: string) {
  const result = spawnSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,nb_frames,r_frame_rate,duration,codec_name",
      "-of",
      "json",
      path,
    ],
    { encoding: "utf8", timeout: 30_000 },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      message: result.stderr.trim() || "ffprobe failed or is not installed.",
    };
  }
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, message: "ffprobe returned non-JSON output." };
  }
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

async function createValidationDir(): Promise<string> {
  const baseDir =
    process.env.WITTGENSTEIN_VIDEO_VALIDATION_DIR ??
    join(process.cwd(), "artifacts", "tmp", "video-mp4-renderer");
  const resolvedBaseDir = resolve(baseDir);
  await mkdir(resolvedBaseDir, { recursive: true });
  return mkdtemp(join(resolvedBaseDir, "run-"));
}

void main();
