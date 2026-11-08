import { Console } from "node:console";
import { resolve } from "node:path";
import type {
  CostUsdReason,
  LicenseManifest,
  WittgensteinRequest,
  RenderCtx,
  RenderResult,
  RunManifest,
  codecV2,
} from "@wittgenstein/schemas";
import { codecV2 as codecV2Ns } from "@wittgenstein/schemas";
import { loadWittgensteinConfig } from "./config.js";
import { BudgetTracker } from "./budget.js";
import { assertRunManifestValid, collectRuntimeFingerprint, hashFileOrThrow } from "./manifest.js";
import { routeRequest } from "./router.js";
import { CodecRegistry } from "./registry.js";
import { createRunId, resolveSeed } from "./seed.js";
import { RunTelemetry } from "./telemetry.js";
import type { RetryPolicy } from "./retry.js";
import { serializeError, ValidationError, WittgensteinError } from "./errors.js";
import { injectSchemaPreamble } from "../schema/preamble.js";
import type { LlmAdapter, LlmGenerationRequest, LlmGenerationResult } from "../llm/adapter.js";
import { OpenAICompatibleLlmAdapter } from "../llm/openai-compatible.js";
import { AnthropicLlmAdapter } from "../llm/anthropic.js";
import { registerAudioCodec } from "../codecs/audio.js";
import { registerImageCodec } from "../codecs/image.js";
import { registerVideoCodec } from "../codecs/video.js";
import { registerSensorCodec } from "../codecs/sensor.js";
import { registerSvgCodec } from "../codecs/svg.js";
import { registerAsciipngCodec } from "../codecs/asciipng.js";
import {
  applyLegacyProviderReceipt,
  generateLegacyCodecInput as generateLegacyCodecInputForLegacyPipeline,
} from "./legacy-codec-pipeline.js";

export interface HarnessRunOptions {
  command: string;
  args: string[];
  cwd?: string;
  dryRun?: boolean;
  outPath?: string;
  configPath?: string;
  /**
   * Additional v2 codec services folded into `HarnessCtx.services`
   * (S7b/S7c entry-layer injection — e.g. an already-loaded decoder
   * bridge the CLI loaded via `loadLlamagenDecoderBridge`). Core
   * stays type-agnostic: each codec owns the shape of its services
   * and core-owned keys (`llm` / `telemetry` / `dryRun`) win on
   * conflicts.
   */
  services?: Readonly<Record<string, unknown>>;
}

export interface HarnessOutcome {
  manifest: RunManifest;
  result: RenderResult | null;
  runDir: string;
  error: ReturnType<typeof serializeError> | null;
}

export interface WittgensteinOptions {
  registry?: CodecRegistry;
  llmAdapter?: LlmAdapter | null;
}

type MutableManifest = RunManifest & Record<string, unknown>;

export class Wittgenstein {
  public constructor(
    private readonly config: Awaited<ReturnType<typeof loadWittgensteinConfig>>,
    private readonly registry: CodecRegistry,
    private readonly llmAdapter: LlmAdapter | null,
  ) {}

  public static async bootstrap(
    options: WittgensteinOptions & { cwd?: string; configPath?: string } = {},
  ): Promise<Wittgenstein> {
    const config = await loadWittgensteinConfig({
      ...(options.cwd ? { cwd: options.cwd } : {}),
      ...(options.configPath ? { configPath: options.configPath } : {}),
    });
    const registry = options.registry ?? createDefaultRegistry();
    const llmAdapter = options.llmAdapter ?? createLlmAdapter(config.llm, config.runtime.retry);
    return new Wittgenstein(config, registry, llmAdapter);
  }

