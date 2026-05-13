import { z } from "zod";
import type { AudioRequest, Result } from "@wittgenstein/schemas";
import { AudioRequestSchema } from "@wittgenstein/schemas";

// Audio route enum surfaced separately so route inference can drive off the
// schema (not a hardcoded list parallel to it). Adding a new audio route
// becomes: extend AudioRouteSchema.options + add a keyword entry to
// `ROUTE_KEYWORDS` in codec.ts (#355).
export const AudioRouteSchema = z.enum(["speech", "soundscape", "music"]);

export const AudioPlanSchema = z.object({
  route: AudioRouteSchema.default("speech"),
  script: z.string().default("Wittgenstein launches a multimodal artifact."),
  voice: z
    .object({
      speaker: z.string().default("neutral"),
      tone: z.string().default("clear"),
      language: z.string().default("en"),
    })
    .default({}),
  timeline: z
    .array(
      z.object({
        atSec: z.number().nonnegative(),
        event: z.string(),
      }),
    )
    .default([]),
  music: z
    .object({
      bpm: z.number().positive().default(120),
      key: z.string().default("C"),
      motif: z.string().default("minimal"),
    })
    .default({}),
  ambient: z
    .object({
      category: z
        .enum(["auto", "silence", "rain", "wind", "city", "forest", "electronic"])
        .default("auto"),
      level: z.number().min(0).max(1).default(0.22),
    })
    .default({}),
});

export type AudioPlan = z.infer<typeof AudioPlanSchema>;

export function audioSchemaPreamble(req: AudioRequest): string {
  return [
    "Emit a JSON audio plan.",
    "Choose route from speech, soundscape, or music.",
    "Prefer symbolic structure over raw samples.",
    "Include a short `script` for speech or voice-led outputs.",
    "Ambient can be auto, silence, rain, wind, city, forest, or electronic.",
    `Requested route: ${req.route ?? "auto"}.`,
    `Requested duration: ${req.durationSec ?? "unspecified"} seconds.`,
    `Requested ambient: ${req.ambient ?? "auto"}.`,
  ].join("\n");
}

export function parseAudioPlan(raw: string): Result<AudioPlan> {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = AudioPlanSchema.safeParse(json);

    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "AUDIO_SCHEMA_INVALID",
          message: "Audio plan failed validation.",
          details: {
            issues: parsed.error.issues,
          },
        },
      };
    }

    return {
      ok: true,
      value: parsed.data,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "AUDIO_SCHEMA_PARSE_FAILED",
        message: "Audio plan was not valid JSON.",
        cause: error,
      },
    };
  }
}

export { AudioRequestSchema };
