import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  resolveExecutionRoot,
  type CommandRuntimeOptions,
} from "./shared.js";

function collectSvgPath(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

export interface VideoCommandOptions extends CommandRuntimeOptions {
  durationSec?: string;
  svg?: string[];
}

export function registerVideoCommand(program: Command): void {
  program
    .command("video")
    .argument("<prompt>", "user prompt")
    .description(
      "Run the video codec. With `--svg` (repeatable), embeds those SVG files as timed slides and skips the LLM.",
    )
    .option("--duration-sec <number>", "requested duration in seconds")
    .option("--out <path>", "output path")
    .option("--seed <number>", "seed", parseSeedOption)
    .option(
      "--svg <path>",
      "SVG file as one slide (repeatable); bypasses LLM when set",
      collectSvgPath,
      [],
    )
    .option("--dry-run", "skip the remote model call and exercise the manifest spine")
    .option("--config <path>", "config path")
    .action(async (prompt: string, options: VideoCommandOptions) => {
      const root = resolveExecutionRoot();
      const svgPaths = options.svg ?? [];
      const inlineSvgs: string[] = [];
      for (const rel of svgPaths) {
        const abs = resolve(root, rel);
        inlineSvgs.push(await readFile(abs, "utf8"));
      }

      await runCodecCommand(
        {
          modality: "video",
          prompt,
          out: options.out,
          seed: parseOptionalSeed(options.seed),
          durationSec: options.durationSec ? Number.parseFloat(options.durationSec) : undefined,
          ...(inlineSvgs.length > 0 ? { inlineSvgs } : {}),
        },
        "wittgenstein video",
        process.argv.slice(2),
        options,
      );
    });
}