  public async run(
    request: WittgensteinRequest,
    options: HarnessRunOptions,
  ): Promise<HarnessOutcome> {
    const cwd = resolve(options.cwd ?? process.cwd());
    const codec = routeRequest(request, this.registry);
    const runId = createRunId();
    const runDir = resolve(cwd, this.config.runtime.artifactsDir, "runs", runId);
    const telemetry = new RunTelemetry({ runId, runDir });
    const fingerprint = await collectRuntimeFingerprint(cwd);
    const budget = new BudgetTracker(this.config.runtime.budget);
    const seed = resolveSeed(request.seed, this.config.runtime.defaultSeed);
    const promptExpanded =
      "schemaPreamble" in codec
        ? injectSchemaPreamble(request.prompt, codec.schemaPreamble(request))
        : null;
    const startedAt = new Date();

    await telemetry.ensureRunDir();
    if (promptExpanded !== null) {
      await telemetry.writeText("llm-input.txt", promptExpanded);
    }

    const manifest: RunManifest = {
      runId,
      ...fingerprint,
      command: options.command,
      args: options.args,
      seed,
      codec: "name" in codec ? codec.name : codec.id,
      tier: null,
      route: "route" in request ? request.route : undefined,
      license: { weightsRestriction: "permissive" },
      llmProvider: this.config.llm.provider,
      llmModel: this.config.llm.model,
      llmTokens: {
        input: 0,
        output: 0,
      },
      costUsd: null,
      costUsdReason: "no-llm-call",
      promptRaw: request.prompt,
      promptExpanded,
      llmOutputRaw: null,
      llmOutputParsed: null,
      // Record the full request so `wittgenstein replay <manifest>` can
      // reconstruct the run without consulting external state (Issue #384).
      request,
      artifactPath: null,
      artifactSha256: null,
      startedAt: startedAt.toISOString(),
      durationMs: 0,
      ok: false,
      error: null,
    };

    let result: RenderResult | null = null;
    let error: ReturnType<typeof serializeError> | null = null;
    let codecReceiptRecorded = false;
    const llmCalls: LlmCallReceipt[] = [];
    const llmAdapter = this.llmAdapter;
    const meteredLlmAdapter: LlmAdapter | null = llmAdapter
      ? {
          provider: llmAdapter.provider,
          generate: async (generationRequest) => {
            budget.consume(0, 0);
            const receipt: LlmCallReceipt = { request: generationRequest };
            const callNumber = llmCalls.push(receipt);
            await telemetry.writeJson(`llm-calls/${callNumber}-request.json`, generationRequest);
            const generation = await llmAdapter.generate(generationRequest);
            receipt.response = generation;
            await telemetry.writeJson(`llm-calls/${callNumber}-response.json`, generation);
            // Stop before the codec can parse, adapt, or decode over-budget output.
            // The receipt already exists even when consume() rejects this call.
            budget.consume(
              generation.tokens.input + generation.tokens.output,
              generation.costUsd ?? 0,
            );
            return generation;
          },
        }
      : null;

    try {
      if (isV2Codec(codec)) {
        const validated = await codec.schema["~standard"].validate(request);
        if ("issues" in validated) {
          throw new ValidationError("Codec request failed v2 schema validation.", {
            details: {
              codec: codec.id,
              issues: validated.issues,
            },
          });
        }

        const harnessCtx = createHarnessCtx({
          runId,
          runDir,
          seed,
          outPath: resolve(options.outPath ?? defaultOutputPathFor(codec.modality, cwd, runId)),
          logger: createRunLogger(runId),
          llmAdapter: meteredLlmAdapter,
          llmModel: this.config.llm.model,
          llmTemperature: this.config.llm.temperature,
          llmMaxOutputTokens: this.config.llm.maxOutputTokens,
          dryRun: options.dryRun === true,
          telemetry,
          budget,
          ...(options.services ? { services: options.services } : {}),
        });

        const art = await codec.produce(validated.value, harnessCtx);
        const produced = art as codecV2.BaseArtifact & {
          outPath: string;
          mime: string;
          bytes?: Uint8Array;
          metadata: {
            codec: string;
            route?: string;
            llmTokens?: { input: number; output: number };
            costUsd?: number | null;
            costUsdReason?: CostUsdReason;
            durationMs?: number;
            seed?: number | null;
            promptExpanded?: string | null;
            llmOutputRaw?: string | null;
            llmOutputParsed?: unknown;
            artifactSha256?: string | null;
            license?: LicenseManifest;
          };
        };
        const artMeta = produced.metadata;
        const hasNumericUnpricedCost =
          artMeta.costUsd !== undefined &&
          artMeta.costUsd !== null &&
          (artMeta.costUsdReason === "unknown-model" || artMeta.costUsdReason === "missing-usage");
        const computedCostMissing =
          artMeta.costUsd === null && artMeta.costUsdReason === "computed";
        const noCallHasUsage =
          artMeta.costUsdReason === "no-llm-call" &&
          ((artMeta.llmTokens?.input ?? 0) > 0 || (artMeta.llmTokens?.output ?? 0) > 0);
        const noCallHasCost =
          artMeta.costUsdReason === "no-llm-call" &&
          artMeta.costUsd !== undefined &&
          artMeta.costUsd !== null &&
          artMeta.costUsd !== 0;
        if (hasNumericUnpricedCost || computedCostMissing || noCallHasUsage || noCallHasCost) {
          throw new WittgensteinError(
            "LLM_RECEIPT_MISMATCH",
            "Codec metadata contains an inconsistent LLM cost or usage receipt.",
            {
              details: {
                declaredCostUsd: artMeta.costUsd,
                declaredCostUsdReason: artMeta.costUsdReason,
                declaredLlmTokens: artMeta.llmTokens,
              },
            },
          );
        }

        const observedLlm = summarizeLlmCalls(llmCalls);
        manifest.promptExpanded =
          artMeta.promptExpanded ??
          (llmCalls.length > 0 ? observedLlm.promptExpanded : manifest.promptExpanded);
        manifest.llmOutputRaw =
          artMeta.llmOutputRaw ?? (llmCalls.length > 0 ? observedLlm.llmOutputRaw : null);
        manifest.llmOutputParsed = artMeta.llmOutputParsed ?? null;
        if (llmCalls.length > 0) {
          manifest.llmProvider = llmAdapter?.provider ?? manifest.llmProvider;
          manifest.llmModel = observedLlm.model ?? manifest.llmModel;
          manifest.llmTokens = observedLlm.tokens;
          manifest.costUsd = observedLlm.costUsd;
          manifest.costUsdReason = observedLlm.costUsdReason;

          if (
            artMeta.llmTokens &&
            (artMeta.llmTokens.input < observedLlm.tokens.input ||
              artMeta.llmTokens.output < observedLlm.tokens.output)
          ) {
            throw new WittgensteinError(
              "LLM_RECEIPT_MISMATCH",
              "Codec metadata reports fewer LLM tokens than the harness observed.",
              {
                details: {
                  observed: observedLlm.tokens,
                  declared: artMeta.llmTokens,
                },
              },
            );
          }
          if (artMeta.llmTokens) {
            manifest.llmTokens = artMeta.llmTokens;
          }

          if (artMeta.costUsdReason === "no-llm-call") {
            throw new WittgensteinError(
              "LLM_RECEIPT_MISMATCH",
              "Codec metadata claims no LLM call despite a recorded service call.",
              { details: { observedCalls: llmCalls.length } },
            );
          }
          if (artMeta.costUsd !== undefined) {
            if (
              (observedLlm.costUsd === null && artMeta.costUsd !== null) ||
              (observedLlm.costUsd !== null &&
                artMeta.costUsd !== null &&
                artMeta.costUsd + 1e-12 < observedLlm.costUsd)
            ) {
              throw new WittgensteinError(
                "LLM_RECEIPT_MISMATCH",
                "Codec metadata reports less LLM cost than the harness observed.",
                {
                  details: {
                    observedCostUsd: observedLlm.costUsd,
                    declaredCostUsd: artMeta.costUsd,
                  },
                },
              );
            }
            manifest.costUsd = artMeta.costUsd;
            manifest.costUsdReason =
              artMeta.costUsdReason ??
              (artMeta.costUsd === null
                ? observedLlm.costUsd === null
                  ? observedLlm.costUsdReason
                  : "missing-usage"
                : "computed");
          } else if (
            artMeta.costUsdReason !== undefined &&
            artMeta.costUsdReason !== observedLlm.costUsdReason
          ) {
            if (
              artMeta.costUsdReason === "unknown-model" ||
              artMeta.costUsdReason === "missing-usage"
            ) {
              manifest.costUsd = null;
              manifest.costUsdReason = artMeta.costUsdReason;
            } else {
              throw new WittgensteinError(
                "LLM_RECEIPT_MISMATCH",
                "Codec metadata gives a cost reason that conflicts with the observed LLM receipt.",
                {
                  details: {
                    observedCostUsdReason: observedLlm.costUsdReason,
                    declaredCostUsdReason: artMeta.costUsdReason,
                  },
                },
              );
            }
          }
        } else {
          manifest.llmTokens = artMeta.llmTokens ?? manifest.llmTokens;
          const noReportedTokens =
            (artMeta.llmTokens?.input ?? 0) === 0 && (artMeta.llmTokens?.output ?? 0) === 0;
          // Older v2 codecs use costUsd: 0 for dry-run/local output. Zero
          // usage is the evidence that lets the harness normalize that into
          // the manifest's explicit no-call receipt.
          if (
            noReportedTokens &&
            artMeta.costUsd === 0 &&
            artMeta.costUsdReason !== "unknown-model" &&
            artMeta.costUsdReason !== "missing-usage"
          ) {
            manifest.costUsd = null;
            manifest.costUsdReason = "no-llm-call";
          } else if (artMeta.costUsd !== undefined) {
            manifest.costUsd = artMeta.costUsd;
            manifest.costUsdReason =
              artMeta.costUsdReason ?? (artMeta.costUsd === null ? "missing-usage" : "computed");
          } else if (artMeta.costUsdReason !== undefined) {
            manifest.costUsdReason = artMeta.costUsdReason;
          }
        }
        manifest.artifactPath = produced.outPath;
        manifest.artifactSha256 = artMeta.artifactSha256 ?? null;
        applyLicenseReceipt(manifest, request, artMeta.license);
        const manifestRows = codec.manifestRows(art);
        // Keep the digest row out of failed manifests until the file has been
        // hashed and every codec claim has passed verification.
        foldManifestRows(
          manifest,
          manifestRows.filter((row) => row.key !== "artifact.sha256"),
        );
        codecReceiptRecorded = true;
        // The top-level field is a verified digest, not a codec assertion.
        manifest.artifactSha256 = null;
        // Codec metadata may include work outside services.llm. Charge only the
        // difference: successful service calls have already consumed this budget.
        const spent = budget.snapshot();
        budget.consume(
          Math.max(
            0,
            (artMeta.llmTokens?.input ?? 0) + (artMeta.llmTokens?.output ?? 0) - spent.tokens,
          ),
          Math.max(0, (artMeta.costUsd ?? 0) - spent.costUsd),
        );
        const actualArtifactSha256 = await hashFileOrThrow(produced.outPath);
        const hashClaims: Array<{ source: string; value: unknown }> = [
          { source: "metadata", value: artMeta.artifactSha256 },
          ...manifestRows
            .filter((row) => row.key === "artifact.sha256")
            .map((row) => ({ source: "artifact.sha256 row", value: row.value })),
        ];
        for (const claim of hashClaims) {
          if (claim.value === undefined || claim.value === null) {
            continue;
          }
          if (claim.value !== actualArtifactSha256) {
            throw new WittgensteinError(
              "ARTIFACT_HASH_MISMATCH",
              "The codec-declared artifact SHA-256 from " +
                claim.source +
                " does not match the file written to outPath.",
              {
                details: {
                  artifactPath: produced.outPath,
                  source: claim.source,
                  expectedSha256: claim.value,
                  actualSha256: actualArtifactSha256,
                },
              },
            );
          }
        }
        manifest.artifactSha256 = actualArtifactSha256;
        foldManifestRows(
          manifest,
          manifestRows.filter((row) => row.key === "artifact.sha256"),
        );
        result = toRenderResult(produced);
        manifest.ok = true;
        manifest.durationMs = Date.now() - startedAt.getTime();
      } else {
        result = await this.runLegacyCodecPipeline({
          codec,
          request,
          options,
          cwd,
          runId,
          runDir,
          seed,
          promptExpanded,
          startedAt,
          manifest,
          telemetry,
          budget,
        });
      }
    } catch (caughtError) {
      if (!codecReceiptRecorded && llmCalls.length > 0) {
        applyFailedLlmReceipts(manifest, llmCalls, llmAdapter!.provider);
      }
      error = serializeError(caughtError);
      manifest.error = error;
      manifest.durationMs = Date.now() - startedAt.getTime();
      manifest.ok = false;
    }

    assertRunManifestValid(manifest);
    await telemetry.writeJson("manifest.json", manifest);

    return {
      manifest,
      result,
      runDir,
      error,
    };
  }

