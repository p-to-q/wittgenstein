import { createHash } from "node:crypto";
import type {
  CostUsdReason,
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
import {
  decodeLatentsToRaster,
  toImageDecoderReceipt,
  type DecodeLatentsToRasterOptions,
} from "./pipeline/decoder.js";
import type { ImageDecoderBridge } from "./decoders/types.js";
import { packageRasterAsPng } from "./pipeline/package.js";
import { imageCodeReceipt } from "./image-code-receipt.js";
import type { ImageAdapterOutcome, ImageAdapterReceipt, ImageArtifact } from "./types.js";

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
    costUsd: number | null;
    costUsdReason?: CostUsdReason;
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
  /**
   * S7b DI seam: an already-loaded `ImageDecoderBridge` the caller
   * (CLI / entry layer) resolved and wants this decode to run through.
   * The codec never loads bridges itself and never parses env/config;
   * an injected bridge failure is a typed error, not a placeholder
   * fallback. Absent → the procedural placeholder lane runs as before.
   */
  readonly decoderBridge?: ImageDecoderBridge;
  /**
   * S7d recorded-generation seam: when present, `expand()` re-parses the
   * recorded LLM output instead of calling an LLM or the dry-run stub —
   * the VCR-style record/replay lane for `wittgenstein replay` (#384).
   * Priority: recorded > dry-run > live LLM. A recorded generation that
   * fails to parse is a typed `RECORDED_GENERATION_INVALID` error; the
   * codec never silently substitutes another scene source.
   */
  readonly recordedGeneration?: { readonly llmOutputRaw: string };
}

/**
 * Typed failure for `services.recordedGeneration` payloads that do not
 * parse as an `ImageSceneSpec`. Carries the parse issues for diagnostics;
 * callers (replay) map it to a manifest-level reporter code and MUST NOT
 * treat it as a cue to fall back to the dry-run stub scene.
 */
export class RecordedGenerationInvalidError extends Error {
  readonly code = "RECORDED_GENERATION_INVALID";
  readonly details: Record<string, unknown>;

  constructor(parseError: { message: string; details?: unknown }) {
    super(
      "Recorded LLM output does not parse as an ImageSceneSpec; refusing to substitute " +
        "another scene source for recorded-generation replay (S7d, #384).",
    );
    this.name = "WittgensteinError";
    this.details = {
      parseError: parseError.message,
      ...(parseError.details !== undefined ? { parseDetails: parseError.details } : {}),
    };
  }
}

