import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DecoderWeightsManifestSchema,
  DecoderWeightsNotInstalledError,
  DecoderWeightsSha256MismatchError,
  ResearchWeightsRequiresOptInError,
  resolveDecoderWeights,
  type DecoderWeightsManifest,
} from "../src/decoders/weights.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "witt-image-weights-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("decoder weight resolver", () => {
  it("resolves cached weights after sha256 verification", async () => {
    const bytes = new TextEncoder().encode("cached-weights");
    const manifest = manifestFor(bytes);
    const cachePath = join(tmp, manifest.family, manifest.weightsSha256, manifest.weightsFilename);
    await mkdir(join(tmp, manifest.family, manifest.weightsSha256), { recursive: true });
    await writeFile(cachePath, bytes);

    const resolved = await resolveDecoderWeights({ manifest, cacheDir: tmp });

    expect(resolved).toEqual({
      weightsPath: cachePath,
      weightsSha256: manifest.weightsSha256,
      weightsRestriction: "permissive",
      source: "cache-hit",
    });
  });

  it("refuses research-only weights without explicit opt-in", async () => {
    const manifest = manifestFor(new TextEncoder().encode("research"), "research-only");

    await expect(resolveDecoderWeights({ manifest, cacheDir: tmp })).rejects.toBeInstanceOf(
      ResearchWeightsRequiresOptInError,
    );
  });

  it("fetches and caches verified bytes through an injected fetcher", async () => {
    const bytes = new TextEncoder().encode("fetched-weights");
    const manifest = manifestFor(bytes);

    const resolved = await resolveDecoderWeights({
      manifest,
      cacheDir: tmp,
      fetcher: async () => bytes,
    });

    expect(resolved.source).toBe("fetched");
    expect(resolved.weightsSha256).toBe(manifest.weightsSha256);
  });

  it("rejects mismatched fetched bytes without caching them", async () => {
    const manifest = manifestFor(new TextEncoder().encode("expected"));

    await expect(
      resolveDecoderWeights({
        manifest,
        cacheDir: tmp,
        fetcher: async () => new TextEncoder().encode("actual"),
      }),
    ).rejects.toBeInstanceOf(DecoderWeightsSha256MismatchError);
  });

  it("reports not-installed when cache is empty and no fetcher is provided", async () => {
    const manifest = manifestFor(new TextEncoder().encode("expected"));

    await expect(resolveDecoderWeights({ manifest, cacheDir: tmp })).rejects.toBeInstanceOf(
      DecoderWeightsNotInstalledError,
    );
  });

  it("validates decoder-weight manifest shape", () => {
    expect(DecoderWeightsManifestSchema.safeParse(manifestFor(new Uint8Array([1]))).success).toBe(
      true,
    );
  });
});

function manifestFor(
  bytes: Uint8Array,
  weights: "permissive" | "research-only" = "permissive",
): DecoderWeightsManifest {
  return {
    family: "llamagen",
    repoId: "wittgenstein-harness/test-decoder",
    revision: "test",
    weightsFilename: "decoder.onnx",
    weightsSha256: createHash("sha256").update(bytes).digest("hex"),
    license: { code: "MIT", weights },
  };
}
