import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AudioRequest } from "@wittgenstein/schemas";
import { codecV2 } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { audioCodec } from "../src/index.js";
import type { AudioArtifact } from "../src/types.js";

interface AudioParityRun {
  readonly art: AudioArtifact;
  readonly sha256: string;
}

const PROCEDURAL_AUDIO_GOLDENS = {
  speech: "6f7696baa84e5c77b6ec8bc9384703d127272030d3fb1a7ff5a62277b36519c2",
  soundscape: "473ae42bc4cd0debdc547c5c484fe9f9d69e40c3cc2e361c7101384cf2d3f997",
  music: "3d09cd6d44d11d72c5b4e3fc3a4444c5ab56624d902cdf18d77cfadd0218b794",
} as const;

describe("@wittgenstein/codec-audio parity", () => {
  it("keeps speech procedural runtime parity honest", async () => {
    const runs = await produceRepeated(
      {
        modality: "audio",
        prompt: "A concise spoken launch line for codec parity.",
        ambient: "rain",
      },
      "speech",
    );

    expect(new Set(runs.map((run) => run.sha256)).size).toBe(1);
    expect(runs[0]?.sha256).toBe(PROCEDURAL_AUDIO_GOLDENS.speech);
    expectStableAudioRender(runs, "speech");
  });

  it("keeps soundscape byte-for-byte deterministic with manifest evidence", async () => {
    const runs = await produceRepeated(
      {
        modality: "audio",
        prompt: "Forest rain ambience with a soft morning texture.",
        ambient: "forest",
      },
      "soundscape",
    );

    expect(new Set(runs.map((run) => run.sha256)).size).toBe(1);
    expect(runs[0]?.sha256).toBe(PROCEDURAL_AUDIO_GOLDENS.soundscape);
    expectStableAudioRender(runs, "soundscape");
  });

  it("keeps music byte-for-byte deterministic with manifest evidence", async () => {
    const runs = await produceRepeated(
      {
        modality: "audio",
        prompt: "A lightweight launch soundtrack with a slow synthetic pulse.",
        ambient: "electronic",
      },
      "music",
    );

    expect(new Set(runs.map((run) => run.sha256)).size).toBe(1);
    expect(runs[0]?.sha256).toBe(PROCEDURAL_AUDIO_GOLDENS.music);
    expectStableAudioRender(runs, "music");
  });
});

async function produceRepeated(
  request: AudioRequest,
  expectedRoute: "speech" | "soundscape" | "music",
): Promise<AudioParityRun[]> {
  const runs: AudioParityRun[] = [];
  for (let index = 0; index < 3; index += 1) {
    const dir = await mkdtemp(join(tmpdir(), "witt-audio-parity-"));
    const art = await audioCodec.produce(request, {
      runId: `parity-${expectedRoute}-${index}`,
      parentRunId: null,
      runDir: dir,
      seed: 73,
      outPath: join(dir, `${expectedRoute}.wav`),
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      clock: {
        now: () => 1_900_000_000_000 + index,
        iso: () => new Date(1_900_000_000_000 + index).toISOString(),
      },
      sidecar: codecV2.createRunSidecar(),
      services: {
        dryRun: true,
      },
      fork: () => {
        throw new Error("not used in this test");
      },
    });
    const bytes = await readFile(art.outPath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    expect(art.metadata.route).toBe(expectedRoute);
    runs.push({ art, sha256 });
  }
  return runs;
}

function expectStableAudioRender(
  runs: readonly AudioParityRun[],
  route: "speech" | "soundscape" | "music",
): void {
  const [first] = runs;
  expect(first).toBeDefined();
  for (const run of runs) {
    const manifestRows = Object.fromEntries(
      audioCodec.manifestRows(run.art).map((row) => [row.key, row.value]),
    );

    expect(run.art.metadata.artifactSha256).toBe(run.sha256);
    expect(run.art.metadata.audioRender).toEqual(first!.art.metadata.audioRender);
    expect(run.art.metadata.audioRender).toMatchObject({
      sampleRateHz: 22_050,
      channels: 1,
      container: "wav",
      bitDepth: 16,
      determinismClass: "byte-parity",
      decoderId: "procedural-audio-runtime",
    });
    expect(run.art.metadata.audioRender.durationSec).toBeGreaterThan(0);
    expect(run.art.metadata.quality.structural).toEqual({
      schemaValidated: true,
      route,
      determinismClass: "byte-parity",
    });
    expect(run.art.metadata.quality.partial).toEqual({
      reason: "procedural-runtime",
    });
    expect(manifestRows.route).toBe(route);
    expect(manifestRows.audioRender).toEqual(run.art.metadata.audioRender);
    expect(manifestRows["artifact.sha256"]).toBe(run.sha256);
  }
}
