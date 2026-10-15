import { describe, expect, it } from "vitest";
import { codecV2, RunManifestSchema } from "../src/index.js";

/**
 * The nine keys that were undeclared in `RunManifestSchema` before the
 * 2026-10-16 closeout review (CR1) — parse used to strip them silently.
 * `route`, `renderPath`, `audioRender`, and `audioPlan` were already declared
 * as typed spine fields; the core package's `manifest-rows.test.ts` covers
 * the full 13-key fold → validate → parse round-trip.
 */
const DECLARED_BY_CR1 = [
  "image.code",
  "image.adapter",
  "image.decoder",
  "quality.structural",
  "quality.partial",
  "metadata.warnings",
  "L4.adapterHash",
  "L5.decoderHash",
  "artifact.sha256",
] as const;

describe("manifest row channel (2026-10-16 closeout review CR1/CR2)", () => {
  it("pins the closed row-key set and its runtime narrow", () => {
    expect([...codecV2.MANIFEST_ROW_KEYS]).toEqual([
      "route",
      "renderPath",
      "audioRender",
      "audioPlan",
      "image.code",
      "image.adapter",
      "image.decoder",
      "quality.structural",
      "quality.partial",
      "metadata.warnings",
      "L4.adapterHash",
      "L5.decoderHash",
      "artifact.sha256",
    ]);
    expect(codecV2.isManifestRowKey("image.decoder")).toBe(true);
    expect(codecV2.isManifestRowKey("image.palette")).toBe(false);
  });

  it("preserves every CR1-declared row key through a canonical parse", () => {
    for (const key of DECLARED_BY_CR1) {
      const marker = { marker: key };
      const parsed = RunManifestSchema.safeParse({ ...failedImageManifest(), [key]: marker });
      expect(parsed.success, key).toBe(true);
      if (parsed.success) {
        expect((parsed.data as Record<string, unknown>)[key], key).toEqual(marker);
      }
    }
  });

  it("still drops row-like keys outside the closed set — declaration is the boundary", () => {
    const parsed = RunManifestSchema.safeParse({ ...failedImageManifest(), "image.bogus": 1 });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>)["image.bogus"]).toBeUndefined();
    }
  });
});

function failedImageManifest(): Record<string, unknown> {
  return {
    runId: "run-rows",
    gitSha: null,
    lockfileHash: null,
    nodeVersion: process.version,
    wittgensteinVersion: "0.3.0-alpha.3",
    command: "wittgenstein image",
    args: ["otter"],
    seed: null,
    codec: "image",
    route: "raster",
    license: { weightsRestriction: "permissive" },
    llmProvider: "openai-compatible",
    llmModel: "gpt-4o-mini",
    llmTokens: { input: 0, output: 0 },
    costUsd: 0,
    promptRaw: "otter",
    promptExpanded: null,
    llmOutputRaw: null,
    llmOutputParsed: null,
    artifactPath: null,
    artifactSha256: null,
    startedAt: new Date(0).toISOString(),
    durationMs: 0,
    ok: false,
    error: { code: "NOT_IMPLEMENTED", message: "stub" },
  };
}