  private async generateStructured(
    promptExpanded: string,
    seed: number | null,
  ): Promise<LlmGenerationResult> {
    if (!this.llmAdapter) {
      throw new ValidationError("No LLM adapter is configured for non-dry-run execution.");
    }

    return this.llmAdapter.generate({
      model: this.config.llm.model,
      maxOutputTokens: this.config.llm.maxOutputTokens,
      temperature: this.config.llm.temperature,
      seed,
      responseFormat: "json",
      messages: [
        {
          role: "system",
          content: "Return JSON only. Do not wrap it in markdown.",
        },
        {
          role: "user",
          content: promptExpanded,
        },
      ],
    });
  }

  private async runLegacyCodecPipeline(options: {
    codec: LegacyCodec;
    request: WittgensteinRequest;
    options: HarnessRunOptions;
    cwd: string;
    runId: string;
    runDir: string;
    seed: number | null;
    promptExpanded: string | null;
    startedAt: Date;
    manifest: RunManifest;
    telemetry: RunTelemetry;
    budget: BudgetTracker;
  }): Promise<RenderResult> {
    const {
      codec,
      request,
      options: runOptions,
      cwd,
      runId,
      runDir,
      seed,
      promptExpanded,
      startedAt,
      manifest,
      telemetry,
      budget,
    } = options;
    // Same fail-fast rule as the v2 services wrapper: don't pay for an
    // LLM call when the budget is already exhausted.
    budget.assertWithinLimits();
    const generation = await this.generateLegacyCodecInput(
      request,
      runOptions,
      promptExpanded,
      seed,
    );
    applyLegacyProviderReceipt(manifest, request, generation, this.config.svg.inferenceUrl);

    manifest.llmOutputRaw = generation.text;
    manifest.llmTokens = generation.tokens;
    manifest.costUsd = generation.costUsd;
    manifest.costUsdReason = generation.costUsdReason;
    await telemetry.writeText("llm-output.txt", generation.text);
    budget.consume(generation.tokens.input + generation.tokens.output, generation.costUsd ?? 0);

    const parsed = codec.parse(generation.text);
    if (!parsed.ok) {
      throw new ValidationError("Codec output could not be parsed", {
        details: {
          codec: codec.name,
          error: parsed.error,
        },
      });
    }

    manifest.llmOutputParsed = parsed.value;

    const renderCtx: RenderCtx = {
      runId,
      runDir,
      seed,
      outPath: resolve(runOptions.outPath ?? defaultOutputPathFor(request.modality, cwd, runId)),
      logger: createRunLogger(runId),
    };

    const rendered = await codec.render(parsed.value, renderCtx);
    manifest.artifactPath = rendered.artifactPath;
    manifest.artifactSha256 = await hashFileOrThrow(rendered.artifactPath);
    manifest.ok = true;
    manifest.durationMs = Date.now() - startedAt.getTime();
    manifest.llmTokens = rendered.metadata.llmTokens;
    if (rendered.metadata.costUsdReason !== undefined) {
      manifest.costUsd = rendered.metadata.costUsd;
      manifest.costUsdReason = rendered.metadata.costUsdReason;
    }
    if (rendered.metadata.renderPath !== undefined) {
      manifest.renderPath = rendered.metadata.renderPath;
    }
    if (rendered.metadata.videoRender !== undefined) {
      manifest.videoRender = rendered.metadata.videoRender;
    }
    if (rendered.metadata.sidecars !== undefined) {
      manifest.artifactSidecars = rendered.metadata.sidecars;
    }
    applyLicenseReceipt(manifest, request, rendered.metadata.license);
    return rendered;
  }

