import { z } from "zod";
import type { Result, SensorRequest } from "@wittgenstein/schemas";
import { SensorRequestSchema } from "@wittgenstein/schemas";

export type SensorBaseOperator =
  | { type: "oscillator"; frequencyHz: number; amplitude: number; phaseRad: number }
  | { type: "noise"; color: "white" | "pink"; amplitude: number }
  | { type: "drift"; slopePerSec: number }
  | { type: "pulse"; centerSec: number; widthSec: number; amplitude: number }
  | { type: "step"; atSec: number; amplitude: number }
  | { type: "ecgTemplate"; bpm: number; amplitude: number };

export type SensorPatchGrammarOperator = {
  type: "patchGrammar";
  patchLengthSec: number;
  patches: Array<{
    operators: SensorBaseOperator[];
    affineNormalize?: { minOutput: number; maxOutput: number } | undefined;
  }>;
};

export type SensorOperator = SensorBaseOperator | SensorPatchGrammarOperator;

const baseOperatorVariants = [
  z.object({
    type: z.literal("oscillator"),
    frequencyHz: z.number().positive(),
    amplitude: z.number().nonnegative(),
    phaseRad: z.number().default(0),
  }),
  z.object({
    type: z.literal("noise"),
    color: z.enum(["white", "pink"]).default("white"),
    amplitude: z.number().nonnegative(),
  }),
  z.object({
    type: z.literal("drift"),
    slopePerSec: z.number(),
  }),
  z.object({
    type: z.literal("pulse"),
    centerSec: z.number().nonnegative(),
    widthSec: z.number().positive(),
    amplitude: z.number(),
  }),
  z.object({
    type: z.literal("step"),
    atSec: z.number().nonnegative(),
    amplitude: z.number(),
  }),
  z.object({
    type: z.literal("ecgTemplate"),
    bpm: z.number().positive().default(72),
    amplitude: z.number().positive().default(1),
  }),
] as const;

const baseOperatorSchema = z.discriminatedUnion("type", [...baseOperatorVariants]);

/**
 * `affineNormalize` requires `minOutput < maxOutput` strictly. Equality (degenerate
 * range) and inversion (`min > max`) are rejected at parse time per #247 so the
 * normalized output band is unambiguous. If callers want a constant offset, the
 * `step` operator with `atSec: 0` already covers that case.
 */
const affineNormalizeSchema = z
  .object({
    minOutput: z.number(),
    maxOutput: z.number(),
  })
  .refine((value) => value.minOutput < value.maxOutput, {
    message: "affineNormalize.minOutput must be strictly less than maxOutput.",
  });

/**
 * `SensorOperatorSchema` admits the 6 flat operator variants plus a higher-order
 * `patchGrammar` operator. Patches contain ONLY base operators — nested
 * `patchGrammar` is rejected at parse time per #247 (recursion-depth cap = 1 for
 * the first implementation slice). Future PRs can lift the cap if motivated by
 * a use case the flat-operator-per-patch shape can't express.
 *
 * Tracks `docs/research/2026-05-07-sensor-patch-grammar.md` Option A.
 */
const patchGrammarSchema = z.object({
  type: z.literal("patchGrammar"),
  patchLengthSec: z.number().positive(),
  patches: z
    .array(
      z.object({
        operators: z.array(baseOperatorSchema),
        affineNormalize: affineNormalizeSchema.optional(),
      }),
    )
    .min(1),
});

const SensorOperatorSchema = z.discriminatedUnion("type", [
  ...baseOperatorVariants,
  patchGrammarSchema,
]);

export const SensorSignalSpecSchema = z.object({
  signal: z.enum(["ecg", "temperature", "gyro"]).default("temperature"),
  sampleRateHz: z.number().positive().default(10),
  durationSec: z.number().positive().default(60),
  unit: z.string().default("arb"),
  algorithm: z.string().default("deterministic-operators"),
  operators: z.array(SensorOperatorSchema).default([]),
  notes: z.array(z.string()).default([]),
});

export type SensorSignalSpec = z.infer<typeof SensorSignalSpecSchema>;

export function sensorSchemaPreamble(req: SensorRequest): string {
  return [
    "Emit a JSON procedural sensor algorithm specification.",
    "Choose one signal family: ecg, temperature, gyro.",
    "Do not emit raw sample arrays.",
    "Use an `operators` list so the runtime can deterministically expand the signal.",
    `Requested signal: ${req.signal ?? "auto"}.`,
    `Requested duration: ${req.durationSec ?? "unspecified"} seconds.`,
  ].join("\n");
}

export function parseSensorSignalSpec(raw: string): Result<SensorSignalSpec> {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = SensorSignalSpecSchema.safeParse(json);

    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "SENSOR_SCHEMA_INVALID",
          message: "Sensor signal spec failed validation.",
          details: {
            issues: parsed.error.issues,
          },
        },
      };
    }

    const withDefaults = ensureSignalDefaults(parsed.data);

    return {
      ok: true,
      value: withDefaults,
    };
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "SENSOR_SCHEMA_PARSE_FAILED",
        message: "Sensor signal spec was not valid JSON.",
        cause: error,
      },
    };
  }
}

function ensureSignalDefaults(spec: SensorSignalSpec): SensorSignalSpec {
  if (spec.operators.length > 0) {
    return spec;
  }

  if (spec.signal === "ecg") {
    return {
      ...spec,
      unit: spec.unit === "arb" ? "mV" : spec.unit,
      operators: [
        { type: "ecgTemplate", bpm: 72, amplitude: 1 },
        { type: "noise", color: "white", amplitude: 0.02 },
        { type: "drift", slopePerSec: 0.005 },
      ],
    };
  }

  if (spec.signal === "gyro") {
    return {
      ...spec,
      unit: spec.unit === "arb" ? "deg/s" : spec.unit,
      operators: [
        { type: "oscillator", frequencyHz: 1.7, amplitude: 0.42, phaseRad: 0 },
        { type: "oscillator", frequencyHz: 3.4, amplitude: 0.12, phaseRad: 1.1 },
        { type: "noise", color: "white", amplitude: 0.06 },
      ],
    };
  }

  return {
    ...spec,
    unit: spec.unit === "arb" ? "C" : spec.unit,
    operators: [
      { type: "drift", slopePerSec: 0.004 },
      { type: "noise", color: "white", amplitude: 0.04 },
      { type: "step", atSec: Math.max(1, spec.durationSec * 0.55), amplitude: 0.7 },
    ],
  };
}

export { SensorRequestSchema };
