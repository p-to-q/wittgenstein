// Sensor render orchestrator — expands a sensor signal spec into samples via
// the operator strategy registry, writes the JSON/CSV sidecars, and runs the
// Loupe dashboard renderer for the HTML companion.
//
// Operator strategies live under `./operators/` (extracted per #326 / #288).
// The Loupe fallback chain lives in `./loupe-renderer.ts`. This file owns
// orchestration only; the per-operator math and the dashboard plumbing are
// no longer mixed into the same module.

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";
import type { RenderCtx, RenderResult, RenderSidecar } from "@wittgenstein/schemas";
import type { SensorSignalSpec } from "./schema.js";
import { dispatchOperator } from "./operators/index.js";
import { renderLoupeDashboard, type SensorRenderPath } from "./loupe-renderer.js";

export interface SensorSample {
  timeSec: number;
  value: number;
}

export type { SensorRenderPath };

export async function renderSignalBundle(
  spec: SensorSignalSpec,
  ctx: RenderCtx,
): Promise<RenderResult> {
  const startedAt = Date.now();
  const sampleRateHz = Math.max(1, Math.floor(spec.sampleRateHz));
  const durationSec = Math.max(1, spec.durationSec);
  const samples = expandSensorAlgorithm(spec, sampleRateHz, durationSec, ctx.seed);
  const rows = samplesToRows(samples, sampleRateHz);

  const jsonPath = ensureExtension(ctx.outPath, ".json");
  const csvPath = replaceExtension(jsonPath, ".csv");
  const htmlPath = replaceExtension(jsonPath, ".html");

  await mkdir(dirname(jsonPath), { recursive: true });
  await writeFile(
    jsonPath,
    JSON.stringify(
      {
        signal: spec.signal,
        sampleRateHz,
        durationSec,
        unit: spec.unit,
        algorithm: spec.algorithm,
        operators: spec.operators,
        notes: spec.notes,
        samples: rows,
      },
      null,
      2,
    ),
  );
  await writeFile(csvPath, toCsv(rows));

  const dashboardOutcome = await renderLoupeDashboard(csvPath, htmlPath, spec);
  const artifactPath = dashboardOutcome.htmlReady ? htmlPath : jsonPath;
  const info = await stat(artifactPath);
  const sidecars = await Promise.all([
    describeSidecar("sensor-json", jsonPath, "application/json"),
    describeSidecar("sensor-csv", csvPath, "text/csv"),
    describeSidecar("sensor-html", htmlPath, "text/html"),
  ]);

  return {
    artifactPath,
    mimeType: dashboardOutcome.htmlReady ? "text/html" : "application/json",
    bytes: info.size,
    metadata: {
      codec: "sensor:procedural+loupesidecar",
      route: spec.signal,
      llmTokens: { input: 0, output: 0 },
      costUsd: 0,
      durationMs: Date.now() - startedAt,
      seed: ctx.seed,
      sidecars,
      renderPath: dashboardOutcome.renderPath,
    },
  };
}

export function makeEcgSignal(
  sampleRateHz: number,
  durationSec: number,
  seed: number | null,
): Float32Array {
  return expandSensorAlgorithm(
    {
      signal: "ecg",
      sampleRateHz,
      durationSec,
      unit: "mV",
      algorithm: "deterministic-operators",
      operators: [
        { type: "ecgTemplate", bpm: 72, amplitude: 1 },
        { type: "noise", color: "white", amplitude: 0.02 },
      ],
      notes: [],
    },
    sampleRateHz,
    durationSec,
    seed,
  );
}

export function makeGyroSignal(
  sampleRateHz: number,
  durationSec: number,
  seed: number | null,
): Float32Array {
  return expandSensorAlgorithm(
    {
      signal: "gyro",
      sampleRateHz,
      durationSec,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: [
        { type: "oscillator", frequencyHz: 1.7, amplitude: 0.42, phaseRad: 0 },
        { type: "oscillator", frequencyHz: 3.4, amplitude: 0.12, phaseRad: 1.1 },
        { type: "noise", color: "white", amplitude: 0.06 },
      ],
      notes: [],
    },
    sampleRateHz,
    durationSec,
    seed,
  );
}

export function makeTemperatureSignal(
  sampleRateHz: number,
  durationSec: number,
  seed: number | null,
): Float32Array {
  return expandSensorAlgorithm(
    {
      signal: "temperature",
      sampleRateHz,
      durationSec,
      unit: "C",
      algorithm: "deterministic-operators",
      operators: [
        { type: "drift", slopePerSec: 0.004 },
        { type: "noise", color: "white", amplitude: 0.04 },
        { type: "step", atSec: Math.max(1, durationSec * 0.55), amplitude: 0.7 },
      ],
      notes: [],
    },
    sampleRateHz,
    durationSec,
    seed,
  );
}

function expandSensorAlgorithm(
  spec: SensorSignalSpec,
  sampleRateHz: number,
  durationSec: number,
  seed: number | null,
): Float32Array {
  const frameCount = Math.max(1, Math.floor(sampleRateHz * durationSec));
  const signal = new Float32Array(frameCount);
  const rng = createRng(seed ?? 0);

  // Top-level operators run with timeOriginFrame = 0 so absolute-time semantics
  // are preserved for the flat operator list (existing 3 sensor goldens stay
  // byte-stable). Patches override timeOriginFrame to the patch boundary so
  // operator parameters inside a patch are interpreted patch-local per the
  // research note (#239) and #247 contract decision.
  for (const operator of spec.operators) {
    dispatchOperator(operator, {
      signal,
      startFrame: 0,
      endFrame: frameCount,
      sampleRateHz,
      rng,
      timeOriginFrame: 0,
    });
  }

  return signal;
}

function samplesToRows(samples: Float32Array, sampleRateHz: number): SensorSample[] {
  return Array.from(samples, (value, index) => ({
    timeSec: Number((index / sampleRateHz).toFixed(4)),
    value: Number(value.toFixed(6)),
  }));
}

function toCsv(rows: SensorSample[]): string {
  return ["timeSec,value", ...rows.map((row) => `${row.timeSec},${row.value}`)].join("\n");
}

function ensureExtension(path: string, ext: string): string {
  return extname(path) ? replaceExtension(path, ext) : `${path}${ext}`;
}

function replaceExtension(path: string, ext: string): string {
  return extname(path) ? path.slice(0, -extname(path).length) + ext : `${path}${ext}`;
}

async function describeSidecar(
  role: string,
  path: string,
  mimeType: string,
): Promise<RenderSidecar> {
  const [info, data] = await Promise.all([stat(path), readFile(path)]);
  return {
    role,
    path,
    mimeType,
    bytes: info.size,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

function createRng(seed: number): () => number {
  let state = (seed >>> 0) + 1;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 0xffffffff;
  };
}
