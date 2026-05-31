import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  type CommandRuntimeOptions,
} from "./shared.js";

export function registerAudioCommand(program: Command): void {
  program
    .command("audio")
    .argument("<prompt>", "user prompt")
    .description("Run the audio codec")
    .option("--route <route>", "Deprecated compatibility hint: speech | soundscape | music")
    .option("--ambient <ambient>", "auto | silence | rain | wind | city | forest | electronic")
    .option("--duration-sec <number>", "requested duration in seconds")
    .option("--out <path>", "output path")
    .option("--seed <number>", "seed", parseSeedOption)
    .option("--dry-run", "skip the remote model call and exercise the manifest spine")
    .option("--config <path>", "config path")
    .action(
      async (
        prompt: string,
        options: CommandRuntimeOptions & {
          route?: "speech" | "soundscape" | "music";
          ambient?: string;
          durationSec?: string;
        },
      ) => {
        await runCodecCommand(
          {
            modality: "audio",
            prompt,
            out: options.out,
            seed: parseOptionalSeed(options.seed),
            route: options.route,
            ambient: options.ambient,
            durationSec: options.durationSec ? Number.parseFloat(options.durationSec) : undefined,
          },
          "wittgenstein audio",
          process.argv.slice(2),
          options,
        );
      },
    );
}
