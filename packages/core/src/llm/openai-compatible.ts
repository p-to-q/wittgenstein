import { llm as llmSchemas } from "@wittgenstein/schemas";
import type { LlmConfig } from "@wittgenstein/schemas";
import { WittgensteinError } from "../runtime/errors.js";
import type { LlmAdapter, LlmGenerationRequest, LlmGenerationResult } from "./adapter.js";

const DEFAULT_BASE_URLS: Record<string, string> = {
  "openai-compatible": "https://api.openai.com/v1",
  minimax: "https://api.minimax.chat/v1",
  moonshot: "https://api.moonshot.cn/v1",
  deepseek: "https://api.deepseek.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
};

export class OpenAICompatibleLlmAdapter implements LlmAdapter {
  public readonly provider: string;
  private readonly config: LlmConfig;

  public constructor(config: LlmConfig) {
    this.provider = config.provider;
    this.config = config;
  }

  public async generate(
    request: LlmGenerationRequest,
  ): Promise<LlmGenerationResult> {
    const baseUrl =
      this.config.baseUrl ?? DEFAULT_BASE_URLS[this.config.provider] ?? DEFAULT_BASE_URLS["openai-compatible"];
    const apiKey = process.env[this.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(
        `Missing API key in env var ${this.config.apiKeyEnv} for provider ${this.config.provider}.`,
      );
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
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
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI-compatible request failed with ${response.status}: ${await response.text()}`,
      );
    }

    const rawJson: unknown = await response.json();
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

    return {
      text: firstChoice.message.content,
      tokens: {
        input: parsed.data.usage.prompt_tokens,
        output: parsed.data.usage.completion_tokens,
      },
      costUsd: 0,
      raw: parsed.data,
    };
  }
}