interface AdaptedImagePayload {
  readonly scene: ImageSceneSpec;
  readonly latents: ImageLatentCodes;
  readonly adapterOutcome: ImageAdapterOutcome;
  readonly adapterReceipt: ImageAdapterReceipt;
  readonly promptExpanded: string;
  readonly llmOutputRaw: string;
  readonly llmTokens: { input: number; output: number };
  readonly costUsd: number | null;
  readonly costUsdReason?: CostUsdReason;
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
  costUsd: number | null;
  costUsdReason?: CostUsdReason;
} {
  if (!codecV2.isTextIR(ir) || !ir.plan) {
    throw new Error("ImageCodec expected TextIR with ImageSceneSpec plan.");
  }
  return ir.plan as {
    scene: ImageSceneSpec;
    promptExpanded: string;
    llmOutputRaw: string;
    llmTokens: { input: number; output: number };
    costUsd: number | null;
    costUsdReason?: CostUsdReason;
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

    // S7d recorded-generation replay: re-parse the recorded generation
    // (priority: recorded > dry-run > live LLM). The LLM stage is frozen
    // like a VCR cassette — no LLM call, no stub substitution, and a
    // recorded generation that fails to parse is a typed refusal.
    if (services.recordedGeneration) {
      const llmOutputRaw = services.recordedGeneration.llmOutputRaw;
      const parsedRecorded = parseImageSceneSpec(llmOutputRaw);
      if (!parsedRecorded.ok) {
        throw new RecordedGenerationInvalidError(parsedRecorded.error);
      }
      await services.telemetry?.writeText("llm-output.txt", llmOutputRaw);
      return {
        kind: "text",
        text: llmOutputRaw,
        plan: {
          scene: parsedRecorded.value,
          promptExpanded,
          llmOutputRaw,
          llmTokens: { input: 0, output: 0 },
          costUsd: null,
          costUsdReason: "no-llm-call",
        },
      };
    }

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
          costUsd: null,
          costUsdReason: "no-llm-call",
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
        ...(generation.costUsdReason ? { costUsdReason: generation.costUsdReason } : {}),
      },
    };
  }

  protected override async adapt(ir: codecV2.IR, ctx: codecV2.HarnessCtx): Promise<codecV2.IR> {
    const expanded = asScenePlan(ir);
    const { latents, outcome, receipt } = await adaptSceneToLatents(
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
        adapterReceipt: receipt,
        promptExpanded: expanded.promptExpanded,
        llmOutputRaw: expanded.llmOutputRaw,
        llmTokens: expanded.llmTokens,
        costUsd: expanded.costUsd,
        ...(expanded.costUsdReason ? { costUsdReason: expanded.costUsdReason } : {}),
      } satisfies AdaptedImagePayload,
    };
  }

  protected override async decode(ir: codecV2.IR, ctx: codecV2.HarnessCtx): Promise<ImageArtifact> {
    if (!codecV2.isHybridIR(ir)) {
      throw new Error("ImageCodec expected HybridIR after adapt().");
    }
    // Phase-scoped duration: `ctx.clock.now()` returns epoch milliseconds, not
    // an elapsed value. Recording it directly (previous bug) wrote ~1.75e12
    // into `durationMs` and polluted manifest telemetry. Match codec-audio's
    // pattern: capture at phase entry, record elapsed ms at phase exit.
    const startedAt = ctx.clock.now();
    const payload = asPayload(ir.latent);
    const imageCode = imageCodeReceipt(payload.scene);
    const services = asServices(ctx.services);
    const bridge = services.decoderBridge;
    const raster = await decodeLatentsToRaster(
      payload.latents,
      this.createRenderCtx(ctx, codecV2.CodecPhase.Decode),
      bridge ? { bridge } : undefined,
    );
    if (raster.bridge) {
      for (const warning of raster.bridge.warnings) {
        ctx.sidecar.warnings.push({
          code: warning.code,
          message: warning.message,
          ...(warning.detail !== undefined ? { detail: warning.detail } : {}),
          phase: codecV2.CodecPhase.Decode,
        });
      }
    }

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
        ...(payload.costUsdReason ? { costUsdReason: payload.costUsdReason } : {}),
        durationMs: Math.max(0, ctx.clock.now() - startedAt),
        seed: ctx.seed,
        promptExpanded: payload.promptExpanded,
        llmOutputRaw: payload.llmOutputRaw,
        llmOutputParsed: payload.scene,
        imageCode,
        adapterOutcome: payload.adapterOutcome,
        adapterReceipt: payload.adapterReceipt,
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
        decoderHash: raster.bridge
          ? { value: raster.bridge.decoderHash, frozen: true, slot: raster.bridge.decoderId }
          : { value: hashString("LFQ-family-decoder"), frozen: true, slot: "LFQ-family-decoder" },
        ...(raster.bridge ? { decoderReceipt: toImageDecoderReceipt(raster.bridge) } : {}),
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
      { key: "image.adapter", value: art.metadata.adapterReceipt },
      { key: "quality.structural", value: art.metadata.quality.structural },
      { key: "quality.partial", value: art.metadata.quality.partial },
      { key: "metadata.warnings", value: art.metadata.warnings.length },
      { key: "L4.adapterHash", value: art.metadata.adapterHash },
      { key: "L5.decoderHash", value: art.metadata.decoderHash },
      // S7b: lane + bridge identity row, emitted only for bridge-backed
      // runs so the placeholder lane's row set stays byte-identical
      // (golden untouched).
      ...(art.metadata.decoderReceipt
        ? [{ key: "image.decoder" as const, value: art.metadata.decoderReceipt }]
        : []),
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
  async render(
    parsed: ImageSceneSpec,
    ctx: RenderCtx,
    options?: DecodeLatentsToRasterOptions,
  ): Promise<RenderResult> {
    return renderImagePipeline(parsed, ctx, options);
  },
};
