import type { Command } from "commander";
import type { RunManifest } from "@wittgenstein/schemas";
import {
  loadLlamagenDecoderBridge,
  type ImageDecoderBridge,
} from "@wittgenstein/codec-image";
import { readDecoderCacheDir } from "./decoder-manifest.js";
import {
  runCodecCommand,
  parseOptionalSeed,
  parseSeedOption,
  resolveExecutionRoot,
  type CommandRuntimeOptions,
} from "./shared.js";

interface ImageCommandOptions extends CommandRuntimeOptions {
  showImageCode?: boolean;
  showSemantic?: boolean;
  showSeedSummary?: boolean;
  allowResearchWeights?: boolean;
  decoder?: string;
}

export function registerImageCommand(program: Command): void {
  program
    .command("image")
    .argument("<prompt>", "user prompt")
    .description("Run the image codec")
    .option("--out <path>", "output path")
    .option("--seed <number>", "seed", parseSeedOption)
    .option("--dry-run", "skip the remote model call and exercise the manifest spine")
    .option("--show-image-code", "print the imageCode receipt that records the fired VSC path")
    .option("--show-semantic", "print the emitted/effective Semantic IR for inspection")
    .option("--show-seed-summary", "print a compact seed/VQ execution summary")
    .option(
      "--allow-research-weights",
      "allow research-only decoder weights for benchmarking per ADR-0020",
    )
    .option(
      "--decoder <family>",
      "decode latents with an installed decoder bridge instead of the placeholder renderer " +
        "(only `llamagen` ships; failures are typed and never fall back)",
    )
    .option("--config <path>", "config path")
    .action(async (prompt: string, options: ImageCommandOptions) => {
      const workspaceRoot = resolveExecutionRoot();
      const decoderCacheDir = readDecoderCacheDir(workspaceRoot);
      const loaded = await loadImageDecoderBridgeForRun({
        ...(options.decoder !== undefined ? { decoder: options.decoder } : {}),
        allowResearchWeights: options.allowResearchWeights ?? false,
        ...(decoderCacheDir !== undefined ? { cacheDir: decoderCacheDir } : {}),
      });
      if (loaded.error) {
        printImageDecoderError(loaded.error);
        process.exitCode = 1;
        return;
      }
      try {
        await runCodecCommand(
          {
            modality: "image",
            prompt,
            out: options.out,
            seed: parseOptionalSeed(options.seed),
            allowResearchWeights: options.allowResearchWeights,
          },
          "wittgenstein image",
          process.argv.slice(2),
          options,
          {
            inspect: ({ manifest }) => imageInspectionPayload(manifest, options),
          },
          loaded.bridge ? { decoderBridge: loaded.bridge } : undefined,
        );
      } finally {
        await loaded.bridge?.unload();
      }
    });
}

export function imageInspectionPayload(
  manifest: RunManifest,
  options: Pick<ImageCommandOptions, "showImageCode" | "showSemantic" | "showSeedSummary">,
): Record<string, unknown> | undefined {
  const payload: Record<string, unknown> = {};
  const imageCode = readImageCodeReceipt(manifest);

  if (options.showImageCode) {
    payload.imageCode = imageCode;
  }

  if (options.showSemantic) {
    payload.semantic = {
      source: readStringProperty(imageCode, "semanticSource") ?? "unknown",
      value: readSemanticLayer(manifest.llmOutputParsed),
    };
  }

  if (options.showSeedSummary) {
    payload.seedSummary = summarizeSeedPath(imageCode);
  }

  return Object.keys(payload).length > 0 ? payload : undefined;
}

function readImageCodeReceipt(manifest: RunManifest): Record<string, unknown> | null {
  const value = (manifest as RunManifest & Record<string, unknown>)["image.code"];
  return isRecord(value) ? value : null;
}

function summarizeSeedPath(imageCode: Record<string, unknown> | null): Record<string, unknown> {
  if (!imageCode) {
    return {
      path: null,
      seedFamily: null,
      seedMode: null,
      seedLength: null,
      coarseVqGrid: null,
      providerLatentGrid: null,
    };
  }

  return {
    path: readStringProperty(imageCode, "path"),
    seedFamily: readStringProperty(imageCode, "seedFamily"),
    seedMode: readStringProperty(imageCode, "seedMode"),
    seedLength: readNumberProperty(imageCode, "seedLength"),
    coarseVqGrid: imageCode.coarseVqGrid ?? null,
    providerLatentGrid: imageCode.providerLatentGrid ?? null,
  };
}

function readSemanticLayer(parsed: unknown): unknown {
  if (!isRecord(parsed)) {
    return null;
  }

  if (isRecord(parsed.semantic)) {
    return parsed.semantic;
  }

  const legacyKeys = ["intent", "subject", "composition", "lighting", "style", "constraints"];
  if (legacyKeys.some((key) => key in parsed)) {
    return Object.fromEntries(legacyKeys.map((key) => [key, parsed[key]]));
  }

  return null;
}

function readStringProperty(value: Record<string, unknown> | null, key: string): string | null {
  const property = value?.[key];
  return typeof property === "string" ? property : null;
}

function readNumberProperty(value: Record<string, unknown> | null, key: string): number | null {
  const property = value?.[key];
  return typeof property === "number" ? property : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Structured CLI error for the `--decoder` opt-in lane (mirrors install's shape). */
export interface ImageDecoderCliError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly installHint?: string;
}

export interface ImageDecoderLoadOutcome {
  readonly bridge?: ImageDecoderBridge;
  readonly error?: ImageDecoderCliError;
}

/**
 * Load the decoder bridge the `--decoder` flag opts into (S7b/S7c entry
 * layer). The codec owns the decode contract; the CLI owns loading and turns
 * loader failures into structured CLI errors before any LLM spend.
 */
export async function loadImageDecoderBridgeForRun(options: {
  decoder?: string;
  allowResearchWeights?: boolean;
  cacheDir?: string;
}): Promise<ImageDecoderLoadOutcome> {
  if (!options.decoder) {
    return {};
  }

  if (options.decoder !== "llamagen") {
    return {
      error: {
        code: "INVALID_IMAGE_DECODER",
        message: `Unknown decoder family "${options.decoder}"; only "llamagen" is shipped.`,
      },
    };
  }

  try {
    const bridge = await loadLlamagenDecoderBridge({
      ...(options.allowResearchWeights ? { allowResearchWeights: options.allowResearchWeights } : {}),
      ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    });
    return { bridge };
  } catch (error) {
    const shaped = error as Error & { code?: string; details?: Record<string, unknown> };
    const installHint =
      typeof shaped.details?.["installHint"] === "string" ? shaped.details["installHint"] : undefined;
    return {
      error: {
        code: typeof shaped.code === "string" ? shaped.code : "IMAGE_DECODER_LOAD_FAILED",
        message: shaped.message ?? "Failed to load the image decoder bridge.",
        ...(shaped.details !== undefined ? { details: shaped.details } : {}),
        ...(installHint !== undefined ? { installHint } : {}),
      },
    };
  }
}

function printImageDecoderError(error: ImageDecoderCliError): void {
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
