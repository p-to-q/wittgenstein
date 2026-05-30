import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { loadWittgensteinConfig } from "@wittgenstein/core";
import type { DecoderPreflightReceipt } from "@wittgenstein/codec-image";
import {
  createRuntimeProbeReceipt,
  probeRuntimeCommandVersion,
  type RuntimeProbeReceipt,
} from "@wittgenstein/process-runner";
import type { Command } from "commander";
import {
  auditStatuses,
  preflightSelectedImageDecoder,
  readDecoderCacheDir,
  weightsCachedFromPreflight,
} from "./decoder-manifest.js";
import { resolveExecutionRoot } from "./shared.js";
import { runtimeTierReadiness } from "../tiers.js";

type DoctorCheck = RuntimeProbeReceipt;

interface DoctorFileCheck {
  status: "ok" | "missing" | "invalid" | "skipped";
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
  decoderManifest: DoctorFileCheck;
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
    const skippedMessage =
      "Set WITTGENSTEIN_HYPERFRAMES_RENDER=1 to enable MP4 render dependency checks.";
    return {
      enabled,
      backend: readVideoBackend(),
      hyperframesNode: skippedVideoProbe("node", skippedMessage),
      hyperframesCli: skippedVideoProbe("hyperframes", skippedMessage),
      ffmpeg: skippedVideoProbe("ffmpeg", skippedMessage),
      chrome: skippedVideoProbe("chrome", skippedMessage),
    };
  }

  const backend = readVideoBackend();
  return {
    enabled,
    backend,
    hyperframesNode:
      backend === "npx-cli"
        ? checkNodeForHyperframesCli()
        : createRuntimeProbeReceipt({
            status: "skipped",
            runtime: "node",
            tier: "video",
            message: "Only checked when WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli.",
          }),
    hyperframesCli:
      backend === "npx-cli"
        ? checkHyperframesCli()
        : createRuntimeProbeReceipt({
            status: "skipped",
            runtime: "hyperframes",
            tier: "video",
            message: "Only checked when WITTGENSTEIN_HYPERFRAMES_BACKEND=npx-cli.",
          }),
    ffmpeg: checkCommandVersion("ffmpeg", ["-version"], "Install FFmpeg for video MP4 rendering."),
    chrome: checkChrome(),
  };
}

function checkNodeForHyperframesCli(): DoctorCheck {
  const major = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (major >= 22) {
    return createRuntimeProbeReceipt({
      status: "ok",
      runtime: "node",
      tier: "video",
      version: process.version,
    });
  }
  return createRuntimeProbeReceipt({
    status: "missing",
    runtime: "node",
    tier: "video",
    version: process.version,
    message:
      "HyperFrames CLI currently requires Node.js >=22. Use the distilled internal backend on Node 20, or run the npx backend under Node 22+.",
  });
}

function readVideoBackend(): "distilled-internal" | "npx-cli" {
  return process.env.WITTGENSTEIN_HYPERFRAMES_BACKEND === "npx-cli"
    ? "npx-cli"
    : "distilled-internal";
}

function checkHyperframesCli(): DoctorCheck {
  return probeRuntimeCommandVersion({
    runtime: "hyperframes",
    tier: "video",
    command: "npx",
    args: ["--no-install", "hyperframes", "--version"],
    env: {
      HYPERFRAMES_NO_TELEMETRY: process.env.HYPERFRAMES_NO_TELEMETRY ?? "1",
      HYPERFRAMES_NO_UPDATE_CHECK: process.env.HYPERFRAMES_NO_UPDATE_CHECK ?? "1",
    },
    missingMessage:
      "Install HyperFrames locally, or unset WITTGENSTEIN_HYPERFRAMES_BACKEND to use the distilled internal renderer.",
  });
}

function checkCommandVersion(command: string, args: string[], missingMessage: string): DoctorCheck {
  return probeRuntimeCommandVersion({
    runtime: command,
    tier: "video",
    command,
    args,
    missingMessage,
  });
}

function checkChrome(): DoctorCheck {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      return createRuntimeProbeReceipt({
        status: "missing",
        runtime: "chrome",
        tier: "video",
        path: envPath,
        message: "PUPPETEER_EXECUTABLE_PATH is set but does not point to an existing file.",
      });
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

  return createRuntimeProbeReceipt({
    runtime: "chrome",
    tier: "video",
    status: "missing",
    message: "Install Chrome/Chromium or set PUPPETEER_EXECUTABLE_PATH for video MP4 rendering.",
  });
}

function checkChromeCandidate(candidate: string): DoctorCheck {
  return probeRuntimeCommandVersion({
    runtime: "chrome",
    tier: "video",
    command: candidate,
    args: ["--version"],
    path: candidate,
    missingMessage: "Chrome/Chromium candidate did not respond to --version.",
  });
}

async function checkImageDecoderReadiness(workspaceRoot: string): Promise<ImageDecoderDoctor> {
  const onnxRuntime = checkOptionalNodePeer("onnxruntime-node", "wittgenstein install image");
  const blockers = imageDecoderBlockers();
  const cacheDir = readDecoderCacheDir(workspaceRoot);
  const { selection, preflight } = await preflightSelectedImageDecoder({
    workspaceRoot,
    ...(cacheDir ? { cacheDir } : {}),
    // Doctor is an audit surface: surface research-only posture and peer
    // availability without opting users into a decode runtime.
    allowResearchWeights: true,
    checkRuntime: false,
  });

  if (selection.status === "not-selected") {
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

  if (selection.status === "read-error") {
    return {
      status: "blocked",
      manifestPath: selection.manifestPath,
      family: null,
      decoderId: null,
      manifestStatus: null,
      weightsRestriction: null,
      audits: null,
      weightsCached: null,
      decoderManifest: {
        status: "missing",
        path: selection.manifestPath!,
        message: `Could not read decoder-family manifest: ${selection.errorMessage}`,
      },
      onnxRuntime,
      reason: preflight.reason,
      installHint: preflight.installHint,
      tracker: preflight.tracker,
      details: preflight.details,
      blockers,
    };
  }

  const parsed = selection.parsedManifest;

  return {
    status: preflight.status,
    manifestPath: selection.manifestPath,
    family: parsed?.family ?? preflight.family,
    decoderId: parsed?.decoderId ?? preflight.decoderId,
    manifestStatus: parsed?.status ?? null,
    weightsRestriction: parsed?.assets.license.weights ?? null,
    audits: parsed ? auditStatuses(parsed) : null,
    weightsCached: weightsCachedFromPreflight(preflight),
    decoderManifest: {
      status: parsed ? "ok" : "invalid",
      path: selection.manifestPath!,
      message: parsed
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

function checkOptionalNodePeer(packageName: string, installHint: string): DoctorCheck {
  const requireFromDoctor = createRequire(import.meta.url);
  try {
    const resolvedPath = requireFromDoctor.resolve(packageName);
    return createRuntimeProbeReceipt({
      status: "ok",
      runtime: packageName,
      tier: "image",
      path: resolvedPath,
      installHint,
    });
  } catch {
    return createRuntimeProbeReceipt({
      status: "missing",
      runtime: packageName,
      tier: "image",
      installHint,
      message: `${packageName} is optional and not installed. Run \`${installHint}\` after a decoder manifest is selected.`,
    });
  }
}

function skippedVideoProbe(runtime: string, message: string): DoctorCheck {
  return createRuntimeProbeReceipt({
    status: "skipped",
    runtime,
    tier: "video",
    message,
  });
}
