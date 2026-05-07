import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { codecV2 } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { imageV2Codec } from "../src/codec.js";

describe("image v2 round trip", () => {
  it("produces an artifact and manifest rows", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-image-v2-"));
    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "otter portrait" },
      {
        runId: "r1",
        parentRunId: null,
        runDir,
        seed: null,
        outPath: resolve(runDir, "out.png"),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        clock: { now: () => 0, iso: () => new Date(0).toISOString() },
        sidecar: codecV2.createRunSidecar(),
        services: { dryRun: true, telemetry: { writeText: async () => {} } },
        fork: (childRunId) => ({
          runId: childRunId,
          parentRunId: "r1",
          runDir,
          seed: null,
          outPath: resolve(runDir, "out.png"),
          logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
          clock: { now: () => 0, iso: () => new Date(0).toISOString() },
          sidecar: codecV2.createRunSidecar(),
          services: { dryRun: true, telemetry: { writeText: async () => {} } },
          fork: () => {
            throw new Error("unused");
          },
        }),
      },
    );
    expect(art.mime).toBe("image/png");
    expect(art.metadata.route).toBe("raster");
    expect(art.metadata.imageCode).toMatchObject({
      mode: "one-shot-vsc",
      path: "visual-seed-code",
      hasSeedCode: true,
      hasSemantic: true,
      hasEmittedSemantic: true,
      hasEffectiveSemantic: true,
      semanticSource: "emitted",
      seedFamily: "witt-dry-run",
      seedLength: 32,
    });
    expect(imageV2Codec.manifestRows(art).map((row) => row.key)).toEqual([
      "route",
      "renderPath",
      "image.code",
      "quality.structural",
      "quality.partial",
      "metadata.warnings",
      "L4.adapterHash",
      "L5.decoderHash",
      "artifact.sha256",
    ]);
    expect(
      imageV2Codec.manifestRows(art).find((row) => row.key === "renderPath")?.value,
    ).toBe("visual-seed-code");
    expect(imageV2Codec.manifestRows(art).find((row) => row.key === "image.code")?.value).toEqual(
      art.metadata.imageCode,
    );
  });
});
