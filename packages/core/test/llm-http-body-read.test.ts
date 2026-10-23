/**
 * Body-read timeout coverage for the LLM HTTP boundary (2026-10-16 sprint
 * follow-up): Node/undici `fetch()` resolves when response HEADERS arrive;
 * the body is a stream read afterwards. These tests pin that the timeout
 * window in `fetchWithTimeout` (and both adapters through it) covers the
 * WHOLE exchange — a server that writes headers and then stalls the body
 * must abort within the configured ms instead of hanging the run forever.
 *
 * Real `node:http` servers are used (not fetch stubs) so the abort semantics
 * exercised are undici's own: an abort during body consumption rejects the
 * read with a DOMException named "AbortError" (~101ms for a 100ms timeout on
 * Node 22), which `isTransientLlmFailure` classifies as retryable.
 */
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchWithTimeout, isTransientLlmFailure } from "../src/llm/http.js";
import { OpenAICompatibleLlmAdapter } from "../src/llm/openai-compatible.js";
import { AnthropicLlmAdapter } from "../src/llm/anthropic.js";

const originalFetch = globalThis.fetch;

type TestServer = { url: string; requests: () => number; close: () => Promise<void> };

/** Start a local HTTP server recording request count. */
async function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<TestServer> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  let requestCount = 0;
  server.on("request", () => {
    requestCount += 1;
  });
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    requests: () => requestCount,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections?.();
      }),
  };
}

/** Handler that writes success headers and then never sends the body. */
function stallBodyAfterHeaders(status = 200): (req: IncomingMessage, res: ServerResponse) => void {
  return (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    // flushHeaders() sends the status line + headers immediately, so `fetch()`
    // resolves and only the BODY read stalls — the exact defect shape.
    res.flushHeaders();
    // no write, no end — the body never arrives
  };
}

const servers: TestServer[] = [];

async function startStalledServer(status = 200): Promise<TestServer> {
  const server = await startServer(stallBodyAfterHeaders(status));
  servers.push(server);
  return server;
}

async function startJsonServer(body: string): Promise<TestServer> {
  const server = await startServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(body);
  });
  servers.push(server);
  return server;
}

beforeEach(() => {
  process.env.TEST_LLM_KEY = "fake-key";
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.TEST_LLM_KEY;
  await Promise.all(servers.splice(0).map((server) => server.close().catch(() => undefined)));
});

describe("fetchWithTimeout body-read coverage", () => {
  it("aborts a stalled body read (json) within the configured timeout", async () => {
    const server = await startStalledServer();
    const startedAt = Date.now();
    let consumeEntered = false;

    await expect(
      fetchWithTimeout(`${server.url}/completions`, { method: "POST" }, 100, (response) => {
        // Proves `fetch()` resolved (headers arrived) and the stall is in the
        // body read, not in the headers phase.
        consumeEntered = true;
        return response.json();
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(consumeEntered).toBe(true);
    const elapsed = Date.now() - startedAt;
    // The abort fired at the configured timeout (allow scheduling slack),
    // and — the actual regression — the read did not hang forever.
    expect(elapsed).toBeGreaterThanOrEqual(90);
    expect(elapsed).toBeLessThan(5_000);
  });

  it("classifies the body-read abort as a transient (retryable) failure", async () => {
    const server = await startStalledServer();

    let caught: unknown;
    try {
      await fetchWithTimeout(`${server.url}/completions`, { method: "POST" }, 100, (response) => response.json());
    } catch (error) {
      caught = error;
    }

    expect(isTransientLlmFailure(caught)).toBe(true);
  });

  it("aborts a stalled error-path body read (text on a non-ok response)", async () => {
    const server = await startStalledServer(500);
    let consumeEntered = false;

    await expect(
      fetchWithTimeout(`${server.url}/completions`, { method: "POST" }, 100, (response) => {
        consumeEntered = true;
        return response.text();
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(consumeEntered).toBe(true);
  });

  it("passes the consumed value through on the happy path", async () => {
    const server = await startJsonServer(JSON.stringify({ ok: true }));

    const value = await fetchWithTimeout(
      `${server.url}/completions`,
      { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
      5_000,
      (response) => response.json() as Promise<{ ok: boolean }>,
    );

    expect(value).toEqual({ ok: true });
  });
});

describe("OpenAICompatibleLlmAdapter body-read coverage", () => {
  const fastRetry = { maxAttempts: 2, backoffMs: 0, backoffStrategy: "linear" as const };

  it("times out a headers-then-stalled-body response end to end and retries it as transient", async () => {
    const server = await startStalledServer();
    const adapter = new OpenAICompatibleLlmAdapter(
      {
        provider: "openai-compatible",
        apiKeyEnv: "TEST_LLM_KEY",
        model: "test-model",
        baseUrl: server.url,
        timeoutMs: 100,
      },
      fastRetry,
    );

    await expect(
      adapter.generate({
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0,
        maxOutputTokens: 100,
        seed: 1,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    // AbortError stays transient: both attempts ran against the stalled server.
    expect(server.requests()).toBe(2);
  });

  it("returns the parsed payload when the body arrives", async () => {
    const server = await startJsonServer(
      JSON.stringify({
        choices: [{ message: { role: "assistant", content: '{"ok":true}' } }],
        usage: { prompt_tokens: 7, completion_tokens: 5 },
      }),
    );
    const adapter = new OpenAICompatibleLlmAdapter(
      {
        provider: "openai-compatible",
        apiKeyEnv: "TEST_LLM_KEY",
        model: "test-model",
        baseUrl: server.url,
        timeoutMs: 5_000,
      },
      { maxAttempts: 1, backoffMs: 0 },
    );

    const result = await adapter.generate({
      model: "test-model",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0,
      maxOutputTokens: 100,
      seed: 1,
    });

    expect(result.text).toBe('{"ok":true}');
    expect(result.tokens).toEqual({ input: 7, output: 5 });
  });
});

describe("AnthropicLlmAdapter body-read coverage", () => {
  it("times out a stalled body through the shared fetch window", async () => {
    const server = await startStalledServer();
    // The Anthropic adapter's endpoint is hardcoded, so requests are
    // redirected to the local stalled server while keeping undici's real
    // abort semantics (the AbortSignal is passed through untouched).
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
      originalFetch(server.url, init)) as typeof fetch;

    const adapter = new AnthropicLlmAdapter(
      {
        provider: "anthropic",
        apiKeyEnv: "TEST_LLM_KEY",
        model: "test-model",
        timeoutMs: 100,
      },
      { maxAttempts: 1, backoffMs: 0 },
    );

    await expect(
      adapter.generate({
        model: "test-model",
        messages: [{ role: "user", content: "hi" }],
        temperature: 0,
        maxOutputTokens: 100,
        seed: 1,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});