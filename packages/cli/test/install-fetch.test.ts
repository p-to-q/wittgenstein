/**
 * Unit coverage for the #403 weight-fetch orchestration and the
 * installed-tiers receipt — no network, no onnxruntime-node, no spawned
 * process. The fetch lane is exercised through the same codec-image
 * resolver the bridge uses, with the global fetch stubbed.
 */
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DecoderWeightsManifest } from "@wittgenstein/codec-image";
import { fetchImageTierWeights } from "../src/install-image-tier.js";
import {
  readInstalledTiersReceipt,
  upsertInstalledTierEntry,
  type InstalledTierEntry,
} from "../src/install-receipt.js";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "witt-install-fetch-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllGlobals();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.clearAllMocks();
});

const BYTES = new TextEncoder().encode("llamagen-weights-bytes");

function makeManifest(weights: Uint8Array, overrides: Partial<DecoderWeightsManifest> = {}) {
  const sha = createHash("sha256").update(weights).digest("hex");
  const manifest: DecoderWeightsManifest = {
    family: "llamagen",
    repoId: "FoundationVision/LlamaGen",
    revision: "81e41139272c038412e4fe8f1c52a51ebbf95b8b",
    weightsFilename: "vqgan.onnx",
    weightsSha256: sha,
    license: { code: "MIT", weights: "permissive" },
    ...overrides,
  };
  return { manifest, sha };
}

describe("fetchImageTierWeights", () => {
  it("fetches from <base>/<repoId>/resolve/<revision>/<filename> and caches verified bytes", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(BYTES, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { manifest, sha } = makeManifest(BYTES);
    const cacheDir = makeTempDir();

    const outcome = await fetchImageTierWeights({
      manifest,
      baseUrl: "https://huggingface.co/",
      cacheDir,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resolved.source).toBe("fetched");
    expect(outcome.resolved.weightsSha256).toBe(sha);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://huggingface.co/FoundationVision/LlamaGen/resolve/81e41139272c038412e4fe8f1c52a51ebbf95b8b/vqgan.onnx",
    );
    const cached = readFileSync(join(cacheDir, "llamagen", sha, "vqgan.onnx"));
    expect(new Uint8Array(cached)).toEqual(BYTES);
  });

  it("is a cache-hit no-op (no fetch) when verified weights already exist", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { manifest, sha } = makeManifest(BYTES);
    const cacheDir = makeTempDir();

    // Seed the cache exactly as a previous successful install would have.
    mkdirSync(join(cacheDir, "llamagen", sha), { recursive: true });
    writeFileSync(join(cacheDir, "llamagen", sha, "vqgan.onnx"), BYTES);

    const outcome = await fetchImageTierWeights({
      manifest,
      baseUrl: "https://huggingface.co",
      cacheDir,
    });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.resolved.source).toBe("cache-hit");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses mismatched bytes with WEIGHTS_SHA256_MISMATCH and caches nothing", async () => {
    const fetchMock = vi.fn(async () => new Response("corrupt-bytes", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { manifest, sha } = makeManifest(BYTES);
    const cacheDir = makeTempDir();

    const outcome = await fetchImageTierWeights({
      manifest,
      baseUrl: "https://huggingface.co",
      cacheDir,
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("WEIGHTS_SHA256_MISMATCH");
    expect(outcome.message).toMatch(/failed sha256 verification/);
    expect(() => readFileSync(join(cacheDir, "llamagen", sha, "vqgan.onnx"))).toThrow();
  });

  it("surfaces fetch failures as WEIGHTS_FETCH_FAILED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const { manifest } = makeManifest(BYTES);

    const outcome = await fetchImageTierWeights({
      manifest,
      baseUrl: "https://huggingface.co",
      cacheDir: makeTempDir(),
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("WEIGHTS_FETCH_FAILED");
    expect(outcome.message).toMatch(/Failed to fetch/);
  });

  it("enforces ADR-0020 opt-in for research-only weights", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(BYTES, { status: 200 })));
    const { manifest } = makeManifest(BYTES, {
      license: { code: "Apache-2.0", weights: "research-only" },
    });

    const outcome = await fetchImageTierWeights({
      manifest,
      baseUrl: "https://huggingface.co",
      cacheDir: makeTempDir(),
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("RESEARCH_WEIGHTS_REQUIRES_OPT_IN");

    const allowed = await fetchImageTierWeights({
      manifest,
      baseUrl: "https://huggingface.co",
      cacheDir: makeTempDir(),
      allowResearchWeights: true,
    });
    expect(allowed.ok).toBe(true);
  });

  it("rejects a non-http(s) base URL with INVALID_WEIGHTS_BASE_URL", async () => {
    const { manifest } = makeManifest(BYTES);
    const outcome = await fetchImageTierWeights({
      manifest,
      baseUrl: "file:///tmp/weights",
      cacheDir: makeTempDir(),
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.code).toBe("INVALID_WEIGHTS_BASE_URL");
  });
});

describe("installed-tiers receipt", () => {
  const entry = (tier: "image"): InstalledTierEntry => ({
    tier,
    family: "llamagen",
    decoderId: "llamagen-vqgan-phase0",
    weightsSha256: "a".repeat(64),
    codebookSha256: "b".repeat(64),
    weightsRestriction: "permissive",
    source: "fetched",
    runtimeVerified: true,
    installedAt: "2026-10-16T00:00:00.000Z",
  });

  it("round-trips entries and overwrites per tier (idempotent upsert)", async () => {
    const path = join(makeTempDir(), "nested", "installed-tiers.json");

    expect((await readInstalledTiersReceipt(path)).status).toBe("missing");

    await upsertInstalledTierEntry(path, entry("image"));
    const first = await readInstalledTiersReceipt(path);
    expect(first.status).toBe("loaded");
    expect(first.receipt?.tiers.image?.weightsSha256).toBe("a".repeat(64));

    await upsertInstalledTierEntry(path, { ...entry("image"), source: "cache-hit" });
    const second = await readInstalledTiersReceipt(path);
    expect(second.status).toBe("loaded");
    expect(second.receipt?.tiers.image?.source).toBe("cache-hit");
  });

  it("reports corrupt or unknown-shape receipts as invalid", async () => {
    const path = join(makeTempDir(), "installed-tiers.json");
    writeFileSync(path, JSON.stringify({ schemaVersion: "wrong" }));
    expect((await readInstalledTiersReceipt(path)).status).toBe("invalid");

    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: "witt.installed-tiers/v0.1",
        tiers: { image: { tier: "image", weightsSha256: "not-a-sha" } },
      }),
    );
    expect((await readInstalledTiersReceipt(path)).status).toBe("invalid");
  });
});
