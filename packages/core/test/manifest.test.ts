import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WittgensteinError } from "../src/runtime/errors.js";
import { collectRuntimeFingerprint, hashFile, hashFileOrThrow } from "../src/runtime/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "wittgenstein-manifest-test-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("hashFile", () => {
  it("returns the SHA-256 hex digest of the file contents", async () => {
    const path = join(tmp, "fixture.txt");
    const content = "deterministic content";
    await writeFile(path, content);

    const expected = createHash("sha256").update(content).digest("hex");
    expect(await hashFile(path)).toBe(expected);
  });

  it("is identical for two writes of the same content", async () => {
    const a = join(tmp, "a.txt");
    const b = join(tmp, "b.txt");
    await writeFile(a, "same bytes");
    await writeFile(b, "same bytes");

    expect(await hashFile(a)).toBe(await hashFile(b));
  });

  it("differs when a single byte changes", async () => {
    const a = join(tmp, "a.txt");
    const b = join(tmp, "b.txt");
    await writeFile(a, "same bytes");
    await writeFile(b, "Same bytes"); // capitalized first letter

    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });

  it("returns null (not throws) for a missing file — failure must be inspectable, not silent", async () => {
    const result = await hashFile(join(tmp, "does-not-exist.txt"));
    expect(result).toBeNull();
  });
});

