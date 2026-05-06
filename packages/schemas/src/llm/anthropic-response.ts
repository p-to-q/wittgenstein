import { z } from "zod";

/**
 * Minimal subset of the Anthropic Messages API response shape that
 * `@wittgenstein/core`'s adapter relies on. Strict at the boundary —
 * a response missing `content[0].text` or `usage.{input,output}_tokens`
 * is a vendor-protocol error, not a $0 zero-token "successful" run.
 *
 * Fields not consumed by the adapter (e.g. `id`, `model`, `stop_reason`,
 * other content-block kinds) are deliberately permitted via a passthrough
 * so future vendor extensions don't break parsing.
 */
export const AnthropicMessagesResponseSchema = z
  .object({
    content: z
      .array(
        z
          .object({
            type: z.string().optional(),
            text: z.string(),
          })
          .passthrough(),
      )
      .min(1, "content array must have at least one block"),
    usage: z.object({
      input_tokens: z.number().int().nonnegative(),
      output_tokens: z.number().int().nonnegative(),
    }),
  })
  .passthrough();

export type AnthropicMessagesResponse = z.infer<typeof AnthropicMessagesResponseSchema>;
