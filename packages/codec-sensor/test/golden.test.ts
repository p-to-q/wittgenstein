import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { sensorCodec } from "../src/index.js";
import { sensorGoldenCases } from "./golden-cases.js";

interface SensorGoldenManifest {
  version: number;
  generatedBy: string;
  entries: Array<{
    signal: string;
    seed: number;
    sampleRateHz: number;
    durationSec: number;
    fixture: string;
    artifactSha256: string;
  }>;
}

const fixtureDir = resolve(process.cwd(), "../../fixtures/golden/sensor");

describe("@wittgenstein/codec-sensor goldens", () => {
  it.each(sensorGoldenCases)("matches the $name byte-for-byte fixture", async (goldenCase) => {
    const manifest = await readManifest();
    const manifestEntry = manifest.entries.find(
      (entry) => entry.fixture === `${goldenCase.name}.csv`,
    );

    expect(manifestEntry).toMatchObject({
      signal: goldenCase.spec.signal,
      seed: goldenCase.seed,
      sampleRateHz: goldenCase.spec.sampleRateHz,
      durationSec: goldenCase.spec.durationSec,
    });

    const dir = await mkdtemp(join(tmpdir(), `witt-sensor-golden-test-${goldenCase.name}-`));
    await sensorCodec.render(goldenCase.spec, {
      runId: `sensor-golden-test-${goldenCase.name}`,
      runDir: dir,
      seed: goldenCase.seed,
      outPath: join(dir, `${goldenCase.name}.json`),
      logger: console,
    });

    const generatedCsv = await readFile(join(dir, `${goldenCase.name}.csv`));
    const fixtureCsv = await readFile(resolve(fixtureDir, `${goldenCase.name}.csv`));

    expect(generatedCsv.equals(fixtureCsv)).toBe(true);
    expect(sha256(generatedCsv)).toBe(manifestEntry?.artifactSha256);
  });
});

async function readManifest(): Promise<SensorGoldenManifest> {
  const raw = await readFile(resolve(fixtureDir, "manifest.json"), "utf8");
  return JSON.parse(raw) as SensorGoldenManifest;
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
