import { llm as llmSchemas } from "@wittgenstein/schemas";
import type { LlmConfig } from "@wittgenstein/schemas";
import { WittgensteinError } from "../runtime/errors.js";
import { retryWithPolicy, type RetryPolicy } from "../runtime/retry.js";
import type { LlmAdapter, LlmGenerationRequest, LlmGenerationResult } from "./adapter.js";
import { priceModel } from "./pricing.js";
import {
  DEFAULT_LLM_TIMEOUT_MS,
  fetchWithTimeout,
  isTransientLlmFailure,
  LlmHttpStatusError,
  parseRetryAfterHeader,
  retryAfterMsFrom,
} from "./http.js";
import { DEFAULT_LLM_RETRY_POLICY } from "./openai-compatible.js";

/**
 * Default Anthropic Messages endpoint base. The `/messages` path is appended
 * to the resolved base, so a configured `config.llm.baseUrl` (a gateway/proxy
 * deployment) can replace the host — the same base+path join the
 * openai-compatible lane uses (`DEFAULT_BASE_URLS` + `/chat/completions`).
 */
const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";

export class AnthropicLlmAdapter implements LlmAdapter {
  public readonly provider = "anthropic";
  private readonly retryPolicy: RetryPolicy;

  public constructor(
    private readonly config: LlmConfig,
    retryPolicy: RetryPolicy = DEFAULT_LLM_RETRY_POLICY,
  ) {
    this.retryPolicy = retryPolicy;
  }

  public async generate(request: LlmGenerationRequest): Promise<LlmGenerationResult> {
    return retryWithPolicy(
      (attempt) => this.requestOnce(request, attempt),
      {
        ...this.retryPolicy,
        respectRetryAfter: this.retryPolicy.respectRetryAfter ?? retryAfterMsFrom,
      },
      isTransientLlmFailure,
    );
  }

  private async requestOnce(
    request: LlmGenerationRequest,
    attempt: number,
  ): Promise<LlmGenerationResult> {
    const apiKey = process.env[this.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(`Missing API key in env var ${this.config.apiKeyEnv} for Anthropic.`);
    }

    // Precedence mirrors the openai-compatible lane: explicit per-adapter
    // `config.baseUrl` wins, else the provider default. Trailing slashes are
    // trimmed so a base ending in "/" cannot emit a doubled separator before
    // the Messages path.
    const baseUrl = this.config.baseUrl ?? DEFAULT_ANTHROPIC_BASE_URL;
    const messagesEndpoint = `${baseUrl.replace(/\/+$/, "")}/messages`;

    const response = await fetchWithTimeout(
      messagesEndpoint,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: request.maxOutputTokens,
          temperature: request.temperature,
          system:
            request.messages.find((message) => message.role === "system")?.content ??
            "Return JSON only.",
          messages: request.messages
            .filter((message) => message.role !== "system")
            .map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: message.content,
            })),
        }),
      },
      this.config.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
    );

    if (!response.ok) {
      const body = await response.text();
      throw new LlmHttpStatusError(
        response.status,
        `Anthropic request failed with ${response.status}${attempt > 1 ? ` (attempt ${attempt})` : ""}: ${body}`,
        parseRetryAfterHeader(response.headers.get("retry-after")),
      );
    }

    const rawJson: unknown = await response.json();
    const parsed = llmSchemas.AnthropicMessagesResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new WittgensteinError(
        "LLM_PROTOCOL_ERROR",
        `Anthropic response did not match the expected Messages API shape.`,
        {
          details: {
            vendor: "anthropic",
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
      );
    }

    // `min(1)` on the schema guarantees at least one block, but the array
    // element type is still `T | undefined` per TS noUncheckedIndexedAccess.
    const firstBlock = parsed.data.content[0];
    if (firstBlock === undefined) {
      throw new WittgensteinError(
        "LLM_PROTOCOL_ERROR",
        `Anthropic response content array was unexpectedly empty after schema parse.`,
        { details: { vendor: "anthropic" } },
      );
    }

    const tokens = {
      input: parsed.data.usage.input_tokens,
      output: parsed.data.usage.output_tokens,
    };
    const { costUsd, costUsdReason } = priceModel("anthropic", request.model, tokens);

    return {
      text: firstBlock.text,
      tokens,
      costUsd,
      costUsdReason,
      raw: parsed.data,
    };
  }
}
