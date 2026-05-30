import { z } from "zod";
import { ModalitySchema } from "./modality.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GitShaSchema = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/);
const TimestampSchema = z.string().datetime({ offset: true });

export const TrainingRunManifestSchemaVersion = "witt.training.run-manifest/v0.1" as const;

export const TrainingSubprogramSchema = z.enum(["tokenizer", "adapter", "llm-head"]);

export const TrainingRunDatasetSchema = z
  .object({
    dvcRev: z.string().min(1),
    name: z.string().min(1),
    sha256: Sha256Schema,
  })
  .strict();

export const TrainingRunHardwareSchema = z
  .object({
    gpuModel: z.string().min(1),
    gpuCount: z.number().int().positive(),
    nodeCount: z.number().int().positive(),
  })
  .strict();

export const TrainingRunEvalMetricSchema = z
  .object({
    name: z.string().min(1),
    value: z.number().finite(),
    unit: z.string().min(1).optional(),
    higherIsBetter: z.boolean().optional(),
  })
  .strict();

export const TrainingRunEvalSnapshotSchema = z
  .object({
    modality: ModalitySchema,
    dataset: z
      .object({
        name: z.string().min(1),
        split: z.string().min(1),
        sha256: Sha256Schema,
      })
      .strict(),
    step: z.number().int().nonnegative(),
    generatedAt: TimestampSchema,
    metrics: z.array(TrainingRunEvalMetricSchema).min(1),
  })
  .strict();

export const TrainingRunCheckpointSchema = z
  .object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    bytes: z.number().int().positive(),
    weightsLicense: z.enum(["permissive", "research-only"]),
  })
  .strict();

export const TrainingRunConfigReferenceSchema = z
  .object({
    path: z.string().min(1),
    sha256: Sha256Schema,
  })
  .strict();

export const TrainingRunManifestSchema = z
  .object({
    schemaVersion: z.literal(TrainingRunManifestSchemaVersion),
    runId: z.string().min(1),
    subprogram: TrainingSubprogramSchema,
    startedAt: TimestampSchema,
    finishedAt: TimestampSchema.nullable(),

    harnessGitSha: GitShaSchema,
    trainingCodeGitSha: GitShaSchema,
    dockerImageSha: z
      .string()
      .regex(/^sha256:[a-f0-9]{64}$/)
      .nullable(),
    lockfileSha256: Sha256Schema.nullable(),
    dataset: TrainingRunDatasetSchema,
    seed: z.number().int(),
    stepCount: z.number().int().nonnegative(),
    wallClockSec: z.number().nonnegative(),
    hardware: TrainingRunHardwareSchema,
    evalSnapshots: z.array(TrainingRunEvalSnapshotSchema),
    checkpoint: TrainingRunCheckpointSchema,
    trainingConfig: TrainingRunConfigReferenceSchema.optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    if (manifest.finishedAt === null) {
      return;
    }

    if (Date.parse(manifest.finishedAt) < Date.parse(manifest.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finishedAt"],
        message: "finishedAt must be greater than or equal to startedAt.",
      });
    }
  });

export const TrainingRunManifestReferenceSchema = z
  .object({
    runId: z.string().min(1),
    manifestPath: z.string().min(1),
    manifestSha256: Sha256Schema,
    checkpointSha256: Sha256Schema,
  })
  .strict();

export type TrainingSubprogram = z.infer<typeof TrainingSubprogramSchema>;
export type TrainingRunDataset = z.infer<typeof TrainingRunDatasetSchema>;
export type TrainingRunHardware = z.infer<typeof TrainingRunHardwareSchema>;
export type TrainingRunEvalMetric = z.infer<typeof TrainingRunEvalMetricSchema>;
export type TrainingRunEvalSnapshot = z.infer<typeof TrainingRunEvalSnapshotSchema>;
export type TrainingRunCheckpoint = z.infer<typeof TrainingRunCheckpointSchema>;
export type TrainingRunConfigReference = z.infer<typeof TrainingRunConfigReferenceSchema>;
export type TrainingRunManifest = z.infer<typeof TrainingRunManifestSchema>;
export type TrainingRunManifestReference = z.infer<typeof TrainingRunManifestReferenceSchema>;