  private async generateLegacyCodecInput(
    request: WittgensteinRequest,
    options: HarnessRunOptions,
    promptExpanded: string | null,
    seed: number | null,
  ): Promise<LlmGenerationResult> {
    return generateLegacyCodecInputForLegacyPipeline(request, options, promptExpanded, seed, {
      llmConfig: this.config.llm,
      svgConfig: this.config.svg,
      generateStructured: (prompt, resolvedSeed) => this.generateStructured(prompt, resolvedSeed),
    });
  }
}

interface LegacyCodec {
  readonly name: string;
  parse(
    text: string,
  ):
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly error: unknown };
  render(value: unknown, ctx: RenderCtx): Promise<RenderResult>;
}

interface LlmCallReceipt {
  request: LlmGenerationRequest;
  response?: LlmGenerationResult;
}

function applyFailedLlmReceipts(
  manifest: RunManifest,
  calls: LlmCallReceipt[],
  provider: string,
): void {
  const observed = summarizeLlmCalls(calls);
  manifest.llmProvider = provider;
  manifest.llmModel = observed.model ?? manifest.llmModel;
  manifest.promptExpanded = observed.promptExpanded ?? manifest.promptExpanded;
  manifest.llmOutputRaw = observed.llmOutputRaw;
  manifest.llmTokens = observed.tokens;
  manifest.costUsd = observed.costUsd;
  manifest.costUsdReason = observed.costUsdReason;
}

