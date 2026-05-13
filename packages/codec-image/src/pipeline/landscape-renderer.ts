// Procedural landscape renderer — the placeholder pixel synthesis that fills in
// for a real frozen-decoder bridge until M1B wires one. Extracted from the
// original `pipeline/decoder.ts` per #325 / #288.
//
// This module is intentionally self-contained for the landscape concern:
// - five scene modes (coast / forest / lake / mountain / meadow)
// - per-mode palette tables
// - sky / terrain pixel shaders
// - reference-landscape image bypass (Python bridge)
//
// The four FIELD_SALTS named below are the magic salts that the original
// decoder threaded into `buildField()` — they're conceptually landscape-
// specific (they name the four scalar fields the landscape renderer expects:
// elevation, moisture, warmth, detail), so they live with the renderer that
// names them rather than embedded as bare hex literals at the caller.

import { readFile, unlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import type { RenderCtx } from "@wittgenstein/schemas";

import {
  clamp01,
  clampByte,
  hash01,
  mixColor,
  sampleField,
  sampleNoise,
  scaleColor,
  smoothstep,
  type Rgb,
} from "./internal-math.js";

export type SceneMode = "coast" | "forest" | "lake" | "mountain" | "meadow";

export interface SceneProfile {
  mode: SceneMode;
  variantA: number;
  variantB: number;
  ruggedness: number;
}

/**
 * Salts that drive the placeholder landscape's four scalar fields. Each salt
 * mixes into a separate field via the decoder's `buildField()` helper; together
 * they give the landscape renderer the deterministic-but-varied per-token
 * inputs it needs without depending on a real decoder.
 *
 * These are placeholder-bridge concerns, not load-bearing decoder doctrine.
 * They go away when a real frozen-decoder bridge wires under M1B (gated on
 * the per-candidate audits in #283).
 */
export const FIELD_SALTS = {
  elevation: 0x1a2b3c4d,
  moisture: 0x91c7e35a,
  warmth: 0x4f6a9d21,
  detail: 0xd15f0c77,
} as const;

export function buildSceneProfile(tokens: number[]): SceneProfile {
  let hash = 2166136261;
  for (let i = 0; i < tokens.length; i += 1) {
    hash ^= (tokens[i] ?? 0) + i * 31;
    hash = Math.imul(hash, 16777619);
  }
  const hashA = hash >>> 0;
  const hashB = Math.imul(hashA ^ 0x9e3779b9, 2246822519) >>> 0;
  const modes: SceneMode[] = ["coast", "forest", "lake", "mountain", "meadow"];
  return {
    mode: modes[Math.abs(tokens[0] ?? hashA) % modes.length] ?? "meadow",
    variantA: tokens.length > 1 ? ((tokens[1] ?? 0) % 8192) / 8191 : ((hashA >>> 8) & 255) / 255,
    variantB: tokens.length > 2 ? ((tokens[2] ?? 0) % 8192) / 8191 : ((hashB >>> 12) & 255) / 255,
    ruggedness: 0.35 + (((hashB >>> 20) & 255) / 255) * 0.65,
  };
}

export function buildPalette(
  profile: SceneProfile,
  averageWarmth: number,
  averageMoisture: number,
) {
  if (profile.mode === "coast") {
    return {
      skyTop: mixColor(
        [49, 92, 155],
        [116, 132, 181],
        profile.variantA * 0.6 + averageWarmth * 0.4,
      ),
      skyHorizon: mixColor([236, 225, 214], [255, 210, 168], averageWarmth * 0.8 + 0.1),
      rockBase: [142, 132, 118] as Rgb,
      grassBase: [122, 142, 102] as Rgb,
      waterBase: [68, 136, 176] as Rgb,
    };
  }
  if (profile.mode === "forest") {
    return {
      skyTop: [72, 96, 150] as Rgb,
      skyHorizon: [232, 223, 214] as Rgb,
      rockBase: [100, 108, 102] as Rgb,
      grassBase: mixColor([60, 92, 58], [98, 129, 80], averageMoisture * 0.8 + 0.1),
      waterBase: [58, 112, 130] as Rgb,
    };
  }
  if (profile.mode === "lake") {
    return {
      skyTop: [62, 98, 158] as Rgb,
      skyHorizon: [224, 230, 240] as Rgb,
      rockBase: [116, 122, 126] as Rgb,
      grassBase: [104, 136, 92] as Rgb,
      waterBase: [70, 130, 180] as Rgb,
    };
  }
  if (profile.mode === "mountain") {
    return {
      skyTop: [74, 94, 146] as Rgb,
      skyHorizon: [230, 220, 214] as Rgb,
      rockBase: mixColor([108, 114, 126], [150, 130, 116], averageWarmth * 0.55),
      grassBase: [122, 136, 106] as Rgb,
      waterBase: [74, 116, 160] as Rgb,
    };
  }
  return {
    skyTop: [70, 100, 150] as Rgb,
    skyHorizon: [244, 223, 194] as Rgb,
    rockBase: [124, 120, 106] as Rgb,
    grassBase: mixColor([96, 132, 74], [156, 164, 92], averageMoisture * 0.5 + averageWarmth * 0.3),
    waterBase: [74, 120, 164] as Rgb,
  };
}

export function renderSky(
  nx: number,
  ny: number,
  horizon: number,
  warm: number,
  moist: number,
  detail: number,
  skyTop: Rgb,
  skyHorizon: Rgb,
  profile: SceneProfile,
): Rgb {
  const t = clamp01(ny / Math.max(horizon, 0.001));
  let color = mixColor(skyTop, skyHorizon, Math.pow(t, 0.85));

  const cloudBand = smoothstep(0.12, 0.78, moist * 0.7 + detail * 0.3);
  const cloudMask =
    smoothstep(0.52, 0.88, sampleNoise(nx * 5.5 + detail, ny * 7.2 + warm * 2.4)) *
    (1 - t) *
    cloudBand *
    0.42;
  color = mixColor(color, [247, 244, 239], cloudMask);

  const sunMask =
    Math.exp(-Math.pow(nx - (0.18 + warm * 0.52 + profile.variantA * 0.08), 2) / 0.006) *
    Math.exp(-Math.pow(ny - (0.11 + moist * 0.11 + profile.variantB * 0.03), 2) / 0.0025) *
    0.35;
  color = mixColor(color, [255, 236, 190], sunMask);

  return color;
}

export function renderTerrain(
  nx: number,
  ny: number,
  horizon: number,
  elevation: number,
  moisture: number,
  warmth: number,
  detail: number,
  rockBase: Rgb,
  grassBase: Rgb,
  waterBase: Rgb,
  skyHorizon: Rgb,
  elevationField: Float32Array,
  gridWidth: number,
  gridHeight: number,
  profile: SceneProfile,
): Rgb {
  const landT = clamp01((ny - horizon) / Math.max(1 - horizon, 0.001));
  const atmosphere = Math.pow(1 - landT, 1.5) * 0.45;

  const ridgeNoise = sampleNoise(nx * 8.2 + detail * 1.5, ny * 11.3 + elevation * 1.8);
  const vegetation = clamp01(moisture * 0.75 + (1 - landT) * 0.15 + ridgeNoise * 0.1);
  const soilWarmth = clamp01(warmth * 0.7 + detail * 0.2);
  const terrainBase = mixColor(rockBase, grassBase, vegetation);
  let color = mixColor(terrainBase, [178, 134, 84], soilWarmth * 0.22);

  const waterBias = profile.mode === "coast" ? 0.28 : profile.mode === "lake" ? 0.34 : 0;
  const waterChance = clamp01((moisture - 0.52) * 1.6 + waterBias) * (1 - landT) * 1.4;
  const waterMask =
    smoothstep(0.16, 0.01, landT) *
    smoothstep(0.14, 0.65, waterChance) *
    smoothstep(0.32, 0.72, ridgeNoise);
  color = mixColor(color, waterBase, waterMask * 0.85);

  if (profile.mode === "coast") {
    const beachMask = smoothstep(0.22, 0.58, landT) * smoothstep(0.72, 0.15, vegetation);
    color = mixColor(color, [205, 188, 144], beachMask * 0.45);
  }

  if (profile.mode === "forest") {
    const treeNoise = sampleNoise(nx * 18 + profile.variantA * 3, detail * 7 + nx * 4);
    const treeMask =
      smoothstep(0.62, 0.82, treeNoise) * smoothstep(0.2, 0.01, landT) * (1 - waterMask);
    color = mixColor(color, [52, 79, 52], treeMask * 0.65);
  }

  if (profile.mode === "mountain") {
    const snowMask = smoothstep(0.82, 0.96, elevation) * smoothstep(0.2, 0.02, landT);
    color = mixColor(color, [230, 233, 236], snowMask * 0.55);
  }

  if (profile.mode === "meadow") {
    const flowerNoise = sampleNoise(nx * 34 + profile.variantB * 5, ny * 40 + detail * 3.2);
    const flowerMask = smoothstep(0.82, 0.94, flowerNoise) * smoothstep(0.86, 0.32, landT);
    color = mixColor(color, [234, 198, 141], flowerMask * 0.18);
  }

  const shading = terrainShade(elevationField, gridWidth, gridHeight, nx, ny);
  color = scaleColor(color, 0.82 + shading * 0.28);

  const grain = (sampleNoise(nx * 28 + detail * 4.2, ny * 34 + warmth * 3.1) - 0.5) * 26;
  color = [
    clampByte(color[0] + grain),
    clampByte(color[1] + grain * 0.7),
    clampByte(color[2] + grain * 0.45),
  ];

  return mixColor(color, skyHorizon, atmosphere);
}

export async function tryDecodeReferenceLandscape(
  profile: SceneProfile,
  ctx: RenderCtx,
): Promise<Uint8Array | null> {
  const referencePath = selectReferenceImage(profile);
  if (!referencePath) {
    return null;
  }

  const outPath = join(ctx.runDir, `_reference-${profile.mode}.png`);
  const bridgeScript = resolve(process.cwd(), "scripts/reference_image_to_png.py");

  try {
    await spawnChecked("python3", [bridgeScript, referencePath, outPath, profile.mode]);
    const png = new Uint8Array(await readFile(outPath));
    await unlink(outPath).catch(() => undefined);
    ctx.logger.info(`Using reference decoder bridge asset: ${basename(referencePath)}`);
    return png;
  } catch (error) {
    ctx.logger.warn(
      "Reference decoder bridge unavailable; falling back to procedural placeholder.",
      {
        mode: profile.mode,
        error,
      },
    );
    return null;
  }
}

function selectReferenceImage(profile: SceneProfile): string | null {
  const bank: Record<SceneMode, string[]> = {
    coast: ["9.jpg"],
    forest: ["23.jpg"],
    lake: ["8.jpg"],
    mountain: ["11.jpg"],
    meadow: ["16.jpg"],
  };

  const choices = bank[profile.mode];
  if (!choices || choices.length === 0) {
    return null;
  }

  const index = Math.floor(profile.variantA * choices.length) % choices.length;
  return resolve(
    process.cwd(),
    "data/image_adapter/raw/images",
    choices[index] ?? choices[0] ?? "",
  );
}

// Terrain-specific shading sampler. Kept here because it's used only by
// `renderTerrain`; the general field-sampling helper it builds on (`sampleField`)
// lives in `internal-math.ts` so both the decoder orchestrator and this
// landscape renderer can use it without duplication.
function terrainShade(
  field: Float32Array,
  width: number,
  height: number,
  nx: number,
  ny: number,
): number {
  const eps = 1 / Math.max(width, height);
  const left = sampleField(field, width, height, nx - eps, ny);
  const right = sampleField(field, width, height, nx + eps, ny);
  const up = sampleField(field, width, height, nx, ny - eps);
  const down = sampleField(field, width, height, nx, ny + eps);
  const dx = right - left;
  const dy = down - up;
  return clamp01(0.55 + dx * 0.9 - dy * 0.65);
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

// re-export hash01 so callers wanting deterministic noise without
// pulling internal-math twice can grab it from here. Not load-bearing.
export { hash01 };
