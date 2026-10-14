import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  Modality,
  RunManifestSchema,
  codecV2,
  type WittgensteinRequest,
} from "@wittgenstein/schemas";
import { createDefaultRegistry, Wittgenstein } from "../src/runtime/harness.js";
import { CodecRegistry } from "../src/runtime/registry.js";

let tmp: string;

afterEach(async () => {
  if (tmp) {
    await rm(tmp, { recursive: true, force: true });
  }
});

describe("@wittgenstein/core", () => {
  it("registers the four first-class codecs", () => {
    const registry = createDefaultRegistry();
    const names = registry
      .list()
      .map((codec) => codec.name)
      .sort();
    expect(names).toEqual(["asciipng", "audio", "image", "sensor", "svg", "video"]);
  });
});

describe("run() manifest write-path validation (2026-10-16 Stage B)", () => {
  it("persists a manifest for a valid v2 codec run", async () => {
    tmp = await mkdtemp(join(tmpdir(), "witt-harness-valid-"));
    const harness = await Wittgenstein.bootstrap({ registry: registryWith(fakeCodec()) });

    const outcome = await harness.run(imageRequest(), {
      command: "wittgenstein",
      args: ["image", "test"],
      cwd: tmp,
    });

    expect(outcome.error).toBeNull();
    expect(outcome.manifest.ok).toBe(true);
    const entries = await readdir(outcome.runDir);
    expect(entries).toContain("manifest.json");

    // The persisted receipt itself parses against the canonical schema.
    const persisted = await readJson(join(outcome.runDir, "manifest.json"));
    expect(RunManifestSchema.safeParse(persisted).success).toBe(true);
  });

  it("refuses to persist when a codec row violates the canonical schema", async () => {
    tmp = await mkdtemp(join(tmpdir(), "witt-harness-invalid-"));
    const harness = await Wittgenstein.bootstrap({
      registry: registryWith(fakeCodec([{ key: "route", value: 123 }])),
    });

    await expect(
      harness.run(imageRequest(), {
        command: "wittgenstein",
        args: ["image", "test"],
        cwd: tmp,
      }),
    ).rejects.toMatchObject({ name: "WittgensteinError", code: "MANIFEST_INVALID" });

    // No corrupt receipt anywhere under the run tree.
    const runRoot = join(tmp, "artifacts", "runs");
    const nested = await collectFiles(runRoot);
    expect(nested.filter((file) => file.endsWith("manifest.json"))).toHaveLength(0);
  });
});

function registryWith(codec: codecV2.Codec<unknown, codecV2.BaseArtifact>): CodecRegistry {
  return new CodecRegistry().register(codec);
}

function imageRequest(): WittgensteinRequest {
  return {
    modality: Modality.Image,
    prompt: "integration test prompt",
    seed: null,
  } as unknown as WittgensteinRequest;
}

function fakeCodec(
  rows: ReadonlyArray<codecV2.ManifestRow> = [],
): codecV2.Codec<unknown, codecV2.BaseArtifact> {
  return {
    id: "fake-image",
    modality: Modality.Image,
    routes: [{ id: "raster", match: () => true }],
    schema: {
      "~standard": {
        version: 1,
        vendor: "test",
        validate: (value: unknown) => ({ value }),
      },
    },
    async produce(_req: unknown, ctx: codecV2.HarnessCtx) {
      return {
        outPath: ctx.outPath,
        mime: "text/plain",
        metadata: {
          codec: "fake-image",
          route: "raster",
          warnings: [],
          artifactSha256: "a".repeat(64),
          llmTokens: { input: 0, output: 0 },
          costUsd: null,
          costUsdReason: "no-llm-call" as const,
          durationMs: 0,
          seed: ctx.seed,
        },
      };
    },
    manifestRows: () => rows,
  };
}

async function collectFiles(root: string): Promise<string[]> {
  try {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name));
  } catch {
    return [];
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