function summarizeLlmCalls(calls: LlmCallReceipt[]): {
  tokens: { input: number; output: number };
  costUsd: number | null;
  costUsdReason: CostUsdReason;
  model: string | null;
  promptExpanded: string | null;
  llmOutputRaw: string | null;
} {
  const latest = calls[calls.length - 1];
  const tokens = { input: 0, output: 0 };
  let knownCostUsd = 0;
  let unknownCostReason: CostUsdReason | undefined;
  for (const call of calls) {
    if (!call.response) {
      unknownCostReason = "missing-usage";
      continue;
    }
    tokens.input += call.response.tokens.input;
    tokens.output += call.response.tokens.output;
    if (call.response.costUsd === null) {
      unknownCostReason ??= call.response.costUsdReason;
    } else {
      knownCostUsd += call.response.costUsd;
    }
  }
  return {
    tokens,
    costUsd: unknownCostReason ? null : knownCostUsd,
    costUsdReason: unknownCostReason ?? "computed",
    model: latest?.request.model ?? null,
    promptExpanded:
      latest?.request.messages
        .filter((message) => message.role === "user")
        .map((message) => message.content)
        .join("\n\n") ?? null,
    llmOutputRaw: latest?.response?.text ?? null,
  };
}

function applyLicenseReceipt(
  manifest: RunManifest,
  request: WittgensteinRequest,
  license: LicenseManifest | undefined,
): void {
  manifest.license = license ?? manifest.license ?? { weightsRestriction: "permissive" };
  if (
    manifest.license.weightsRestriction === "research-only" &&
    request.allowResearchWeights !== true
  ) {
    throw new WittgensteinError(
      "RESEARCH_WEIGHTS_REQUIRES_OPT_IN",
      "This run would load research-only weights. Re-run with --allow-research-weights to opt in per ADR-0020.",
      {
        details: {
          adr: "docs/adrs/0020-code-weights-license-divergence-policy.md",
          weightsRestriction: manifest.license.weightsRestriction,
        },
      },
    );
  }
}

