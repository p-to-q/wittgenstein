import { z } from "zod";
import { TrainingRunManifestReferenceSchema } from "./training-manifest.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const TimestampSchema = z.string().datetime({ offset: true });

export const TrainingExperimentReceiptSchemaVersion = "witt.training.experiment/v0.1" as const;

export const TrainingExperimentTrackerSchema = z.enum(["aim", "wandb", "mlflow", "jsonl"]);

export const TrainingExperimentMetricLogSchema = z
  .object({
    path: z.string().min(1),
    sha256: Sha256Schema,
    bytes: z.number().int().nonnegative(),
  })
  .strict();

export const TrainingExperimentConfigReferenceSchema = z
  .object({
    tracker: TrainingExperimentTrackerSchema,
    uri: z.string().url(),
    runId: z.string().min(1),
    trainingRunId: z.string().min(1),
    receiptPath: z.string().min(1),
    metricsLogPath: z.string().min(1),
  })
  .strict();

export const TrainingExperimentReceiptSchema = z
  .object({
    schemaVersion: z.literal(TrainingExperimentReceiptSchemaVersion),
    tracker: TrainingExperimentTrackerSchema,
    uri: z.string().url(),
    runId: z.string().min(1),
    trainingRunId: z.string().min(1),
    startedAt: TimestampSchema,
    finishedAt: TimestampSchema.nullable(),
    metricsLog: TrainingExperimentMetricLogSchema,
    manifest: TrainingRunManifestReferenceSchema.optional(),
  })
  .strict()
  .superRefine((receipt, ctx) => {
    if (receipt.finishedAt === null) {
      return;
    }

    if (Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["finishedAt"],
        message: "finishedAt must be greater than or equal to startedAt.",
      });
    }
  });

export const TrainingExperimentReferenceSchema = z
  .object({
    tracker: TrainingExperimentTrackerSchema,
    uri: z.string().url(),
    runId: z.string().min(1),
    receiptPath: z.string().min(1),
    receiptSha256: Sha256Schema,
    metricsSha256: Sha256Schema,
  })
  .strict();

export type TrainingExperimentTracker = z.infer<typeof TrainingExperimentTrackerSchema>;
export type TrainingExperimentMetricLog = z.infer<typeof TrainingExperimentMetricLogSchema>;
export type TrainingExperimentConfigReference = z.infer<
  typeof TrainingExperimentConfigReferenceSchema
>;
export type TrainingExperimentReceipt = z.infer<typeof TrainingExperimentReceiptSchema>;
export type TrainingExperimentReference = z.infer<typeof TrainingExperimentReferenceSchema>;
