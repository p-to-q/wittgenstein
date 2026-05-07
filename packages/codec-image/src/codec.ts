import { createHash } from "node:crypto";
import type {
  ImageRequest,
  RenderCtx,
  RenderResult,
  WittgensteinCodec,
} from "@wittgenstein/schemas";
import { Modality, codecV2 } from "@wittgenstein/schemas";
import {
  ImageRequestSchema,
  ImageSceneSpecSchema,
  imageSchemaPreamble,
  parseImageSceneSpec,
  type ImageLatentCodes,
  type ImageSceneSpec,
} from "./schema.js";
import { renderImagePipeline } from "./pipeline/index.js";
import { adaptSceneToLatents } from "./pipeline/adapter.js";
import { decodeLatentsToRaster } from "./pipeline/decoder.js";
import { packageRasterAsPng } from "./pipeline/package.js";
import { imageCodeReceipt } from "./image-code-receipt.js";
import type { ImageAdapterOutcome, ImageArtifact } from "./types.js";

interface ImageCodecLlmService {
  readonly provider: string;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly temperature: number;
  generate(request: {
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    model: string;
    maxOutputTokens: number;
    temperature: number;
    seed: number | null;
    responseFormat?: "json" | "text";
  }): Promise<{
    text: string;
    tokens: { input: number; output: number };
    costUsd: number;
    raw?: unknown;
  }>;
}

interface ImageCodecTelemetryService {
  writeText(name: string, value: string): Promise<void>;
}

interface ImageCodecServices {
  readonly llm?: ImageCodecLlmService;
  readonly telemetry?: ImageCodecTelemetryService;
  readonly dryRun?: boolean;
}

interface AdaptedImagePayload {
  readonly scene: ImageSceneSpec;
  readonly latents: ImageLatentCodes;
  readonly adapterOutcome: ImageAdapterOutcome;
  readonly promptExpanded: string;
  readonly llmOutputRaw: string;
  readonly llmTokens: { input: number; output: number };
  readonly costUsd: number;
}

const standardSchema = toStandardSchema(ImageRequestSchema);

function injectSchemaPreamble(prompt: string, schemaPreamble: string): string {
  return [
    "You are Wittgenstein.",
    "Return valid JSON only.",
    schemaPreamble.trim(),
    `User prompt:\n${prompt.trim()}`,
  ].join("\n\n");
}

function toStandardSchema(
  schema: typeof ImageRequestSchema,
): codecV2.StandardSchemaV1<unknown, ImageRequest> {
  const maybeStandard = (
    schema as typeof schema & {
      ["~standard"]?: codecV2.StandardSchemaV1<unknown, ImageRequest>["~standard"];
    }
  )["~standard"];
  if (maybeStandard) {
    return { "~standard": maybeStandard };
  }
  return {
    "~standard": {
      version: 1,
      vendor: "zod",
      validate: (value) => {
        const parsed = schema.safeParse(value);
        if (parsed.success) {
          return { value: parsed.data };
        }
        return {
          issues: parsed.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path,
          })),
        };
      },
    },
  };
}

