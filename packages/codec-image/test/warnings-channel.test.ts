import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { codecV2 } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { imageV2Codec } from "../src/codec.js";

describe("image v2 warnings channel", () => {
  it("surfaces declared warning codes from adapter/decode warns", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-image-warn-"));
    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "misty shoreline" },
      {
        runId: "warn-1",
        parentRunId: null,
        runDir,
        seed: null,
        outPath: resolve(runDir, "out.png"),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        clock: { now: () => 0, iso: () => new Date(0).toISOString() },
        sidecar: codecV2.createRunSidecar(),
        services: {
          telemetry: { writeText: async () => {} },
          llm: {
            provider: "test",
            model: "test",
            maxOutputTokens: 1024,
            temperature: 0,
            generate: async () => ({
              text: "{}",
              tokens: { input: 1, output: 1 },
              costUsd: 0,
            }),
          },
        },
        fork: () => {
          throw new Error("unused");
        },
      },
    );
    expect(
      art.metadata.warnings.some((warning) => warning.code === imageV2Codec.warnings.adapter_stub),
    ).toBe(true);
  });

  it("declares image/coarse-vq-invalid + image/seed-code-invalid warning codes for adapter fall-through", () => {
    expect(imageV2Codec.warnings.coarse_vq_invalid).toBe("image/coarse-vq-invalid");
    expect(imageV2Codec.warnings.seed_code_invalid).toBe("image/seed-code-invalid");
  });
});
