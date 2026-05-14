import { loadWittgensteinConfig } from "@wittgenstein/core";
import type { Command } from "commander";
import { resolveExecutionRoot } from "./shared.js";

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
            tiers: {
              tier0: {
                label: "sensor / svg-local / asciipng",
                ready: true,
              },
              tier1: {
                label: "image CPU decoder bridge",
                ready: false,
                installHint: "wittgenstein install image",
                tracker: "https://github.com/p-to-q/wittgenstein/issues/403",
              },
              tier2: {
                label: "image GPU decoder bridge",
                ready: false,
                installHint: "wittgenstein install image --gpu",
                tracker: "https://github.com/p-to-q/wittgenstein/issues/403",
              },
              tier3: {
                label: "research / training",
                ready: false,
                installHint: "git checkout + repo docs; not a user install tier",
              },
            },
          },
          null,
          2,
        ),
      );
    });
}
