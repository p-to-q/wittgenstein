import { z } from "zod";

/**
 * Minimal subset of the OpenAI Chat Completions API response shape that
 * `@wittgenstein/core`'s adapter relies on. Same strict-at-boundary
 * discipline as `AnthropicMessagesResponseSchema`: a response missing
 * `choices[0].message.content` or `usage.{prompt,completion}_tokens`
 * is a vendor-protocol error, not a silent zero-token success.
 *
 * Used by Moonshot / MiniMax / DeepSeek / Qwen / OpenAI itself — they
 * all conform to this shape per their OpenAI-compat documentation.
 */
export const OpenAIChatCompletionResponseSchema = z
  .object({
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string(),
                role: z.string().optional(),
              })
              .passthrough(),
          })
          .passthrough(),
      )
      .min(1, "choices array must have at least one entry"),
    usage: z.object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
    }),
  })
  .passthrough();

export type OpenAIChatCompletionResponse = z.infer<
  typeof OpenAIChatCompletionResponseSchema
>;
