import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { LoadDecoderBridgeOptions } from "./types.js";

export const DecoderWeightsManifestSchema = z
  .object({
    family: z.string().min(1),
    repoId: z.string().min(1),
    revision: z.string().min(1),
    weightsFilename: z.string().min(1),
    weightsSha256: z.string().regex(/^[a-f0-9]{64}$/),
    codebookFilename: z.string().min(1).optional(),
    codebookSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    license: z.object({
      code: z.string().min(1),
      weights: z.enum(["permissive", "research-only"]),
    }),
  })
  .refine((manifest) => Boolean(manifest.codebookFilename) === Boolean(manifest.codebookSha256), {
    message: "codebookFilename and codebookSha256 must be provided together",
    path: ["codebookFilename"],
  });

export type DecoderWeightsManifest = z.infer<typeof DecoderWeightsManifestSchema>;

export type DecoderWeightsAssetKind = "weights" | "codebook";

export interface DecoderWeightsAsset {
  readonly kind: DecoderWeightsAssetKind;
  readonly filename: string;
  readonly sha256: string;
}

export interface ResolveDecoderWeightsOptions extends LoadDecoderBridgeOptions {
  readonly manifest: DecoderWeightsManifest;
  readonly fetcher?: (
    asset: DecoderWeightsAsset,
    manifest: DecoderWeightsManifest,
  ) => Promise<Uint8Array>;
}

export interface ResolvedDecoderWeights {
  readonly weightsPath: string;
  readonly codebookPath?: string;
  readonly weightsSha256: string;
  readonly codebookSha256?: string;
  readonly weightsRestriction: "permissive" | "research-only";
  readonly source: "cache-hit" | "fetched";
}

export class ResearchWeightsRequiresOptInError extends Error {
  readonly code = "RESEARCH_WEIGHTS_REQUIRES_OPT_IN";
  readonly details: Record<string, unknown>;

  constructor(manifest: DecoderWeightsManifest) {
    super(
      `Decoder weights for ${manifest.family} are research-only. Re-run with --allow-research-weights to opt in per ADR-0020.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: manifest.family,
      repoId: manifest.repoId,
      weightsRestriction: manifest.license.weights,
      adr: "docs/adrs/0020-code-weights-license-divergence-policy.md",
      tracker: "https://github.com/p-to-q/wittgenstein/issues/376",
    };
  }
}

export class DecoderWeightsNotInstalledError extends Error {
  readonly code = "WEIGHTS_NOT_INSTALLED";
  readonly details: Record<string, unknown>;

  constructor(manifest: DecoderWeightsManifest, asset: DecoderWeightsAsset, cachePath: string) {
    super(
      `Decoder ${asset.kind} for ${manifest.family} is not installed. Run \`wittgenstein install image\` to fetch and verify it.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: manifest.family,
      repoId: manifest.repoId,
      assetKind: asset.kind,
      filename: asset.filename,
      assetSha256: asset.sha256,
      weightsSha256: manifest.weightsSha256,
      cachePath,
      installHint: "wittgenstein install image",
      tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    };
  }
}

export class DecoderWeightsSha256MismatchError extends Error {
  readonly code = "WEIGHTS_SHA256_MISMATCH";
  readonly details: Record<string, unknown>;

  constructor(manifest: DecoderWeightsManifest, asset: DecoderWeightsAsset, actualSha256: string) {
    super(
      `Decoder ${asset.kind} for ${manifest.family} failed sha256 verification; refusing to cache or load mismatched bytes.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: manifest.family,
      assetKind: asset.kind,
      filename: asset.filename,
      expectedSha256: asset.sha256,
      actualSha256,
      tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    };
  }
}

export class DecoderWeightsFetchFailedError extends Error {
  readonly code = "WEIGHTS_FETCH_FAILED";
  readonly details: Record<string, unknown>;

  constructor(manifest: DecoderWeightsManifest, asset: DecoderWeightsAsset, cause: unknown) {
    super(`Failed to fetch decoder ${asset.kind} for ${manifest.family}.`);
    this.name = "WittgensteinError";
    this.cause = cause;
    this.details = {
      family: manifest.family,
      repoId: manifest.repoId,
      revision: manifest.revision,
      assetKind: asset.kind,
      filename: asset.filename,
      tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    };
  }
}

