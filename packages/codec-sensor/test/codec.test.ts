import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sensorCodec } from "../src/index.js";
import type { SensorSignalSpec } from "../src/schema.js";

describe("@wittgenstein/codec-sensor", () => {
  it("exports the sensor codec contract", () => {
    expect(sensorCodec.name).toBe("sensor");
    expect(sensorCodec.parse("{}").ok).toBe(true);
  });

  it("renders sensor data with a loupe-friendly sidecar", async () => {
    const dir = await mkdtemp(join(tmpdir(), "witt-sensor-"));
    const parseResult = sensorCodec.parse(
      JSON.stringify({
        signal: "ecg",
        sampleRateHz: 120,
        durationSec: 3,
      }),
    );

    expect(parseResult.ok).toBe(true);
    if (!parseResult.ok) {
      return;
    }

    const result = await sensorCodec.render(parseResult.value, {
      runId: "sensor-run",
      runDir: dir,
      seed: 5,
      outPath: join(dir, "signal.json"),
      logger: console,
    });

    expect(["text/html", "application/json"]).toContain(result.mimeType);
    expect((await stat(result.artifactPath)).size).toBeGreaterThan(10);
  });
});

/**
 * `patchGrammar` is the higher-order operator added per
 * `docs/research/2026-05-07-sensor-patch-grammar.md` Option A. Tests below
 * pin the three properties the design relies on so the recursion seam stays
 * trustworthy: parse-roundtrip, single-patch equivalence (RNG sharing), and
 * affineNormalize range enforcement.
 */
describe("sensor patchGrammar operator", () => {
  it("round-trips through the schema", () => {
    const result = sensorCodec.parse(
      JSON.stringify({
        signal: "gyro",
        sampleRateHz: 50,
        durationSec: 2,
        operators: [
          {
            type: "patchGrammar",
            patchLengthSec: 1,
            patches: [
              { operators: [{ type: "oscillator", frequencyHz: 1, amplitude: 0.5, phaseRad: 0 }] },
              { operators: [{ type: "oscillator", frequencyHz: 2, amplitude: 0.5, phaseRad: 0 }] },
            ],
          },
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.operators).toHaveLength(1);
    const op = result.value.operators[0]!;
    expect(op.type).toBe("patchGrammar");
  });

  it("rejects empty patches array", () => {
    const result = sensorCodec.parse(
      JSON.stringify({
        signal: "gyro",
        operators: [{ type: "patchGrammar", patchLengthSec: 1, patches: [] }],
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("single-patch full-duration patchGrammar matches the flat operator list byte-for-byte", async () => {
    // Property: a patchGrammar with one patch covering the full duration and
    // operators identical to the flat list must produce the same CSV bytes
    // because the recursion shares the parent RNG with no extra consumption.
    const baseOps: SensorSignalSpec["operators"] = [
      { type: "oscillator", frequencyHz: 1.7, amplitude: 0.42, phaseRad: 0 },
      { type: "noise", color: "white", amplitude: 0.06 },
    ];

    const flatSpec: SensorSignalSpec = {
      signal: "gyro",
      sampleRateHz: 20,
      durationSec: 2,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: baseOps,
      notes: [],
    };

    const wrappedSpec: SensorSignalSpec = {
      ...flatSpec,
      operators: [{ type: "patchGrammar", patchLengthSec: 2, patches: [{ operators: baseOps }] }],
    };

    const flatCsv = await renderToCsv(flatSpec, 11);
    const wrappedCsv = await renderToCsv(wrappedSpec, 11);
    expect(wrappedCsv.equals(flatCsv)).toBe(true);
  });

  it("multi-patch concatenation produces distinct contributions per patch", async () => {
    const spec: SensorSignalSpec = {
      signal: "gyro",
      sampleRateHz: 10,
      durationSec: 2,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: [
        {
          type: "patchGrammar",
          patchLengthSec: 1,
          patches: [
            { operators: [{ type: "step", atSec: 0, amplitude: 1 }] },
            { operators: [{ type: "step", atSec: 0, amplitude: 5 }] },
          ],
        },
      ],
      notes: [],
    };

    const rows = await renderRows(spec, 0);
    // patch 0 covers frames 0..9 with +1; patch 1 covers frames 10..19 with +5.
    // (step.atSec is interpreted in absolute seconds within the parent range,
    // but step's start is clamped to startFrame, so each patch's step starts
    // at the patch boundary.)
    expect(rows[0]!.value).toBeCloseTo(1, 5);
    expect(rows[9]!.value).toBeCloseTo(1, 5);
    expect(rows[10]!.value).toBeCloseTo(5, 5);
    expect(rows[19]!.value).toBeCloseTo(5, 5);
  });

  it("affineNormalize rescales the patch contribution to the requested range", async () => {
    // Patch contains a step of +1 from t=0; we expect affineNormalize to
    // collapse the patch's constant contribution to the range midpoint
    // (since min === max, the fallback center kicks in).
    const spec: SensorSignalSpec = {
      signal: "gyro",
      sampleRateHz: 10,
      durationSec: 1,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: [
        {
          type: "patchGrammar",
          patchLengthSec: 1,
          patches: [
            {
              operators: [{ type: "step", atSec: 0, amplitude: 1 }],
              affineNormalize: { minOutput: 2, maxOutput: 4 },
            },
          ],
        },
      ],
      notes: [],
    };

    const rows = await renderRows(spec, 0);
    for (const row of rows) {
      expect(row.value).toBeCloseTo(3, 5); // (2+4)/2 = 3, fallback center
    }
  });

  it("repeats deterministically across runs with the same seed", async () => {
    const spec: SensorSignalSpec = {
      signal: "gyro",
      sampleRateHz: 20,
      durationSec: 2,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: [
        {
          type: "patchGrammar",
          patchLengthSec: 1,
          patches: [
            {
              operators: [{ type: "noise", color: "white", amplitude: 0.5 }],
              affineNormalize: { minOutput: -1, maxOutput: 1 },
            },
            { operators: [{ type: "noise", color: "pink", amplitude: 0.5 }] },
          ],
        },
      ],
      notes: [],
    };

    const a = await renderToCsv(spec, 42);
    const b = await renderToCsv(spec, 42);
    const c = await renderToCsv(spec, 42);
    expect(a.equals(b)).toBe(true);
    expect(b.equals(c)).toBe(true);
  });
});

async function renderToCsv(spec: SensorSignalSpec, seed: number): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "witt-sensor-pg-"));
  await sensorCodec.render(spec, {
    runId: `sensor-pg-${seed}`,
    runDir: dir,
    seed,
    outPath: join(dir, "signal.json"),
    logger: console,
  });
  return readFile(join(dir, "signal.csv"));
}

async function renderRows(
  spec: SensorSignalSpec,
  seed: number,
): Promise<Array<{ timeSec: number; value: number }>> {
  const csv = (await renderToCsv(spec, seed)).toString("utf8");
  const lines = csv.split("\n").slice(1); // drop header
  return lines.filter((line) => line.length > 0).map((line) => {
    const [timeSec, value] = line.split(",");
    return { timeSec: Number(timeSec), value: Number(value) };
  });
}
