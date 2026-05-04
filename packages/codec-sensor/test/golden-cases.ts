import type { SensorSignalSpec } from "../src/schema.js";

export interface SensorGoldenCase {
  name: "ecg" | "temperature" | "gyro";
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
];
