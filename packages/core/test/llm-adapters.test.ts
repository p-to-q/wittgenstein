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
