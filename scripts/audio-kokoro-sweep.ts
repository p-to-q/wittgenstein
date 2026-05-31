import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { arch, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { AudioCodec } from "../packages/codec-audio/src/codec.js";
import type { codecV2 as CodecV2Namespace } from "@wittgenstein/schemas";

interface SweepRun {
  readonly index: number;
  readonly outPath: string;
  readonly artifactSha256: string;
  readonly audioRender: unknown;
  readonly decoderHash: unknown;
  readonly quality: unknown;
}

interface SweepReceipt {
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly platform: {
    readonly os: NodeJS.Platform;
    readonly arch: string;
    readonly release: string;
    readonly node: string;
  };
  readonly packageVersions: {
    readonly codecAudio: string;
    readonly kokoroJs: string;
    readonly transformers: string;
  };
  readonly backend: "kokoro";
  readonly seed: number;
  readonly runsRequested: number;
  readonly uniqueArtifactShaCount: number;
  readonly runs: readonly SweepRun[];
  readonly error?: {
    readonly message: string;
    readonly stack?: string;
  };
}

const repoRoot = process.cwd();
const seed = 7;
const runsRequested = readRunsArg();
const outPath = readOutArg();

async function main(): Promise<void> {
  process.env.WITTGENSTEIN_AUDIO_BACKEND = "kokoro";

  try {
    const runs = await produceRuns(runsRequested);
    const receipt = await buildReceipt({
      ok: new Set(runs.map((run) => run.artifactSha256)).size === 1,
      runs,
    });
    await emitReceipt(receipt);
    if (!receipt.ok) {
      process.exitCode = 1;
    }
  } catch (error) {
    const receipt = await buildReceipt({
      ok: false,
      runs: [],
      error: error instanceof Error ? error : new Error(String(error)),
    });
    await emitReceipt(receipt);
    process.exitCode = 1;
  }
}

void main();

async function produceRuns(count: number): Promise<SweepRun[]> {
  const { audioCodec } = (await import("../packages/codec-audio/src/index.js")) as {
    readonly audioCodec: AudioCodec;
  };
  const { codecV2 } = (await import("@wittgenstein/schemas")) as {
    readonly codecV2: typeof CodecV2Namespace;
  };
  const runs: SweepRun[] = [];
  for (let index = 0; index < count; index += 1) {
    const dir = await mkdtemp(join(tmpdir(), `witt-kokoro-sweep-${index}-`));
    const art = await audioCodec.produce(
      {
        modality: "audio",
        prompt: "Hello world. This is a Kokoro determinism check.",
        ambient: "silence",
      },
      {
        runId: `kokoro-sweep-${index}`,
        parentRunId: null,
        runDir: dir,
        seed,
        outPath: join(dir, "kokoro.wav"),
        logger: {
          debug: () => {},
          info: () => {},
          warn: () => {},
          error: () => {},
        },
        clock: {
          now: () => 1_900_000_000_000 + index,
          iso: () => new Date(1_900_000_000_000 + index).toISOString(),
        },
        sidecar: codecV2.createRunSidecar(),
        services: {
          dryRun: true,
        },
        fork: () => {
          throw new Error("not used in the Kokoro sweep");
        },
      },
    );
    const bytes = await readFile(art.outPath);
    const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
    runs.push({
      index,
      outPath: art.outPath,
      artifactSha256,
      audioRender: art.metadata.audioRender,
      decoderHash: art.metadata.decoderHash,
      quality: art.metadata.quality,
    });
  }
  return runs;
}

async function buildReceipt(input: {
  readonly ok: boolean;
  readonly runs: readonly SweepRun[];
  readonly error?: Error;
}): Promise<SweepReceipt> {
  const codecAudioPackage = JSON.parse(
    await readFile(resolve(repoRoot, "packages/codec-audio/package.json"), "utf8"),
  ) as { version: string; dependencies?: Record<string, string> };

  return {
    ok: input.ok,
    generatedAt: new Date().toISOString(),
    platform: {
      os: platform(),
      arch: arch(),
      release: release(),
      node: process.version,
    },
    packageVersions: {
      codecAudio: codecAudioPackage.version,
      kokoroJs: codecAudioPackage.dependencies?.["kokoro-js"] ?? "unknown",
      transformers: codecAudioPackage.dependencies?.["@huggingface/transformers"] ?? "unknown",
    },
    backend: "kokoro",
    seed,
    runsRequested,
    uniqueArtifactShaCount: new Set(input.runs.map((run) => run.artifactSha256)).size,
    runs: input.runs,
    ...(input.error
      ? {
          error: {
            message: input.error.message,
            stack: input.error.stack,
          },
        }
      : {}),
  };
}

async function emitReceipt(receipt: SweepReceipt): Promise<void> {
  const text = `${JSON.stringify(receipt, null, 2)}\n`;
  if (outPath) {
    await mkdir(dirname(outPath), { recursive: true });
    await writeFile(outPath, text);
  }
  console.log(text);
}

function readOutArg(): string | null {
  const index = process.argv.indexOf("--out");
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value) {
    throw new Error("--out requires a path");
  }
  return resolve(repoRoot, value);
}

function readRunsArg(): number {
  const index = process.argv.indexOf("--runs");
  if (index === -1) {
    return 3;
  }
  const raw = process.argv[index + 1] ?? "";
  if (!/^\d+$/.test(raw)) {
    throw new Error("--runs requires a positive integer");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("--runs requires a positive safe integer");
  }
  return value;
}
