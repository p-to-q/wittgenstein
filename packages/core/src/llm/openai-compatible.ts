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

const DEFAULT_BASE_URLS: Record<string, string> = {
  "openai-compatible": "https://api.openai.com/v1",
  minimax: "https://api.minimax.chat/v1",
  moonshot: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

/**
 * Default retry posture for direct constructor users (the harness passes its
 * own `config.runtime.retry` values). Industry default: few attempts,
 * exponential backoff with full jitter, transient failures only.
 */
export const DEFAULT_LLM_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoffMs: 500,
  backoffStrategy: "exponential-jitter",
};

export class OpenAICompatibleLlmAdapter implements LlmAdapter {
  public readonly provider: string;
  private readonly config: LlmConfig;
  private readonly retryPolicy: RetryPolicy;

  public constructor(config: LlmConfig, retryPolicy: RetryPolicy = DEFAULT_LLM_RETRY_POLICY) {
    this.provider = config.provider;
    this.config = config;
    this.retryPolicy = retryPolicy;
  }

  public async generate(
    request: LlmGenerationRequest,
  ): Promise<LlmGenerationResult> {
    return retryWithPolicy(
      (attempt) => this.requestOnce(request, attempt),
      {
        ...this.retryPolicy,
        // Respect provider Retry-After headers when present (429/503
        // backpressure), unless the caller pinned its own override.
        respectRetryAfter: this.retryPolicy.respectRetryAfter ?? retryAfterMsFrom,
      },
      isTransientLlmFailure,
    );
  }

  private async requestOnce(
    request: LlmGenerationRequest,
    attempt: number,
  ): Promise<LlmGenerationResult> {
    const baseUrl =
      this.config.baseUrl ?? DEFAULT_BASE_URLS[this.config.provider] ?? DEFAULT_BASE_URLS["openai-compatible"];
    const apiKey = process.env[this.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(
        `Missing API key in env var ${this.config.apiKeyEnv} for provider ${this.config.provider}.`,
      );
    }

    // The timeout window must cover the body reads too: `fetch()` resolves
    // when headers arrive, so `response.json()`/`text()` run inside the
    // guarded `consume` callback while the abort timer is still armed.
    const rawJson: unknown = await fetchWithTimeout(
      `${baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          temperature: request.temperature,
          max_tokens: request.maxOutputTokens,
          seed: request.seed ?? undefined,
          response_format:
            request.responseFormat === "json"
              ? { type: "json_object" }
              : undefined,
        }),
      },
      this.config.timeoutMs ?? DEFAULT_LLM_TIMEOUT_MS,
      async (response) => {
        if (!response.ok) {
          const body = await response.text();
          throw new LlmHttpStatusError(
            response.status,
            `OpenAI-compatible request failed with ${response.status}${attempt > 1 ? ` (attempt ${attempt})` : ""}: ${body}`,
            parseRetryAfterHeader(response.headers.get("retry-after")),
          );
        }
        return await response.json();
      },
    );
    const parsed =
      llmSchemas.OpenAIChatCompletionResponseSchema.safeParse(rawJson);
    if (!parsed.success) {
      throw new WittgensteinError(
        "LLM_PROTOCOL_ERROR",
        `OpenAI-compatible (${this.config.provider}) response did not match the expected Chat Completions API shape.`,
        {
          details: {
            vendor: this.config.provider,
            issues: parsed.error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
        },
      );
    }

    // `min(1)` on the schema guarantees at least one choice, but the array
    // element type is still `T | undefined` per TS noUncheckedIndexedAccess.
    const firstChoice = parsed.data.choices[0];
    if (firstChoice === undefined) {
      throw new WittgensteinError(
        "LLM_PROTOCOL_ERROR",
        `OpenAI-compatible (${this.config.provider}) response choices array was unexpectedly empty after schema parse.`,
        { details: { vendor: this.config.provider } },
      );
    }

    const tokens = {
      input: parsed.data.usage.prompt_tokens,
      output: parsed.data.usage.completion_tokens,
    };
    const { costUsd, costUsdReason } = priceModel(this.config.provider, request.model, tokens);

    return {
      text: firstChoice.message.content,
      tokens,
      costUsd,
      costUsdReason,
      raw: parsed.data,
    };
  }
}
