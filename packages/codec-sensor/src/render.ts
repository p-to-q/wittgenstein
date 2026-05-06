import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import type { SensorSignalSpec } from "./schema.js";

export interface SensorSample {
  timeSec: number;
  value: number;
}

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
      renderPath: dashboardOutcome.renderPath,
    },
  };
}

export type SensorRenderPath = "loupe-script" | "loupe-cli" | "fallback-static-html";

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

  for (const operator of spec.operators) {
    if (operator.type === "oscillator") {
      for (let i = 0; i < frameCount; i += 1) {
        const timeSec = i / sampleRateHz;
        signal[i] =
          (signal[i] ?? 0) +
          Math.sin(2 * Math.PI * operator.frequencyHz * timeSec + operator.phaseRad) *
            operator.amplitude;
      }
      continue;
    }

    if (operator.type === "noise") {
      const noise =
        operator.color === "pink" ? pinkNoise(frameCount, rng) : whiteNoise(frameCount, rng);
      for (let i = 0; i < frameCount; i += 1) {
        signal[i] = (signal[i] ?? 0) + (noise[i] ?? 0) * operator.amplitude;
      }
      continue;
    }

    if (operator.type === "drift") {
      for (let i = 0; i < frameCount; i += 1) {
        const timeSec = i / sampleRateHz;
        signal[i] = (signal[i] ?? 0) + timeSec * operator.slopePerSec;
      }
      continue;
    }

    if (operator.type === "pulse") {
      const start = Math.max(
        0,
        Math.floor((operator.centerSec - operator.widthSec / 2) * sampleRateHz),
      );
      const end = Math.min(
        frameCount,
        Math.ceil((operator.centerSec + operator.widthSec / 2) * sampleRateHz),
      );
      for (let i = start; i < end; i += 1) {
        const phase = (i - start) / Math.max(1, end - start);
        signal[i] = (signal[i] ?? 0) + Math.sin(Math.PI * phase) * operator.amplitude;
      }
      continue;
    }

    if (operator.type === "step") {
      const start = Math.max(0, Math.floor(operator.atSec * sampleRateHz));
      for (let i = start; i < frameCount; i += 1) {
        signal[i] = (signal[i] ?? 0) + operator.amplitude;
      }
      continue;
    }

    const beatPeriod = 60 / operator.bpm;
    for (let i = 0; i < frameCount; i += 1) {
      const timeSec = i / sampleRateHz;
      const phase = (timeSec % beatPeriod) / beatPeriod;
      const p = Math.exp(-Math.pow((phase - 0.16) * 22, 2)) * 0.08;
      const qrs =
        Math.exp(-Math.pow((phase - 0.34) * 55, 2)) * 0.92 -
        Math.exp(-Math.pow((phase - 0.31) * 80, 2)) * 0.22;
      const t = Math.exp(-Math.pow((phase - 0.58) * 15, 2)) * 0.18;
      signal[i] = (signal[i] ?? 0) + (p + qrs + t) * operator.amplitude;
    }
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

const moduleDir = dirname(fileURLToPath(import.meta.url));

async function renderLoupeDashboard(
  csvPath: string,
  htmlPath: string,
  spec: SensorSignalSpec,
): Promise<{ htmlReady: boolean; renderPath: SensorRenderPath }> {
  // Search for loupe.py: repo root → package dir → cwd → polyglot-mini sub-project
  const candidates = [
    resolvePath(moduleDir, "../../../../loupe.py"), // repo root
    resolvePath(moduleDir, "../loupe.py"), // package root
    resolvePath(process.cwd(), "loupe.py"), // cwd
    resolvePath(process.cwd(), "polyglot-mini/loupe.py"), // sub-project
  ];
  let loupePath: string | null = null;
  for (const c of candidates) {
    try {
      await access(c);
      loupePath = c;
      break;
    } catch {
      /* skip */
    }
  }
  if (!loupePath) {
    // Try `loupe` on PATH
    try {
      await spawnChecked("python3", ["-m", "loupe_cli", csvPath, "-o", htmlPath]);
      return { htmlReady: true, renderPath: "loupe-cli" };
    } catch {
      /* continue to fallback */
    }
  } else {
    try {
      await spawnChecked("python3", [loupePath, csvPath, "-o", htmlPath]);
      return { htmlReady: true, renderPath: "loupe-script" };
    } catch {
      /* continue to fallback */
    }
  }
  const fallbackHtml = `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>${spec.signal} preview</title>
<body style="font-family: ui-monospace, monospace; padding: 24px; background: #111; color: #f5f5f5;">
  <h1>${spec.signal} preview</h1>
  <p>Loupe was unavailable, so Wittgenstein wrote the raw CSV sidecar instead.</p>
  <p>Open <code>${csvPath}</code> or rerun with Python 3 available to get the interactive dashboard.</p>
</body>
</html>`;
  await writeFile(htmlPath, fallbackHtml);
  return { htmlReady: true, renderPath: "fallback-static-html" };
}

function ensureExtension(path: string, ext: string): string {
  return extname(path) ? replaceExtension(path, ext) : `${path}${ext}`;
}

function replaceExtension(path: string, ext: string): string {
  return extname(path) ? path.slice(0, -extname(path).length) + ext : `${path}${ext}`;
}

function createRng(seed: number): () => number {
  let state = (seed >>> 0) + 1;
  return () => {
    state = (state * 1103515245 + 12345) >>> 0;
    return state / 0xffffffff;
  };
}

function whiteNoise(frameCount: number, rng: () => number): Float32Array {
  const samples = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    samples[i] = rng() * 2 - 1;
  }
  return samples;
}

function pinkNoise(frameCount: number, rng: () => number): Float32Array {
  const white = whiteNoise(frameCount, rng);
  const pink = new Float32Array(frameCount);
  let prev = 0;
  for (let i = 0; i < frameCount; i += 1) {
    prev = 0.985 * prev + 0.15 * (white[i] ?? 0);
    pink[i] = prev;
  }
  return pink;
}

async function spawnChecked(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}