function isV2Codec(
  codec: CodecRegistry["getOrThrow"] extends (...args: never[]) => infer T ? T : never,
): codec is codecV2.Codec<unknown, codecV2.BaseArtifact> {
  return "produce" in codec && typeof codec.produce === "function";
}

function createHarnessCtx(options: {
  runId: string;
  parentRunId?: string | null;
  runDir: string;
  seed: number | null;
  outPath: string;
  logger: RenderCtx["logger"];
  llmAdapter: LlmAdapter | null;
  llmModel: string;
  llmTemperature: number;
  llmMaxOutputTokens: number;
  dryRun: boolean;
  telemetry: RunTelemetry;
  budget: BudgetTracker;
  /** Entry-layer injected codec services (S7b/S7c); merged under core-owned keys. */
  services?: Readonly<Record<string, unknown>>;
}): codecV2.HarnessCtx {
  const ctx: codecV2.HarnessCtx = {
    runId: options.runId,
    parentRunId: options.parentRunId ?? null,
    runDir: options.runDir,
    seed: options.seed,
    outPath: options.outPath,
    logger: options.logger,
    clock: {
      now: () => Date.now(),
      iso: () => new Date().toISOString(),
    },
    sidecar: codecV2Ns.createRunSidecar(),
    services: {
      // Entry-layer injected services first; core-owned
      // llm/telemetry/dryRun win on key conflicts.
      ...(options.services ?? {}),
      llm: options.llmAdapter
        ? {
            provider: options.llmAdapter.provider,
            model: options.llmModel,
            maxOutputTokens: options.llmMaxOutputTokens,
            temperature: options.llmTemperature,
            generate: (request: Parameters<LlmAdapter["generate"]>[0]) => {
              // Fail fast before spending: an exhausted budget rejects the
              // next LLM call instead of paying for it and failing after.
              options.budget.assertWithinLimits();
              return options.llmAdapter!.generate(request);
            },
          }
        : undefined,
      telemetry: options.telemetry,
      dryRun: options.dryRun,
    },
    fork: (childRunId, overrides) =>
      createHarnessCtx({
        ...options,
        runId: childRunId,
        // Derive parentRunId from the forking ctx so multi-stage codecs
        // can trace sub-run lineage on receipts (Issue #346; contract
        // pinned by `packages/schemas/test/codec-v2.test.ts`).
        parentRunId: options.runId,
        runDir: overrides?.runDir ?? options.runDir,
        seed: overrides?.seed !== undefined ? overrides.seed : options.seed,
        outPath: overrides?.outPath ?? options.outPath,
        services: { ...(options.services ?? {}), ...(overrides?.services ?? {}) },
        llmAdapter: options.llmAdapter,
        telemetry: options.telemetry,
        dryRun: options.dryRun,
      }),
  };
  return ctx;
}

