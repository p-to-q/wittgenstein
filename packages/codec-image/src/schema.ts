import { z } from "zod";
import type { ImageRequest, Result } from "@wittgenstein/schemas";
import { ImageRequestSchema } from "@wittgenstein/schemas";

export const DecoderFamilySchema = z.enum(["llamagen", "seed", "dvae"]);
export type DecoderFamily = z.infer<typeof DecoderFamilySchema>;
export const ImageSceneSpecVersionSchema = z.literal("witt.image.spec/v0.1");
export const ImageSeedCodeVersionSchema = z.literal("witt.image.seed/v0.1");
export const ImageCoarseVqVersionSchema = z.literal("witt.image.coarse-vq/v0.1");
export const ImageCodeModeSchema = z.enum([
  "semantic-only",
  "one-shot-vsc",
  "two-pass-compile",
  "provider-latents",
]);

/** Discrete latent codes consumed by the frozen decoder bridge (also used for MiniMax / provider-included latents). */
export const ImageLatentCodesSchema = z
  .object({
    schemaVersion: z.literal("witt.image.latents/v0.1"),
    family: DecoderFamilySchema,
    codebook: z.string().min(1),
    codebookVersion: z.string().min(1),
    tokenGrid: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    tokens: z.array(z.number().int().nonnegative()),
  })
  .superRefine((value, ctx) => {
    const [width, height] = value.tokenGrid;
    if (value.tokens.length !== width * height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tokens"],
        message: "tokens length must match tokenGrid area.",
      });
    }
  });
export type ImageLatentCodes = z.infer<typeof ImageLatentCodesSchema>;

const ImageSemanticLayerSchema = z.object({
  intent: z.string().default("placeholder scene"),
  subject: z.string().default("placeholder subject"),
  composition: z
    .object({
      framing: z.string().default("medium shot"),
      camera: z.string().default("neutral camera"),
      depthPlan: z.array(z.string()).default(["foreground", "midground", "background"]),
    })
    .default({}),
  lighting: z
    .object({
      mood: z.string().default("neutral"),
      key: z.string().default("soft"),
    })
    .default({}),
  style: z
    .object({
      references: z.array(z.string()).default([]),
      palette: z.array(z.string()).default(["black", "white"]),
    })
    .default({}),
  constraints: z
    .object({
      mustHave: z.array(z.string()).default([]),
      negative: z.array(z.string()).default([]),
    })
    .default({}),
});

export const ImageVisualSeedCodeSchema = z
  .object({
    schemaVersion: ImageSeedCodeVersionSchema.default("witt.image.seed/v0.1"),
    family: z.string().min(1).default("vqvae"),
    mode: z.enum(["prefix", "coarse-scale", "residual", "lexical"]).default("prefix"),
    tokenizer: z.string().min(1).optional(),
    length: z.number().int().positive().optional(),
    tokens: z.array(z.number().int().nonnegative()).min(1),
  })
  .superRefine((value, ctx) => {
    if (value.length !== undefined && value.length !== value.tokens.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["length"],
        message: "length must match tokens length when provided.",
      });
    }
  });
export type ImageVisualSeedCode = z.infer<typeof ImageVisualSeedCodeSchema>;

export const ImageCoarseVqSchema = z
  .object({
    schemaVersion: ImageCoarseVqVersionSchema.default("witt.image.coarse-vq/v0.1"),
    family: DecoderFamilySchema,
    codebook: z.string().min(1),
    codebookVersion: z.string().min(1),
    tokenGrid: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    tokens: z.array(z.number().int().nonnegative()).min(1),
  })
  .superRefine((value, ctx) => {
    const [width, height] = value.tokenGrid;
    if (value.tokens.length !== width * height) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tokens"],
        message: "tokens length must match tokenGrid area.",
      });
    }
  });
export type ImageCoarseVq = z.infer<typeof ImageCoarseVqSchema>;

