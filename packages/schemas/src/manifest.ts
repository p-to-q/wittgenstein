import { z } from "zod";

export const AudioRenderManifestSchema = z.object({
  sampleRateHz: z.number().int().positive(),
  channels: z.number().int().positive(),
  durationSec: z.number().nonnegative(),
  container: z.literal("wav"),
  bitDepth: z.number().int().positive(),
  determinismClass: z.enum(["byte-parity", "structural-parity"]),
  decoderId: z.string(),
  decoderHash: z.string().optional(),
});

const AudioRouteSchema = z.enum(["speech", "soundscape", "music"]);

const CostUsdReasonSchema = z.enum(["computed", "unknown-model", "missing-usage"]);

export const RunManifestSchema = z
  .object({
    runId: z.string(),
    gitSha: z.string().nullable(),
    lockfileHash: z.string().nullable(),
    nodeVersion: z.string(),
    wittgensteinVersion: z.string(),

    command: z.string(),
    args: z.array(z.string()),
    seed: z.number().int().nullable(),

    codec: z.string(),
    tier: z.string().nullable().optional(),
    route: z.string().optional(),

    llmProvider: z.string(),
    llmModel: z.string(),
    llmTokens: z.object({
      input: z.number().int().nonnegative(),
      output: z.number().int().nonnegative(),
    }),
    /**
     * USD cost computed from `costUsd = priceModel(llmProvider, llmModel, llmTokens)`.
     * `null` only when `costUsdReason` is `"unknown-model"` or `"missing-usage"` —
     * never silently zero (Issue #182).
     */
    costUsd: z.number().nonnegative().nullable(),
    /** Why `costUsd` is what it is — required so manifests cannot fudge zeros. */
    costUsdReason: CostUsdReasonSchema.optional(),

    promptRaw: z.string(),
    promptExpanded: z.string().nullable(),
    llmOutputRaw: z.string().nullable(),
    llmOutputParsed: z.unknown().nullable(),

    artifactPath: z.string().nullable(),
    artifactSha256: z.string().nullable(),
    audioRender: AudioRenderManifestSchema.optional(),

    startedAt: z.string(),
    durationMs: z.number().nonnegative(),
    ok: z.boolean(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        stack: z.string().optional(),
      })
      .nullable()
      .optional(),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.ok) {
      if (manifest.artifactPath === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifactPath"],
          message: "Successful runs must record artifactPath.",
        });
      }
      if (manifest.artifactSha256 === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["artifactSha256"],
          message: "Successful runs must record artifactSha256.",
        });
      }
      if (manifest.error !== null && manifest.error !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["error"],
          message: "Successful runs must not carry an error payload.",
        });
      }
    } else if (manifest.error === null || manifest.error === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "Failed runs must record an error payload.",
      });
    }

    if (manifest.codec === "audio" && manifest.route !== undefined) {
      const parsedRoute = AudioRouteSchema.safeParse(manifest.route);
      if (!parsedRoute.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["route"],
          message: `Audio manifests must use one of: ${AudioRouteSchema.options.join(", ")}.`,
        });
      }
    }

    if (manifest.costUsd === null && manifest.costUsdReason === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["costUsdReason"],
        message: "costUsd === null requires a costUsdReason (unknown-model or missing-usage).",
      });
    }
    if (manifest.costUsd === null && manifest.costUsdReason === "computed") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["costUsdReason"],
        message: 'costUsd === null cannot have costUsdReason = "computed".',
      });
    }
  });

export type AudioRenderManifest = z.infer<typeof AudioRenderManifestSchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
export type CostUsdReason = z.infer<typeof CostUsdReasonSchema>;