/**
 * Row keys a v2 codec may fold into the manifest via `manifestRows()` are a
 * closed set, single-sourced in the protocol package
 * (`@wittgenstein/schemas` → `codecV2.MANIFEST_ROW_KEYS`; set closed by the
 * 2026-10-16 robustness slice A4, moved + declared by the 2026-10-16
 * closeout review CR1/CR2). Before A4 the fold accepted ANY key — a codec
 * typo could silently overwrite core manifest fields (e.g. `seed`) or write
 * junk keys with no schema. Extending the set is deliberate and
 * code-reviewed; the runtime guard below stays for untyped callers even
 * though `ManifestRow.key` is now typed.
 */

/**
 * Folds codec manifest rows into the run manifest. Exported for the harness
 * unit tests; the harness itself is the only production caller.
 */
export function foldManifestRows(
  manifest: MutableManifest,
  rows: ReadonlyArray<codecV2.ManifestRow>,
): void {
  for (const row of rows) {
    if (!codecV2Ns.isManifestRowKey(row.key)) {
      throw new WittgensteinError(
        "MANIFEST_ROW_KEY_REJECTED",
        `Codec emitted manifest row with key "${row.key}", which is not in the allowed row-key set. ` +
          "Extend MANIFEST_ROW_KEYS in packages/schemas/src/codec/v2/manifest-rows.ts deliberately — " +
          "unchecked rows can silently overwrite core RunManifest fields.",
        { details: { rowKey: row.key } },
      );
    }
    // Generic row-channel write. The cast is the fold's contract: values are
    // codec-authored `unknown`; the closed key set here plus the typed
    // aliases below are what keep the manifest honest.
    (manifest as Record<string, unknown>)[row.key] = row.value;
    if (row.key === "route" && typeof row.value === "string") {
      manifest.route = row.value;
    }
    if (row.key === "artifact.sha256" && typeof row.value === "string") {
      manifest.artifactSha256 = row.value;
    }
  }
}

