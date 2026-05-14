import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import manifestJson from "./manifest.json" with { type: "json" };

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

export const KOKORO_MANIFEST = manifestJson as KokoroDecoderManifest;

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
      },
    ): Promise<KokoroTtsLike>;
  };
};

type TransformersEnvModule = {
  env: { cacheDir: string };
};

export interface KokoroDecoder {
  /** Synthesize `text` and write a WAV file to `outPath`. */
  synthesize(text: string, voice: string, outPath: string): Promise<{ sampleRate: number }>;
  /** Stable identifier suitable for `audioRender.decoderId`. */
  readonly decoderId: string;
  /** Pinned manifest values used to construct this decoder. */
  readonly manifest: KokoroDecoderManifest;
}

let cachedDecoder: KokoroDecoder | null = null;
let proxyDispatcherInstalled = false;

/**
 * Node's global `fetch` (undici) does NOT honor `HTTP_PROXY` / `HTTPS_PROXY`
 * env vars by default — kokoro-js / transformers.js call `fetch` to download
 * weights from HuggingFace, so behind a corp / regional proxy the download
 * silently times out. Install undici's `EnvHttpProxyAgent` as the global
 * dispatcher when proxy env vars are present so the existing curl-style
 * proxy story carries into Node fetch.
 *
 * No-op when no proxy env var is set; harmless on CI.
 */
async function ensureProxyDispatcher(): Promise<void> {
  if (proxyDispatcherInstalled) {
    return;
  }
  proxyDispatcherInstalled = true;
  if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY) {
    return;
  }
  const undici = await import("undici");
  undici.setGlobalDispatcher(new undici.EnvHttpProxyAgent());
}

/**
 * Lazy-load Kokoro-82M (fp32, CPU) and return a thin synthesize/save wrapper.
 *
 * Integrity story is layered:
 *   1. `pnpm-lock.yaml` pins `kokoro-js@1.2.1` (the npm package bundles
 *      `voices/<name>.bin` directly, so voice files come from the locked
 *      npm tarball, not from HuggingFace).
 *   2. `manifest.json#revision` records the HuggingFace commit we audited
 *      against (`f46687f7e41512228ae953af24a11b2640ea0f22`, 2025-02-07).
 *      kokoro-js@1.2.1 does NOT pass `revision` through to transformers.js
 *      — it always fetches `main` — so the next layer is the only thing
 *      that catches HF main drift.
 *   3. Post-load SHA-256 verification:
 *      - weights at `<transformers.env.cacheDir>/<repoId>/<weightsFilename>`
 *        must match `manifest.json#weightsSha256`.
 *      - voice at `<kokoro-js package>/voices/<voice>.bin` must match
 *        `manifest.json#voicesSha256`.
 *      Mismatch is a hard error — refuses to engage Kokoro rather than
 *      lying about which decoder ran.
 */
export async function getKokoroDecoder(): Promise<KokoroDecoder> {
  if (cachedDecoder !== null) {
    return cachedDecoder;
  }

  await ensureProxyDispatcher();

  const kokoroMod = await importRuntime<KokoroTtsLoader>("kokoro-js");
  const transformersMod = await importRuntime<TransformersEnvModule>("@huggingface/transformers");

  const tts = await kokoroMod.KokoroTTS.from_pretrained(KOKORO_MANIFEST.repoId, {
    dtype: KOKORO_MANIFEST.dtype,
    device: "cpu",
  });

  await verifyCachedAssetIntegrity(transformersMod);

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

async function importRuntime<T>(moduleId: string): Promise<T> {
  const dynamicImport = new Function("id", "return import(id)") as (id: string) => Promise<T>;
  return dynamicImport(moduleId);
}

async function verifyCachedAssetIntegrity(transformersMod: TransformersEnvModule): Promise<void> {
  const weightsPath = join(
    transformersMod.env.cacheDir,
    KOKORO_MANIFEST.repoId,
    KOKORO_MANIFEST.weightsFilename,
  );
  const voicesPath = resolveBundledVoicePath();

  const [actualWeights, actualVoices] = await Promise.all([
    sha256OfFile(weightsPath),
    sha256OfFile(voicesPath),
  ]);

  if (actualWeights !== KOKORO_MANIFEST.weightsSha256) {
    throw integrityError(
      `Kokoro weights SHA-256 mismatch at ${weightsPath}: expected ${KOKORO_MANIFEST.weightsSha256}, got ${actualWeights}. ` +
        `kokoro-js@${KOKORO_MANIFEST.kokoroJsVersion} does not pass \`revision\` through to transformers.js, so this check is the only catch for HuggingFace ${KOKORO_MANIFEST.repoId} 'main' drift away from commit ${KOKORO_MANIFEST.revision}. ` +
        `If main has moved intentionally, update manifest.json's revision + weightsSha256.`,
    );
  }

  if (actualVoices !== KOKORO_MANIFEST.voicesSha256) {
    throw integrityError(
      `Kokoro voice file SHA-256 mismatch at ${voicesPath}: expected ${KOKORO_MANIFEST.voicesSha256}, got ${actualVoices}. ` +
        `kokoro-js bundles voice files in its npm package, so a mismatch here implies a corrupted \`node_modules\` or a kokoro-js version drift not reflected in pnpm-lock.`,
    );
  }
}

// Mirrors @wittgenstein/core's serializeError() duck-type contract:
// an Error-shaped object with a string `code` is recognized and the
// code is preserved in the run manifest. Codec packages do not import
// @wittgenstein/core (boundary kept clean per scripts/check-codec-
// boundaries.mjs). When/if error classes move to @wittgenstein/schemas
// per the #170 architectural follow-up, this helper goes away.
function integrityError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), {
    name: "WittgensteinError",
    code: "INTEGRITY_MISMATCH",
  });
}

function resolveBundledVoicePath(): string {
  // kokoro-js's main entry resolves to `<pkg>/dist/kokoro.js`; voices/ is a
  // sibling of dist/. Walk up two dirs from the resolved entry to land on
  // the package root. `createRequire` works in both Node CLI and the vitest
  // SSR environment; `import.meta.resolve` is CLI-only.
  const requireFromHere = createRequireFromRuntime();
  const entryPath = requireFromHere.resolve("kokoro-js");
  const packageRoot = dirname(dirname(entryPath));
  return join(packageRoot, KOKORO_MANIFEST.voicesFilename);
}

function createRequireFromRuntime(): NodeRequire {
  if (typeof import.meta.url === "string") {
    return createRequire(import.meta.url);
  }
  const cjsFilename = new Function(
    "return typeof __filename === 'string' ? __filename : undefined",
  )() as string | undefined;
  return createRequire(cjsFilename ?? resolve(process.cwd(), "index.js"));
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
