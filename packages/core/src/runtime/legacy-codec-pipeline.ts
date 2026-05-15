import type {
  LlmConfig,
  RunManifest,
  SvgEngineConfig,
  WittgensteinRequest,
} from "@wittgenstein/schemas";
import type { LlmGenerationResult } from "../llm/adapter.js";
import { generateAsciipngFromMinimax } from "./asciipng-minimax.js";
import { ValidationError } from "./errors.js";
import { generateSvgFromEngine } from "./svg-generation.js";
import { buildSvgLocalGeneration } from "./svg-local.js";
import { buildVideoCompositionFromInlineSvgs } from "./video-inline-svgs.js";

interface LegacyCodecRunOptions {
  readonly dryRun?: boolean;
}

export interface LegacyCodecGenerationServices {
  readonly llmConfig: LlmConfig;
  readonly svgConfig: SvgEngineConfig;
  generateStructured(promptExpanded: string, seed: number | null): Promise<LlmGenerationResult>;
}

export async function generateLegacyCodecInput(
  request: WittgensteinRequest,
  options: LegacyCodecRunOptions,
  promptExpanded: string | null,
  seed: number | null,
  services: LegacyCodecGenerationServices,
): Promise<LlmGenerationResult> {
  if (request.modality === "asciipng" && request.source === "minimax" && !options.dryRun) {
    return generateAsciipngFromMinimax(
      request,
      promptExpanded ?? request.prompt,
      seed,
      services.llmConfig,
    );
  }

  if (request.modality === "asciipng") {
    return buildAsciiPngGeneration(request);
  }

  if (
    request.modality === "video" &&
    Array.isArray(request.inlineSvgs) &&
    request.inlineSvgs.length > 0
  ) {
    return buildVideoCompositionFromInlineSvgs(request);
  }

  if (request.modality === "svg" && request.source === "local") {
    return buildSvgLocalGeneration(request);
  }

  if (options.dryRun) {
    return createDryRunGeneration(request);
  }

  if (request.modality === "svg") {
    return generateSvgFromEngine(promptExpanded ?? request.prompt, seed, services.svgConfig);
  }

  return services.generateStructured(promptExpanded ?? request.prompt, seed);
}

export function applyLegacyProviderReceipt(
  manifest: RunManifest,
  request: WittgensteinRequest,
  generation: LlmGenerationResult,
  svgInferenceUrl: string,
): void {
  if (request.modality === "svg") {
    const raw = generation.raw;
    if (
      raw &&
      typeof raw === "object" &&
      "svgLocal" in raw &&
      (raw as { svgLocal?: boolean }).svgLocal === true
    ) {
      manifest.llmProvider = "svg-local";
      manifest.llmModel = "geometry-from-prompt";
    } else {
      manifest.llmProvider = "svg-engine";
      manifest.llmModel = svgInferenceUrl;
    }
  }

  if (request.modality === "asciipng" && request.source === "minimax") {
    manifest.llmProvider = "minimax";
    manifest.llmModel =
      request.minimaxModel?.trim() ||
      process.env.WITTGENSTEIN_MINIMAX_MODEL?.trim() ||
      "abab6.5s-chat-h";
  } else if (request.modality === "asciipng") {
    manifest.llmProvider = "local-asciipng";
    manifest.llmModel = "pseudo-ascii-raster";
  }

  if (request.modality === "video") {
    const raw = generation.raw;
    if (
      raw &&
      typeof raw === "object" &&
      "videoInlineSvgs" in raw &&
      (raw as { videoInlineSvgs?: boolean }).videoInlineSvgs === true
    ) {
      manifest.llmProvider = "inline-svgs";
      manifest.llmModel = "filesystem";
    }
  }
}

function buildAsciiPngGeneration(request: WittgensteinRequest): LlmGenerationResult {
  if (request.modality !== "asciipng") {
    throw new ValidationError("buildAsciiPngGeneration called for non-asciipng request.");
  }
  const ir = {
    text: request.prompt.slice(0, 2000),
    columns: request.columns,
    rows: request.rows,
    cell: request.cell,
    glyphMode: "pseudo" as const,
  };
  return {
    text: JSON.stringify(ir),
    tokens: { input: 0, output: 0 },
    costUsd: null,
    costUsdReason: "no-llm-call",
    raw: { asciiPngLocal: true },
  };
}

function createDryRunGeneration(request: WittgensteinRequest): LlmGenerationResult {
  if (request.modality === "svg") {
    return {
      ...buildSvgLocalGeneration(request),
      raw: { dryRun: true, svgLocal: true },
    };
  }

  if (
    request.modality !== "video" &&
    request.modality !== "sensor" &&
    request.modality !== "asciipng"
  ) {
    const scene = {
      intent: "Photorealistic wildlife portrait suitable for print",
      subject: request.prompt,
      composition: {
        framing: "tight portrait on subject",
        camera: "telephoto compression, shallow depth of field",
        depthPlan: ["sharp subject", "soft bokeh", "clean background"],
      },
      lighting: { mood: "natural soft daylight", key: "diffused key, gentle fill" },
      style: {
        references: ["wildlife photography", "fine-art nature print"],
        palette: ["neutral grey", "natural fur tones", "cool water highlights"],
      },
      decoder: {
        family: "llamagen" as const,
        codebook: "stub-codebook",
        latentResolution: [32, 32] as [number, number],
      },
    };

    return {
      text: JSON.stringify(scene),
      tokens: {
        input: 0,
        output: 0,
      },
      costUsd: null,
      costUsdReason: "no-llm-call",
      raw: {
        dryRun: true,
      },
    };
  }

  return {
    text: "{}",
    tokens: {
      input: 0,
      output: 0,
    },
    costUsd: null,
    costUsdReason: "no-llm-call",
    raw: {
      dryRun: true,
    },
  };
}