function toRenderResult(
  art: codecV2.BaseArtifact & {
    outPath: string;
    mime: string;
    bytes?: Uint8Array;
    metadata: {
      codec: string;
      route?: string;
      llmTokens?: { input: number; output: number };
      costUsd?: number | null;
      costUsdReason?: CostUsdReason;
      durationMs?: number;
      seed?: number | null;
      license?: LicenseManifest;
    };
  },
): RenderResult {
  return {
    artifactPath: art.outPath,
    mimeType: art.mime,
    bytes: art.bytes?.byteLength ?? 0,
    metadata: {
      codec: art.metadata.codec,
      llmTokens: art.metadata.llmTokens ?? { input: 0, output: 0 },
      costUsd: art.metadata.costUsd ?? 0,
      durationMs: art.metadata.durationMs ?? 0,
      seed: art.metadata.seed ?? null,
      ...(art.metadata.license ? { license: art.metadata.license } : {}),
      ...(art.metadata.route ? { route: art.metadata.route } : {}),
    },
  };
}

export function createDefaultRegistry(): CodecRegistry {
  const registry = new CodecRegistry();
  registerImageCodec(registry);
  registerAudioCodec(registry);
  registerVideoCodec(registry);
  registerSensorCodec(registry);
  registerSvgCodec(registry);
  registerAsciipngCodec(registry);
  return registry;
}

function createLlmAdapter(
  llmConfig: Awaited<ReturnType<typeof loadWittgensteinConfig>>["llm"],
  retryConfig: Awaited<ReturnType<typeof loadWittgensteinConfig>>["runtime"]["retry"],
): LlmAdapter | null {
  // Wire the L1 retry policy (config.runtime.retry) into the adapter with the
  // industry-default exponential-jitter strategy. Previously the retry config
  // was parsed but never consumed (2026-10-16 robustness slice A2).
  const retryPolicy: RetryPolicy = {
    maxAttempts: retryConfig.maxAttempts,
    backoffMs: retryConfig.backoffMs,
    backoffStrategy: "exponential-jitter",
  };

  if (llmConfig.provider === "anthropic") {
    return new AnthropicLlmAdapter(llmConfig, retryPolicy);
  }

  return new OpenAICompatibleLlmAdapter(llmConfig, retryPolicy);
}

// LEGITIMATE modality-aware routing (NOT v1-compat; stays even after #300).
// The codec registry IS keyed by modality, so picking a default output file
// extension by modality is the registry's own dispatch dimension. v2 codecs
// can override `outPath` via the request; this just provides the convention.
function defaultOutputPathFor(
  modality: WittgensteinRequest["modality"],
  cwd: string,
  runId: string,
) {
  const extension =
    modality === "image" || modality === "asciipng"
      ? "png"
      : modality === "audio"
        ? "wav"
        : modality === "video"
          ? "mp4"
          : modality === "svg"
            ? "svg"
            : "json";

  return resolve(cwd, "artifacts", "runs", runId, `output.${extension}`);
}

// Codec-run diagnostics are diagnostics: they belong on stderr so a run's
// stdout stays the single structured JSON document the CLI contract promises
// (ADR-0009 "logs on stderr"; RFC-0002 fix 1). Image runs in particular log
// `info` progress lines (VSC expansion, adapter selection) that must not
// interleave with the JSON envelope on stdout.
const diagnostics = new Console({ stdout: process.stderr, stderr: process.stderr });

function createRunLogger(runId: string): RenderCtx["logger"] {
  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    data?: unknown,
  ): void => {
    const line = `[wittgenstein:${runId}] ${message}`;
    // Omitting the second argument when there is no data keeps the line free
    // of the otherwise-trailing separator space.
    if (data === undefined || data === null) {
      diagnostics[level](line);
    } else {
      diagnostics[level](line, data);
    }
  };

  return {
    debug: (message, data) => log("debug", message, data),
    info: (message, data) => log("info", message, data),
    warn: (message, data) => log("warn", message, data),
    error: (message, data) => log("error", message, data),
  };
}
