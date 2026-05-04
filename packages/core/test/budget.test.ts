import { describe, expect, it } from "vitest";
import { BudgetTracker } from "../src/runtime/budget.js";
import { BudgetExceededError } from "../src/runtime/errors.js";

const limits = { maxTokens: 100, maxCostUsd: 1.0 };

describe("BudgetTracker.consume", () => {
  it("returns the running snapshot when within limits", () => {
    const tracker = new BudgetTracker(limits);
    const snap = tracker.consume(40, 0.4);
    expect(snap).toEqual({ tokens: 40, costUsd: 0.4 });
  });

  it("accumulates across consume calls", () => {
    const tracker = new BudgetTracker(limits);
    tracker.consume(30, 0.3);
    const snap = tracker.consume(20, 0.2);
    expect(snap).toEqual({ tokens: 50, costUsd: 0.5 });
  });

  it("throws BudgetExceededError when token total exceeds the limit", () => {
    const tracker = new BudgetTracker(limits);
    tracker.consume(80, 0);
    expect(() => tracker.consume(30, 0)).toThrow(BudgetExceededError);
  });

  it("throws BudgetExceededError when cost total exceeds the limit", () => {
    const tracker = new BudgetTracker(limits);
    tracker.consume(0, 0.8);
    expect(() => tracker.consume(0, 0.3)).toThrow(BudgetExceededError);
  });

  it("counts the budget-exceeding consume against the totals (snapshot must reflect what was charged)", () => {
    // Consuming past the limit must NOT silently roll back the totals.
    // The throw is the signal; the running totals are evidence.
    const tracker = new BudgetTracker(limits);
    tracker.consume(50, 0);
    try {
      tracker.consume(60, 0);
    } catch {
      // expected
    }
    expect(tracker.snapshot()).toEqual({ tokens: 110, costUsd: 0 });
  });

  it("treats consuming exactly at the limit as within budget (boundary == ok)", () => {
    const tracker = new BudgetTracker(limits);
    expect(() => tracker.consume(100, 1.0)).not.toThrow();
  });

  it("treats consuming one unit past the limit as over budget", () => {
    const tracker = new BudgetTracker(limits);
    expect(() => tracker.consume(101, 0)).toThrow(BudgetExceededError);
  });
});

describe("BudgetTracker.snapshot", () => {
  it("starts at zero before any consume", () => {
    const tracker = new BudgetTracker(limits);
    expect(tracker.snapshot()).toEqual({ tokens: 0, costUsd: 0 });
  });

  it("does not mutate the limits object after construction", () => {
    const localLimits = { maxTokens: 50, maxCostUsd: 0.5 };
    const tracker = new BudgetTracker(localLimits);
    tracker.consume(10, 0.1);
    expect(localLimits).toEqual({ maxTokens: 50, maxCostUsd: 0.5 });
  });
});
