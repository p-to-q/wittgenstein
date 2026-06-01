import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TrainingDatasetSnapshotSchema,
  TrainingDatasetSnapshotSchemaVersion,
  TrainingSweepManifestSchema,
  TrainingSweepManifestSchemaVersion,
  type TrainingDatasetSnapshot,
  type TrainingSweepManifest,
} from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const datasetFixturePath = join(testDir, "fixtures", "training-dataset-snapshot.json");
const sweepFixturePath = join(testDir, "fixtures", "training-sweep-manifest.json");

describe("Training dataset and sweep receipts", () => {
  it("round-trips a DVC-backed dataset snapshot fixture", () => {
    const fixture = readDatasetSnapshotFixture();

    const parsed = TrainingDatasetSnapshotSchema.parse(fixture);

    expect(parsed).toEqual(fixture);
    expect(parsed.schemaVersion).toBe(TrainingDatasetSnapshotSchemaVersion);
    expect(parsed.dvc.outs[0]?.md5).toBeTruthy();
  });

  it("rejects DVC outputs without a checksum-like field", () => {
    const fixture = readDatasetSnapshotFixture();

    const parsed = TrainingDatasetSnapshotSchema.safeParse({
      ...fixture,
      dvc: {
        ...fixture.dvc,
        outs: [
          {
            path: "dataset",
            size: 1,
          },
        ],
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "dvc.outs.0.checksum",
    );
  });

  it("round-trips a sweep manifest fixture", () => {
    const fixture = readSweepFixture();

    const parsed = TrainingSweepManifestSchema.parse(fixture);

    expect(parsed).toEqual(fixture);
    expect(parsed.schemaVersion).toBe(TrainingSweepManifestSchemaVersion);
    expect(parsed.rows[0]?.trainingRun?.runId).toBe("tokenizer-stdlib-smoke");
  });

  it("rejects summary counts that drift from row statuses", () => {
    const fixture = readSweepFixture();

    const parsed = TrainingSweepManifestSchema.safeParse({
      ...fixture,
      summary: {
        ...fixture.summary,
        passed: 0,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("summary.passed");
  });

  it("requires passed rows to point at training-run evidence", () => {
    const fixture = readSweepFixture();
    const row = { ...fixture.rows[0] };
    delete row.trainingRun;

    const parsed = TrainingSweepManifestSchema.safeParse({
      ...fixture,
      rows: [row],
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "rows.0.trainingRun",
    );
  });
});

function readDatasetSnapshotFixture(): TrainingDatasetSnapshot {
  return JSON.parse(readFileSync(datasetFixturePath, "utf8")) as TrainingDatasetSnapshot;
}

function readSweepFixture(): TrainingSweepManifest {
  return JSON.parse(readFileSync(sweepFixturePath, "utf8")) as TrainingSweepManifest;
}
