import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TrainingExperimentConfigReferenceSchema,
  TrainingExperimentReceiptSchema,
  TrainingExperimentReceiptSchemaVersion,
  TrainingExperimentReferenceSchema,
  type TrainingExperimentReceipt,
} from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(testDir, "fixtures", "training-experiment-receipt.json");

describe("TrainingExperimentReceiptSchema", () => {
  it("round-trips the stdlib JSONL tracker receipt shape", () => {
    const fixture = readTrainingExperimentFixture();

    const parsed = TrainingExperimentReceiptSchema.parse(fixture);

    expect(parsed).toEqual(fixture);
    expect(parsed.schemaVersion).toBe(TrainingExperimentReceiptSchemaVersion);
    expect(parsed.tracker).toBe("jsonl");
    expect(parsed.manifest?.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("accepts external tracker URI schemes without putting them in the training manifest", () => {
    const fixture = readTrainingExperimentFixture();

    for (const [tracker, uri] of [
      ["aim", "aim://wittgenstein/tokenizer-20260531T210000Z-a1b2c3d4"],
      ["wandb", "https://wandb.ai/wittgenstein/training/runs/a1b2c3d4"],
      ["mlflow", "http://mlflow.internal/#/experiments/1/runs/a1b2c3d4"],
    ] as const) {
      expect(
        TrainingExperimentReceiptSchema.parse({
          ...fixture,
          tracker,
          uri,
          runId: `${tracker}-a1b2c3d4`,
        }).tracker,
      ).toBe(tracker);
    }
  });

  it("rejects impossible tracker windows", () => {
    const fixture = readTrainingExperimentFixture();

    const parsed = TrainingExperimentReceiptSchema.safeParse({
      ...fixture,
      finishedAt: "2026-05-31T20:59:59Z",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("finishedAt");
  });

  it("validates the pre-finish reference that training configs can embed", () => {
    const fixture = readTrainingExperimentFixture();

    expect(
      TrainingExperimentConfigReferenceSchema.parse({
        tracker: fixture.tracker,
        uri: fixture.uri,
        runId: fixture.runId,
        trainingRunId: fixture.trainingRunId,
        receiptPath:
          "research/training/_shared/runs/tokenizer-20260531T210000Z-a1b2c3d4/experiment.json",
        metricsLogPath:
          "research/training/_shared/runs/tokenizer-20260531T210000Z-a1b2c3d4/experiment-metrics.jsonl",
      }),
    ).toEqual({
      tracker: fixture.tracker,
      uri: fixture.uri,
      runId: fixture.runId,
      trainingRunId: fixture.trainingRunId,
      receiptPath:
        "research/training/_shared/runs/tokenizer-20260531T210000Z-a1b2c3d4/experiment.json",
      metricsLogPath:
        "research/training/_shared/runs/tokenizer-20260531T210000Z-a1b2c3d4/experiment-metrics.jsonl",
    });
  });

  it("validates a compact post-run reference suitable for artifact indexes", () => {
    const fixture = readTrainingExperimentFixture();

    expect(
      TrainingExperimentReferenceSchema.parse({
        tracker: fixture.tracker,
        uri: fixture.uri,
        runId: fixture.runId,
        receiptPath:
          "research/training/_shared/runs/tokenizer-20260531T210000Z-a1b2c3d4/experiment.json",
        receiptSha256: "9999999999999999999999999999999999999999999999999999999999999999",
        metricsSha256: fixture.metricsLog.sha256,
      }),
    ).toEqual({
      tracker: fixture.tracker,
      uri: fixture.uri,
      runId: fixture.runId,
      receiptPath:
        "research/training/_shared/runs/tokenizer-20260531T210000Z-a1b2c3d4/experiment.json",
      receiptSha256: "9999999999999999999999999999999999999999999999999999999999999999",
      metricsSha256: fixture.metricsLog.sha256,
    });
  });
});

function readTrainingExperimentFixture(): TrainingExperimentReceipt {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as TrainingExperimentReceipt;
}
