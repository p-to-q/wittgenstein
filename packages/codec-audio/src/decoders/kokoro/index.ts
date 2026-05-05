import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("./manifest.json", import.meta.url));

export interface KokoroDecoderManifest {
  readonly repoId: string;
  readonly revision: string;
  readonly weightsFilename: string;
  readonly weightsSha256: string;
  readonly voicesFilename: string;
  readonly voicesSha256: string;
  readonly voiceDefault: string;
  readonly dtype: "fp32";
  readonly kokoroJsVersion: string;
}

export const KOKORO_MANIFEST: KokoroDecoderManifest = JSON.parse(
  readFileSync(manifestPath, "utf8"),
) as KokoroDecoderManifest;

interface RawAudioLike {
  readonly audio: Float32Array;
  readonly sampling_rate: number;
  save(outPath: string): Promise<void>;
}

interface KokoroTtsLike {
  generate(text: string, options: { voice: string }): Promise<RawAudioLike>;
}

type KokoroTtsLoader = {
  KokoroTTS: {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- kokoro-js exports this as snake_case (Python lineage); upstream API, not a Wittgenstein contract.
    from_pretrained(
      modelId: string,
      options: {
        dtype: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
        device: "cpu" | "wasm" | "webgpu";
        revision?: string;
      },
    ): Promise<KokoroTtsLike>;
  };
};

export interface KokoroDecoder {
  /** Synthesize `text` and write a WAV file to `outPath`. */
  synthesize(
    text: string,
    voice: string,
    outPath: string,
  ): Promise<{ sampleRate: number }>;
  /** Stable identifier suitable for `audioRender.decoderId`. */
  readonly decoderId: string;
  /** Pinned manifest values used to construct this decoder. */
  readonly manifest: KokoroDecoderManifest;
}

let cachedDecoder: KokoroDecoder | null = null;

/**
 * Lazy-load Kokoro-82M (fp32, CPU, pinned to a specific HF commit) and return a
 * thin synthesize/save wrapper. The first call downloads weights through
 * `kokoro-js` (transformers.js under the hood) and then verifies the cached
 * weight + voice files against the SHA-256 values in `manifest.json`.
 *
 * Pinning is layered: pnpm-lock fixes the `kokoro-js` package version,
 * `manifest.json#revision` fixes the HuggingFace commit. The post-load SHA
 * check is the third receipt — a cache-corruption / cache-poisoning guard.
 */
export async function getKokoroDecoder(): Promise<KokoroDecoder> {
  if (cachedDecoder !== null) {
    return cachedDecoder;
  }

  const mod = (await import("kokoro-js")) as unknown as KokoroTtsLoader;

  const tts = await mod.KokoroTTS.from_pretrained(KOKORO_MANIFEST.repoId, {
    dtype: KOKORO_MANIFEST.dtype,
    device: "cpu",
    revision: KOKORO_MANIFEST.revision,
  });

  await verifyCachedAssetIntegrity();

  const decoderId = `kokoro-82M:${KOKORO_MANIFEST.weightsSha256}`;

  cachedDecoder = {
    decoderId,
    manifest: KOKORO_MANIFEST,
    async synthesize(text, voice, outPath) {
      const audio = await tts.generate(text, { voice });
      await audio.save(outPath);
      return { sampleRate: audio.sampling_rate };
    },
  };

  return cachedDecoder;
}

/**
 * Walk the transformers.js cache (where `kokoro-js` stores downloaded
 * weights) and SHA-256 the pinned weight + voice files. Mismatch is a hard
 * error — this is the layer-3 receipt that the decoder really did load
 * what `manifest.json` claims.
 *
 * Cache layout convention (transformers.js v3):
 *   $TRANSFORMERS_CACHE/$HF_HOME/hub/
 *     models--{org}--{name}/snapshots/{revision}/{path}
 *
 * `models--{org}--{name}` is the repoId with `/` substituted by `--`.
 */
async function verifyCachedAssetIntegrity(): Promise<void> {
  const cacheRoot = resolveTransformersCacheRoot();
  const repoSlug = `models--${KOKORO_MANIFEST.repoId.replace(/\//g, "--")}`;
  const snapshotRoot = join(
    cacheRoot,
    repoSlug,
    "snapshots",
    KOKORO_MANIFEST.revision,
  );
  const weightsPath = join(snapshotRoot, KOKORO_MANIFEST.weightsFilename);
  const voicesPath = join(snapshotRoot, KOKORO_MANIFEST.voicesFilename);

  const [actualWeights, actualVoices] = await Promise.all([
    sha256OfFile(weightsPath),
    sha256OfFile(voicesPath),
  ]);

  if (actualWeights !== KOKORO_MANIFEST.weightsSha256) {
    throw new Error(
      `Kokoro weights SHA-256 mismatch at ${weightsPath}: expected ${KOKORO_MANIFEST.weightsSha256}, got ${actualWeights}. Refusing to engage Kokoro backend.`,
    );
  }

  if (actualVoices !== KOKORO_MANIFEST.voicesSha256) {
    throw new Error(
      `Kokoro voice file SHA-256 mismatch at ${voicesPath}: expected ${KOKORO_MANIFEST.voicesSha256}, got ${actualVoices}. Refusing to engage Kokoro backend.`,
    );
  }
}

function resolveTransformersCacheRoot(): string {
  // transformers.js precedence: TRANSFORMERS_CACHE > HF_HOME/hub > ~/.cache/huggingface/hub.
  if (process.env.TRANSFORMERS_CACHE) {
    return process.env.TRANSFORMERS_CACHE;
  }
  if (process.env.HF_HOME) {
    return join(process.env.HF_HOME, "hub");
  }
  return join(homedir(), ".cache", "huggingface", "hub");
}

async function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
