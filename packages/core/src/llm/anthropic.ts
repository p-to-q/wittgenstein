import { llm as llmSchemas } from "@wittgenstein/schemas";
import type { LlmConfig } from "@wittgenstein/schemas";
import { WittgensteinError } from "../runtime/errors.js";
import type { LlmAdapter, LlmGenerationRequest, LlmGenerationResult } from "./adapter.js";
import { priceModel } from "./pricing.js";

export class AnthropicLlmAdapter implements LlmAdapter {
  public readonly provider = "anthropic";

  public constructor(private readonly config: LlmConfig) {}

  public async generate(request: LlmGenerationRequest): Promise<LlmGenerationResult> {
    const apiKey = process.env[this.config.apiKeyEnv];

    if (!apiKey) {
      throw new Error(`Missing API key in env var ${this.config.apiKeyEnv} for Anthropic.`);
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
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
    });

    if (!response.ok) {
      throw new Error(`Anthropic request failed with ${response.status}: ${await response.text()}`);
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