export async function resolveDecoderWeights(
  options: ResolveDecoderWeightsOptions,
): Promise<ResolvedDecoderWeights> {
  const manifest = DecoderWeightsManifestSchema.parse(options.manifest);
  enforceResearchWeightsOptIn(manifest, options);
  const cacheDir = resolve(
    options.cacheDir ?? defaultDecoderCacheDir(),
    manifest.family,
    manifest.weightsSha256,
  );
  const assets = assetsForManifest(manifest);
  const assetPaths = new Map(
    assets.map((asset) => [asset.kind, resolve(cacheDir, asset.filename)] as const),
  );
  const missingAssets: DecoderWeightsAsset[] = [];

  for (const asset of assets) {
    const assetPath = assetPaths.get(asset.kind)!;
    try {
      await verifyFileSha256(assetPath, manifest, asset);
    } catch (error) {
      // A sha mismatch means corrupted bytes; other verification errors mean the asset is missing.
      if (error instanceof DecoderWeightsSha256MismatchError) {
        throw error;
      }
      missingAssets.push(asset);
    }
  }

  if (missingAssets.length === 0) {
    return resolvedWeights(manifest, assetPaths, "cache-hit");
  }

  if (!options.fetcher) {
    const missingAsset = missingAssets[0]!;
    throw new DecoderWeightsNotInstalledError(
      manifest,
      missingAsset,
      assetPaths.get(missingAsset.kind)!,
    );
  }

  for (const asset of missingAssets) {
    let bytes: Uint8Array;
    try {
      bytes = await options.fetcher(asset, manifest);
    } catch (error) {
      throw new DecoderWeightsFetchFailedError(manifest, asset, error);
    }

    const actualSha256 = sha256(bytes);
    if (actualSha256 !== asset.sha256) {
      throw new DecoderWeightsSha256MismatchError(manifest, asset, actualSha256);
    }

    const assetPath = assetPaths.get(asset.kind)!;
    const tmpPath = `${assetPath}.tmp-${Date.now()}`;
    await mkdir(dirname(assetPath), { recursive: true });
    try {
      await writeFile(tmpPath, bytes);
      await rename(tmpPath, assetPath);
    } catch (error) {
      await rm(tmpPath, { force: true });
      throw error;
    }
  }

  return resolvedWeights(manifest, assetPaths, "fetched");
}

function enforceResearchWeightsOptIn(
  manifest: DecoderWeightsManifest,
  options: LoadDecoderBridgeOptions,
): void {
  if (manifest.license.weights === "research-only" && options.allowResearchWeights !== true) {
    throw new ResearchWeightsRequiresOptInError(manifest);
  }
}

async function verifyFileSha256(
  path: string,
  manifest: DecoderWeightsManifest,
  asset: DecoderWeightsAsset,
): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    return Promise.reject(new Error("missing"));
  }

  const actualSha256 = sha256(bytes);
  if (actualSha256 !== asset.sha256) {
    await rm(path, { force: true });
    throw new DecoderWeightsSha256MismatchError(manifest, asset, actualSha256);
  }
}

function assetsForManifest(manifest: DecoderWeightsManifest): DecoderWeightsAsset[] {
  const assets: DecoderWeightsAsset[] = [
    {
      kind: "weights",
      filename: manifest.weightsFilename,
      sha256: manifest.weightsSha256,
    },
  ];

  if (manifest.codebookFilename && manifest.codebookSha256) {
    assets.push({
      kind: "codebook",
      filename: manifest.codebookFilename,
      sha256: manifest.codebookSha256,
    });
  }

  return assets;
}

function resolvedWeights(
  manifest: DecoderWeightsManifest,
  assetPaths: ReadonlyMap<DecoderWeightsAssetKind, string>,
  source: "cache-hit" | "fetched",
): ResolvedDecoderWeights {
  const result: ResolvedDecoderWeights = {
    weightsPath: assetPaths.get("weights")!,
    weightsSha256: manifest.weightsSha256,
    weightsRestriction: manifest.license.weights,
    source,
  };

  if (manifest.codebookSha256) {
    return {
      ...result,
      codebookPath: assetPaths.get("codebook")!,
      codebookSha256: manifest.codebookSha256,
    };
  }

  return result;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function defaultDecoderCacheDir(): string {
  return resolve(
    process.env.XDG_CACHE_HOME ?? resolve(process.env.HOME ?? process.cwd(), ".cache"),
    "wittgenstein",
    "decoders",
  );
}
