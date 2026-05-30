import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { loadWittgensteinConfig } from "@wittgenstein/core";
import {
  DecoderFamilyManifestSchema,
  preflightImageDecoder,
  type DecoderFamilyManifest,
  type DecoderPreflightReceipt,
} from "@wittgenstein/codec-image";
import { firstOutputLine, spawnVersionCheck } from "@wittgenstein/process-runner";
import type { Command } from "commander";
import { resolveExecutionRoot } from "./shared.js";
import { runtimeTierReadiness } from "../tiers.js";

type DoctorCheckStatus = "ok" | "missing" | "invalid" | "skipped";

interface DoctorCheck {
  status: DoctorCheckStatus;
  version?: string;
  path?: string;
  message?: string;
}

interface VideoRenderDoctor {
  enabled: boolean;
  backend: "distilled-internal" | "npx-cli";
  hyperframesNode: DoctorCheck;
  hyperframesCli: DoctorCheck;
  ffmpeg: DoctorCheck;
  chrome: DoctorCheck;
}

interface ImageDecoderDoctor {
  status: "ready" | "blocked" | "not-selected";
  manifestPath: string | null;
  family: string | null;
  decoderId: string | null;
  manifestStatus: "blessed" | "candidate" | "rejected" | null;
  weightsRestriction: "permissive" | "research-only" | null;
  audits: {
    gateA: string;
    gateB: string;
    gateC: string;
    gateD: string;
  } | null;
  weightsCached: boolean | null;
  decoderManifest: DoctorCheck;
  onnxRuntime: DoctorCheck;
  reason: DecoderPreflightReceipt["reason"] | null;
  installHint: string | null;
  tracker: string | null;
  details: Record<string, unknown>;
  blockers: {
    decoderDelivery: string;
    gateCDeterminism: string;
    gateDOnnxCpu: string;
  };
}

export function registerDoctorCommand(program: Command): void {
  program
    .command("doctor")
    .description("Check runtime assumptions and config loading")
    .option("--config <path>", "config path")
    .action(async (options: { config?: string }) => {
      const workspaceRoot = resolveExecutionRoot();
      const config = await loadWittgensteinConfig({
        cwd: workspaceRoot,
        ...(options.config ? { configPath: options.config } : {}),
      });
      const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);

      console.log(
        JSON.stringify(
          {
            ok: nodeMajor >= 20,
            nodeVersion: process.version,
            nodeSatisfied: nodeMajor >= 20,
            hasApiKey: Boolean(process.env[config.llm.apiKeyEnv]),
            llmProvider: config.llm.provider,
            llmModel: config.llm.model,
            artifactsDir: config.runtime.artifactsDir,
            tiers: runtimeTierReadiness(),
            videoRender: checkVideoRenderDependencies(),
            imageDecoder: await checkImageDecoderReadiness(workspaceRoot),
          },
          null,
          2,
        ),
      );
    });
}

function checkVideoRenderDependencies(): VideoRenderDoctor {
  const enabled = process.env.WITTGENSTEIN_HYPERFRAMES_RENDER === "1";
  if (!enabled) {
    const skipped: DoctorCheck = {
      status: "skipped",
      message: "Set WITTGENSTEIN_HYPERFRAMES_RENDER=1 to enable MP4 render dependency checks.",
    };
    return {
      enabled,
      backend: readVideoBackend(),
      hyperframesNode: skipped,
      hyperframesCli: skipped,
      ffmpeg: skipped,
      chrome: skipped,
    };
  }

  const backend = readVideoBackend();
  return {
    enabled,
    backend,
    hyperframesNode:
      backend === "npx-cli"
        ? checkNodeForHyperframesCli()
        : {
            status: "skipped",
            message: "Only checked when WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli.",
          },
    hyperframesCli:
      backend === "npx-cli"
        ? checkHyperframesCli()
        : {
            status: "skipped",
            message: "Only checked when WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli.",
          },
    ffmpeg: checkCommandVersion("ffmpeg", ["-version"], "Install FFmpeg for video MP4 rendering."),
    chrome: checkChrome(),
  };
}

