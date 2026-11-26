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
 * read with a DOMException named "AbortError", which `isTransientLlmFailure`
 * classifies as retryable. Body-entry assertions control only the timeout
 * clock after real headers arrive; adapter/retry coverage uses real timers.
 */
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout, isTransientLlmFailure } from "../src/llm/http.js";
import { OpenAICompatibleLlmAdapter } from "../src/llm/openai-compatible.js";
import { AnthropicLlmAdapter } from "../src/llm/anthropic.js";

type TestServer = { url: string; requests: () => number; close: () => Promise<void> };

/** Start a local HTTP server recording request count. */
async function startServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
): Promise<TestServer> {
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
  vi.useRealTimers();
  delete process.env.TEST_LLM_KEY;
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("fetchWithTimeout body-read coverage", () => {
  it("keeps the configured timeout armed during a stalled JSON body read", async () => {
    const server = await startStalledServer();
    // Freeze only timeout scheduling. Real HTTP headers may arrive whenever
    // the loaded host can deliver them; they are not the property under test.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signalBodyRead!: () => void;
    const bodyReadStarted = new Promise<void>((resolve) => {
      signalBodyRead = resolve;
    });
    let rejected = false;
    const request = fetchWithTimeout(
      `${server.url}/completions`,
      { method: "POST" },
      100,
      (response) => {
        const body = response.json();
        signalBodyRead();
        return body;
      },
    );
    void request.catch(() => {
      rejected = true;
    });
    const assertion = expect(request).rejects.toMatchObject({ name: "AbortError" });

    await bodyReadStarted;
    await vi.advanceTimersByTimeAsync(99);
    expect(rejected).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });

  it("classifies the body-read abort as a transient (retryable) failure", async () => {
    const server = await startStalledServer();

    let caught: unknown;
    try {
      await fetchWithTimeout(`${server.url}/completions`, { method: "POST" }, 100, (response) =>
        response.json(),
      );
    } catch (error) {
      caught = error;
    }

    expect(isTransientLlmFailure(caught)).toBe(true);
  });

  it("keeps the timeout armed during an error response text read", async () => {
    const server = await startStalledServer(500);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let signalBodyRead!: () => void;
    const bodyReadStarted = new Promise<void>((resolve) => {
      signalBodyRead = resolve;
    });
    const request = fetchWithTimeout(
      `${server.url}/completions`,
      { method: "POST" },
      100,
      (response) => {
        const body = response.text();
        signalBodyRead();
        return body;
      },
    );
    const assertion = expect(request).rejects.toMatchObject({ name: "AbortError" });

    await bodyReadStarted;
    await vi.advanceTimersByTimeAsync(100);
    await assertion;
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
    const adapter = new AnthropicLlmAdapter(
      {
        provider: "anthropic",
        apiKeyEnv: "TEST_LLM_KEY",
        model: "test-model",
        baseUrl: server.url,
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
