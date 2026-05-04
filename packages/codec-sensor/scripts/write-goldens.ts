import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sensorCodec } from "../src/index.js";
import { sensorGoldenCases } from "../test/golden-cases.js";

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageDir, "../..");
const fixtureDir = resolve(repoRoot, "fixtures/golden/sensor");

interface SensorGoldenManifestEntry {
  signal: string;
  seed: number;
  sampleRateHz: number;
  durationSec: number;
  fixture: string;
  artifactSha256: string;
}

await mkdir(fixtureDir, { recursive: true });

const entries: SensorGoldenManifestEntry[] = [];

for (const goldenCase of sensorGoldenCases) {
  const runDir = await mkdtemp(join(tmpdir(), `witt-sensor-golden-${goldenCase.name}-`));
  const outPath = join(runDir, `${goldenCase.name}.json`);
  await sensorCodec.render(goldenCase.spec, {
    runId: `sensor-golden-${goldenCase.name}`,
    runDir,
    seed: goldenCase.seed,
    outPath,
    logger: console,
  });

  const csv = await readFile(join(runDir, `${goldenCase.name}.csv`));
  const fixture = `${goldenCase.name}.csv`;
  await writeFile(resolve(fixtureDir, fixture), csv);

  entries.push({
    signal: goldenCase.spec.signal,
    seed: goldenCase.seed,
    sampleRateHz: goldenCase.spec.sampleRateHz,
    durationSec: goldenCase.spec.durationSec,
    fixture,
    artifactSha256: sha256(csv),
  });
}

await writeFile(
  resolve(fixtureDir, "manifest.json"),
  `${JSON.stringify({ version: 1, generatedBy: "packages/codec-sensor/scripts/write-goldens.ts", entries }, null, 2)}\n`,
);

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}
