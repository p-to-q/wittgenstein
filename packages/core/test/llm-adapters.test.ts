import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { AnthropicLlmAdapter } from "../src/llm/anthropic.js";
import { OpenAICompatibleLlmAdapter } from "../src/llm/openai-compatible.js";
import { WittgensteinError } from "../src/runtime/errors.js";

// Stub the global fetch so we never hit a real LLM vendor in tests.
// Each test injects a specific response payload.
const originalFetch = globalThis.fetch;

type FetchStub = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function installFetchStub(stub: FetchStub): void {
  globalThis.fetch = stub as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  process.env.TEST_LLM_KEY = "fake-key";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.TEST_LLM_KEY;
});

const baseRequest = {
  model: "test-model",
  messages: [{ role: "user" as const, content: "hi" }],
  temperature: 0,
  maxOutputTokens: 100,
  seed: 1,
};

describe("AnthropicLlmAdapter zod boundary", () => {
  const adapter = new AnthropicLlmAdapter({
    provider: "anthropic",
    apiKeyEnv: "TEST_LLM_KEY",
    model: "test-model",
  });

  it("accepts a well-formed response", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          content: [{ type: "text", text: '{"ok":true}' }],
          usage: { input_tokens: 7, output_tokens: 5 },
        }),
      ),
    );
    const result = await adapter.generate(baseRequest);
    expect(result.text).toBe('{"ok":true}');
    expect(result.tokens).toEqual({ input: 7, output: 5 });
  });

  it("throws LLM_PROTOCOL_ERROR on missing usage", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          content: [{ type: "text", text: "{}" }],
        }),
      ),
    );
    await expect(adapter.generate(baseRequest)).rejects.toMatchObject({
      code: "LLM_PROTOCOL_ERROR",
    });
  });

  it("throws LLM_PROTOCOL_ERROR on missing content array", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      ),
    );
    await expect(adapter.generate(baseRequest)).rejects.toMatchObject({
      code: "LLM_PROTOCOL_ERROR",
    });
  });

  it("throws LLM_PROTOCOL_ERROR on missing text block content", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          content: [{ type: "tool_use" }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      ),
    );
    await expect(adapter.generate(baseRequest)).rejects.toMatchObject({
      code: "LLM_PROTOCOL_ERROR",
    });
  });

  it("throws LLM_PROTOCOL_ERROR on completely malformed JSON", async () => {
    installFetchStub(() => Promise.resolve(jsonResponse({ random: "garbage" })));
    await expect(adapter.generate(baseRequest)).rejects.toBeInstanceOf(WittgensteinError);
  });
});

describe("OpenAICompatibleLlmAdapter zod boundary", () => {
  const adapter = new OpenAICompatibleLlmAdapter({
    provider: "openai-compatible",
    apiKeyEnv: "TEST_LLM_KEY",
    model: "test-model",
  });

  it("accepts a well-formed response", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          choices: [{ message: { role: "assistant", content: '{"ok":true}' } }],
          usage: { prompt_tokens: 7, completion_tokens: 5 },
        }),
      ),
    );
    const result = await adapter.generate(baseRequest);
    expect(result.text).toBe('{"ok":true}');
    expect(result.tokens).toEqual({ input: 7, output: 5 });
  });

  it("throws LLM_PROTOCOL_ERROR on missing message.content", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          choices: [{ message: { role: "assistant" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      ),
    );
    await expect(adapter.generate(baseRequest)).rejects.toMatchObject({
      code: "LLM_PROTOCOL_ERROR",
    });
  });

  it("throws LLM_PROTOCOL_ERROR on empty choices array", async () => {
    installFetchStub(() =>
      Promise.resolve(
        jsonResponse({
          choices: [],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        }),
      ),
    );
    await expect(adapter.generate(baseRequest)).rejects.toMatchObject({
      code: "LLM_PROTOCOL_ERROR",
    });
  });

  it("throws LLM_PROTOCOL_ERROR on completely malformed JSON", async () => {
    installFetchStub(() => Promise.resolve(jsonResponse({ random: "garbage" })));
    await expect(adapter.generate(baseRequest)).rejects.toBeInstanceOf(WittgensteinError);
  });
});

describe("OpenAICompatibleLlmAdapter retry + timeout boundary", () => {
  const fastRetry = { maxAttempts: 3, backoffMs: 0, backoffStrategy: "linear" as const };
  const adapter = new OpenAICompatibleLlmAdapter(
    {
      provider: "openai-compatible",
      apiKeyEnv: "TEST_LLM_KEY",
      model: "test-model",
      timeoutMs: 5_000,
    },
    fastRetry,
  );

  it("retries transient 429s and returns the eventual success", async () => {
    let calls = 0;
    installFetchStub(async () => {
      calls += 1;
      if (calls < 3) {
        return jsonResponse({ error: "rate limited" }, 429);
      }
      return jsonResponse({
        choices: [{ message: { role: "assistant", content: '{"ok":true}' } }],
        usage: { prompt_tokens: 7, completion_tokens: 5 },
      });
    });
    const result = await adapter.generate(baseRequest);
    expect(result.text).toBe('{"ok":true}');
    expect(calls).toBe(3);
  });

  it("does not retry 400 validation failures", async () => {
    let calls = 0;
    installFetchStub(async () => {
      calls += 1;
      return jsonResponse({ error: "bad request" }, 400);
    });
    await expect(adapter.generate(baseRequest)).rejects.toMatchObject({ name: "LlmHttpStatusError", status: 400 });
    expect(calls).toBe(1);
  });

  it("retries network failures (fetch rejects with TypeError)", async () => {
    let calls = 0;
    installFetchStub(async () => {
      calls += 1;
      if (calls < 2) {
        throw new TypeError("fetch failed");
      }
      return jsonResponse({
        choices: [{ message: { role: "assistant", content: '{"ok":true}' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      });
    });
    const result = await adapter.generate(baseRequest);
    expect(result.text).toBe('{"ok":true}');
    expect(calls).toBe(2);
  });

  it("honors Retry-After on a 503 and retries after the advertised delay", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      installFetchStub(async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ error: "overloaded" }), {
            status: 503,
            headers: { "content-type": "application/json", "retry-after": "1" },
          });
        }
        return jsonResponse({
          choices: [{ message: { role: "assistant", content: '{"ok":true}' } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        });
      });

      const promise = adapter.generate(baseRequest);
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await promise;
      expect(result.text).toBe('{"ok":true}');
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out a hung request and exhausts retries with AbortError", async () => {
    let calls = 0;
    installFetchStub(async (_input, init) => {
      calls += 1;
      const signal = init?.signal as AbortSignal | undefined;
      await new Promise<void>((_, reject) => {
        signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      });
      throw new Error("unreachable");
    });

    const shortTimeoutAdapter = new OpenAICompatibleLlmAdapter(
      {
        provider: "openai-compatible",
        apiKeyEnv: "TEST_LLM_KEY",
        model: "test-model",
        timeoutMs: 50,
      },
      fastRetry,
    );

    await expect(shortTimeoutAdapter.generate(baseRequest)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(calls).toBe(3);
  });
});
