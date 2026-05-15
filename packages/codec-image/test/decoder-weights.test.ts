import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DecoderWeightsFetchFailedError,
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

  it("resolves paired codebook assets from cache", async () => {
    const weights = new TextEncoder().encode("cached-weights");
    const codebook = new TextEncoder().encode("cached-codebook");
    const manifest = manifestFor(weights, "permissive", codebook);
    const cacheDir = join(tmp, manifest.family, manifest.weightsSha256);
    const weightsPath = join(cacheDir, manifest.weightsFilename);
    const codebookPath = join(cacheDir, manifest.codebookFilename!);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(weightsPath, weights);
    await writeFile(codebookPath, codebook);

    const resolved = await resolveDecoderWeights({ manifest, cacheDir: tmp });

    expect(resolved).toEqual({
      weightsPath,
      codebookPath,
      weightsSha256: manifest.weightsSha256,
      codebookSha256: manifest.codebookSha256,
      weightsRestriction: "permissive",
      source: "cache-hit",
    });
  });

  it("fetches missing codebook assets through the injected fetcher", async () => {
    const weights = new TextEncoder().encode("fetched-weights");
    const codebook = new TextEncoder().encode("fetched-codebook");
    const manifest = manifestFor(weights, "permissive", codebook);

    const resolved = await resolveDecoderWeights({
      manifest,
      cacheDir: tmp,
      fetcher: async (asset) => (asset.kind === "weights" ? weights : codebook),
    });

    expect(resolved.source).toBe("fetched");
    expect(resolved.codebookSha256).toBe(manifest.codebookSha256);
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

  it("rejects a mismatched cached codebook", async () => {
    const weights = new TextEncoder().encode("cached-weights");
    const codebook = new TextEncoder().encode("expected-codebook");
    const manifest = manifestFor(weights, "permissive", codebook);
    const cacheDir = join(tmp, manifest.family, manifest.weightsSha256);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, manifest.weightsFilename), weights);
    await writeFile(join(cacheDir, manifest.codebookFilename!), new TextEncoder().encode("actual"));

    await expect(resolveDecoderWeights({ manifest, cacheDir: tmp })).rejects.toBeInstanceOf(
      DecoderWeightsSha256MismatchError,
    );
  });

  it("wraps fetcher failures in a structured error", async () => {
    const manifest = manifestFor(new TextEncoder().encode("expected"));

    await expect(
      resolveDecoderWeights({
        manifest,
        cacheDir: tmp,
        fetcher: async () => {
          throw new Error("network unavailable");
        },
      }),
    ).rejects.toBeInstanceOf(DecoderWeightsFetchFailedError);
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

  it("requires codebook filename and sha256 to be provided together", () => {
    const manifest = {
      ...manifestFor(new Uint8Array([1])),
      codebookFilename: "codebook.bin",
    };

    expect(DecoderWeightsManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

function manifestFor(
  bytes: Uint8Array,
  weights: "permissive" | "research-only" = "permissive",
  codebook?: Uint8Array,
): DecoderWeightsManifest {
  const manifest: DecoderWeightsManifest = {
    family: "llamagen",
    repoId: "wittgenstein-harness/test-decoder",
    revision: "test",
    weightsFilename: "decoder.onnx",
    weightsSha256: createHash("sha256").update(bytes).digest("hex"),
    license: { code: "MIT", weights },
  };

  if (codebook) {
    return {
      ...manifest,
      codebookFilename: "codebook.bin",
      codebookSha256: createHash("sha256").update(codebook).digest("hex"),
    };
  }

  return manifest;
}
