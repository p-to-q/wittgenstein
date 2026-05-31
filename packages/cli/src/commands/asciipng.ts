import type { Command } from "commander";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  type CommandRuntimeOptions,
} from "./shared.js";
import { ensureMinimaxApiKeyInteractive } from "./minimax-key.js";

export interface AsciipngCommandOptions extends CommandRuntimeOptions {
  columns?: string;
  rows?: string;
  cell?: string;
  source?: string;
  minimaxModel?: string;
}

export function registerAsciipngCommand(program: Command): void {
  program
    .command("asciipng")
    .argument("<prompt>", "text to render as pseudo-ASCII grid PNG")
    .description(
      "PNG from a character grid: local (no API) or Minimax text-only API + deterministic post-process (not raw image bytes).",
    )
    .option("--out <path>", "output path (default under artifacts/runs/…)")
    .option("--seed <number>", "seed", parseSeedOption)
    .option("--columns <n>", "grid width in characters", "60")
    .option("--rows <n>", "grid height in characters", "30")
    .option("--cell <n>", "pixel size per character cell", "4")
    .option(
      "--source <local|minimax>",
      "local: deterministic pseudo-glyph; minimax: call text chat, normalize lines, rasterize",
      "local",
    )
    .option(
      "--minimax-model <id>",
      "Minimax chat model id (default env WITTGENSTEIN_MINIMAX_MODEL or abab6.5s-chat-h)",
    )
    .option(
      "--dry-run",
      "skip Minimax HTTP when source=minimax (use local grid from prompt only); otherwise ignored for local",
    )
    .option("--config <path>", "config path")
    .action(async (prompt: string, options: AsciipngCommandOptions) => {
      const columns = Number.parseInt(options.columns ?? "60", 10);
      const rows = Number.parseInt(options.rows ?? "30", 10);
      const cell = Number.parseInt(options.cell ?? "4", 10);
      const source = options.source === "minimax" ? "minimax" : "local";

      if (source === "minimax" && !options.dryRun) {
        await ensureMinimaxApiKeyInteractive();
      }

      await runCodecCommand(
        {
          modality: "asciipng",
          prompt,
          columns: Number.isFinite(columns) ? columns : 60,
          rows: Number.isFinite(rows) ? rows : 30,
          cell: Number.isFinite(cell) ? cell : 4,
          source,
          ...(options.minimaxModel ? { minimaxModel: options.minimaxModel } : {}),
          out: options.out,
          seed: parseOptionalSeed(options.seed),
        },
        "wittgenstein asciipng",
        process.argv.slice(2),
        options,
      );
    });
}
