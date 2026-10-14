/**
 * Per-provider × per-model token pricing for honest manifest receipts (Issue #182).
 *
 * Rates are USD per 1,000,000 tokens (input / output). Update when:
 *   - a model rotation lands (e.g. claude-sonnet-4-6 → claude-sonnet-4-7);
 *   - a vendor changes published rates;
 *   - a new provider / adapter is added.
 *
 * Sources (documented for audit, not fetched at runtime):
 *   - Anthropic:  https://platform.claude.com/docs/en/models/overview (primary,
 *                 model pages carry Input/Output $/MTok) + the Sonnet-5 price
 *                 decision report https://pondero.ai/news/2026-08-30-... (secondary).
 *   - OpenAI:     https://platform.openai.com/docs/pricing (primary) — the
 *                 gpt-4o / gpt-4.1 rows below are additionally corroborated by
 *                 two independent 2026 aggregators (calcis.dev, lmmarketcap.com).
 *   - MiniMax:    https://platform.minimax.io/docs/pricing/overview (primary).
 *
 * Last refreshed: 2026-10-16. Wherever independent sources disagree (the
 * newest OpenAI 5.4/5.5/5.6/6.x tiers), the model is deliberately left OUT of
 * this table: an honest "unknown-model" receipt beats a wrong dollar figure.
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
    // Current lineup (platform.claude.com models overview, 2026-10-16):
    "claude-opus-5-5": { inputPerMillion: 4, outputPerMillion: 20 },
    "claude-sonnet-5-5": { inputPerMillion: 2, outputPerMillion: 10 },
    // "From" rates for prompts <= 100k tokens; prompts above 100k cost
    // $0.50 in / $2.50 out per the haiku-5-5 model page.
    "claude-haiku-5-5": { inputPerMillion: 0.1, outputPerMillion: 0.5 },
    "claude-fable-5-1": { inputPerMillion: 10, outputPerMillion: 50 },
    // 5.x line per Anthropic's Aug-2026 price decision (pondero.ai report):
    "claude-opus-5": { inputPerMillion: 5, outputPerMillion: 25 },
    "claude-sonnet-5": { inputPerMillion: 2, outputPerMillion: 10 },
    // Legacy generation (rates unchanged; sonnet-4.6/4.7 corroborated by the
    // same Aug-2026 report listing them at $3/$15):
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
    // Current + still-sold tiers (2026-10-16, two independent aggregators in
    // agreement; gpt-4o/4.1/4o-mini rows also match official published rates).
    "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-2024-08-06": { inputPerMillion: 2.5, outputPerMillion: 10 },
    "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
    "gpt-4-turbo": { inputPerMillion: 10, outputPerMillion: 30 },
    "gpt-4.1": { inputPerMillion: 2, outputPerMillion: 8 },
    "gpt-4.1-mini": { inputPerMillion: 0.4, outputPerMillion: 1.6 },
    "gpt-4.1-nano": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
    "gpt-5": { inputPerMillion: 1.25, outputPerMillion: 10 },
    "gpt-5-mini": { inputPerMillion: 0.25, outputPerMillion: 2 },
    "gpt-5-nano": { inputPerMillion: 0.05, outputPerMillion: 0.4 },
    // gpt-5.4 / gpt-5.5 / gpt-5.6 / gpt-6.x are NOT pinned: aggregator
    // sources conflict on their rates; pin against platform.openai.com
    // before adding.
  },
  minimax: {
    // Current text models (platform.minimax.io/docs/pricing/overview,
    // 2026-10-16): the M2 line prices $0.30 in / $1.20 out per M tokens.
    // MiniMax-M3 is permanently 50% off (<=512k input tier shown here).
    "MiniMax-M3": { inputPerMillion: 0.3, outputPerMillion: 1.2 },
    "MiniMax-M2.7": { inputPerMillion: 0.3, outputPerMillion: 1.2 },
    "MiniMax-M2": { inputPerMillion: 0.3, outputPerMillion: 1.2 },
    "minimax/minimax-m2": { inputPerMillion: 0.3, outputPerMillion: 1.2 },
    "minimax/minimax-m3": { inputPerMillion: 0.3, outputPerMillion: 1.2 },
    // Legacy (rates unchanged since 2025; MiniMax-01 $0.20 input still
    // corroborated by aggregators in 2026-10):
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
