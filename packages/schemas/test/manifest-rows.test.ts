import { describe, expect, it } from "vitest";
import { codecV2, RunManifestSchema } from "../src/index.js";

/**
 * The nine keys that were undeclared in `RunManifestSchema` before the
 * 2026-10-16 closeout review (CR1) — parse used to strip them silently.
 * `route`, `renderPath`, `audioRender`, and `audioPlan` were already declared
 * as typed spine fields; the core package's `manifest-rows.test.ts` covers
 * the full 13-key fold → validate → parse round-trip.
 *
 * Since the S7e value promotion, `image.decoder` is a typed contract: its
 * marker below is a valid receipt, and a malformed row refuses the parse.
 * The other eight CR1 keys stay permissive (`z.unknown()`) until promoted.
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
      const marker = markerFor(key);
      const parsed = RunManifestSchema.safeParse({ ...failedImageManifest(), [key]: marker });
      expect(parsed.success, key).toBe(true);
      if (parsed.success) {
        expect((parsed.data as Record<string, unknown>)[key], key).toEqual(marker);
      }
    }
  });

  it("enforces the promoted image.decoder contract at the schema boundary (S7e)", () => {
    // Pre-S7e receipts record no runtime and must keep parsing.
    const legacyReceipt = {
      lane: "injected-bridge",
      decoderId: "llamagen-frozen-vq-v0",
      decoderHash: "b".repeat(64),
      determinismClass: "byte-parity",
    };
    const legacy = RunManifestSchema.safeParse({
      ...failedImageManifest(),
      "image.decoder": legacyReceipt,
    });
    expect(legacy.success).toBe(true);
    if (legacy.success) {
      expect((legacy.data as Record<string, unknown>)["image.decoder"]).toEqual(legacyReceipt);
    }

    // A malformed known field refuses the whole manifest with a path-precise
    // issue — the row no longer slides through as `unknown` (S7e promotion;
    // this boundary replaced replay's hand-validated
    // `MANIFEST_IMAGE_DECODER_INVALID` refusal).
    const malformed = RunManifestSchema.safeParse({
      ...failedImageManifest(),
      "image.decoder": { ...legacyReceipt, decoderId: 42 },
    });
    expect(malformed.success).toBe(false);
    if (!malformed.success) {
      expect(
        malformed.error.issues.some(
          (issue) => issue.path[0] === "image.decoder" && issue.path[1] === "decoderId",
        ),
      ).toBe(true);
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

/**
 * One parse-preserving marker per CR1-declared key. Eight keys are declared
 * permissively (`z.unknown()`), so any marker round-trips; `image.decoder`
 * is a typed contract since the S7e value promotion and needs a valid
 * receipt — runtime identity included — to pass the canonical parse.
 */
function markerFor(key: (typeof DECLARED_BY_CR1)[number]): unknown {
  return key === "image.decoder" ? IMAGE_DECODER_MARKER : { marker: key };
}

const IMAGE_DECODER_MARKER = {
  lane: "injected-bridge",
  decoderId: "llamagen-frozen-vq-v0",
  decoderHash: "a".repeat(64),
  determinismClass: "structural-parity",
  runtime: { name: "onnxruntime-node", version: "1.30.0", executionProviders: ["cpu"] },
};

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