function checkNodeForHyperframesCli(): DoctorCheck {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 22) {
    return {
      status: "ok",
      version: process.version,
    };
  }
  return {
    status: "missing",
    version: process.version,
    message:
      "HyperFrames CLI currently requires Node.js >=22. Use the distilled internal backend on Node 20, or run the npx backend under Node 22+.",
  };
}

function readVideoBackend(): "distilled-internal" | "npx-cli" {
  return process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND === "npx-cli"
    ? "npx-cli"
    : "distilled-internal";
}

function checkHyperframesCli(): DoctorCheck {
  const result = spawnVersionCheck("npx", ["--no-install", "hyperframes", "--version"], {
    env: {
      HYPERFRAMES_NO_TELEMETRY: process.env.HYPERFRAMES_NO_TELEMETRY ?? "1",
      HYPERFRAMES_NO_UPDATE_CHECK: process.env.HYPERFRAMES_NO_UPDATE_CHECK ?? "1",
    },
  });

  if (result.ok) {
    return {
      status: "ok",
      version: firstOutputLine(result.stdout, result.stderr),
    };
  }

  return {
    status: "missing",
    message:
      "Install HyperFrames locally, or unset WITTGENSTEIN_HYPERFRAMES_BACKEND to use the distilled internal renderer.",
  };
}

function checkCommandVersion(command: string, args: string[], missingMessage: string): DoctorCheck {
  const result = spawnVersionCheck(command, args);

  if (result.ok) {
    return {
      status: "ok",
      version: firstOutputLine(result.stdout, result.stderr),
    };
  }

  return {
    status: "missing",
    message: missingMessage,
  };
}

function checkChrome(): DoctorCheck {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      return {
        status: "missing",
        path: envPath,
        message: "PUPPETEER_EXECUTABLE_PATH is set but does not point to an existing file.",
      };
    }

    return checkChromeCandidate(envPath);
  }

  const candidates = [
    "google-chrome",
    "chromium",
    "chromium-browser",
    "chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const candidate of candidates) {
    const check = checkChromeCandidate(candidate);
    if (check.status === "ok") {
      return check;
    }
  }

  return {
    status: "missing",
    message: "Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH for video MP4 rendering.",
  };
}

function checkChromeCandidate(candidate: string): DoctorCheck {
  const result = spawnVersionCheck(candidate, ["--version"]);

  if (result.ok) {
    return {
      status: "ok",
      path: candidate,
      version: firstOutputLine(result.stdout, result.stderr),
    };
  }

  return { status: "missing" };
}

async function checkImageDecoderReadiness(workspaceRoot: string): Promise<ImageDecoderDoctor> {
  const selectedManifest = process.env.WITTGENSTEIN_DECODER_MANIFEST;
  const onnxRuntime = checkOptionalNodePeer("onnxruntime-node", "wittgenstein install image");
  const blockers = imageDecoderBlockers();

  if (!selectedManifest) {
    return {
      status: "not-selected",
      manifestPath: null,
      family: null,
      decoderId: null,
      manifestStatus: null,
      weightsRestriction: null,
      audits: null,
      weightsCached: null,
      decoderManifest: {
        status: "skipped",
        message: "Set WITTGENSTEIN_DECODER_MANIFEST=<path> to inspect a decoder-family manifest.",
      },
      onnxRuntime,
      reason: "manifest-missing",
      installHint: "wittgenstein install image",
      tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
      details: {
        message: "No decoder-family manifest has been selected for the image tier.",
      },
      blockers,
    };
  }

  const manifestPath = isAbsolute(selectedManifest)
    ? selectedManifest
    : resolve(workspaceRoot, selectedManifest);

  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return {
      status: "blocked",
      manifestPath,
      family: null,
      decoderId: null,
      manifestStatus: null,
      weightsRestriction: null,
      audits: null,
      weightsCached: null,
      decoderManifest: {
        status: "missing",
        path: manifestPath,
        message: `Could not read decoder-family manifest: ${errorMessage(error)}`,
      },
      onnxRuntime,
      reason: "manifest-invalid",
      installHint: "wittgenstein install image",
      tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
      details: {
        issues: [{ path: "", message: errorMessage(error) }],
      },
      blockers,
    };
  }

  const parsedManifest = DecoderFamilyManifestSchema.safeParse(manifestInput);
  const auditReceipts = parsedManifest.success
    ? await readAuditReceipts(parsedManifest.data, workspaceRoot, dirname(manifestPath))
    : new Map<string, unknown>();
  const preflight = await preflightImageDecoder({
    manifest: manifestInput,
    auditReceipts,
    // Doctor is an audit surface: surface research-only posture and peer
    // availability without opting users into a decode runtime.
    allowResearchWeights: true,
    checkRuntime: false,
  });
  const parsed = parsedManifest.success ? parsedManifest.data : null;

  return {
    status: preflight.status,
    manifestPath,
    family: parsed?.family ?? preflight.family,
    decoderId: parsed?.decoderId ?? preflight.decoderId,
    manifestStatus: parsed?.status ?? null,
    weightsRestriction: parsed?.assets.license.weights ?? null,
    audits: parsed ? auditStatuses(parsed) : null,
    weightsCached: weightsCachedFromPreflight(preflight),
    decoderManifest: {
      status: parsedManifest.success ? "ok" : "invalid",
      path: manifestPath,
      message: parsedManifest.success
        ? "Decoder-family manifest loaded from WITTGENSTEIN_DECODER_MANIFEST."
        : "Decoder-family manifest did not match the expected schema.",
    },
    onnxRuntime,
    reason: preflight.reason,
    installHint: preflight.installHint,
    tracker: preflight.tracker,
    details: preflight.details,
    blockers,
  };
}

