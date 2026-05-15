import type { Command } from "commander";
import { buildInstallTierPlan, resolveInstallTier } from "../tiers.js";

interface InstallCommandOptions {
  dryRun?: boolean;
  gpu?: boolean;
  allowResearchWeights?: boolean;
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
