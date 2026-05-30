import type { Command } from "commander";
import { preflightSelectedImageDecoder, readDecoderCacheDir } from "./decoder-manifest.js";
import { resolveExecutionRoot } from "./shared.js";
import { buildInstallTierPlan, resolveInstallTier } from "../tiers.js";

interface InstallCommandOptions {
  dryRun?: boolean;
  gpu?: boolean;
  allowResearchWeights?: boolean;
  json?: boolean;
}

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .argument("<tier>", "installable runtime tier")
    .description("Plan or install optional runtime tiers")
    .option("--dry-run", "print the install plan without downloading or writing files")
    .option("--gpu", "select the GPU image decoder tier")
    .option(
      "--allow-research-weights",
      "allow research-only decoder weights for benchmarking per ADR-0020",
    )
    .option("--json", "print structured JSON output (default)")
    .action(async (tier: string, options: InstallCommandOptions) => {
      const workspaceRoot = resolveExecutionRoot();
      const resolvedTier = resolveInstallTier(tier, { gpu: options.gpu ?? false });

      if (!resolvedTier) {
        printInstallError({
          code: "INVALID_INSTALL_TIER",
          message: `Unknown install tier: ${tier}`,
          supportedTiers: ["image", "image --gpu", "image-gpu"],
        });
        process.exitCode = 1;
        return;
      }

      const plan = buildInstallTierPlan(resolvedTier, {
        allowResearchWeights: options.allowResearchWeights ?? false,
      });
      const cacheDir = readDecoderCacheDir(workspaceRoot);

      if (options.dryRun) {
        const decoderPreflight = imageDecoderPreflightForPlan(plan);
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "plan-only",
              status: decoderPreflight.status,
              plan,
              decoderPreflight,
            },
            null,
            2,
          ),
        );
        return;
      }

      const { selection, preflight } = await preflightSelectedImageDecoder({
        workspaceRoot,
        ...(cacheDir ? { cacheDir } : {}),
        allowResearchWeights: options.allowResearchWeights ?? false,
        checkRuntime: true,
      });

      if (preflight.status === "ready") {
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "install-ready",
              status: "ready",
              manifestPath: selection.manifestPath,
              decoderId: preflight.decoderId,
              family: preflight.family,
              runtimeTier: preflight.runtimeTier,
              weightsRestriction: weightsRestrictionFromPreflight(preflight),
              plan,
              decoderPreflight: preflight,
            },
            null,
            2,
          ),
        );
        return;
      }

      printInstallError({
        code:
          preflight.reason === "manifest-missing"
            ? "TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST"
            : "TIER_INSTALL_BLOCKED_BY_DECODER_PREFLIGHT",
        message: installBlockedMessage(preflight.reason),
        status: "blocked",
        manifestPath: selection.manifestPath,
        decoderId: preflight.decoderId,
        family: preflight.family,
        runtimeTier: preflight.runtimeTier,
        weightsRestriction: weightsRestrictionFromPreflight(preflight),
        plan,
        decoderPreflight: preflight,
      });
      process.exitCode = 1;
    });
}

function imageDecoderPreflightForPlan(plan: ReturnType<typeof buildInstallTierPlan>): {
  schemaVersion: "witt.image.decoder-preflight/v0.1";
  status: "blocked";
  reason: "manifest-missing";
  decoderId: null;
  family: null;
  runtimeTier: "node-onnx-cpu" | "node-onnx-gpu";
  installHint: string;
  tracker: string;
  details: {
    message: string;
    decisionTracker: string;
    gateCDeterminism: string;
    gateDOnnxCpu: string;
  };
} {
  return {
    schemaVersion: "witt.image.decoder-preflight/v0.1",
    status: "blocked",
    reason: "manifest-missing",
    decoderId: null,
    family: null,
    runtimeTier: plan.tier === "image-gpu" ? "node-onnx-gpu" : "node-onnx-cpu",
    installHint:
      plan.tier === "image-gpu" ? "wittgenstein install image --gpu" : "wittgenstein install image",
    tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    details: {
      message: "Image tier installation is blocked until a decoder-family manifest is blessed.",
      decisionTracker: "https://github.com/p-to-q/wittgenstein/issues/402",
      gateCDeterminism: "https://github.com/p-to-q/wittgenstein/issues/334",
      gateDOnnxCpu: "https://github.com/p-to-q/wittgenstein/issues/335",
    },
  };
}

function installBlockedMessage(reason: string | null): string {
  if (reason === "manifest-missing") {
    return "Image tier installation requires a concrete decoder-family manifest before weights can be fetched.";
  }

  return "Image tier installation is blocked by decoder preflight checks.";
}

function weightsRestrictionFromPreflight(preflight: {
  details: Record<string, unknown>;
}): "permissive" | "research-only" | null {
  const weights = preflight.details["weights"];
  if (!isRecord(weights)) {
    return null;
  }

  const restriction = weights["weightsRestriction"];
  return restriction === "permissive" || restriction === "research-only" ? restriction : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function printInstallError(error: Record<string, unknown>): void {
  console.error(
    JSON.stringify(
      {
        ok: false,
        ...error,
      },
      null,
      2,
    ),
  );
}
