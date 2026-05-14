import { z } from "zod";

export const Modality = {
  Image: "image",
  Audio: "audio",
  Video: "video",
  Sensor: "sensor",
  Svg: "svg",
  Asciipng: "asciipng",
} as const;

export type Modality = (typeof Modality)[keyof typeof Modality];

export const ModalitySchema = z.enum(["image", "audio", "video", "sensor", "svg", "asciipng"]);

export const BaseRequestSchema = z.object({
  prompt: z.string().min(1),
  out: z.string().optional(),
  seed: z.number().int().nullable().optional(),
  allowResearchWeights: z.boolean().optional(),
});

export type BaseRequest = z.infer<typeof BaseRequestSchema>;

export const ImageRequestSchema = BaseRequestSchema.extend({
  modality: z.literal("image"),
  size: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});
export type ImageRequest = z.infer<typeof ImageRequestSchema>;

export const AudioRequestSchema = BaseRequestSchema.extend({
  modality: z.literal("audio"),
  route: z.enum(["speech", "soundscape", "music"]).optional(),
  durationSec: z.number().positive().optional(),
  ambient: z.string().optional(),
});
export type AudioRequest = z.infer<typeof AudioRequestSchema>;

export const VideoRequestSchema = BaseRequestSchema.extend({
  modality: z.literal("video"),
  durationSec: z.number().positive().optional(),
  /** Full SVG documents (e.g. from `--svg`); bypasses LLM when non-empty. */
  inlineSvgs: z.array(z.string().min(1)).max(32).optional(),
});
export type VideoRequest = z.infer<typeof VideoRequestSchema>;

export const SensorRequestSchema = BaseRequestSchema.extend({
  modality: z.literal("sensor"),
  signal: z.string().optional(),
  sampleRateHz: z.number().positive().optional(),
  durationSec: z.number().positive().optional(),
});
export type SensorRequest = z.infer<typeof SensorRequestSchema>;

export const SvgRequestSchema = BaseRequestSchema.extend({
  modality: z.literal("svg"),
  /** `engine`: grammar engine HTTP. `local`: deterministic vector art from prompt (no network). */
  source: z.enum(["engine", "local"]).default("engine"),
});
export type SvgRequest = z.infer<typeof SvgRequestSchema>;

export const AsciipngRequestSchema = BaseRequestSchema.extend({
  modality: z.literal("asciipng"),
  columns: z.number().int().min(8).max(120).default(60),
  rows: z.number().int().min(4).max(80).default(30),
  cell: z.number().int().min(2).max(16).default(4),
  /** `minimax`: call Minimax text API, then post-process lines → PNG (not raw model bytes as image). */
  source: z.enum(["local", "minimax"]).default("local"),
  minimaxModel: z.string().optional(),
});
export type AsciipngRequest = z.infer<typeof AsciipngRequestSchema>;

export const WittgensteinRequestSchema = z.discriminatedUnion("modality", [
  ImageRequestSchema,
  AudioRequestSchema,
  VideoRequestSchema,
  SensorRequestSchema,
  SvgRequestSchema,
  AsciipngRequestSchema,
]);
export type WittgensteinRequest = z.infer<typeof WittgensteinRequestSchema>;
