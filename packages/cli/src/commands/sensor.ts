import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parsePositiveNumberOption,
  parseSeedOption,
  type CommandRuntimeOptions,
} from "./shared.js";

export function registerSensorCommand(program: Command): void {
  program
    .command("sensor")
    .argument("<prompt>", "user prompt")
    .description("Run the sensor codec")
    .option("--signal <signal>", "ecg | temperature | gyro")
    .option("--sample-rate-hz <number>", "requested sample rate", parsePositiveNumberOption)
    .option("--duration-sec <number>", "requested duration in seconds", parsePositiveNumberOption)
    .option("--out <path>", "output path")
    .option("--seed <number>", "seed", parseSeedOption)
    .option("--dry-run", "skip the remote model call and exercise the manifest spine")
    .option("--config <path>", "config path")
    .action(
      async (
        prompt: string,
        options: CommandRuntimeOptions & {
          signal?: string;
          sampleRateHz?: number;
          durationSec?: number;
        },
      ) => {
        await runCodecCommand(
          {
            modality: "sensor",
            prompt,
            out: options.out,
            seed: parseOptionalSeed(options.seed),
            signal: options.signal,
            sampleRateHz: options.sampleRateHz,
            durationSec: options.durationSec,
          },
          "wittgenstein sensor",
          process.argv.slice(2),
          options,
        );
      },
    );
}
