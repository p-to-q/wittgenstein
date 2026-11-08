import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WITTGENSTEIN_CONFIG,
  RunManifestSchema,
  type CostUsdReason,
  type codecV2,
} from "@wittgenstein/schemas";
import type { LlmAdapter, LlmGenerationRequest, LlmGenerationResult } from "../src/llm/adapter.js";
import { createDefaultRegistry, Wittgenstein } from "../src/runtime/harness.js";
import { CodecRegistry } from "../src/runtime/registry.js";

let cwd: string;

beforeEach(async () => {
  cwd = await mkdtemp(join(tmpdir(), "wittgenstein-receipts-"));
});

afterEach(async () => {
  await rm(cwd, { recursive: true, force: true });
});

const generation: LlmGenerationResult = {
  text: "not JSON",
  tokens: { input: 10, output: 5 },
  costUsd: 0.01,
  costUsdReason: "computed",
};

function mockLlm(response = generation): LlmAdapter {
  return { provider: "test-provider", generate: vi.fn(async () => response) };
}

const generationRequest: LlmGenerationRequest = {
  messages: [{ role: "user", content: "expanded test prompt" }],
  model: "test-model",
  maxOutputTokens: 100,
  temperature: 0,
  seed: 42,
};

interface TestCodecOptions {
  afterGeneration?: (ctx: codecV2.HarnessCtx) => void;
  calls?: number;
  metadataCalls?: number;
  includeLlmMetadata?: boolean;
  writeArtifact?: boolean;
  metadataCostUsd?: number;
  metadataCostUsdReason?: CostUsdReason;
  metadataReceipt?: {
    llmTokens?: { input: number; output: number };
    costUsd?: number | null;
    costUsdReason?: CostUsdReason;
  };
  metadataArtifactSha256?: string;
  manifestRows?: ReadonlyArray<codecV2.ManifestRow>;
}

function testRegistry(options: TestCodecOptions = {}): CodecRegistry {
  const {
    afterGeneration = () => {},
    calls = 1,
    metadataCalls = calls,
    includeLlmMetadata = true,
    writeArtifact = true,
    metadataCostUsd,
    metadataCostUsdReason,
    metadataReceipt,
    metadataArtifactSha256,
    manifestRows = [],
  } = options;
  const codec: codecV2.Codec<unknown, codecV2.BaseArtifact> = {
    id: "test-codec",
    modality: "image",
    routes: [{ id: "test", match: () => true }],
    schema: {
      "~standard": { version: 1, vendor: "test", validate: (value) => ({ value }) },
    },
    async produce(_request, ctx) {
      const llm = ctx.services?.llm as LlmAdapter;
      for (let index = 0; index < calls; index += 1) {
        await llm.generate(generationRequest);
      }
      afterGeneration(ctx);
      const bytes = Buffer.from("test artifact");
      if (writeArtifact) {
        await writeFile(ctx.outPath, bytes);
      }
      return {
        outPath: ctx.outPath,
        mime: "image/png",
        bytes,
        metadata: {
          codec: "test-codec",
          warnings: [],
          promptExpanded: "codec-authored prompt",
          llmOutputRaw: "codec-authored output",
          ...(includeLlmMetadata
            ? (metadataReceipt ?? {
                llmTokens: { input: 10 * metadataCalls, output: 5 * metadataCalls },
                costUsd: metadataCostUsd ?? 0.01 * metadataCalls,
                costUsdReason: metadataCostUsdReason ?? ("computed" as const),
              })
            : {}),
          artifactSha256:
            metadataArtifactSha256 ?? createHash("sha256").update(bytes).digest("hex"),
        },
      };
    },
    manifestRows: () => manifestRows,
  };
  return new CodecRegistry().register(codec);
}

