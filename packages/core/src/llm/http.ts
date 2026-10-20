/**
 * Shared network-boundary guards for LLM adapters (2026-10-16 robustness
 * slice): per-request timeouts and transient-failure classification for
 * retries. Both adapters (`openai-compatible`, `anthropic`) use these so the
 * L1 retry/timeout posture stays in one place.
 *
 * Classification doctrine (industry default, OpenAI/DeepSeek-grade):
 *   - retry: network failures, request timeouts, and 408/425/429/5xx.
 *   - never retry: other 4xx (auth/validation — same request will fail
 *     again), schema/protocol errors (`LLM_PROTOCOL_ERROR` — permanent).
 */

export const DEFAULT_LLM_TIMEOUT_MS = 120_000;

export const TRANSIENT_HTTP_STATUSES: ReadonlySet<number> = new Set([
  408, // request timeout
  425, // too early
  429, // rate limit
  500, 502, 503, 504,
]);

export class LlmHttpStatusError extends Error {
  public readonly status: number;
  public readonly retryAfterMs: number | null;

  public constructor(status: number, message: string, retryAfterMs: number | null) {
    super(message);
    this.name = "LlmHttpStatusError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * `fetch` with a hard timeout covering the WHOLE request→response cycle,
 * including body consumption. Uses an `AbortController` plus an *unref'ed*
 * timer (unlike `AbortSignal.timeout`) so a pending timeout never keeps the
 * process alive.
 *
 * Node/undici `fetch()` resolves as soon as the response HEADERS arrive; the
 * body is a stream read afterwards. Clearing the timer when `fetch()` settles
 * (the pre-2026-10-21 shape) left `response.json()`/`text()` reads with no
 * timeout at all — a server that sends headers and then stalls the body hung
 * the run forever. Here the timer stays armed until `consume` settles, so an
 * abort interrupts the body read too (the `svg-generation.ts` posture). The
 * timer is cleared only after the full exchange completes.
 */
export async function fetchWithTimeout<T>(
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();

  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return await consume(response);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Parse an HTTP `Retry-After` header into milliseconds. Accepts both delta
 * seconds and an HTTP-date. Returns `null` when absent or unparsable.
 */
export function parseRetryAfterHeader(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && Number.isInteger(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

export function isTransientLlmFailure(error: unknown): boolean {
  if (error instanceof LlmHttpStatusError) {
    return TRANSIENT_HTTP_STATUSES.has(error.status);
  }

  // `fetch` rejects with `TypeError` for network-layer failures (DNS,
  // connection refused/reset) before any response exists.
  if (error instanceof TypeError) {
    return true;
  }

  // Timeout aborts surface as AbortError / TimeoutError (Node DOMException
  // and some runtimes' timeout errors). Retrying a timed-out request is safe:
  // the request is identical and the server may simply be slow.
  if (error instanceof Error) {
    return error.name === "AbortError" || error.name === "TimeoutError";
  }

  return false;
}

export function retryAfterMsFrom(error: unknown): number | null {
  return error instanceof LlmHttpStatusError ? error.retryAfterMs : null;
}
