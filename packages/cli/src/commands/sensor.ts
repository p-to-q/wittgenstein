import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  type CommandRuntimeOptions,
} from "./shared.js";

export function registerSensorCommand(program: Command): void {
  program
    .command("sensor")
    .argument("<prompt>", "user prompt")
    .description("Run the sensor codec")
    .option("--signal <signal>", "ecg | temperature | gyro")
    .option("--sample-rate-hz <number>", "requested sample rate")
    .option("--duration-sec <number>", "requested duration in seconds")
    .option("--out <path>", "output path")
    .option("--seed <number>", "seed", parseSeedOption)
    .option("--dry-run", "skip the remote model call and exercise the manifest spine")
    .option("--config <path>", "config path")
    .action(
      async (
        prompt: string,
        options: CommandRuntimeOptions & {
          signal?: string;
          sampleRateHz?: string;
          durationSec?: string;
        },
      ) => {
        await runCodecCommand(
          {
            modality: "sensor",
            prompt,
            out: options.out,
            seed: parseOptionalSeed(options.seed),
            signal: options.signal,
            sampleRateHz: options.sampleRateHz
              ? Number.parseFloat(options.sampleRateHz)
              : undefined,
            durationSec: options.durationSec ? Number.parseFloat(options.durationSec) : undefined,
          },
          "wittgenstein sensor",
          process.argv.slice(2),
          options,
        );
      },
    );
}
