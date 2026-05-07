import type { SensorSignalSpec } from "../src/schema.js";

export interface SensorGoldenCase {
  name:
    | "ecg"
    | "temperature"
    | "gyro"
    | "ecg-patch-grammar"
    | "temperature-patch-grammar"
    | "gyro-patch-grammar";
  seed: number;
  spec: SensorSignalSpec;
}

export const sensorGoldenCases: SensorGoldenCase[] = [
  {
    name: "ecg",
    seed: 7,
    spec: {
      signal: "ecg",
      sampleRateHz: 120,
      durationSec: 3,
      unit: "mV",
      algorithm: "deterministic-operators",
      operators: [
        { type: "ecgTemplate", bpm: 72, amplitude: 1 },
        { type: "noise", color: "white", amplitude: 0.02 },
        { type: "drift", slopePerSec: 0.005 },
      ],
      notes: ["golden fixture"],
    },
  },
  {
    name: "temperature",
    seed: 7,
    spec: {
      signal: "temperature",
      sampleRateHz: 10,
      durationSec: 12,
      unit: "C",
      algorithm: "deterministic-operators",
      operators: [
        { type: "drift", slopePerSec: 0.004 },
        { type: "noise", color: "white", amplitude: 0.04 },
        { type: "step", atSec: 6.6, amplitude: 0.7 },
      ],
      notes: ["golden fixture"],
    },
  },
  {
    name: "gyro",
    seed: 7,
    spec: {
      signal: "gyro",
      sampleRateHz: 50,
      durationSec: 4,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: [
        { type: "oscillator", frequencyHz: 1.7, amplitude: 0.42, phaseRad: 0 },
        { type: "oscillator", frequencyHz: 3.4, amplitude: 0.12, phaseRad: 1.1 },
        { type: "noise", color: "white", amplitude: 0.06 },
      ],
      notes: ["golden fixture"],
    },
  },
  // Multi-patch concatenation: heart-rate ramp expressed as 2 patches with
  // different ecgTemplate bpm values. Exercises sequential patch dispatch
  // without affineNormalize.
  {
    name: "ecg-patch-grammar",
    seed: 7,
    spec: {
      signal: "ecg",
      sampleRateHz: 120,
      durationSec: 3,
      unit: "mV",
      algorithm: "deterministic-operators",
      operators: [
        {
          type: "patchGrammar",
          patchLengthSec: 1.5,
          patches: [
            { operators: [{ type: "ecgTemplate", bpm: 60, amplitude: 1 }] },
            { operators: [{ type: "ecgTemplate", bpm: 84, amplitude: 1 }] },
          ],
        },
        { type: "noise", color: "white", amplitude: 0.02 },
      ],
      notes: ["golden fixture", "patch-grammar variant"],
    },
  },
  // Per-patch local renormalization: two patches each carry drift+noise but
  // map to distinct output ranges via affineNormalize. Exercises the
  // pre/post-snapshot contribution path.
  {
    name: "temperature-patch-grammar",
    seed: 7,
    spec: {
      signal: "temperature",
      sampleRateHz: 10,
      durationSec: 12,
      unit: "C",
      algorithm: "deterministic-operators",
      operators: [
        {
          type: "patchGrammar",
          patchLengthSec: 6,
          patches: [
            {
              operators: [
                { type: "drift", slopePerSec: 0.02 },
                { type: "noise", color: "white", amplitude: 0.04 },
              ],
              affineNormalize: { minOutput: 0, maxOutput: 0.5 },
            },
            {
              operators: [
                { type: "drift", slopePerSec: 0.02 },
                { type: "noise", color: "white", amplitude: 0.04 },
              ],
              affineNormalize: { minOutput: 0.3, maxOutput: 0.8 },
            },
          ],
        },
      ],
      notes: ["golden fixture", "patch-grammar variant"],
    },
  },
  // Single-patch sanity check: recursion layer must share parent RNG so the
  // single-patch case stays byte-identical to a flat oscillator+noise spec
  // over the same range. Pinned as a regression anchor for the recursion seam.
  {
    name: "gyro-patch-grammar",
    seed: 7,
    spec: {
      signal: "gyro",
      sampleRateHz: 50,
      durationSec: 4,
      unit: "deg/s",
      algorithm: "deterministic-operators",
      operators: [
        {
          type: "patchGrammar",
          patchLengthSec: 4,
          patches: [
            {
              operators: [
                { type: "oscillator", frequencyHz: 1.7, amplitude: 0.42, phaseRad: 0 },
                { type: "oscillator", frequencyHz: 3.4, amplitude: 0.12, phaseRad: 1.1 },
                { type: "noise", color: "white", amplitude: 0.06 },
              ],
            },
          ],
        },
      ],
      notes: ["golden fixture", "patch-grammar variant"],
    },
  },
];
