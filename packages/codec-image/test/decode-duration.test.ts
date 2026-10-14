import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { codecV2 } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { imageV2Codec } from "../src/codec.js";

/**
 * Guard for the F1 defect (2026-10-16 recovery session):
 * `ImageCodec.decode()` once recorded `ctx.clock.now()` — epoch milliseconds —
 * directly into `metadata.durationMs`. This test pins the elapsed-duration
 * contract so the bug cannot silently return.
 */
describe("image v2 decode duration receipt", () => {
  it("records elapsed phase duration, not epoch clock time", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-image-duration-"));

    // Advancing fake clock: 1000ms elapses across the produce() call.
    const calls: number[] = [];
    let now = 1_700_000_000_000;
    const clock = {
      now: () => {
        calls.push(now);
        const value = now;
        now += 500;
        return value;
      },
      iso: () => new Date(now).toISOString(),
    };

    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "calm lake at dusk" },
      {
        runId: "duration-1",
        parentRunId: null,
        runDir,
        seed: null,
        outPath: resolve(runDir, "out.png"),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        clock,
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

    expect(calls.length).toBeGreaterThan(0);
    // Elapsed time across the decode phase: 500ms per clock tick, at most a
    // few ticks in this pipeline. Epoch would be ~1.7e12.
    expect(art.metadata.durationMs).toBeGreaterThanOrEqual(0);
    expect(art.metadata.durationMs).toBeLessThan(10_000);
    expect(art.metadata.durationMs).not.toBe(0);
  });
});
