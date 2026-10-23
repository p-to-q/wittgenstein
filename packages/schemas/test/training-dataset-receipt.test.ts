import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TrainingRunDatasetSchema,
  TrainingRunManifestSchema,
  type TrainingRunManifest,
} from "../src/index.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(testDir, "fixtures", "training-run-manifest.json");

// The four deterministic dataset-receipt fields the Python writer must emit,
// mirroring polyglot-mini/train/data_manifest.py. Kept as a literal list so a
// rename on either side breaks this test (report 19 F-4: the cross-language
// contract was assumed but never enforced).
const DATASET_RECEIPT_FIELDS = [
  "sourceInputSha256",
  "requestedCount",
  "writtenCount",
  "canonicalSelectionSha256",
] as const;

const DATASET_RECEIPT = {
  sourceInputSha256: "1a".repeat(32),
  requestedCount: 128,
  writtenCount: 121,
  canonicalSelectionSha256: "2b".repeat(32),
};

describe("TrainingRunDatasetSchema dataset-receipt fields", () => {
  it("validates and round-trips the four deterministic dataset-receipt fields", () => {
    const fixture = readTrainingManifestFixture();

    const parsed = TrainingRunDatasetSchema.parse({
      ...fixture.dataset,
      ...DATASET_RECEIPT,
    });

    expect(parsed).toEqual({ ...fixture.dataset, ...DATASET_RECEIPT });
    expect(Object.keys(parsed).sort()).toEqual(
      [...Object.keys(fixture.dataset), ...DATASET_RECEIPT_FIELDS].sort(),
    );
  });

  it("accepts a full manifest whose dataset carries the dataset-receipt fields", () => {
    const fixture = readTrainingManifestFixture();
    const manifest = { ...fixture, dataset: { ...fixture.dataset, ...DATASET_RECEIPT } };

    const parsed = TrainingRunManifestSchema.parse(manifest);

    expect(parsed.dataset).toEqual(manifest.dataset);
    expect(parsed.dataset.canonicalSelectionSha256).toBe(DATASET_RECEIPT.canonicalSelectionSha256);
  });

  it("keeps the dataset-receipt fields optional so pre-existing receipts still validate", () => {
    const fixture = readTrainingManifestFixture();

    const parsed = TrainingRunManifestSchema.parse(fixture);

    for (const field of DATASET_RECEIPT_FIELDS) {
      expect(field in parsed.dataset).toBe(false);
    }
  });

  it("rejects malformed digests and counts in the dataset receipt", () => {
    const fixture = readTrainingManifestFixture();
    const base = fixture.dataset;

    expect(
      TrainingRunDatasetSchema.safeParse({ ...base, sourceInputSha256: "not-a-digest" }).success,
    ).toBe(false);
    expect(
      TrainingRunDatasetSchema.safeParse({ ...base, canonicalSelectionSha256: "2b".repeat(31) })
        .success,
    ).toBe(false);
    expect(TrainingRunDatasetSchema.safeParse({ ...base, requestedCount: -1 }).success).toBe(false);
    expect(TrainingRunDatasetSchema.safeParse({ ...base, writtenCount: 1.5 }).success).toBe(false);
  });

  it("still rejects unknown dataset fields alongside the new ones", () => {
    const fixture = readTrainingManifestFixture();

    const parsed = TrainingRunDatasetSchema.safeParse({
      ...fixture.dataset,
      ...DATASET_RECEIPT,
      sampleCount: 128,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unrecognized_keys", keys: ["sampleCount"] }),
      ]),
    );
  });
});

function readTrainingManifestFixture(): TrainingRunManifest {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as TrainingRunManifest;
}