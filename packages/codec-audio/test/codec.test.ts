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
    expect(art.metadata.audioPlan).toMatchObject({
      route: "speech",
      script: "Wittgenstein ships a hackathon-ready audio demo.",
      scriptChars: 48,
      voice: {
        speaker: "neutral",
        tone: "clear",
        language: "en",
      },
      prosody: {
        tone: "clear",
        language: "en",
      },
      timing: {
        timelineEvents: 0,
      },
      ambient: {
        category: "rain",
        level: 0.22,
      },
      backend: "procedural-audio-runtime",
    });
    expect(art.metadata.audioPlan.route).toBe(art.metadata.route);
    expect(art.metadata.audioPlan.scriptSha256).toHaveLength(64);
    expect(art.metadata.audioPlan.timing.durationSec).toBeGreaterThan(0);
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
    expect(art.metadata.audioPlan).toMatchObject({
      route: "music",
      motif: "A small procedural melody.",
      rhythm: {
        bpm: 120,
        key: "C",
      },
      eventGrid: {
        stepSec: 5_512 / 22_050,
      },
      chord: {
        frequenciesHz: [220, 261.63, 329.63, 392, 440],
      },
      ambient: {
        level: 0.17600000000000002,
      },
    });
    expect(art.metadata.audioPlan.route).toBe(art.metadata.route);
    expect(art.metadata.audioPlan.motifSha256).toHaveLength(64);
    expect(art.metadata.audioPlan.eventGrid.steps).toBeGreaterThan(0);
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
    expect(art.metadata.audioPlan).toMatchObject({
      route: "soundscape",
      operatorGraph: {
        source: "procedural-ambient",
        category: "rain",
        seed: 7,
        nodes: ["ambient:rain", "filter:low-pass"],
      },
      envelope: {
        level: 0.22,
      },
      filter: {
        type: "low-pass",
        alpha: 0.24,
      },
    });
    expect(art.metadata.audioPlan.route).toBe(art.metadata.route);
    expect(art.metadata.audioPlan.envelope.durationSec).toBeGreaterThan(0);
    expect(art.metadata.warnings).toEqual([]);
    expect(warnings).toEqual([]);
  });

  // Schema-driven intent routing (#355). `inferIntentRoute` reads its
  // keyword table off `AudioRouteSchema.options` instead of a hardcoded
  // branch tree; these tests pin the routing contract via the codec's
  // public route matchers.
  it.each([
    { prompt: "upbeat music score with motif", expected: "music" },
    { prompt: "a calm forest soundscape with rain", expected: "soundscape" },
    { prompt: "narrator reads a story", expected: "speech" },
    { prompt: "", expected: "speech" }, // empty prompt falls through to speech
  ])("infers route '$expected' for prompt: $prompt", ({ prompt, expected }) => {
    const req = { modality: "audio" as const, prompt };
    const matched = audioCodec.routes.find((r) => r.match(req));
    expect(matched?.id).toBe(expected);
  });
});

// Schema-boundary negative tests (#383). The audio plan parser MUST reject
// malformed input with a structured error code, never silently succeed.
// These tests pin that contract so a future schema change doesn't quietly
// regress to "accept anything."
describe("parseAudioPlan — negative input cases (Issue #383)", () => {
  it("returns AUDIO_SCHEMA_PARSE_FAILED for non-JSON input", () => {
    const result = parseAudioPlan("not-json-at-all");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_PARSE_FAILED");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for an unknown route", () => {
    const result = parseAudioPlan(JSON.stringify({ route: "telepathy" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for wrong-type route", () => {
    const result = parseAudioPlan(JSON.stringify({ route: 42 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for an unknown ambient category", () => {
    const result = parseAudioPlan(
      JSON.stringify({ route: "speech", ambient: { category: "subway", level: 0.5 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for ambient level out of range", () => {
    const result = parseAudioPlan(
      JSON.stringify({ route: "speech", ambient: { category: "rain", level: 1.7 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for negative ambient level", () => {
    const result = parseAudioPlan(
      JSON.stringify({ route: "speech", ambient: { category: "rain", level: -0.1 } }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for negative bpm in music", () => {
    const result = parseAudioPlan(JSON.stringify({ route: "music", music: { bpm: -10 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for negative timeline atSec", () => {
    const result = parseAudioPlan(
      JSON.stringify({ route: "speech", timeline: [{ atSec: -1, event: "start" }] }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("returns AUDIO_SCHEMA_INVALID for timeline missing event field", () => {
    const result = parseAudioPlan(JSON.stringify({ route: "speech", timeline: [{ atSec: 0 }] }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("AUDIO_SCHEMA_INVALID");
    }
  });

  it("accepts an empty object (all fields default)", () => {
    // Positive control: the schema's defaults make `{}` valid. If a future
    // change makes any field required-without-default, this test fails and
    // forces an explicit decision.
    const result = parseAudioPlan("{}");
    expect(result.ok).toBe(true);
  });
});
