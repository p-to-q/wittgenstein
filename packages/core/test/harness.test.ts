import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ImageDecoderBridge } from "@wittgenstein/codec-image";
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

describe("run() entry-layer services passthrough (S7b/S7c)", () => {
  it("injects a decoder bridge into the image codec and records the lane receipt", async () => {
    tmp = await mkdtemp(join(tmpdir(), "witt-harness-bridge-"));
    // The fingerprint measures wittgensteinVersion from the run cwd's
    // package.json and fails closed when it is missing; provide an honest
    // version instead of relying on the day-one forged "0.0.0".
    await writeFile(join(tmp, "package.json"), JSON.stringify({ version: "1.2.3" }));
    // Default registry includes the real image codec; dry-run skips
    // the LLM and the stub bridge decodes the dry-run adapter latents.
    const harness = await Wittgenstein.bootstrap();
    const { bridge, pngBytes } = stubImageDecoderBridge();

    const outcome = await harness.run(imageRequest(), {
      command: "wittgenstein",
      args: ["image", "bridge lane", "--dry-run"],
      cwd: tmp,
      dryRun: true,
      services: { decoderBridge: bridge },
    });

    expect(outcome.error).toBeNull();
    expect(outcome.manifest.ok).toBe(true);
    const manifest = outcome.manifest as RunManifest & Record<string, unknown>;
    // S7e: the runtime identity rides the receipt through fold → validate
    // → persist; the persisted receipt itself is re-parsed in the sibling
    // write-path test below.
    expect(manifest["image.decoder"]).toEqual({
      lane: "injected-bridge",
      decoderId: "stub-bridge",
      decoderHash: "stub-hash",
      determinismClass: "byte-parity",
      runtime: { name: "onnxruntime-node", version: "1.30.0", executionProviders: ["cpu"] },
    });
    expect(manifest["L5.decoderHash"]).toEqual({
      value: "stub-hash",
      frozen: true,
      slot: "stub-bridge",
    });
    // Bridge advisory folded through the sidecar into metadata.warnings.
    expect(manifest["metadata.warnings"]).toBe(1);
    expect(manifest["artifact.sha256"]).toBe(
      createHash("sha256").update(pngBytes).digest("hex"),
    );
  });
});

describe("run() manifest write-path validation (2026-10-16 Stage B)", () => {
  it("persists a manifest for a valid v2 codec run", async () => {
    tmp = await mkdtemp(join(tmpdir(), "witt-harness-valid-"));
    // Honest version fixture — see the bridge test above for why.
    await writeFile(join(tmp, "package.json"), JSON.stringify({ version: "1.2.3" }));
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
    // Honest version fixture — see the bridge test above for why.
    await writeFile(join(tmp, "package.json"), JSON.stringify({ version: "1.2.3" }));
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

function stubImageDecoderBridge(): { bridge: ImageDecoderBridge; pngBytes: Uint8Array } {
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 1, 2, 3]);
  const bridge: ImageDecoderBridge = {
    capabilities: {
      family: "llamagen",
      decoderId: "stub-bridge",
      supportedShapes: [{ shape: "2D", tokenGrid: [32, 32], outputPixels: [64, 64] }],
      codebook: "stub-codebook",
      codebookVersion: "v0",
      determinismClass: "byte-parity",
      runtimeTier: "node-onnx-cpu",
      runtime: { name: "onnxruntime-node", version: "1.30.0", executionProviders: ["cpu"] },
      codeLicense: "Apache-2.0",
      weightsLicense: "permissive",
    },
    async decode() {
      return {
        raster: { pngBytes, width: 64, height: 64 },
        warnings: [{ code: "image/bridge-advisory", message: "stub advisory" }],
        decoderHash: "stub-hash",
      };
    },
    async unload() {
      /* no-op */
    },
  };
  return { bridge, pngBytes };
}

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
