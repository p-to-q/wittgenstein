import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { loadWittgensteinConfig } from "@wittgenstein/core";
import type { Command } from "commander";
import { resolveExecutionRoot } from "./shared.js";
import { runtimeTierReadiness } from "../tiers.js";

type DoctorCheckStatus = "ok" | "missing" | "skipped";

interface DoctorCheck {
  status: DoctorCheckStatus;
  version?: string;
  path?: string;
  message?: string;
}

const OPTIONAL_DEPENDENCY_CHECK_TIMEOUT_MS = 1_000;

interface VideoRenderDoctor {
  enabled: boolean;
  backend: "distilled-internal" | "npx-cli";
  hyperframesNode: DoctorCheck;
  hyperframesCli: DoctorCheck;
  ffmpeg: DoctorCheck;
  chrome: DoctorCheck;
}

interface ImageDecoderDoctor {
  status: "blocked";
  decoderManifest: DoctorCheck;
  onnxRuntime: DoctorCheck;
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
            imageDecoder: checkImageDecoderReadiness(),
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
  const result = spawnSync("npx", ["--no-install", "hyperframes", "--version"], {
    encoding: "utf8",
    timeout: OPTIONAL_DEPENDENCY_CHECK_TIMEOUT_MS,
    env: {
      ...process.env,
      HYPERFRAMES_NO_TELEMETRY: process.env.HYPERFRAMES_NO_TELEMETRY ?? "1",
      HYPERFRAMES_NO_UPDATE_CHECK: process.env.HYPERFRAMES_NO_UPDATE_CHECK ?? "1",
    },
  });

  if (result.status === 0) {
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
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: OPTIONAL_DEPENDENCY_CHECK_TIMEOUT_MS,
  });

  if (result.status === 0) {
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
  const result = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    timeout: OPTIONAL_DEPENDENCY_CHECK_TIMEOUT_MS,
  });

  if (result.status === 0) {
    return {
      status: "ok",
      path: candidate,
      version: firstOutputLine(result.stdout, result.stderr),
    };
  }

  return { status: "missing" };
}

function checkImageDecoderReadiness(): ImageDecoderDoctor {
  return {
    status: "blocked",
    decoderManifest: {
      status: "missing",
      message:
        "No decoder-family manifest has been blessed for the image install tier yet; #402 owns the decision.",
    },
    onnxRuntime: checkOptionalNodePeer("onnxruntime-node", "wittgenstein install image"),
    blockers: {
      decoderDelivery: "https://github.com/p-to-q/wittgenstein/issues/402",
      gateCDeterminism: "https://github.com/p-to-q/wittgenstein/issues/334",
      gateDOnnxCpu: "https://github.com/p-to-q/wittgenstein/issues/335",
    },
  };
}

function checkOptionalNodePeer(packageName: string, installHint: string): DoctorCheck {
  const result = spawnSync(
    process.execPath,
    ["-e", `console.log(require.resolve(${JSON.stringify(packageName)}))`],
    {
      encoding: "utf8",
      timeout: OPTIONAL_DEPENDENCY_CHECK_TIMEOUT_MS,
    },
  );

  if (result.status === 0) {
    return {
      status: "ok",
      path: firstOutputLine(result.stdout, result.stderr),
    };
  }

  return {
    status: "missing",
    message: `${packageName} is optional and not installed. Run \`${installHint}\` after a decoder manifest is selected.`,
  };
}

function firstOutputLine(stdout: string, stderr: string): string {
  return (
    (stdout || stderr)
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
  );
}
