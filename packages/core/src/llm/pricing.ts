/**
 * Per-provider × per-model token pricing for honest manifest receipts (Issue #182).
 *
 * Rates are USD per 1,000,000 tokens (input / output). Update when:
 *   - a model rotation lands (e.g. claude-sonnet-4-6 → claude-sonnet-4-7);
 *   - a vendor changes published rates;
 *   - a new provider / adapter is added.
 *
 * Sources (documented for audit, not fetched at runtime):
 *   - Anthropic:  https://www.anthropic.com/pricing
 *   - OpenAI:     https://platform.openai.com/docs/pricing
 *   - Minimax:    https://platform.minimaxi.com/pricing
 *
 * Unknown (provider, model) pairs return `null` cost with a structured
 * `costUsdReason` so the manifest records the gap honestly rather than
 * silently zero. Operators can then choose to amend this table or treat
 * unknown-model receipts as audit material.
 */

export type CostUsdReason =
  | "computed"
  | "unknown-model"
  | "missing-usage"
  | "no-llm-call";

export interface ModelRate {
  /** USD per 1,000,000 input tokens. */
  readonly inputPerMillion: number;
  /** USD per 1,000,000 output tokens. */
  readonly outputPerMillion: number;
}

const RATES: Readonly<Record<string, Readonly<Record<string, ModelRate>>>> = {
  anthropic: {
    "claude-opus-4-7": { inputPerMillion: 15, outputPerMillion: 75 },
    "claude-opus-4-6": { inputPerMillion: 15, outputPerMillion: 75 },
    "claude-sonnet-4-7": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-haiku-4-5-20251001": { inputPerMillion: 1, outputPerMillion: 5 },
    "claude-haiku-4-5": { inputPerMillion: 1, outputPerMillion: 5 },
    "claude-3-5-haiku-20241022": { inputPerMillion: 0.8, outputPerMillion: 4 },
    "claude-3-5-sonnet-20241022": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-3-5-sonnet-20240620": { inputPerMillion: 3, outputPerMillion: 15 },
    "claude-3-opus-20240229": { inputPerMillion: 15, outputPerMillion: 75 },
  },
  "openai-compatible": {
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-2024-08-06": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "gpt-4-turbo": { inputPerMillion: 10, outputPerMillion: 30 },
  },
  minimax: {
    "minimax/minimax-01": { inputPerMillion: 0.2, outputPerMillion: 1.1 },
    "MiniMax-M1": { inputPerMillion: 0.4, outputPerMillion: 2.2 },
    "abab6.5-chat": { inputPerMillion: 1, outputPerMillion: 4 },
    "abab6.5s-chat": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  },
};

/**
 * Compute USD cost for a (provider, model, tokens) tuple.
 *
 * Returns:
 *   - `{ costUsd: number, costUsdReason: "computed" }` when both input and output are zero (no LLM round-trip).
 *   - `{ costUsd: number, costUsdReason: "computed" }` when the rate is known.
 *   - `{ costUsd: null,   costUsdReason: "unknown-model" }` when the (provider, model) pair is not in the rate table.
 *   - `{ costUsd: null,   costUsdReason: "missing-usage" }` when input or output token counts are not provided.
 *
 * Caller is responsible for surfacing the reason: typically the LLM adapter
 * sets these on `LlmGenerationResult`, the harness writes them onto the
 * manifest, and the budget tracker treats `null` as zero (with a separate
 * sidecar warning if it cares).
 */
export function priceModel(
  provider: string,
  model: string,
  tokens: { input: number; output: number } | undefined,
): { costUsd: number | null; costUsdReason: CostUsdReason } {
  if (tokens === undefined) {
    return { costUsd: null, costUsdReason: "missing-usage" };
  }

  if (tokens.input === 0 && tokens.output === 0) {
    return { costUsd: 0, costUsdReason: "computed" };
  }

  const providerRates = RATES[provider];
  const rate = providerRates?.[model];
  if (!rate) {
    return { costUsd: null, costUsdReason: "unknown-model" };
  }

  const cost =
    (tokens.input * rate.inputPerMillion) / 1_000_000 +
    (tokens.output * rate.outputPerMillion) / 1_000_000;
  return { costUsd: cost, costUsdReason: "computed" };
}

/**
 * Enumerate all (provider, model) combinations currently priced.
 * Useful for `wittgenstein doctor` and tests.
 */
export function pricedModels(): ReadonlyArray<{ provider: string; model: string }> {
  const out: Array<{ provider: string; model: string }> = [];
  for (const provider of Object.keys(RATES)) {
    const providerRates = RATES[provider];
    if (!providerRates) {
      continue;
    }
    for (const model of Object.keys(providerRates)) {
      out.push({ provider, model });
    }
  }
  return out;
}
