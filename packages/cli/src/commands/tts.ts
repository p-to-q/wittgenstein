import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  type CommandRuntimeOptions,
} from "./shared.js";

export function registerTtsCommand(program: Command): void {
  program
    .command("tts")
    .argument("<prompt>", "prompt for a spoken output")
    .description("Run the speech/TTS route of the audio codec")
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
            route: "speech",
            ambient: options.ambient,
            durationSec: options.durationSec ? Number.parseFloat(options.durationSec) : undefined,
          },
          "wittgenstein tts",
          process.argv.slice(2),
          options,
        );
      },
    );
}