function hashString(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function dryRunSeedTokens(prompt: string, length = 32): number[] {
  const digest = createHash("sha256").update(prompt, "utf8").digest();
  return Array.from({ length }, (_, index) => digest[index % digest.length] ?? 0);
}

function createDryRunScene(req: ImageRequest): ImageSceneSpec {
  const raw = JSON.stringify({
    mode: "one-shot-vsc",
    semantic: {
      intent: "Dry-run Visual Seed Code plan",
      subject: req.prompt,
      composition: {
        framing: "centered subject",
        camera: "neutral camera",
        depthPlan: ["foreground", "midground", "background"],
      },
      lighting: { mood: "neutral", key: "soft" },
      style: {
        references: ["local deterministic preview"],
        palette: ["neutral grey", "soft blue", "warm highlight"],
      },
      constraints: {
        mustHave: [],
        negative: [],
      },
    },
    seedCode: {
      schemaVersion: "witt.image.seed/v0.1",
      family: "witt-dry-run",
      mode: "prefix",
      length: 32,
      tokens: dryRunSeedTokens(req.prompt, 32),
    },
    decoder: {
      family: "llamagen",
      codebook: "stub-codebook",
      codebookVersion: "v0",
      latentResolution: [32, 32],
    },
  });
  const parsed = parseImageSceneSpec(raw);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return parsed.value;
}

function asServices(services: codecV2.HarnessCtx["services"]): ImageCodecServices {
  return (services ?? {}) as ImageCodecServices;
}

function asPayload(latent: unknown): AdaptedImagePayload {
  return latent as AdaptedImagePayload;
}

function asScenePlan(ir: codecV2.IR): {
  scene: ImageSceneSpec;
  promptExpanded: string;
  llmOutputRaw: string;
  llmTokens: { input: number; output: number };
  costUsd: number;
} {
  if (!codecV2.isTextIR(ir) || !ir.plan) {
    throw new Error("ImageCodec expected TextIR with ImageSceneSpec plan.");
  }
  return ir.plan as {
    scene: ImageSceneSpec;
    promptExpanded: string;
    llmOutputRaw: string;
    llmTokens: { input: number; output: number };
    costUsd: number;
  };
}

export class ImageCodec extends codecV2.BaseCodec<ImageRequest, ImageArtifact> {
  readonly name = "image";
  readonly id = "image";
  readonly modality = Modality.Image;
  readonly schema = standardSchema;
  readonly routes: ReadonlyArray<codecV2.Route<ImageRequest>> = [
    { id: "raster", match: () => true },
  ];

  readonly warnings = {
    palette_overflow: "image/palette-overflow",
    provider_latents_invalid: "image/provider-latents-invalid",
    coarse_vq_invalid: "image/coarse-vq-invalid",
    seed_code_invalid: "image/seed-code-invalid",
    adapter_stub: "image/adapter-stub",
    decoder_reference_bridge: "image/decoder-reference-bridge",
    decoder_placeholder: "image/decoder-placeholder",
    decoder_fallback: "image/decoder-fallback",
  } as const;

  protected override async expand(req: ImageRequest, ctx: codecV2.HarnessCtx): Promise<codecV2.IR> {
    const services = asServices(ctx.services);
    const promptExpanded = injectSchemaPreamble(req.prompt, imageSchemaPreamble(req));
    await services.telemetry?.writeText("llm-input.txt", promptExpanded);

    if (services.dryRun) {
      const scene = createDryRunScene(req);
      const llmOutputRaw = JSON.stringify(scene);
      await services.telemetry?.writeText("llm-output.txt", llmOutputRaw);
      return {
        kind: "text",
        text: llmOutputRaw,
        plan: {
          scene,
          promptExpanded,
          llmOutputRaw,
          llmTokens: { input: 0, output: 0 },
          costUsd: 0,
        },
      };
    }

    if (!services.llm) {
      throw new Error("ImageCodec requires an LLM service for non-dry-run execution.");
    }

    const generation = await services.llm.generate({
      model: services.llm.model,
      maxOutputTokens: services.llm.maxOutputTokens,
      temperature: services.llm.temperature,
      seed: ctx.seed,
      responseFormat: "json",
      messages: [
        {
          role: "system",
          content: "Return JSON only. Do not wrap it in markdown.",
        },
        {
          role: "user",
          content: promptExpanded,
        },
      ],
    });

    await services.telemetry?.writeText("llm-output.txt", generation.text);
    const parsed = parseImageSceneSpec(generation.text);
    if (!parsed.ok) {
      throw new Error(parsed.error.message);
    }

    return {
      kind: "text",
      text: generation.text,
      plan: {
        scene: parsed.value,
        promptExpanded,
        llmOutputRaw: generation.text,
        llmTokens: generation.tokens,
        costUsd: generation.costUsd,
      },
    };
  }

  protected override async adapt(ir: codecV2.IR, ctx: codecV2.HarnessCtx): Promise<codecV2.IR> {
    const expanded = asScenePlan(ir);
    const { latents, outcome } = await adaptSceneToLatents(
      expanded.scene,
      this.createRenderCtx(ctx, codecV2.CodecPhase.Adapt),
    );

    return {
      kind: "hybrid",
      text: expanded.llmOutputRaw,
      latent: {
        scene: expanded.scene,
        latents,
        adapterOutcome: outcome,
        promptExpanded: expanded.promptExpanded,
        llmOutputRaw: expanded.llmOutputRaw,
        llmTokens: expanded.llmTokens,
        costUsd: expanded.costUsd,
      } satisfies AdaptedImagePayload,
    };
  }

  protected override async decode(ir: codecV2.IR, ctx: codecV2.HarnessCtx): Promise<ImageArtifact> {
    if (!codecV2.isHybridIR(ir)) {
      throw new Error("ImageCodec expected HybridIR after adapt().");
    }
    const payload = asPayload(ir.latent);
    const imageCode = imageCodeReceipt(payload.scene);
    const raster = await decodeLatentsToRaster(
      payload.latents,
      this.createRenderCtx(ctx, codecV2.CodecPhase.Decode),
    );

    return {
      outPath: ctx.outPath,
      bytes: raster.pngBytes,
      mime: "image/png",
      width: raster.width,
      height: raster.height,
      metadata: {
        codec: "image",
        route: "raster",
        warnings: [],
        llmTokens: payload.llmTokens,
        costUsd: payload.costUsd,
        durationMs: Math.max(0, ctx.clock.now()),
        seed: ctx.seed,
        promptExpanded: payload.promptExpanded,
        llmOutputRaw: payload.llmOutputRaw,
        llmOutputParsed: payload.scene,
        imageCode,
        adapterOutcome: payload.adapterOutcome,
        quality: {
          structural: {
            schemaValidated: true,
            route: "raster",
            imageCode,
            paletteCount: payload.scene.style.palette.length,
            palette: [...payload.scene.style.palette],
          },
          partial: {
            reason: "adapter-stub",
          },
        },
        adapterHash: hashString("image-adapter-stub"),
        decoderHash: {
          value: hashString("LFQ-family-decoder"),
          frozen: true,
          slot: "LFQ-family-decoder",
        },
        artifactSha256: hashBytes(raster.pngBytes),
      },
    };
  }

  protected override async package(
    art: ImageArtifact,
    ctx: codecV2.HarnessCtx,
  ): Promise<ImageArtifact> {
    return super.package(await packageRasterAsPng(art, ctx), ctx);
  }

  manifestRows(art: ImageArtifact): ReadonlyArray<codecV2.ManifestRow> {
    return [
      { key: "route", value: art.metadata.route },
      { key: "renderPath", value: art.metadata.adapterOutcome },
      { key: "image.code", value: art.metadata.imageCode },
      { key: "quality.structural", value: art.metadata.quality.structural },
      { key: "quality.partial", value: art.metadata.quality.partial },
      { key: "metadata.warnings", value: art.metadata.warnings.length },
      { key: "L4.adapterHash", value: art.metadata.adapterHash },
      { key: "L5.decoderHash", value: art.metadata.decoderHash },
      { key: "artifact.sha256", value: art.metadata.artifactSha256 },
    ];
  }

  private createRenderCtx(ctx: codecV2.HarnessCtx, phase: codecV2.CodecPhase): RenderCtx {
    return {
      runId: ctx.runId,
      runDir: ctx.runDir,
      seed: ctx.seed,
      outPath: ctx.outPath,
      logger: {
        debug: (message, data) => ctx.logger.debug(message, data),
        info: (message, data) => ctx.logger.info(message, data),
        warn: (message, data) => {
          ctx.logger.warn(message, data);
          const code = this.warningCodeFor(message);
          if (!code) {
            return;
          }
          ctx.sidecar.warnings.push({ code, message, detail: data, phase });
        },
        error: (message, data) => ctx.logger.error(message, data),
      },
    };
  }

  private warningCodeFor(message: string): string | null {
    if (message.includes("providerLatents failed validation")) {
      return this.warnings.provider_latents_invalid;
    }
    if (message.includes("coarseVq failed validation")) {
      return this.warnings.coarse_vq_invalid;
    }
    if (message.includes("seedCode failed validation")) {
      return this.warnings.seed_code_invalid;
    }
    if (message.includes("Using placeholder seed-expansion adapter")) {
      return this.warnings.adapter_stub;
    }
    if (message.includes("Using narrow-domain reference decoder bridge")) {
      return this.warnings.decoder_reference_bridge;
    }
    if (message.includes("Using dense placeholder frozen-decoder bridge")) {
      return this.warnings.decoder_placeholder;
    }
    if (message.includes("Reference decoder bridge unavailable")) {
      return this.warnings.decoder_fallback;
    }
    return null;
  }
}

export const imageV2Codec = new ImageCodec();

export const imageCodec: WittgensteinCodec<ImageRequest, ImageSceneSpec> = {
  name: "image",
  modality: Modality.Image,
  schemaPreamble: imageSchemaPreamble,
  requestSchema: ImageRequestSchema,
  outputSchema: ImageSceneSpecSchema,
  parse: parseImageSceneSpec,
  async render(parsed: ImageSceneSpec, ctx: RenderCtx): Promise<RenderResult> {
    return renderImagePipeline(parsed, ctx);
  },
};