export const ImageSceneSpecSchema = z.object({
  schemaVersion: ImageSceneSpecVersionSchema.default("witt.image.spec/v0.1"),
  mode: ImageCodeModeSchema.optional(),
  semantic: ImageSemanticLayerSchema.optional(),
  intent: ImageSemanticLayerSchema.shape.intent,
  subject: ImageSemanticLayerSchema.shape.subject,
  composition: ImageSemanticLayerSchema.shape.composition,
  lighting: ImageSemanticLayerSchema.shape.lighting,
  style: ImageSemanticLayerSchema.shape.style,
  decoder: z
    .object({
      family: DecoderFamilySchema.default("llamagen"),
      codebook: z.string().default("stub-codebook"),
      codebookVersion: z.string().default("v0"),
      latentResolution: z
        .tuple([z.number().int().positive(), z.number().int().positive()])
        .default([32, 32]),
    })
    .default({}),
  constraints: ImageSemanticLayerSchema.shape.constraints,
  renderHints: z
    .object({
      detailLevel: z.enum(["low", "medium", "high"]).default("medium"),
      tokenBudget: z.number().int().positive().default(1024),
      seed: z.number().int().nullable().default(null),
    })
    .default({}),
  seedCode: ImageVisualSeedCodeSchema.optional(),
  coarseVq: ImageCoarseVqSchema.optional(),
  /** When set (e.g. MiniMax returns VQ indices), the harness skips the learned adapter and validates these latents. */
  providerLatents: ImageLatentCodesSchema.optional(),
});

export type ImageSceneSpec = z.infer<typeof ImageSceneSpecSchema>;

export function imageSchemaPreamble(req: ImageRequest): string {
  const requestedSize = req.size ? `${req.size[0]}x${req.size[1]}` : "unspecified";

  return [
    "Emit a JSON Visual Seed Code contract for the sole neural image pipeline.",
    "Prefer seedCode as the primary decoder-facing output.",
    "Use Semantic IR to organize concepts, expose the user-facing plan, and optionally condition seed expansion.",
    "Optional coarseVq hints may be included when you can provide stable partial VQ structure.",
    "Use providerLatents only when you can emit decoder-native latent tokens directly.",
    "Do not emit SVG, HTML, Canvas commands, or pixel arrays.",
    `Requested output size: ${requestedSize}.`,
    `Requested seed: ${req.seed ?? "null"}.`,
  ].join("\n");
}

function normalizeImageSceneSpec(spec: ImageSceneSpec): ImageSceneSpec {
  const semanticDefaults = {
    intent: spec.intent,
    subject: spec.subject,
    composition: spec.composition,
    lighting: spec.lighting,
    style: spec.style,
    constraints: spec.constraints,
  };
  const semantic = spec.semantic;
  const effectiveSemantic = semantic ?? semanticDefaults;

  const mode =
    spec.mode ??
    (spec.providerLatents
      ? "provider-latents"
      : spec.seedCode || spec.coarseVq
        ? "one-shot-vsc"
        : "semantic-only");

  return {
    ...spec,
    mode,
    semantic,
    intent: effectiveSemantic.intent,
    subject: effectiveSemantic.subject,
    composition: effectiveSemantic.composition,
    lighting: effectiveSemantic.lighting,
    style: effectiveSemantic.style,
    constraints: effectiveSemantic.constraints,
    seedCode: spec.seedCode
      ? {
          ...spec.seedCode,
          length: spec.seedCode.length ?? spec.seedCode.tokens.length,
        }
      : undefined,
  };
}

export function parseImageSceneSpec(raw: string): Result<ImageSceneSpec> {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = ImageSceneSpecSchema.safeParse(json);

    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "IMAGE_SCHEMA_INVALID",
          message: "Image scene spec failed validation.",
          details: {
            issues: parsed.error.issues,
          },
        },
      };
    }

    return {
      ok: true,
      value: normalizeImageSceneSpec(parsed.data),
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "IMAGE_SCHEMA_PARSE_FAILED",
        message: "Image scene spec was not valid JSON.",
        cause: error,
      },
    };
  }
}

export { ImageRequestSchema };
