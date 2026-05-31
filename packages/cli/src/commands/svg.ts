import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  type CommandRuntimeOptions,
} from "./shared.js";

export interface SvgCommandOptions extends CommandRuntimeOptions {
  source?: string;
}

export function registerSvgCommand(program: Command): void {
  program
    .command("svg")
    .argument("<prompt>", "user prompt")
    .description(
      "Run the SVG codec: `engine` calls the grammar engine HTTP; `local` emits deterministic vector art from the prompt (no text, black background).",
    )
    .option("--out <path>", "output path")
    .option("--seed <number>", "seed", parseSeedOption)
    .option("--source <engine|local>", "svg generation source", "engine")
    .option("--dry-run", "skip remote model / engine calls and exercise the manifest spine")
    .option("--config <path>", "config path")
    .action(async (prompt: string, options: SvgCommandOptions) => {
      const source = options.source === "local" ? "local" : "engine";
      await runCodecCommand(
        {
          modality: "svg",
          prompt,
          source,
          out: options.out,
          seed: parseOptionalSeed(options.seed),
        },
        "wittgenstein svg",
        process.argv.slice(2),
        options,
      );
    });
}
