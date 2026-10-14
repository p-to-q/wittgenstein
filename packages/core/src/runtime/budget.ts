import type { RuntimeConfig } from "@wittgenstein/schemas";
import { BudgetExceededError } from "./errors.js";

export interface BudgetSnapshot {
  tokens: number;
  costUsd: number;
}

export class BudgetTracker {
  private totalTokens = 0;
  private totalCostUsd = 0;

  public constructor(private readonly limits: RuntimeConfig["budget"]) {}

  public consume(tokens: number, costUsd: number): BudgetSnapshot {
    this.totalTokens += tokens;
    this.totalCostUsd += costUsd;
    this.assertWithinLimits();
    return this.snapshot();
  }

  public snapshot(): BudgetSnapshot {
    return {
      tokens: this.totalTokens,
      costUsd: this.totalCostUsd,
    };
  }

  /**
   * Fail fast before a spend is attempted. The harness calls this before
   * issuing an LLM call so an already-exhausted budget rejects the NEXT call
   * instead of spending first and noticing afterwards (2026-10-16 Stage B).
   */
  public assertWithinLimits(): void {
    if (this.totalTokens > this.limits.maxTokens) {
      throw new BudgetExceededError(
        `Token budget exceeded: ${this.totalTokens} > ${this.limits.maxTokens}`,
      );
    }

    if (this.totalCostUsd > this.limits.maxCostUsd) {
      throw new BudgetExceededError(
        `Cost budget exceeded: ${this.totalCostUsd} > ${this.limits.maxCostUsd}`,
      );
    }
  }
}
