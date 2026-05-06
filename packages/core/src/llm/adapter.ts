export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmGenerationRequest {
  messages: LlmMessage[];
  model: string;
  maxOutputTokens: number;
  temperature: number;
  seed: number | null;
  responseFormat?: "json" | "text";
}

import type { CostUsdReason } from "./pricing.js";

export interface LlmGenerationResult {
  text: string;
  tokens: {
    input: number;
    output: number;
  };
  /**
   * Computed cost in USD. `null` when the model is unpriced (`costUsdReason: "unknown-model"`)
   * or when the vendor did not return token usage (`costUsdReason: "missing-usage"`).
   * Manifest receipts preserve `null` rather than silently substituting zero (Issue #182).
   */
  costUsd: number | null;
  costUsdReason: CostUsdReason;
  raw?: unknown;
}

export interface LlmAdapter {
  readonly provider: string;
  generate(request: LlmGenerationRequest): Promise<LlmGenerationResult>;
}
