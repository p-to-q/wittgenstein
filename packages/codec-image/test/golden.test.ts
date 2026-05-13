/**
 * Byte-stable golden coverage for codec-image (Issue #347).
 *
 * Locks the dry-run produce() pipeline against a SHA-256 digest of the
 * emitted PNG bytes. With `dryRun: true` and `seed: null`, the path is
 * deterministic — no LLM, fixed VSC seed family ("witt-dry-run"), fixed
 * decoder. Any drift in the seed expander, decoder, or PNG encoder will
 * trip the assertion.
 *
 * To regenerate after an intentional pipeline change: replace the expected
 * digest with the value the test prints when it fails.
 */
import { createHash } from "node:crypto";
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
  it("imageV2Codec.produce is byte-stable for a canonical dry-run input", async () => {
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
            throw new Error("unused");
          },
        }),
      },
    );
    expect(art.mime).toBe("image/png");
    expect(art.bytes).toBeDefined();
    const bytes = art.bytes as Uint8Array;
    const digest = createHash("sha256").update(bytes).digest("hex");
    expect(digest).toBe(
      "5b7e24098e12e8f683f641737a0c5707cf6d4f370b57ae3b5545f564f866fee3",
    );
  });
});
