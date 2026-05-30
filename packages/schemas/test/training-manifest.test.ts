import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TrainingRunManifestReferenceSchema,
  TrainingRunManifestSchema,
  TrainingRunManifestSchemaVersion,
  type TrainingRunManifest,
} from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(testDir, "fixtures", "training-run-manifest.json");

describe("TrainingRunManifestSchema", () => {
  it("round-trips a representative training-run receipt fixture without information loss", () => {
    const fixture = readTrainingManifestFixture();

    const parsed = TrainingRunManifestSchema.parse(fixture);

    expect(parsed).toEqual(fixture);
    expect(parsed.schemaVersion).toBe(TrainingRunManifestSchemaVersion);
    expect(parsed.subprogram).toBe("tokenizer");
    expect(parsed.checkpoint.weightsLicense).toBe("research-only");
  });

  it("rejects receipts that smuggle hyperparameters as a freeform top-level blob", () => {
    const fixture = readTrainingManifestFixture();

    const parsed = TrainingRunManifestSchema.safeParse({
      ...fixture,
      hyperparameters: {
        lr: 0.0001,
      },
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unrecognized_keys",
          keys: ["hyperparameters"],
        }),
      ]),
    );
  });

  it("rejects impossible run windows", () => {
    const fixture = readTrainingManifestFixture();

    const parsed = TrainingRunManifestSchema.safeParse({
      ...fixture,
      finishedAt: "2026-05-30T20:59:59Z",
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toContain("finishedAt");
  });

  it("validates a compact reference suitable for downstream decoder-family manifests", () => {
    const fixture = readTrainingManifestFixture();

    expect(
      TrainingRunManifestReferenceSchema.parse({
        runId: fixture.runId,
        manifestPath:
          "research/training/_shared/runs/tokenizer-20260530T210000Z-a1b2c3d4/manifest.json",
        manifestSha256: "8888888888888888888888888888888888888888888888888888888888888888",
        checkpointSha256: fixture.checkpoint.sha256,
      }),
    ).toEqual({
      runId: fixture.runId,
      manifestPath:
        "research/training/_shared/runs/tokenizer-20260530T210000Z-a1b2c3d4/manifest.json",
      manifestSha256: "8888888888888888888888888888888888888888888888888888888888888888",
      checkpointSha256: fixture.checkpoint.sha256,
    });
  });
});

function readTrainingManifestFixture(): TrainingRunManifest {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as TrainingRunManifest;
}
