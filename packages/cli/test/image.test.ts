import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunManifest } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { createProgram } from "../src/index.js";
import { imageInspectionPayload, loadImageDecoderBridgeForRun } from "../src/commands/image.js";

describe("image command inspection flags", () => {
  it("registers the image receipt inspection surface", () => {
    const image = createProgram().commands.find((command) => command.name() === "image");
    expect(image?.options.map((option) => option.long).sort()).toEqual([
      "--allow-research-weights",
      "--config",
      "--decoder",
      "--dry-run",
      "--out",
      "--seed",
      "--show-image-code",
      "--show-seed-summary",
      "--show-semantic",
    ]);
  });

  it("omits inspection payloads unless requested", () => {
    expect(imageInspectionPayload(baseManifest(), {})).toBeUndefined();
  });

  it("prints image-code receipt and seed summary from manifest evidence", () => {
    const payload = imageInspectionPayload(baseManifest(), {
      showImageCode: true,
      showSeedSummary: true,
    });

    expect(payload).toMatchObject({
      imageCode: {
        path: "visual-seed-code",
        seedFamily: "witt-dry-run",
        seedMode: "prefix",
        seedLength: 32,
      },
      seedSummary: {
        path: "visual-seed-code",
        seedFamily: "witt-dry-run",
        seedMode: "prefix",
        seedLength: 32,
        coarseVqGrid: null,
        providerLatentGrid: null,
      },
    });
  });

  it("prints semantic source separately from backend seed execution", () => {
    const payload = imageInspectionPayload(baseManifest(), { showSemantic: true });

    expect(payload).toEqual({
      semantic: {
        source: "emitted",
        value: {
          intent: "Dry-run Visual Seed Code plan",
          subject: "otter portrait",
        },
      },
    });
  });
});

function baseManifest(): RunManifest {
  return {
    runId: "r1",
    gitSha: "abc",
    lockfileHash: "def",
    nodeVersion: "v20.19.0",
    wittgensteinVersion: "0.0.0",
    command: "wittgenstein image",
    args: ["image", "otter portrait", "--dry-run"],
    seed: 7,
    codec: "image",
    tier: null,
    route: "raster",
    license: { weightsRestriction: "permissive" },
    llmProvider: "none",
    llmModel: "dry-run",
    llmTokens: { input: 0, output: 0 },
    costUsd: 0,
    costUsdReason: "computed",
    promptRaw: "otter portrait",
    promptExpanded: null,
    llmOutputRaw: null,
    llmOutputParsed: {
      semantic: {
        intent: "Dry-run Visual Seed Code plan",
        subject: "otter portrait",
      },
    },
    artifactPath: "/tmp/out.png",
    artifactSha256: "sha",
    startedAt: new Date(0).toISOString(),
    durationMs: 0,
    ok: true,
    error: null,
    "image.code": {
      mode: "one-shot-vsc",
      path: "visual-seed-code",
      hasSemantic: true,
      hasEmittedSemantic: true,
      hasEffectiveSemantic: true,
      semanticSource: "emitted",
      hasSeedCode: true,
      hasCoarseVq: false,
      hasProviderLatents: false,
      seedFamily: "witt-dry-run",
      seedMode: "prefix",
      seedLength: 32,
      coarseVqGrid: null,
      providerLatentGrid: null,
    },
  } as RunManifest;
}


describe("image --decoder opt-in lane (S7c entry layer)", () => {
  it("loads no bridge when --decoder is not passed", async () => {
    const outcome = await loadImageDecoderBridgeForRun({});
    expect(outcome.bridge).toBeUndefined();
    expect(outcome.error).toBeUndefined();
  });

  it("refuses unknown decoder families with a typed CLI error", async () => {
    const outcome = await loadImageDecoderBridgeForRun({ decoder: "dvae" });
    expect(outcome.bridge).toBeUndefined();
    expect(outcome.error?.code).toBe("INVALID_IMAGE_DECODER");
    expect(outcome.error?.message).toContain("dvae");
  });

  it("surfaces WEIGHTS_NOT_INSTALLED with the install hint when the cache is empty", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "witt-cli-decoder-"));
    try {
      const outcome = await loadImageDecoderBridgeForRun({ decoder: "llamagen", cacheDir });
      expect(outcome.bridge).toBeUndefined();
      expect(outcome.error?.code).toBe("WEIGHTS_NOT_INSTALLED");
      expect(outcome.error?.installHint).toBe("wittgenstein install image");
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
