import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";
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
          validatedBackends: mp4.length,
          html: htmlReceipt,
          mp4,
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

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
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
  await mkdir(baseDir, { recursive: true });
  return mkdtemp(join(baseDir, "run-"));
}

void main();
