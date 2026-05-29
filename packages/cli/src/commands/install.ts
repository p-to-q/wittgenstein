import type { Command } from "commander";
import { buildInstallTierPlan, resolveInstallTier } from "../tiers.js";

interface InstallCommandOptions {
  dryRun?: boolean;
  gpu?: boolean;
  allowResearchWeights?: boolean;
}

interface ImageDecoderPreflightReceipt {
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
    .action((tier: string, options: InstallCommandOptions) => {
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

      if (options.dryRun) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "plan-only",
              plan,
              decoderPreflight: imageDecoderPreflightForPlan(plan),
            },
            null,
            2,
          ),
        );
        return;
      }

      printInstallError({
        code: "TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST",
        message:
          "Image tier installation requires a concrete decoder-family manifest before weights can be fetched.",
        plan,
      });
      process.exitCode = 1;
    });
}

function imageDecoderPreflightForPlan(
  plan: ReturnType<typeof buildInstallTierPlan>,
): ImageDecoderPreflightReceipt {
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
