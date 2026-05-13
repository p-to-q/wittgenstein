/**
 * Structural-stable golden coverage for codec-image (Issue #347).
 *
 * The dry-run produce() pipeline is deterministic per-platform, but the
 * emitted PNG bytes currently differ between darwin/arm64 and linux/x64 —
 * a real cross-platform reproducibility gap in the procedural placeholder
 * renderer (filed forward from this audit). Until that gap closes, this
 * golden locks the structural metadata that IS stable cross-platform:
 * mime type, route, image-code shape, manifest row keys, PNG magic bytes.
 *
 * When the procedural renderer becomes byte-deterministic across
 * platforms, switch this to a `createHash(...).digest("hex")` lock.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { codecV2 } from "@wittgenstein/schemas";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { imageV2Codec } from "../src/codec.js";

let runDir: string;

beforeEach(async () => {
  runDir = await mkdtemp(resolve(tmpdir(), "witt-image-golden-"));
});

afterEach(async () => {
  await rm(runDir, { recursive: true, force: true });
});

describe("codec-image golden parity (Issue #347)", () => {
  it("imageV2Codec.produce locks structural invariants for the dry-run path", async () => {
    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "otter portrait" },
      {
        runId: "golden",
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
          parentRunId: "golden",
          runDir,
          seed: null,
          outPath: resolve(runDir, "out.png"),
          logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
          clock: { now: () => 0, iso: () => new Date(0).toISOString() },
          sidecar: codecV2.createRunSidecar(),
          services: { dryRun: true, telemetry: { writeText: async () => {} } },
          fork: () => {
            throw Object.assign(
              new Error("Nested fork is not exercised by the golden test."),
              { code: "UNEXPECTED_NESTED_FORK" as const },
            );
          },
        }),
      },
    );
    expect(art.mime).toBe("image/png");
    expect(art.metadata.route).toBe("raster");

    // PNG magic header — the bytes ARE a real PNG, even if the full
    // SHA-256 digest is not yet platform-stable (see file header).
    expect(art.bytes).toBeDefined();
    const bytes = art.bytes as Uint8Array;
    expect(bytes.length).toBeGreaterThan(8);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x4e); // N
    expect(bytes[3]).toBe(0x47); // G

    // Image-code metadata is the doctrine surface — drift here means the
    // codec's path/mode/seed-family identity has changed.
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

    // Manifest row keys are the receipt contract — drift means the spine
    // has changed shape.
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
  });
});
