import type { Command } from "commander";
import {
  DecoderFamilySchema,
  ImageVisualSeedCodeSchema,
  placeholderSeedExpander,
  tileMosaicSeedExpander,
  type ImageSceneSpec,
  type SeedExpander,
} from "@wittgenstein/codec-image";

interface DryExpandOptions {
  seedCode: string;
  grid: string;
  seed?: string;
  family?: string;
  mode?: string;
  decoderFamily?: string;
  codebook?: string;
  codebookVersion?: string;
  expander?: string;
  ascii?: boolean;
}

/**
 * `wittgenstein image-dry-expand` — offline inspection of what a SeedExpander
 * would emit for a given Visual Seed Code, without invoking the harness, the
 * LLM, or the decoder. Exists so VSC research and prompt-stack iteration can
 * see the deterministic output of the placeholder / tile-mosaic expanders
 * without scheduling a full run.
 *
 * Lane 1D of the #251 forward-program package. Pure observability — does not
 * change codec or harness behavior.
 *
 * Output is JSON on stdout (or an ASCII grid view with `--ascii`); both forms
 * are deterministic for a fixed `(seedCode, decoder, seed, expander)` tuple
 * since the expanders themselves are deterministic.
 */
export function registerImageDryExpandCommand(program: Command): void {
  program
    .command("image-dry-expand")
    .description(
      "Offline preview of SeedExpander output for a given Visual Seed Code (no harness, no decoder).",
    )
    .requiredOption("--seed-code <json>", "JSON array of seed code tokens, e.g. '[3,17,9,220]'")
    .requiredOption("--grid <WxH>", "target latent grid, e.g. '4x4' or '8x4'")
    .option("--seed <number>", "per-spec deterministic seed", "0")
    .option("--family <name>", "seedCode family", "vqvae")
    .option("--mode <name>", "seedCode mode (prefix | full | …)", "prefix")
    .option("--decoder-family <name>", "decoder family hint", "llamagen")
    .option("--codebook <name>", "decoder codebook name", "stub-codebook")
    .option("--codebook-version <name>", "decoder codebook version", "v0")
    .option("--expander <name>", "expander to invoke (placeholder | tile-mosaic)", "placeholder")
    .option("--ascii", "print a fixed-width ASCII token grid instead of JSON")
    .action((options: DryExpandOptions) => {
      try {
        runDryExpand(options);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`image-dry-expand: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

function runDryExpand(options: DryExpandOptions): void {
  const tokens = parseSeedCodeTokens(options.seedCode);
  const [width, height] = parseGrid(options.grid);
  const seed = parseSeed(options.seed);
  const expander = pickExpander(options.expander ?? "placeholder");

  const seedCode = ImageVisualSeedCodeSchema.parse({
    family: options.family ?? "vqvae",
    mode: options.mode ?? "prefix",
    tokens,
  });

  const decoderFamilyParse = DecoderFamilySchema.safeParse(options.decoderFamily ?? "llamagen");
  if (!decoderFamilyParse.success) {
    throw new Error(
      `--decoder-family must be one of ${DecoderFamilySchema.options.join(", ")}. Got: ${options.decoderFamily}`,
    );
  }
  const decoder: ImageSceneSpec["decoder"] = {
    family: decoderFamilyParse.data,
    codebook: options.codebook ?? "stub-codebook",
    codebookVersion: options.codebookVersion ?? "v0",
    latentResolution: [width, height],
  };

  const result = expander.expander.expand({ seedCode, decoder, seed });

  if (options.ascii) {
    process.stdout.write(`expander: ${expander.name}\n`);
    process.stdout.write(`seedCode: ${seedCode.family} ${seedCode.mode} ${JSON.stringify(seedCode.tokens)}\n`);
    process.stdout.write(
      `decoder: ${decoder.family}/${decoder.codebook}/${decoder.codebookVersion} ${width}x${height}\n`,
    );
    process.stdout.write(`seed: ${seed}\n`);
    process.stdout.write(`grid (codebook indices):\n`);
    const cellWidth = Math.max(4, String(Math.max(...result.tokens)).length + 1);
    for (let y = 0; y < height; y += 1) {
      const cells: string[] = [];
      for (let x = 0; x < width; x += 1) {
        const value = result.tokens[y * width + x] ?? 0;
        cells.push(String(value).padStart(cellWidth, " "));
      }
      process.stdout.write(`${cells.join("")}\n`);
    }
    return;
  }

  const payload = {
    expander: expander.name,
    seedCode: {
      family: seedCode.family,
      mode: seedCode.mode,
      tokens: seedCode.tokens,
    },
    decoder,
    seed,
    tokens: chunkRowMajor(result.tokens, width),
  };
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function parseSeedCodeTokens(raw: string): number[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`--seed-code must be a JSON array, got: ${raw}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`--seed-code must be a JSON array, got: ${raw}`);
  }
  if (parsed.length === 0) {
    throw new Error("--seed-code must contain at least one token.");
  }
  if (!parsed.every((value) => typeof value === "number" && Number.isFinite(value))) {
    throw new Error("--seed-code tokens must all be finite numbers.");
  }
  return parsed as number[];
}

function parseGrid(raw: string): [number, number] {
  const match = /^([0-9]+)x([0-9]+)$/i.exec(raw.trim());
  if (!match) {
    throw new Error(`--grid must be of the form WxH (e.g. 4x4), got: ${raw}`);
  }
  const width = Number.parseInt(match[1]!, 10);
  const height = Number.parseInt(match[2]!, 10);
  if (width <= 0 || height <= 0) {
    throw new Error(`--grid dimensions must be positive integers, got: ${raw}`);
  }
  return [width, height];
}

function parseSeed(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 0;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`--seed must be an integer, got: ${raw}`);
  }
  return value;
}

interface NamedExpander {
  readonly name: "placeholder" | "tile-mosaic";
  readonly expander: SeedExpander;
}

function pickExpander(name: string): NamedExpander {
  if (name === "placeholder") return { name: "placeholder", expander: placeholderSeedExpander };
  if (name === "tile-mosaic") return { name: "tile-mosaic", expander: tileMosaicSeedExpander };
  throw new Error(`--expander must be one of: placeholder, tile-mosaic. Got: ${name}`);
}

function chunkRowMajor(tokens: readonly number[], width: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < tokens.length; i += width) {
    rows.push(tokens.slice(i, i + width));
  }
  return rows;
}
