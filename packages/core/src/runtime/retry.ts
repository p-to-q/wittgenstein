export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  /**
   * Backoff shape between attempts. `linear` (the default) preserves the
   * historical behavior: delay = `backoffMs * attempt`. `exponential-jitter`
   * uses `backoffMs * 2^(attempt-1)` capped at `maxBackoffMs`, multiplied by a
   * uniform random factor in [0,1] — the industry default for network retries
   * (OpenAI/DeepSeek-compatible SDKs). Pinned by `test/retry.test.ts`.
   */
  backoffStrategy?: "linear" | "exponential-jitter";
  /**
   * Upper bound for exponential backoff. Ignored for the linear strategy.
   * Defaults to 30_000ms.
   */
  maxBackoffMs?: number;
  /**
   * Optional per-error override for the computed delay. When provided and it
   * returns a positive number for an error, that delay is used verbatim
   * (e.g. honoring a `Retry-After` header). Returns `null`/`undefined` to fall
   * back to the computed delay.
   */
  respectRetryAfter?: (error: unknown) => number | null | undefined;
}

export async function retryWithPolicy<T>(
  task: (attempt: number) => Promise<T>,
  policy: RetryPolicy,
  shouldRetry: (error: unknown) => boolean = () => true,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= policy.maxAttempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === policy.maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const retryAfter = policy.respectRetryAfter?.(error);
      const delay =
        retryAfter !== null && retryAfter !== undefined && retryAfter > 0
          ? retryAfter
          : computedDelay(attempt, policy);
      await sleep(delay);
    }
  }

  throw lastError;
}

function computedDelay(attempt: number, policy: RetryPolicy): number {
  if (policy.backoffStrategy !== "exponential-jitter") {
    return policy.backoffMs * attempt;
  }

  const cap = policy.maxBackoffMs ?? 30_000;
  const exponential = Math.min(cap, policy.backoffMs * 2 ** (attempt - 1));
  // Full jitter: uniform in [0, exponential]. Keeps thundering-herd risk low
  // while remaining deterministic-safe under fake timers in tests.
  return Math.floor(Math.random() * exponential);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
