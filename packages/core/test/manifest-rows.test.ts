import { describe, expect, it } from "vitest";
import type { RunManifest, codecV2 } from "@wittgenstein/schemas";
import { RunManifestSchema } from "@wittgenstein/schemas";
import { foldManifestRows } from "../src/runtime/harness.js";
import { assertRunManifestValid } from "../src/runtime/manifest.js";

type MutableManifest = Record<string, unknown>;

describe("foldManifestRows closed row-key set (2026-10-16 slice A4)", () => {
  it("folds allowed row keys onto the manifest", () => {
    const manifest: MutableManifest = { seed: 7 };
    foldManifestRows(manifest, [
      { key: "image.code", value: { mode: "one-shot-vsc" } },
      { key: "metadata.warnings", value: 2 },
      { key: "route", value: "raster" },
    ]);
    expect(manifest["image.code"]).toEqual({ mode: "one-shot-vsc" });
    expect(manifest["metadata.warnings"]).toBe(2);
    expect(manifest["route"]).toBe("raster");
    // Core fields untouched by unrelated rows.
    expect(manifest["seed"]).toBe(7);
  });

  it("aliases route and artifact.sha256 rows onto the typed manifest fields", () => {
    const manifest: MutableManifest = {};
    foldManifestRows(manifest, [
      { key: "route", value: "speech" },
      { key: "artifact.sha256", value: "abc123" },
    ]);
    expect(manifest["route"]).toBe("speech");
    expect(manifest["artifactSha256"]).toBe("abc123");
  });

  it("rejects unknown row keys with a typed error instead of writing silently", () => {
    const manifest: MutableManifest = { seed: 7 };
    expect(() => {
      // Untyped adversarial input: `ManifestRow.key` is now a closed union,
      // so the runtime guard's caller-side coverage is JS code and raw JSON.
      foldManifestRows(manifest, [{ key: "seed", value: 99 } as unknown as codecV2.ManifestRow]);
    }).toThrowError(
      expect.objectContaining({
        name: "WittgensteinError",
        code: "MANIFEST_ROW_KEY_REJECTED",
      }),
    );
    // Rejection happens before any write: the core field stays intact.
    expect(manifest["seed"]).toBe(7);
  });

  it("rejects unknown keys even when earlier rows were valid", () => {
    const manifest: MutableManifest = {};
    expect(() => {
      foldManifestRows(manifest, [
        { key: "renderPath", value: "raster" },
        { key: "not-a-real-row", value: true } as unknown as codecV2.ManifestRow,
      ]);
    }).toThrowError(expect.objectContaining({ code: "MANIFEST_ROW_KEY_REJECTED" }));
  });
});

describe("row keys survive fold → validate → parse (2026-10-16 closeout review CR1)", () => {
  it("preserves every closed-set key through a canonical schema parse", () => {
    const manifest: MutableManifest = {
      ...rowSpine(),
      ok: true,
      error: null,
      artifactPath: "/tmp/out.png",
      artifactSha256: "0".repeat(64),
    };
    foldManifestRows(
      manifest,
      rowMarkers().map(([key, value]) => ({ key, value })),
    );
    assertRunManifestValid(manifest as unknown as RunManifest);

    const reparsed = RunManifestSchema.parse(manifest) as Record<string, unknown>;
    for (const [key, value] of rowMarkers()) {
      expect(reparsed[key], key).toEqual(value);
    }
    // The dotted artifact row rides with its typed alias.
    expect(reparsed["artifactSha256"]).toBe("f".repeat(64));
  });

  it("still drops keys outside the closed set — the row channel stays closed on read too", () => {
    const parsed = RunManifestSchema.safeParse({
      ...rowSpine(),
      "image.bogus": { smuggled: true },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>)["image.bogus"]).toBeUndefined();
    }
  });
});

/**
 * One marker per closed-set row key. The typed spine aliases (`route`,
 * `renderPath`, `audioRender`, `audioPlan`) need type-valid values; still-
 * permissive row-only keys (`z.unknown()`) accept any marker, while
 * `image.decoder` — the first promoted value contract (S7e) — carries a
 * full receipt so the parse-preservation pass covers the nested runtime
 * identity too.
 */
function rowMarkers(): Array<[codecV2.ManifestRowKey, unknown]> {
  return [
    ["route", "raster"],
    ["renderPath", "raster"],
    ["audioRender", AUDIO_RENDER_MARKER],
    ["audioPlan", AUDIO_PLAN_MARKER],
    ["image.code", { mode: "one-shot-vsc", marker: "image.code" }],
    ["image.adapter", { marker: "image.adapter" }],
    ["image.decoder", IMAGE_DECODER_MARKER],
    ["quality.structural", { marker: "quality.structural" }],
    ["quality.partial", { marker: "quality.partial" }],
    ["metadata.warnings", 3],
    ["L4.adapterHash", { marker: "L4.adapterHash" }],
    ["L5.decoderHash", { marker: "L5.decoderHash" }],
    ["artifact.sha256", "f".repeat(64)],
  ];
}

/**
 * The `image.decoder` marker (S7e value promotion): a full typed receipt —
 * lane, decoder identity, determinism class, and the nested runtime
 * identity — so the parse-preservation pass above proves every field
 * survives fold → validate → parse.
 */
const IMAGE_DECODER_MARKER = {
  lane: "injected-bridge",
  decoderId: "stub-decode-bridge",
  decoderHash: "a".repeat(64),
  determinismClass: "structural-parity",
  runtime: { name: "onnxruntime-node", version: "1.30.0", executionProviders: ["cpu"] },
};

const AUDIO_RENDER_MARKER = {
  sampleRateHz: 22_050,
  channels: 1,
  durationSec: 2.5,
  container: "wav",
  bitDepth: 16,
  determinismClass: "byte-parity",
  decoderId: "procedural-audio-runtime",
  decoderHash: "sha256-placeholder",
};

const AUDIO_PLAN_MARKER = {
  route: "speech",
  script: "hello",
  scriptSha256: "a".repeat(64),
  scriptChars: 5,
  voice: { speaker: "narrator", tone: "calm", language: "en" },
  prosody: { tone: "calm", language: "en" },
  timing: { durationSec: 1.5, timelineEvents: 2 },
  ambient: { category: "auto", level: 0.1 },
  backend: "procedural-audio-runtime",
};

function rowSpine(): Record<string, unknown> {
  return {
    runId: "run-rows",
    gitSha: null,
    lockfileHash: null,
    nodeVersion: process.version,
    wittgensteinVersion: "0.3.0-alpha.3",
    command: "wittgenstein",
    args: ["image", "test"],
    seed: null,
    codec: "image",
    tier: null,
    route: "raster",
    license: { weightsRestriction: "permissive" },
    llmProvider: "openai-compatible",
    llmModel: "gpt-4o-mini",
    llmTokens: { input: 0, output: 0 },
    costUsd: null,
    costUsdReason: "no-llm-call",
    promptRaw: "prompt",
    promptExpanded: null,
    llmOutputRaw: null,
    llmOutputParsed: null,
    artifactPath: null,
    artifactSha256: null,
    startedAt: new Date(0).toISOString(),
    durationMs: 0,
    ok: false,
    error: { code: "SMOKE", message: "smoke" },
  };
}