function imageDecoderBlockers(): ImageDecoderDoctor["blockers"] {
  return {
    decoderDelivery: "https://github.com/p-to-q/wittgenstein/issues/402",
    gateCDeterminism: "https://github.com/p-to-q/wittgenstein/issues/334",
    gateDOnnxCpu: "https://github.com/p-to-q/wittgenstein/issues/335",
  };
}

async function readAuditReceipts(
  manifest: DecoderFamilyManifest,
  workspaceRoot: string,
  manifestDir: string,
): Promise<Map<string, unknown>> {
  const receipts = new Map<string, unknown>();

  for (const gate of ["gateC", "gateD"] as const) {
    const receiptPath = manifest.audits[gate].receipt;
    if (!receiptPath) continue;

    const input = await readJsonFromCandidates(
      resolveReceiptCandidates(receiptPath, workspaceRoot, manifestDir),
    );
    if (input !== undefined) {
      receipts.set(receiptPath, input);
    }
  }

  return receipts;
}

function resolveReceiptCandidates(
  receiptPath: string,
  workspaceRoot: string,
  manifestDir: string,
): string[] {
  if (isAbsolute(receiptPath)) {
    return [receiptPath];
  }

  return [resolve(workspaceRoot, receiptPath), resolve(manifestDir, receiptPath)];
}

async function readJsonFromCandidates(paths: readonly string[]): Promise<unknown | undefined> {
  for (const path of paths) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      // Try the next resolution root. If every candidate fails, preflight will
      // report the receipt as missing for the manifest's declared path.
    }
  }

  return undefined;
}

function auditStatuses(manifest: DecoderFamilyManifest): NonNullable<ImageDecoderDoctor["audits"]> {
  return {
    gateA: manifest.audits.gateA.status,
    gateB: manifest.audits.gateB.status,
    gateC: manifest.audits.gateC.status,
    gateD: manifest.audits.gateD.status,
  };
}

function weightsCachedFromPreflight(receipt: DecoderPreflightReceipt): boolean | null {
  if (receipt.status === "ready") return true;
  if (receipt.reason === "weights-not-installed" || receipt.reason === "weights-invalid") {
    return false;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function checkOptionalNodePeer(packageName: string, installHint: string): DoctorCheck {
  const requireFromDoctor = createRequire(import.meta.url);
  try {
    const resolvedPath = requireFromDoctor.resolve(packageName);
    return {
      status: "ok",
      path: resolvedPath,
    };
  } catch {
    return {
      status: "missing",
      message: `${packageName} is optional and not installed. Run \`${installHint}\` after a decoder manifest is selected.`,
    };
  }
}
