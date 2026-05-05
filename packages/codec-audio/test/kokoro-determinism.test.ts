import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AudioRequest } from "@wittgenstein/schemas";
import { codecV2 } from "@wittgenstein/schemas";
import { describe, expect, it } from "vitest";
import { audioCodec } from "../src/index.js";

/*
 * Local-only determinism probe for the Kokoro backend. Skipped on CI;
 * locally, the first run downloads ~325 MB of Kokoro weights through
 * kokoro-js / transformers.js (cached under
 * `<repo>/node_modules/.pnpm/@huggingface+transformers@<v>/node_modules/@huggingface/transformers/.cache/onnx-community/Kokoro-82M-ONNX/`)
 * — subsequent runs are sub-second. To opt in:
 *
 *   WITTGENSTEIN_KOKORO_TEST=1 pnpm --filter @wittgenstein/codec-audio test
 *
 * This is the single-machine version of Brief I §H I.7. The cross-platform
 * sweep is M2 Slice E (#118), not this file.
 */

const SHOULD_SKIP =
  process.env.CI === "true" ||
  process.env.CI === "1" ||
  process.env.WITTGENSTEIN_KOKORO_TEST !== "1";

describe.skipIf(SHOULD_SKIP)(
  "@wittgenstein/codec-audio Kokoro determinism (local-only, opt-in via cached weights)",
  () => {
    it("produces byte-identical WAV across 3 back-to-back same-seed invocations", async () => {
      const restore = withEnv("WITTGENSTEIN_AUDIO_BACKEND", "kokoro");
      try {
        const shas = await produceKokoroRunShas(3);
        expect(new Set(shas).size).toBe(1);
      } finally {
        restore();
      }
    });

    it("writes honest manifest evidence — kokoro-82M decoderId, 24 kHz, structural-parity", async () => {
      const restore = withEnv("WITTGENSTEIN_AUDIO_BACKEND", "kokoro");
      try {
        const dir = await mkdtemp(join(tmpdir(), "witt-kokoro-manifest-"));
        const art = await audioCodec.produce(buildSpeechRequest(), buildCtx(dir, 0));
        expect(art.metadata.audioRender.decoderId).toMatch(/^kokoro-82M:[0-9a-f]{64}$/);
        expect(art.metadata.audioRender.determinismClass).toBe("structural-parity");
        expect(art.metadata.audioRender.sampleRateHz).toBe(24_000);
        expect(art.metadata.quality.partial.reason).toBe("kokoro-cross-platform-pending");
        expect(art.metadata.decoderHash.slot).toBe("Kokoro-82M-family-decoder");
      } finally {
        restore();
      }
    });

    it("emits audio/kokoro-backend-not-applicable warning when route is non-speech", async () => {
      const restore = withEnv("WITTGENSTEIN_AUDIO_BACKEND", "kokoro");
      try {
        const dir = await mkdtemp(join(tmpdir(), "witt-kokoro-warn-"));
        const ctx = buildCtx(dir, 0);
        const soundscapeReq: AudioRequest = {
          modality: "audio",
          prompt: "Forest rain ambience for codec parity.",
          ambient: "forest",
        };
        const art = await audioCodec.produce(soundscapeReq, ctx);
        // Falls through to procedural; manifest tells the truth.
        expect(art.metadata.audioRender.decoderId).toBe("procedural-audio-runtime");
        expect(art.metadata.audioRender.determinismClass).toBe("byte-parity");
        // But sidecar carries the explicit warning.
        const codes = ctx.sidecar.warnings.map((w) => w.code);
        expect(codes).toContain("audio/kokoro-backend-not-applicable");
      } finally {
        restore();
      }
    });
  },
);

async function produceKokoroRunShas(count: number): Promise<string[]> {
  const shas: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const dir = await mkdtemp(join(tmpdir(), `witt-kokoro-det-${i}-`));
    const art = await audioCodec.produce(buildSpeechRequest(), buildCtx(dir, i));
    const bytes = await readFile(art.outPath);
    shas.push(createHash("sha256").update(bytes).digest("hex"));
  }
  return shas;
}

function buildSpeechRequest(): AudioRequest {
  return {
    modality: "audio",
    prompt: "Hello world. This is a Kokoro determinism check.",
    ambient: "silence",
  };
}

function buildCtx(dir: string, index: number): codecV2.HarnessCtx {
  return {
    runId: `kokoro-test-${index}`,
    parentRunId: null,
    runDir: dir,
    seed: 7,
    outPath: join(dir, "kokoro.wav"),
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
  };
}

function withEnv(name: string, value: string): () => void {
  const original = process.env[name];
  process.env[name] = value;
  return () => {
    if (original === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = original;
    }
  };
}