describe("hashFileOrThrow (Issue #345)", () => {
  it("returns the same digest as hashFile for an existing file", async () => {
    const path = join(tmp, "fixture.txt");
    const content = "deterministic content";
    await writeFile(path, content);

    const expected = createHash("sha256").update(content).digest("hex");
    await expect(hashFileOrThrow(path)).resolves.toBe(expected);
  });

  it("throws ARTIFACT_HASH_FAILED for a missing file with the path in details", async () => {
    const missing = join(tmp, "does-not-exist.txt");
    let caught: unknown;
    try {
      await hashFileOrThrow(missing);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(WittgensteinError);
    expect((caught as WittgensteinError).code).toBe("ARTIFACT_HASH_FAILED");
    expect((caught as WittgensteinError).message).toContain(missing);
    expect((caught as WittgensteinError).details).toEqual({ artifactPath: missing });
  });
});

// Harness-level regression test for the v1 render→hash race path (Issue #345).
// A stub v1 codec returns a `RenderResult.artifactPath` pointing at a file
// that doesn't exist — simulating the FS race the issue describes. The
// harness must NOT write a success manifest with `artifactSha256: null`;
// the throw from `hashFileOrThrow` propagates to the outer catch and
// serializes as `ARTIFACT_HASH_FAILED`.
describe("Wittgenstein.run — v1 artifact-hash race regression (Issue #345)", () => {
  it("sets ok=false and error.code=ARTIFACT_HASH_FAILED when render artifact is missing", async () => {
    const { Wittgenstein } = await import("../src/runtime/harness.js");
    const { CodecRegistry } = await import("../src/runtime/registry.js");
    const { DEFAULT_WITTGENSTEIN_CONFIG } = await import("@wittgenstein/schemas");

    const stubMissingArtifactPath = join(tmp, "stub", "missing-on-purpose.svg");
    const stubCodec = {
      name: "stub-svg",
      modality: "svg" as const,
      schemaPreamble: () => "",
      requestSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      parse: () => ({ ok: true as const, value: {} as never }),
      render: async () => ({
        artifactPath: stubMissingArtifactPath, // codec lies: never writes this file
        mimeType: "image/svg+xml",
        bytes: 0,
        metadata: {
          codec: "stub-svg",
          llmTokens: { input: 0, output: 0 },
          costUsd: 0,
          durationMs: 0,
          seed: null,
        },
      }),
    };

    const registry = new CodecRegistry();
    registry.register(stubCodec as never);
    const harness = new Wittgenstein(DEFAULT_WITTGENSTEIN_CONFIG, registry, null);

    const outcome = await harness.run(
      {
        modality: "svg",
        prompt: "hash-race regression",
        source: "local",
      } as never,
      { command: "test", args: [], cwd: tmp, dryRun: true },
    );

    expect(outcome.manifest.ok).toBe(false);
    expect(outcome.manifest.error?.code).toBe("ARTIFACT_HASH_FAILED");
    expect(outcome.manifest.error?.message).toContain(stubMissingArtifactPath);
    // The hash must never be silently nulled into a success manifest — the
    // throw aborts before manifest.ok flips to true.
    expect(outcome.manifest.artifactSha256).toBeNull();
  });

  it("copies codec-authored artifact sidecars into the run manifest", async () => {
    const { Wittgenstein } = await import("../src/runtime/harness.js");
    const { CodecRegistry } = await import("../src/runtime/registry.js");
    const { DEFAULT_WITTGENSTEIN_CONFIG } = await import("@wittgenstein/schemas");

    const artifactPath = join(tmp, "sensor.html");
    const sidecarPath = join(tmp, "sensor.csv");
    const artifactContent = "<!doctype html><title>sensor</title>";
    const sidecarContent = "timeSec,value\n0,1\n";
    await writeFile(artifactPath, artifactContent);
    await writeFile(sidecarPath, sidecarContent);

    const sidecarSha256 = createHash("sha256").update(sidecarContent).digest("hex");
    const stubCodec = {
      name: "stub-sensor",
      modality: "sensor" as const,
      schemaPreamble: () => "",
      requestSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      parse: () => ({ ok: true as const, value: {} as never }),
      render: async () => ({
        artifactPath,
        mimeType: "text/html",
        bytes: Buffer.byteLength(artifactContent),
        metadata: {
          codec: "stub-sensor",
          llmTokens: { input: 0, output: 0 },
          costUsd: 0,
          durationMs: 0,
          seed: null,
          sidecars: [
            {
              role: "sensor-csv",
              path: sidecarPath,
              mimeType: "text/csv",
              bytes: Buffer.byteLength(sidecarContent),
              sha256: sidecarSha256,
            },
          ],
        },
      }),
    };

    const registry = new CodecRegistry();
    registry.register(stubCodec as never);
    const harness = new Wittgenstein(DEFAULT_WITTGENSTEIN_CONFIG, registry, null);

    const outcome = await harness.run(
      {
        modality: "sensor",
        prompt: "sidecar manifest regression",
        source: "local",
      } as never,
      { command: "test", args: [], cwd: tmp, dryRun: true },
    );

    expect(outcome.manifest.ok).toBe(true);
    expect(outcome.manifest.artifactSidecars).toEqual([
      {
        role: "sensor-csv",
        path: sidecarPath,
        mimeType: "text/csv",
        bytes: Buffer.byteLength(sidecarContent),
        sha256: sidecarSha256,
      },
    ]);
  });

  it("refuses research-only weight receipts unless the request opts in", async () => {
    const { Wittgenstein } = await import("../src/runtime/harness.js");
    const { CodecRegistry } = await import("../src/runtime/registry.js");
    const { DEFAULT_WITTGENSTEIN_CONFIG } = await import("@wittgenstein/schemas");

    const artifactPath = join(tmp, "image.png");
    await writeFile(artifactPath, "png");

    const stubCodec = {
      name: "stub-image",
      modality: "image" as const,
      schemaPreamble: () => "",
      requestSchema: { parse: (v: unknown) => v } as never,
      outputSchema: { parse: (v: unknown) => v } as never,
      parse: () => ({ ok: true as const, value: {} as never }),
      render: async () => ({
        artifactPath,
        mimeType: "image/png",
        bytes: 3,
        metadata: {
          codec: "stub-image",
          llmTokens: { input: 0, output: 0 },
          costUsd: 0,
          durationMs: 0,
          seed: null,
          license: { weightsRestriction: "research-only" as const },
        },
      }),
    };

    const registry = new CodecRegistry();
    registry.register(stubCodec as never);
    const harness = new Wittgenstein(DEFAULT_WITTGENSTEIN_CONFIG, registry, null);

    const refused = await harness.run(
      {
        modality: "image",
        prompt: "research-only weights",
        source: "local",
      } as never,
      { command: "test", args: [], cwd: tmp, dryRun: true },
    );

    expect(refused.manifest.ok).toBe(false);
    expect(refused.manifest.error?.code).toBe("RESEARCH_WEIGHTS_REQUIRES_OPT_IN");

    const allowed = await harness.run(
      {
        modality: "image",
        prompt: "research-only weights",
        source: "local",
        allowResearchWeights: true,
      } as never,
      { command: "test", args: [], cwd: tmp, dryRun: true },
    );

    expect(allowed.manifest.ok).toBe(true);
    expect(allowed.manifest.license.weightsRestriction).toBe("research-only");
  });
});

describe("collectRuntimeFingerprint", () => {
  it("returns the spine shape for a directory with no git or lockfile", async () => {
    const fp = await collectRuntimeFingerprint(tmp);

    // gitSha is null because tmpdir is not a git repo.
    expect(fp.gitSha).toBeNull();
    // lockfile is missing in tmpdir, so its hash is null too.
    expect(fp.lockfileHash).toBeNull();
    // wittgensteinVersion falls back to 0.0.0 when package.json is absent.
    expect(fp.wittgensteinVersion).toBe("0.0.0");
    // Node version is a real value, like "v20.x.y".
    expect(fp.nodeVersion).toBe(process.version);
    expect(fp.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it("reads version from package.json when present", async () => {
    await writeFile(join(tmp, "package.json"), JSON.stringify({ version: "1.2.3" }));
    const fp = await collectRuntimeFingerprint(tmp);
    expect(fp.wittgensteinVersion).toBe("1.2.3");
  });

  it("reads lockfile hash when pnpm-lock.yaml is present", async () => {
    const lockfilePath = join(tmp, "pnpm-lock.yaml");
    await writeFile(lockfilePath, "lockfileVersion: '6.0'\n");

    const fp = await collectRuntimeFingerprint(tmp);

    const expected = createHash("sha256").update("lockfileVersion: '6.0'\n").digest("hex");
    expect(fp.lockfileHash).toBe(expected);
  });
});
