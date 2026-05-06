import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { imageCodec } from "../src/index.js";
import { imageCodeReceipt } from "../src/image-code-receipt.js";
import { adaptSceneToLatents } from "../src/pipeline/adapter.js";
import { renderImagePipeline } from "../src/pipeline/index.js";

describe("@wittgenstein/codec-image", () => {
  it("parses and enriches scene contract defaults", () => {
    expect(imageCodec.name).toBe("image");
    expect(imageCodec.modality).toBe("image");
    const parsed = imageCodec.parse("{}");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.schemaVersion).toBe("witt.image.spec/v0.1");
      expect(parsed.value.decoder.codebookVersion).toBe("v0");
      expect(parsed.value.constraints.negative).toEqual([]);
      expect(parsed.value.mode).toBe("semantic-only");
    }
  });

  it("parses a Visual Seed Code contract and normalizes semantic + seed fields", () => {
    const parsed = imageCodec.parse(
      JSON.stringify({
        mode: "one-shot-vsc",
        semantic: {
          intent: "forest poster",
          subject: "misty pine forest",
          composition: {
            framing: "wide",
            camera: "eye level",
            depthPlan: ["foreground mist", "forest", "mountains"],
          },
          lighting: { mood: "moody", key: "soft dawn" },
          style: { references: ["landscape"], palette: ["green", "gray"] },
          constraints: { mustHave: ["trees"], negative: ["people"] },
        },
        seedCode: {
          family: "vqvae",
          mode: "prefix",
          tokens: [1, 2, 3, 4],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("Visual Seed Code parse unexpectedly failed");
    }
    expect(parsed.value.semantic?.subject).toBe("misty pine forest");
    expect(parsed.value.subject).toBe("misty pine forest");
    expect(parsed.value.seedCode?.length).toBe(4);
    expect(parsed.value.mode).toBe("one-shot-vsc");
  });

  it("distinguishes emitted semantic from legacy/effective semantic receipts", () => {
    const emitted = imageCodec.parse(
      JSON.stringify({
        semantic: {
          intent: "poster",
          subject: "tree",
          style: { palette: ["green"] },
        },
      }),
    );
    const legacy = imageCodec.parse(JSON.stringify({ intent: "poster", subject: "tree" }));
    const absent = imageCodec.parse("{}");

    expect(emitted.ok).toBe(true);
    expect(legacy.ok).toBe(true);
    expect(absent.ok).toBe(true);
    if (!emitted.ok || !legacy.ok || !absent.ok) {
      throw new Error("image parse unexpectedly failed");
    }

    expect(imageCodeReceipt(emitted.value)).toMatchObject({
      hasSemantic: true,
      hasEmittedSemantic: true,
      hasEffectiveSemantic: true,
      semanticSource: "emitted",
    });
    expect(imageCodeReceipt(legacy.value)).toMatchObject({
      hasSemantic: true,
      hasEmittedSemantic: false,
      hasEffectiveSemantic: true,
      semanticSource: "legacy-top-level",
    });
    expect(imageCodeReceipt(absent.value)).toMatchObject({
      hasSemantic: false,
      hasEmittedSemantic: false,
      hasEffectiveSemantic: false,
      semanticSource: "absent",
    });
  });

  it("rejects inconsistent visual code lengths", () => {
    const badSeed = imageCodec.parse(
      JSON.stringify({
        seedCode: {
          family: "vqvae",
          mode: "prefix",
          length: 8,
          tokens: [1, 2, 3, 4],
        },
      }),
    );
    expect(badSeed.ok).toBe(false);

    const badCoarse = imageCodec.parse(
      JSON.stringify({
        coarseVq: {
          schemaVersion: "witt.image.coarse-vq/v0.1",
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          tokenGrid: [4, 4],
          tokens: [1, 2, 3, 4],
        },
      }),
    );
    expect(badCoarse.ok).toBe(false);
  });

  it("rejects empty seedCode tokens array", () => {
    const result = imageCodec.parse(
      JSON.stringify({
        seedCode: {
          family: "vqvae",
          mode: "prefix",
          tokens: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects empty coarseVq tokens array", () => {
    const result = imageCodec.parse(
      JSON.stringify({
        coarseVq: {
          schemaVersion: "witt.image.coarse-vq/v0.1",
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          tokenGrid: [4, 4],
          tokens: [],
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects providerLatents with tokenGrid area mismatch", () => {
    const result = imageCodec.parse(
      JSON.stringify({
        providerLatents: {
          schemaVersion: "witt.image.latents/v0.1",
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          tokenGrid: [4, 4],
          tokens: [1, 2, 3], // 3 tokens for a 16-cell grid
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects unknown image-code mode values", () => {
    const result = imageCodec.parse(
      JSON.stringify({
        mode: "weird-mode-not-in-enum",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects unknown seedCode.mode values", () => {
    const result = imageCodec.parse(
      JSON.stringify({
        seedCode: {
          family: "vqvae",
          mode: "not-a-known-mode",
          tokens: [1, 2, 3, 4],
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("accepts legacy semantic-only input as the compatibility fallback", () => {
    // Pre-VSC scene shape: top-level intent / subject / composition / lighting / style / constraints,
    // no nested `semantic`, no `seedCode`, no `coarseVq`. Should still parse and normalize to
    // mode: "semantic-only".
    const result = imageCodec.parse(
      JSON.stringify({
        intent: "Forest path at golden hour",
        subject: "forest path",
        composition: {
          framing: "wide shot",
          camera: "natural",
          depthPlan: ["foreground", "midground", "background"],
        },
        lighting: { mood: "warm", key: "golden" },
        style: {
          references: ["landscape photography"],
          palette: ["amber", "moss", "umber"],
        },
        constraints: { mustHave: ["natural light"], negative: [] },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.mode).toBe("semantic-only");
      expect(result.value.seedCode).toBeUndefined();
      expect(result.value.coarseVq).toBeUndefined();
      expect(result.value.providerLatents).toBeUndefined();
      const receipt = imageCodeReceipt(result.value);
      expect(receipt.path).toBe("semantic-fallback");
      expect(receipt.semanticSource).toBe("legacy-top-level");
    }
  });

  it("renders placeholder latents into a PNG artifact", async () => {
    const parsed = imageCodec.parse("{}");
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("image parse unexpectedly failed in test");
    }

    const runDir = await mkdtemp(resolve(tmpdir(), "wittgenstein-codec-image-"));
    const outPath = resolve(runDir, "output.png");
    const result = await imageCodec.render(parsed.value, {
      runId: "test-run",
      runDir,
      seed: null,
      outPath,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.bytes).toBeGreaterThan(0);
    const bytes = await readFile(outPath);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("uses providerLatents when present", async () => {
    const tokens = Array.from({ length: 32 * 32 }, (_, index) => index % 8192);
    const raw = JSON.stringify({
      schemaVersion: "witt.image.spec/v0.1",
      intent: "test",
      subject: "test",
      composition: {
        framing: "medium shot",
        camera: "neutral camera",
        depthPlan: ["foreground", "midground", "background"],
      },
      lighting: { mood: "neutral", key: "soft" },
      style: { references: [], palette: ["black", "white"] },
      decoder: {
        family: "llamagen",
        codebook: "stub-codebook",
        codebookVersion: "v0",
        latentResolution: [32, 32],
      },
      constraints: { mustHave: [], negative: [] },
      renderHints: { detailLevel: "medium", tokenBudget: 1024, seed: null },
      providerLatents: {
        schemaVersion: "witt.image.latents/v0.1",
        family: "llamagen",
        codebook: "stub-codebook",
        codebookVersion: "v0",
        tokenGrid: [32, 32],
        tokens,
      },
    });
    const parsed = imageCodec.parse(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error("parse failed");
    }
    const runDir = await mkdtemp(resolve(tmpdir(), "wittgenstein-codec-image-pl-"));
    const outPath = resolve(runDir, "out.png");
    await imageCodec.render(parsed.value, {
      runId: "pl-test",
      runDir,
      seed: null,
      outPath,
      logger: {
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });
    const bytes = await readFile(outPath);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});

describe("image pipeline (neural decode)", () => {
  it("renders a PNG via the current placeholder decoder bridge", async () => {
    const parsed = imageCodec.parse(
      JSON.stringify({
        intent: "test",
        subject: "x",
        decoder: { latentResolution: [16, 16] },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const runDir = await mkdtemp(resolve(tmpdir(), "wittgenstein-codec-image-pipeline-"));
    const outPath = resolve(runDir, "out.png");
    const result = await renderImagePipeline(parsed.value, {
      runId: "test-run",
      runDir,
      seed: null,
      outPath,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    expect(result.mimeType).toBe("image/png");
    expect(result.bytes).toBeGreaterThan(0);
    const bytes = await readFile(outPath);
    expect(Array.from(bytes.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });

  it("uses coarseVq hints before the placeholder adapter path", async () => {
    const warnings: string[] = [];
    const parsed = imageCodec.parse(
      JSON.stringify({
        intent: "test",
        subject: "forest",
        decoder: {
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          latentResolution: [16, 16],
        },
        coarseVq: {
          schemaVersion: "witt.image.coarse-vq/v0.1",
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          tokenGrid: [4, 4],
          tokens: Array.from({ length: 16 }, (_, index) => index),
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const runDir = await mkdtemp(resolve(tmpdir(), "wittgenstein-codec-image-coarse-"));
    const outPath = resolve(runDir, "out.png");
    await renderImagePipeline(parsed.value, {
      runId: "test-run",
      runDir,
      seed: null,
      outPath,
      logger: {
        debug: () => {},
        info: () => {},
        warn: (message) => warnings.push(message),
        error: () => {},
      },
    });

    expect(warnings.some((message) => message.includes("placeholder seed-expansion adapter"))).toBe(
      false,
    );
  });

  it("preserves decoder-facing coarseVq tokens during expansion", async () => {
    const parsed = imageCodec.parse(
      JSON.stringify({
        subject: "forest",
        decoder: {
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          latentResolution: [4, 4],
        },
        coarseVq: {
          schemaVersion: "witt.image.coarse-vq/v0.1",
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          tokenGrid: [2, 2],
          tokens: [700, 701, 702, 703],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const latents = await adaptSceneToLatents(parsed.value, {
      runId: "coarse-preserve",
      runDir: await mkdtemp(resolve(tmpdir(), "wittgenstein-codec-image-preserve-")),
      seed: null,
      outPath: "out.png",
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
    });

    expect(latents.tokens.slice(0, 4)).toEqual([700, 700, 701, 701]);
  });

  it("uses seedCode before the placeholder adapter path", async () => {
    const warnings: string[] = [];
    const parsed = imageCodec.parse(
      JSON.stringify({
        mode: "one-shot-vsc",
        semantic: {
          intent: "test",
          subject: "coastal cliffs",
          composition: {
            framing: "wide",
            camera: "neutral camera",
            depthPlan: ["foreground", "midground", "background"],
          },
          lighting: { mood: "neutral", key: "soft" },
          style: { references: [], palette: ["blue", "gray"] },
          constraints: { mustHave: [], negative: [] },
        },
        decoder: {
          family: "llamagen",
          codebook: "stub-codebook",
          codebookVersion: "v0",
          latentResolution: [16, 16],
        },
        seedCode: {
          schemaVersion: "witt.image.seed/v0.1",
          family: "vqvae",
          mode: "prefix",
          tokens: [10, 20, 30, 40, 50, 60],
        },
      }),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const runDir = await mkdtemp(resolve(tmpdir(), "wittgenstein-codec-image-seed-"));
    const outPath = resolve(runDir, "out.png");
    await renderImagePipeline(parsed.value, {
      runId: "test-run",
      runDir,
      seed: null,
      outPath,
      logger: {
        debug: () => {},
        info: () => {},
        warn: (message) => warnings.push(message),
        error: () => {},
      },
    });

    expect(warnings.some((message) => message.includes("placeholder seed-expansion adapter"))).toBe(
      false,
    );
  });
});
