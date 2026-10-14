import { z } from "zod";

export const LlmProviderSchema = z.enum([
  "openai-compatible",
  "anthropic",
  "minimax",
  "moonshot",
  "deepseek",
  "qwen",
]);
export type LlmProvider = z.infer<typeof LlmProviderSchema>;

export const LlmConfigSchema = z.object({
  provider: LlmProviderSchema,
  model: z.string(),
  baseUrl: z.string().url().optional(),
  apiKeyEnv: z.string().default("WITTGENSTEIN_LLM_API_KEY"),
  maxOutputTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.2),
  /**
   * Per-request network timeout for LLM calls (ms). Optional so callers that
   * construct `LlmConfig` objects by hand stay valid; the harness default
   * (`DEFAULT_WITTGENSTEIN_CONFIG`) and the adapter-level fallback both use
   * 120_000. Adapters pass an abort signal so a hung connection can never
   * block a run forever (2026-10-16 robustness slice A2).
   */
  timeoutMs: z.number().int().positive().optional(),
});
export type LlmConfig = z.infer<typeof LlmConfigSchema>;

export const SvgEngineConfigSchema = z.object({
  inferenceUrl: z.string().url().default("http://127.0.0.1:8777"),
  requestPath: z.string().default("/v1/generate"),
  timeoutMs: z.number().int().positive().default(120_000),
});
export type SvgEngineConfig = z.infer<typeof SvgEngineConfigSchema>;

export const RuntimeConfigSchema = z.object({
  artifactsDir: z.string().default("artifacts"),
  defaultSeed: z.number().int().nullable().default(null),
  retry: z
    .object({
      maxAttempts: z.number().int().min(1).default(3),
      backoffMs: z.number().int().nonnegative().default(500),
    })
    .default({}),
  budget: z
    .object({
      maxCostUsd: z.number().nonnegative().default(1.0),
      maxTokens: z.number().int().nonnegative().default(100_000),
    })
    .default({}),
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;

export const WittgensteinConfigSchema = z.object({
  llm: LlmConfigSchema,
  runtime: RuntimeConfigSchema.default({}),
  codecs: z
    .object({
      image: z.object({ enabled: z.boolean().default(true) }).default({}),
      audio: z.object({ enabled: z.boolean().default(true) }).default({}),
      video: z.object({ enabled: z.boolean().default(true) }).default({}),
      sensor: z.object({ enabled: z.boolean().default(true) }).default({}),
      svg: z.object({ enabled: z.boolean().default(true) }).default({}),
      asciipng: z.object({ enabled: z.boolean().default(true) }).default({}),
    })
    .default({}),
  svg: SvgEngineConfigSchema.default({
    inferenceUrl: "http://127.0.0.1:8777",
    requestPath: "/v1/generate",
    timeoutMs: 120_000,
  }),
});
export type WittgensteinConfig = z.infer<typeof WittgensteinConfigSchema>;

export const DEFAULT_WITTGENSTEIN_CONFIG: WittgensteinConfig = WittgensteinConfigSchema.parse({
  llm: {
    provider: "minimax",
    model: "minimax/minimax-01",
    apiKeyEnv: "WITTGENSTEIN_LLM_API_KEY",
    maxOutputTokens: 4096,
    temperature: 0.2,
    timeoutMs: 120_000,
  },
  runtime: {
    artifactsDir: "artifacts",
    defaultSeed: null,
    retry: {
      maxAttempts: 3,
      backoffMs: 500,
    },
    budget: {
      maxCostUsd: 1,
      maxTokens: 100000,
    },
  },
  svg: {
    inferenceUrl: "http://127.0.0.1:8777",
    requestPath: "/v1/generate",
    timeoutMs: 120_000,
  },
});
