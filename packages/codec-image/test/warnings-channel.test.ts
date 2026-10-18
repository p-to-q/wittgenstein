import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { codecV2 } from "@wittgenstein/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { clearAdapterWeightCache } from "../src/adapters/adapter-resolve.js";
import { IMAGE_WARNING_CODES, classifyImageWarning, imageV2Codec } from "../src/codec.js";

const ADAPTER_ENV_VARS = [
  "WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH",
  "WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH",
  "WITTGENSTEIN_IMAGE_ADAPTER_MLP_PATH",
  "WITTGENSTEIN_IMAGE_ADAPTER_MLP_FALLBACK_PATH",
] as const;

function clearAdapterEnv(): void {
  for (const key of ADAPTER_ENV_VARS) {
    delete process.env[key];
  }
  clearAdapterWeightCache();
}

/**
 * Minimal but structurally valid MLP adapter payload. The zeroed weights are
 * irrelevant here: these tests assert on *which warning reached the receipt*,
 * not on the pixels produced.
 */
function adapterWeights(tokenGrid: readonly [number, number]): Record<string, unknown> {
  return {
    version: "witt.image.adapter.mlp/v0.1",
    codebookSize: 8192,
    tokenGrid,
    inputDim: 128,
    hiddenDim: 4,
    w1: new Array(4 * 128).fill(0),
    b1: new Array(4).fill(0),
    w2: new Array(1024 * 4).fill(0),
    b2: new Array(1024).fill(0),
    family: "llamagen",
    codebook: "stub-codebook",
    codebookVersion: "v0",
  };
}

/** Run the codec once with an LLM stub that yields the schema defaults. */
async function produceWithDefaults() {
  const runDir = await mkdtemp(resolve(tmpdir(), "witt-image-warn-"));
  return imageV2Codec.produce(
    { modality: "image", prompt: "misty shoreline" },
    {
      runId: "warn-adapter",
      parentRunId: null,
      runDir,
      seed: null,
      outPath: join(runDir, "out.png"),
      logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
      clock: { now: () => 0, iso: () => new Date(0).toISOString() },
      sidecar: codecV2.createRunSidecar(),
      services: {
        telemetry: { writeText: async () => {} },
        llm: {
          provider: "test",
          model: "test",
          maxOutputTokens: 1024,
          temperature: 0,
          generate: async () => ({
            text: "{}",
            tokens: { input: 1, output: 1 },
            costUsd: 0,
          }),
        },
      },
      fork: () => {
        throw new Error("unused");
      },
    },
  );
}

describe("image v2 warnings channel", () => {
  afterEach(() => {
    clearAdapterEnv();
  });

  it("surfaces declared warning codes from adapter/decode warns", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-image-warn-"));
    const art = await imageV2Codec.produce(
      { modality: "image", prompt: "misty shoreline" },
      {
        runId: "warn-1",
        parentRunId: null,
        runDir,
        seed: null,
        outPath: resolve(runDir, "out.png"),
        logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
        clock: { now: () => 0, iso: () => new Date(0).toISOString() },
        sidecar: codecV2.createRunSidecar(),
        services: {
          telemetry: { writeText: async () => {} },
          llm: {
            provider: "test",
            model: "test",
            maxOutputTokens: 1024,
            temperature: 0,
            generate: async () => ({
              text: "{}",
              tokens: { input: 1, output: 1 },
              costUsd: 0,
            }),
          },
        },
        fork: () => {
          throw new Error("unused");
        },
      },
    );
    expect(
      art.metadata.warnings.some((warning) => warning.code === imageV2Codec.warnings.adapter_stub),
    ).toBe(true);
  });

  it("declares image/coarse-vq-invalid + image/seed-code-invalid warning codes for adapter fall-through", () => {
    expect(imageV2Codec.warnings.coarse_vq_invalid).toBe("image/coarse-vq-invalid");
    expect(imageV2Codec.warnings.seed_code_invalid).toBe("image/seed-code-invalid");
  });

  it("records an unreadable adapter weights path instead of dropping the warning", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "witt-adapter-warn-"));
    process.env.WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH = join(dir, "does-not-exist.json");

    const art = await produceWithDefaults();

    const codes = art.metadata.warnings.map((warning) => warning.code);
    expect(codes).toContain(IMAGE_WARNING_CODES.adapter_weights_unreadable);
    // The placeholder tier still reports itself; the adapter failure is now
    // recorded alongside it rather than being swallowed by the classifier.
    expect(codes).toContain(IMAGE_WARNING_CODES.adapter_stub);
  });

  it("records a token-grid mismatch instead of dropping the warning", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "witt-adapter-warn-"));
    const mismatched = join(dir, "mismatched.json");
    // The default scene asks for a [32,32] latent grid; declare [16,16].
    await writeFile(mismatched, JSON.stringify(adapterWeights([16, 16])), "utf8");
    process.env.WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH = mismatched;

    const art = await produceWithDefaults();

    expect(art.metadata.warnings.map((warning) => warning.code)).toContain(
      IMAGE_WARNING_CODES.adapter_token_grid_mismatch,
    );
  });

  it("classifies every declared warning code and backstops unknown text", () => {
    // The instance table is the module-scope table, so declarations cannot drift.
    expect(imageV2Codec.warnings).toBe(IMAGE_WARNING_CODES);

    expect(classifyImageWarning("providerLatents failed validation; falling back.")).toBe(
      IMAGE_WARNING_CODES.provider_latents_invalid,
    );
    expect(classifyImageWarning("coarseVq failed validation; falling back.")).toBe(
      IMAGE_WARNING_CODES.coarse_vq_invalid,
    );
    expect(classifyImageWarning("seedCode failed validation; falling back.")).toBe(
      IMAGE_WARNING_CODES.seed_code_invalid,
    );
    expect(classifyImageWarning("Using placeholder seed-expansion adapter; set X.")).toBe(
      IMAGE_WARNING_CODES.adapter_stub,
    );
    expect(classifyImageWarning("Using narrow-domain reference decoder bridge.")).toBe(
      IMAGE_WARNING_CODES.decoder_reference_bridge,
    );
    expect(classifyImageWarning("Using dense placeholder frozen-decoder bridge.")).toBe(
      IMAGE_WARNING_CODES.decoder_placeholder,
    );
    expect(classifyImageWarning("Reference decoder bridge unavailable; falling back.")).toBe(
      IMAGE_WARNING_CODES.decoder_fallback,
    );
    expect(classifyImageWarning("Image adapter: could not load or parse JSON at /x.json")).toBe(
      IMAGE_WARNING_CODES.adapter_weights_unreadable,
    );
    expect(
      classifyImageWarning(
        "Image adapter: token_grid mismatch for /x.json; expected scene [32,32], weights [16,16].",
      ),
    ).toBe(IMAGE_WARNING_CODES.adapter_token_grid_mismatch);

    // Totality: an unmapped message is recorded, never discarded.
    expect(classifyImageWarning("a brand new warning nobody mapped")).toBe(
      IMAGE_WARNING_CODES.unclassified,
    );
  });
});