describe("harness LLM receipts and budget enforcement", () => {
  it("preserves completed LLM usage when the image codec cannot parse its response", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      createDefaultRegistry(),
      mockLlm(),
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "parse failure" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.manifest.ok).toBe(false);
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.costUsd).toBe(generation.costUsd);
    expect(outcome.manifest.costUsdReason).toBe("computed");
    expect(outcome.manifest.llmOutputRaw).toBe(generation.text);
    expect(outcome.manifest.promptExpanded).toContain("parse failure");
    expect(
      JSON.parse(await readFile(join(outcome.runDir, "llm-calls/1-response.json"), "utf8")),
    ).toEqual(generation);
    expect(RunManifestSchema.safeParse(outcome.manifest).success).toBe(true);
  });

  it.each([
    { maxTokens: 14, maxCostUsd: 1 },
    { maxTokens: 100, maxCostUsd: 0.009 },
  ])("stops before decode and retains receipts when the budget is exceeded: %j", async (budget) => {
    const afterGeneration = vi.fn();
    const config = structuredClone(DEFAULT_WITTGENSTEIN_CONFIG);
    config.runtime.budget = budget;
    const harness = new Wittgenstein(config, testRegistry({ afterGeneration }), mockLlm());
    const outcome = await harness.run(
      { modality: "image", prompt: "over budget" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("BUDGET_EXCEEDED");
    expect(afterGeneration).not.toHaveBeenCalled();
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.costUsd).toBe(generation.costUsd);
    expect(outcome.manifest.costUsdReason).toBe("computed");
    expect(outcome.manifest.llmOutputRaw).toBe(generation.text);
    expect(outcome.manifest.artifactPath).toBeNull();
    expect(RunManifestSchema.safeParse(outcome.manifest).success).toBe(true);
  });

  it("does not double-charge a successful call and preserves codec-authored metadata", async () => {
    const config = structuredClone(DEFAULT_WITTGENSTEIN_CONFIG);
    config.runtime.budget = { maxTokens: 15, maxCostUsd: 0.01 };
    const harness = new Wittgenstein(config, testRegistry(), mockLlm());
    const outcome = await harness.run(
      { modality: "image", prompt: "exact budget" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error).toBeNull();
    expect(outcome.manifest.ok).toBe(true);
    expect(outcome.manifest.promptExpanded).toBe("codec-authored prompt");
    expect(outcome.manifest.llmOutputRaw).toBe("codec-authored output");
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(await readFile(outcome.manifest.artifactPath!, "utf8")).toBe("test artifact");
    expect(RunManifestSchema.safeParse(outcome.manifest).success).toBe(true);
  });

  it("uses observed service usage when a successful codec omits its LLM receipt", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ includeLlmMetadata: false }),
      mockLlm(),
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "missing codec receipt" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error).toBeNull();
    expect(outcome.manifest.ok).toBe(true);
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.costUsd).toBe(generation.costUsd);
    expect(outcome.manifest.costUsdReason).toBe("computed");
    expect(RunManifestSchema.safeParse(outcome.manifest).success).toBe(true);
  });

  it("rejects token metadata that understates a successful service call", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ metadataCalls: 0 }),
      mockLlm(),
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "underreported token receipt" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("LLM_RECEIPT_MISMATCH");
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.costUsd).toBe(generation.costUsd);
  });

  it("rejects cost metadata that understates a successful service call", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ metadataCostUsd: 0 }),
      mockLlm(),
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "underreported cost receipt" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("LLM_RECEIPT_MISMATCH");
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.costUsd).toBe(generation.costUsd);
  });

  it.each(["unknown-model", "missing-usage"] as const)(
    "rejects numeric cost metadata with a %s reason after an observed service call",
    async (costUsdReason) => {
      const harness = new Wittgenstein(
        DEFAULT_WITTGENSTEIN_CONFIG,
        testRegistry({ metadataCostUsd: 0, metadataCostUsdReason: costUsdReason }),
        mockLlm(),
      );
      const outcome = await harness.run(
        { modality: "image", prompt: `numeric ${costUsdReason}` },
        { command: "test", args: [], cwd },
      );

      expect(outcome.error?.code).toBe("LLM_RECEIPT_MISMATCH");
      expect(outcome.manifest.ok).toBe(false);
    },
  );

  it.each(["unknown-model", "missing-usage"] as const)(
    "rejects numeric cost metadata with a %s reason when no service call was observed",
    async (costUsdReason) => {
      const harness = new Wittgenstein(
        DEFAULT_WITTGENSTEIN_CONFIG,
        testRegistry({
          calls: 0,
          metadataCostUsd: 0,
          metadataCostUsdReason: costUsdReason,
        }),
        null,
      );
      const outcome = await harness.run(
        { modality: "image", prompt: `local ${costUsdReason}` },
        { command: "test", args: [], cwd },
      );

      expect(outcome.error?.code).toBe("LLM_RECEIPT_MISMATCH");
      expect(outcome.manifest.ok).toBe(false);
    },
  );

  it("preserves explicit null seeds and merges service overrides in forked contexts", async () => {
    let parentServiceValue: unknown;
    let forked: codecV2.HarnessCtx | undefined;
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({
        calls: 0,
        afterGeneration: (ctx) => {
          parentServiceValue = ctx.services?.scope;
          forked = ctx.fork("child-run", {
            seed: null,
            services: { scope: "child", childOnly: true },
          });
        },
      }),
      mockLlm(),
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "fork context" },
      {
        command: "test",
        args: [],
        cwd,
        services: { scope: "parent", parentOnly: true },
      },
    );

    expect(outcome.error).toBeNull();
    expect(parentServiceValue).toBe("parent");
    expect(forked).toMatchObject({
      parentRunId: outcome.manifest.runId,
      seed: null,
      services: { scope: "child", parentOnly: true, childOnly: true },
    });
    expect(outcome.manifest.costUsd).toBeNull();
    expect(outcome.manifest.costUsdReason).toBe("no-llm-call");
  });

  it.each([
    {
      name: "nonzero tokens without a cost receipt",
      receipt: { llmTokens: { input: 4, output: 2 } },
    },
    {
      name: "computed cost without an amount",
      receipt: { llmTokens: { input: 0, output: 0 }, costUsdReason: "computed" as const },
    },
  ])("writes a structured failure for $name", async ({ receipt }) => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ calls: 0, metadataReceipt: receipt }),
      null,
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "incomplete no-call receipt" },
      { command: "test", args: [], cwd },
    );
    const writtenManifest = JSON.parse(
      await readFile(join(outcome.runDir, "manifest.json"), "utf8"),
    );

    expect(outcome.error?.code).toBe("LLM_RECEIPT_MISMATCH");
    expect(outcome.manifest.error?.details).toMatchObject({ declaredLlmTokens: receipt.llmTokens });
    if (receipt.costUsdReason) {
      expect(outcome.manifest.error?.details).toMatchObject({
        declaredCostUsdReason: receipt.costUsdReason,
      });
    }
    expect(writtenManifest.error.code).toBe("LLM_RECEIPT_MISMATCH");
    expect(RunManifestSchema.safeParse(writtenManifest).success).toBe(true);
  });

  it("fails the run when a codec does not write its declared artifact", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ calls: 0, writeArtifact: false }),
      null,
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "missing artifact" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("ARTIFACT_HASH_FAILED");
    expect(outcome.manifest.ok).toBe(false);
    expect(outcome.manifest.artifactSha256).toBeNull();
  });

  it("rejects an artifact SHA-256 claim that differs from the written file", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ calls: 0, metadataArtifactSha256: "f".repeat(64) }),
      null,
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "metadata hash mismatch" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("ARTIFACT_HASH_MISMATCH");
    expect(outcome.error?.message).toContain("from metadata");
    expect(outcome.manifest.error?.details).toMatchObject({ source: "metadata" });
    expect(outcome.manifest.ok).toBe(false);
    expect(outcome.manifest.artifactSha256).toBeNull();
  });

  it("rejects an artifact.sha256 manifest row that differs from the written file", async () => {
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({
        calls: 0,
        manifestRows: [{ key: "artifact.sha256", value: "f".repeat(64) }],
      }),
      null,
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "manifest row hash mismatch" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("ARTIFACT_HASH_MISMATCH");
    expect(outcome.error?.message).toContain("from artifact.sha256 row");
    expect(outcome.manifest.error?.details).toMatchObject({ source: "artifact.sha256 row" });
    expect(outcome.manifest["artifact.sha256"]).toBeUndefined();
    expect(outcome.manifest.ok).toBe(false);
    expect(outcome.manifest.artifactSha256).toBeNull();
  });

  it("retains a verified artifact.sha256 row on success", async () => {
    const bytes = Buffer.from("test artifact");
    const digest = createHash("sha256").update(bytes).digest("hex");
    const harness = new Wittgenstein(
      DEFAULT_WITTGENSTEIN_CONFIG,
      testRegistry({ calls: 0, manifestRows: [{ key: "artifact.sha256", value: digest }] }),
      null,
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "verified manifest row hash" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error).toBeNull();
    expect(outcome.manifest["artifact.sha256"]).toBe(digest);
    expect(outcome.manifest.artifactSha256).toBe(digest);
  });

  it("accounts for all completed calls before a later call crosses the budget", async () => {
    const config = structuredClone(DEFAULT_WITTGENSTEIN_CONFIG);
    config.runtime.budget = { maxTokens: 20, maxCostUsd: 1 };
    const afterGeneration = vi.fn();
    const harness = new Wittgenstein(
      config,
      testRegistry({ afterGeneration, calls: 2 }),
      mockLlm(),
    );
    const outcome = await harness.run(
      { modality: "image", prompt: "two calls" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("BUDGET_EXCEEDED");
    expect(afterGeneration).not.toHaveBeenCalled();
    expect(outcome.manifest.llmTokens).toEqual({ input: 20, output: 10 });
    expect(outcome.manifest.costUsd).toBe(0.02);
  });

  it("retains codec receipts when metadata reports over-budget work outside the LLM service", async () => {
    const config = structuredClone(DEFAULT_WITTGENSTEIN_CONFIG);
    config.runtime.budget = { maxTokens: 14, maxCostUsd: 1 };
    const harness = new Wittgenstein(config, testRegistry({ calls: 0, metadataCalls: 1 }), null);
    const outcome = await harness.run(
      { modality: "image", prompt: "codec-owned work" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("BUDGET_EXCEEDED");
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.llmOutputRaw).toBe("codec-authored output");
    expect(outcome.manifest.costUsd).toBe(0.01);
    expect(await readFile(outcome.manifest.artifactPath!, "utf8")).toBe("test artifact");
  });

  it("does not invent a price when an unpriced LLM response fails parsing", async () => {
    const llm = mockLlm({ ...generation, costUsd: null, costUsdReason: "unknown-model" });
    const harness = new Wittgenstein(DEFAULT_WITTGENSTEIN_CONFIG, createDefaultRegistry(), llm);
    const outcome = await harness.run(
      { modality: "image", prompt: "unpriced parse failure" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.manifest.ok).toBe(false);
    expect(outcome.manifest.costUsd).toBeNull();
    expect(outcome.manifest.costUsdReason).toBe("unknown-model");
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
  });

  it("records an attempted call with missing usage when the provider rejects", async () => {
    const llm: LlmAdapter = {
      provider: "test-provider",
      generate: async () => {
        throw new Error("provider disconnected");
      },
    };
    const harness = new Wittgenstein(DEFAULT_WITTGENSTEIN_CONFIG, testRegistry(), llm);
    const outcome = await harness.run(
      { modality: "image", prompt: "provider failure" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.message).toBe("provider disconnected");
    expect(outcome.manifest.costUsd).toBeNull();
    expect(outcome.manifest.costUsdReason).toBe("missing-usage");
    expect(outcome.manifest.llmProvider).toBe("test-provider");
    expect(outcome.manifest.llmModel).toBe("test-model");
    expect(
      JSON.parse(await readFile(join(outcome.runDir, "llm-calls/1-request.json"), "utf8")),
    ).toEqual(generationRequest);
  });

  it("retains legacy generation receipts before enforcing its budget", async () => {
    const config = structuredClone(DEFAULT_WITTGENSTEIN_CONFIG);
    config.runtime.budget = { maxTokens: 14, maxCostUsd: 1 };
    const parse = vi.fn(() => ({ ok: true as const, value: {} }));
    const registry = new CodecRegistry().register({
      name: "legacy-image",
      modality: "image",
      schemaPreamble: () => "test schema",
      requestSchema: {} as never,
      outputSchema: {} as never,
      parse,
      render: async () => {
        throw new Error("render must not run");
      },
    });
    const harness = new Wittgenstein(config, registry, mockLlm());
    const outcome = await harness.run(
      { modality: "image", prompt: "legacy budget" },
      { command: "test", args: [], cwd },
    );

    expect(outcome.error?.code).toBe("BUDGET_EXCEEDED");
    expect(parse).not.toHaveBeenCalled();
    expect(outcome.manifest.llmTokens).toEqual(generation.tokens);
    expect(outcome.manifest.costUsd).toBe(0.01);
    expect(outcome.manifest.llmOutputRaw).toBe(generation.text);
    expect(await readFile(join(outcome.runDir, "llm-output.txt"), "utf8")).toBe(generation.text);
  });
});
