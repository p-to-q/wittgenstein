import { describe, expect, it, vi } from "vitest";
import { retryWithPolicy } from "../src/runtime/retry.js";

describe("retryWithPolicy", () => {
  it("returns the task result when the first attempt succeeds (no retries)", async () => {
    const task = vi.fn().mockResolvedValue("ok");
    const result = await retryWithPolicy(task, { maxAttempts: 3, backoffMs: 0 });
    expect(result).toBe("ok");
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("retries until success and returns the eventual result", async () => {
    let attempts = 0;
    const task = vi.fn(async () => {
      attempts += 1;
      if (attempts < 3) {
        throw new Error(`fail ${attempts}`);
      }
      return "third-time-lucky";
    });

    const result = await retryWithPolicy(task, { maxAttempts: 5, backoffMs: 0 });
    expect(result).toBe("third-time-lucky");
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("passes the attempt number into the task", async () => {
    const seen: number[] = [];
    const task = vi.fn(async (attempt: number) => {
      seen.push(attempt);
      if (attempt < 3) {
        throw new Error("retry");
      }
      return attempt;
    });

    await retryWithPolicy(task, { maxAttempts: 5, backoffMs: 0 });
    expect(seen).toEqual([1, 2, 3]);
  });

  it("throws the last error when maxAttempts is exhausted", async () => {
    let count = 0;
    const task = vi.fn(async () => {
      count += 1;
      throw new Error(`fail-${count}`);
    });

    await expect(retryWithPolicy(task, { maxAttempts: 3, backoffMs: 0 })).rejects.toThrow("fail-3");
    expect(task).toHaveBeenCalledTimes(3);
  });

  it("stops retrying immediately when shouldRetry returns false", async () => {
    const task = vi.fn(async () => {
      throw new Error("non-retryable");
    });
    const shouldRetry = vi.fn(() => false);

    await expect(
      retryWithPolicy(task, { maxAttempts: 5, backoffMs: 0 }, shouldRetry),
    ).rejects.toThrow("non-retryable");
    expect(task).toHaveBeenCalledTimes(1);
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });

  it("scales backoff linearly with attempt number", async () => {
    // Verify that backoff is `policy.backoffMs * attempt`. Use vi fake timers
    // so the test is deterministic and the assertion does not depend on
    // wall-clock variance.
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const task = vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("retry");
        }
        return "done";
      });

      const promise = retryWithPolicy(task, { maxAttempts: 5, backoffMs: 100 });

      // Drive the event loop forward: first failure → backoff = 100 ms
      await vi.advanceTimersByTimeAsync(100);
      // Second failure → backoff = 200 ms
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe("done");
      expect(task).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not call shouldRetry on the final attempt (after the throw)", async () => {
    // On attempt === maxAttempts, the function throws without consulting
    // shouldRetry. Verifies the early-return short-circuit.
    const task = vi.fn(async () => {
      throw new Error("always fail");
    });
    const shouldRetry = vi.fn(() => true);

    await expect(
      retryWithPolicy(task, { maxAttempts: 2, backoffMs: 0 }, shouldRetry),
    ).rejects.toThrow();
    // shouldRetry called once (after attempt 1), not after attempt 2.
    expect(shouldRetry).toHaveBeenCalledTimes(1);
  });
});

describe("retryWithPolicy exponential-jitter strategy", () => {
  it("succeeds after transient failures with jittered delays within bounds", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const task = vi.fn(async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error("retry");
        }
        return "done";
      });

      const promise = retryWithPolicy(task, {
        maxAttempts: 5,
        backoffMs: 100,
        backoffStrategy: "exponential-jitter",
      });

      // Delay after attempt 1: uniform jitter in [0, 100].
      await vi.advanceTimersByTimeAsync(100);
      // Delay after attempt 2: uniform jitter in [0, 200].
      await vi.advanceTimersByTimeAsync(200);

      const result = await promise;
      expect(result).toBe("done");
      expect(task).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps exponential backoff at maxBackoffMs", async () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn(async () => {
        throw new Error("always fail");
      });

      const promise = retryWithPolicy(task, {
        maxAttempts: 4,
        backoffMs: 10_000,
        maxBackoffMs: 50,
        backoffStrategy: "exponential-jitter",
      }).catch(() => undefined);

      // Every inter-attempt delay must be within [0, 50]. Advancing 50ms
      // repeatedly must be enough to let all attempts finish.
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      await vi.advanceTimersByTimeAsync(50);
      await promise;
      expect(task).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the respectRetryAfter override when it returns a positive delay", async () => {
    vi.useFakeTimers();
    try {
      const task = vi.fn(async () => {
        throw new Error("rate-limited");
      });

      const promise = retryWithPolicy(
        task,
        {
          maxAttempts: 2,
          backoffMs: 100,
          backoffStrategy: "exponential-jitter",
          respectRetryAfter: () => 250,
        },
        () => true,
      );

      // Attach the rejection assertion first so the second attempt's throw
      // (which fires from inside the timer advance) is already handled.
      const assertion = expect(promise).rejects.toThrow("rate-limited");

      // Computed delay would be <= 100; the override pins 250ms. Advancing
      // only 100ms must NOT let the second attempt start.
      await vi.advanceTimersByTimeAsync(100);
      expect(task).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(150);
      await assertion;
      expect(task).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
