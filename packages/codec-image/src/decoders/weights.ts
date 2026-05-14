import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import type { LoadDecoderBridgeOptions } from "./types.js";

export const DecoderWeightsManifestSchema = z.object({
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
});

export type DecoderWeightsManifest = z.infer<typeof DecoderWeightsManifestSchema>;

export interface ResolveDecoderWeightsOptions extends LoadDecoderBridgeOptions {
  readonly manifest: DecoderWeightsManifest;
  readonly fetcher?: (manifest: DecoderWeightsManifest) => Promise<Uint8Array>;
}

export interface ResolvedDecoderWeights {
  readonly weightsPath: string;
  readonly weightsSha256: string;
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

  constructor(manifest: DecoderWeightsManifest, cachePath: string) {
    super(
      `Decoder weights for ${manifest.family} are not installed. Run \`wittgenstein install image\` to fetch and verify them.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: manifest.family,
      repoId: manifest.repoId,
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

  constructor(manifest: DecoderWeightsManifest, actualSha256: string) {
    super(
      `Decoder weights for ${manifest.family} failed sha256 verification; refusing to cache or load mismatched bytes.`,
    );
    this.name = "WittgensteinError";
    this.details = {
      family: manifest.family,
      expectedSha256: manifest.weightsSha256,
      actualSha256,
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
  const weightsPath = resolve(cacheDir, manifest.weightsFilename);

  try {
    await verifyFileSha256(weightsPath, manifest);
    return {
      weightsPath,
      weightsSha256: manifest.weightsSha256,
      weightsRestriction: manifest.license.weights,
      source: "cache-hit",
    };
  } catch (error) {
    if (!(error instanceof DecoderWeightsSha256MismatchError)) {
      if (!options.fetcher) {
        throw new DecoderWeightsNotInstalledError(manifest, weightsPath);
      }
    } else {
      throw error;
    }
  }

  const bytes = await options.fetcher!(manifest);
  const actualSha256 = sha256(bytes);
  if (actualSha256 !== manifest.weightsSha256) {
    throw new DecoderWeightsSha256MismatchError(manifest, actualSha256);
  }

  const tmpPath = `${weightsPath}.tmp-${Date.now()}`;
  await mkdir(dirname(weightsPath), { recursive: true });
  await writeFile(tmpPath, bytes);
  await rename(tmpPath, weightsPath);
  return {
    weightsPath,
    weightsSha256: manifest.weightsSha256,
    weightsRestriction: manifest.license.weights,
    source: "fetched",
  };
}

function enforceResearchWeightsOptIn(
  manifest: DecoderWeightsManifest,
  options: LoadDecoderBridgeOptions,
): void {
  if (manifest.license.weights === "research-only" && options.allowResearchWeights !== true) {
    throw new ResearchWeightsRequiresOptInError(manifest);
  }
}

async function verifyFileSha256(path: string, manifest: DecoderWeightsManifest): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await readFile(path);
  } catch {
    return Promise.reject(new Error("missing"));
  }

  const actualSha256 = sha256(bytes);
  if (actualSha256 !== manifest.weightsSha256) {
    await rm(path, { force: true });
    throw new DecoderWeightsSha256MismatchError(manifest, actualSha256);
  }
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
