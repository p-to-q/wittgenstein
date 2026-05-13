import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { codecV2 } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { audioCodec, parseAudioPlan } from "../src/index.js";

describe("@wittgenstein/codec-audio", () => {
  it("exports a typed v2 audio codec with default route validation", async () => {
    expect(audioCodec.name).toBe("audio");
    expect(audioCodec.id).toBe("audio");
    const validated = await audioCodec.schema["~standard"].validate({
      modality: "audio",
      prompt: "Render a short audio artifact.",
    });
    expect("value" in validated).toBe(true);
    expect(parseAudioPlan("{}").ok).toBe(true);
  });

  it("produces a wav artifact for speech with ambient overlay", async () => {
    const dir = await mkdtemp(join(tmpdir(), "witt-audio-"));
    const warnings: string[] = [];
    const art = await audioCodec.produce(
      {
        modality: "audio",
        prompt: "Wittgenstein ships a hackathon-ready audio demo.",
        route: "speech",
        ambient: "rain",
      },
      {
        runId: "test-run",
        parentRunId: null,
        runDir: dir,
        seed: 7,
        outPath: join(dir, "speech.wav"),
        logger: {
          debug: () => {},
          info: () => {},
          warn: (message) => {
            warnings.push(message);
          },
          error: () => {},
        },
        clock: {
          now: () => Date.now(),
          iso: () => new Date().toISOString(),
        },
        sidecar: codecV2.createRunSidecar(),
        services: {
          dryRun: true,
        },
        fork: () => {
          throw new Error("not used in this test");
        },
      },
    );

    expect(art.mime).toBe("audio/wav");
    expect(art.outPath.endsWith(".wav")).toBe(true);
    expect(art.metadata.route).toBe("speech");
    expect(art.metadata.costUsd).toBeNull();
    expect(art.metadata.costUsdReason).toBe("no-llm-call");
    expect(art.metadata.audioRender).toMatchObject({
      sampleRateHz: 22_050,
      channels: 1,
      container: "wav",
      bitDepth: 16,
      determinismClass: "byte-parity",
      decoderId: "procedural-audio-runtime",
    });
    expect(art.metadata.warnings).toEqual([
      expect.objectContaining({
        code: "audio/route-deprecated",
      }),
    ]);
    expect(warnings).toEqual([
      "`AudioRequest.route` is deprecated and will be removed after one minor version. Audio routing now lives inside `AudioCodec.route()`; keep `--route` only for compatibility while migrating callers to modality-level intent.",
    ]);
    expect(art.metadata.artifactSha256).toHaveLength(64);
    expect((await stat(art.outPath)).size).toBeGreaterThan(44);
  });

  it("keeps request-side route hints in codec-owned routing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "witt-audio-"));
    const warnings: string[] = [];
    const art = await audioCodec.produce(
      {
        modality: "audio",
        prompt: "A small procedural melody.",
        route: "music",
      },
      {
        runId: "test-run",
        runDir: dir,
        seed: 7,
        parentRunId: null,
        outPath: join(dir, "music.wav"),
        logger: {
          debug: () => {},
          info: () => {},
          warn: (message) => {
            warnings.push(message);
          },
          error: () => {},
        },
        clock: {
          now: () => Date.now(),
          iso: () => new Date().toISOString(),
        },
        sidecar: codecV2.createRunSidecar(),
        services: {
          dryRun: true,
        },
        fork: () => {
          throw new Error("not used in this test");
        },
      },
    );

    expect(art.metadata.route).toBe("music");
    expect(art.metadata.warnings).toEqual([
      expect.objectContaining({
        code: "audio/route-deprecated",
      }),
    ]);
    expect(warnings).toEqual([
      "`AudioRequest.route` is deprecated and will be removed after one minor version. Audio routing now lives inside `AudioCodec.route()`; keep `--route` only for compatibility while migrating callers to modality-level intent.",
    ]);
    expect((await stat(art.outPath)).size).toBeGreaterThan(44);
  });

  it("routes soundtrack-style dry-run prompts to music without a deprecation warning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "witt-audio-"));
    const warnings: string[] = [];
    const art = await audioCodec.produce(
      {
        modality: "audio",
        prompt: "A lightweight launch soundtrack with a slow synthetic pulse.",
      },
      {
        runId: "test-run",
        parentRunId: null,
        runDir: dir,
        seed: 7,
        outPath: join(dir, "intent-music.wav"),
        logger: {
          debug: () => {},
          info: () => {},
          warn: (message) => {
            warnings.push(message);
          },
          error: () => {},
        },
        clock: {
          now: () => Date.now(),
          iso: () => new Date().toISOString(),
        },
        sidecar: codecV2.createRunSidecar(),
        services: {
          dryRun: true,
        },
        fork: () => {
          throw new Error("not used in this test");
        },
      },
    );

    expect(art.metadata.route).toBe("music");
    expect(art.metadata.warnings).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("routes ambient no-route dry-run prompts to soundscape without a deprecation warning", async () => {
    const dir = await mkdtemp(join(tmpdir(), "witt-audio-"));
    const warnings: string[] = [];
    const art = await audioCodec.produce(
      {
        modality: "audio",
        prompt: "Forest rain ambience with a soft morning texture.",
      },
      {
        runId: "test-run",
        parentRunId: null,
        runDir: dir,
        seed: 7,
        outPath: join(dir, "intent-soundscape.wav"),
        logger: {
          debug: () => {},
          info: () => {},
          warn: (message) => {
            warnings.push(message);
          },
          error: () => {},
        },
        clock: {
          now: () => Date.now(),
          iso: () => new Date().toISOString(),
        },
        sidecar: codecV2.createRunSidecar(),
        services: {
          dryRun: true,
        },
        fork: () => {
          throw new Error("not used in this test");
        },
      },
    );

    expect(art.metadata.route).toBe("soundscape");
    expect(art.metadata.warnings).toEqual([]);
    expect(warnings).toEqual([]);
  });
});
