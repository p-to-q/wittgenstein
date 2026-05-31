import { z } from "zod";
import {
  TrainingRunConfigReferenceSchema,
  TrainingRunEvalMetricSchema,
  TrainingRunManifestReferenceSchema,
  TrainingSubprogramSchema,
} from "./training-manifest.js";
import { TrainingExperimentReferenceSchema } from "./training-experiment.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const TimestampSchema = z.string().datetime({ offset: true });

export const TrainingDatasetSnapshotSchemaVersion = "witt.training.dataset-snapshot/v0.1" as const;
export const TrainingSweepManifestSchemaVersion = "witt.training.sweep-manifest/v0.1" as const;

export const TrainingDatasetRoleSchema = z.enum(["train", "validation", "eval", "smoke"]);
export const TrainingDatasetLicenseSchema = z.enum([
  "permissive",
  "research-only",
  "restricted",
  "unknown",
]);

export const TrainingDvcOutputSchema = z
  .object({
    path: z.string().min(1),
    size: z.number().int().nonnegative().optional(),
    md5: z.string().min(1).optional(),
    etag: z.string().min(1).optional(),
    checksum: z.string().min(1).optional(),
    hash: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((output, ctx) => {
    if (!output.md5 && !output.etag && !output.checksum) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checksum"],
        message: "DVC outputs must carry at least one checksum field.",
      });
    }
  });

export const TrainingDvcRemoteSchema = z
  .object({
    name: z.string().min(1),
    url: z.string().min(1).optional(),
  })
  .strict();

export const TrainingDatasetSnapshotSchema = z
  .object({
    schemaVersion: z.literal(TrainingDatasetSnapshotSchemaVersion),
    snapshotId: z.string().min(1),
    generatedAt: TimestampSchema,
    dataset: z
      .object({
        name: z.string().min(1),
        split: z.string().min(1),
        role: TrainingDatasetRoleSchema,
        uri: z.string().min(1).optional(),
        license: TrainingDatasetLicenseSchema,
        sampleCount: z.number().int().nonnegative().optional(),
        deadLinkRate: z.number().finite().min(0).max(1).optional(),
      })
      .strict(),
    dvc: z
      .object({
        path: z.string().min(1),
        repoRevLock: z.string().min(1),
        remote: TrainingDvcRemoteSchema.optional(),
        outs: z.array(TrainingDvcOutputSchema).min(1),
      })
      .strict(),
    sha256: Sha256Schema,
  })
  .strict();

export const TrainingSweepRowStatusSchema = z.enum([
  "planned",
  "running",
  "passed",
  "failed",
  "skipped",
  "blocked",
]);

export const TrainingSweepDatasetReferenceSchema = z
  .object({
    snapshotId: z.string().min(1),
    snapshotPath: z.string().min(1),
    snapshotSha256: Sha256Schema,
    datasetSha256: Sha256Schema,
  })
  .strict();

export const TrainingSweepErrorSchema = z
  .object({
    code: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();

export const TrainingSweepRowSchema = z
  .object({
    rowId: z.string().min(1),
    subprogram: TrainingSubprogramSchema,
    status: TrainingSweepRowStatusSchema,
    dataset: TrainingSweepDatasetReferenceSchema,
    command: z.array(z.string().min(1)).min(1),
    config: TrainingRunConfigReferenceSchema.optional(),
    trainingRun: TrainingRunManifestReferenceSchema.optional(),
    experiment: TrainingExperimentReferenceSchema.optional(),
    metrics: z.array(TrainingRunEvalMetricSchema).optional(),
    error: TrainingSweepErrorSchema.optional(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (row.status === "passed" && !row.trainingRun) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["trainingRun"],
        message: "passed sweep rows must reference a training-run manifest.",
      });
    }
    if ((row.status === "failed" || row.status === "blocked") && !row.error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["error"],
        message: "failed or blocked sweep rows must carry a structured error.",
      });
    }
  });

export const TrainingSweepSummarySchema = z
  .object({
    total: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
  })
  .strict();

export const TrainingSweepManifestSchema = z
  .object({
    schemaVersion: z.literal(TrainingSweepManifestSchemaVersion),
    sweepId: z.string().min(1),
    generatedAt: TimestampSchema,
    tracker: z.string().url().optional(),
    source: z
      .object({
        specPath: z.string().min(1),
        specSha256: Sha256Schema,
      })
      .strict(),
    rows: z.array(TrainingSweepRowSchema).min(1),
    summary: TrainingSweepSummarySchema,
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const counts = {
      total: manifest.rows.length,
      passed: manifest.rows.filter((row) => row.status === "passed").length,
      failed: manifest.rows.filter((row) => row.status === "failed").length,
      skipped: manifest.rows.filter((row) => row.status === "skipped").length,
      blocked: manifest.rows.filter((row) => row.status === "blocked").length,
    };
    for (const [key, expected] of Object.entries(counts)) {
      const actual = manifest.summary[key as keyof typeof counts];
      if (actual !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["summary", key],
          message: `summary.${key} must equal the number of matching sweep rows.`,
        });
      }
    }
  });

export type TrainingDatasetRole = z.infer<typeof TrainingDatasetRoleSchema>;
export type TrainingDatasetLicense = z.infer<typeof TrainingDatasetLicenseSchema>;
export type TrainingDvcOutput = z.infer<typeof TrainingDvcOutputSchema>;
export type TrainingDatasetSnapshot = z.infer<typeof TrainingDatasetSnapshotSchema>;
export type TrainingSweepRowStatus = z.infer<typeof TrainingSweepRowStatusSchema>;
export type TrainingSweepDatasetReference = z.infer<typeof TrainingSweepDatasetReferenceSchema>;
export type TrainingSweepRow = z.infer<typeof TrainingSweepRowSchema>;
export type TrainingSweepManifest = z.infer<typeof TrainingSweepManifestSchema>;
