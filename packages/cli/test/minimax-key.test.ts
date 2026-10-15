import { PassThrough } from "node:stream";
import { createInterface } from "node:readline/promises";
import { describe, expect, it } from "vitest";
import { ensureMinimaxApiKeyInteractive, questionOrClose } from "../src/commands/minimax-key.js";

const KEY_ENVS = ["WITTGENSTEIN_MINIMAX_API_KEY", "MINIMAX_API_KEY"] as const;

async function withoutMinimaxKeys<T>(run: () => Promise<T>): Promise<T> {
  const saved = KEY_ENVS.map((name) => [name, process.env[name]] as const);
  for (const name of KEY_ENVS) {
    delete process.env[name];
  }
  try {
    return await run();
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

describe("ensureMinimaxApiKeyInteractive", () => {
  it("returns without prompting when a key is already in the environment", async () => {
    await withoutMinimaxKeys(async () => {
      process.env.WITTGENSTEIN_MINIMAX_API_KEY = "env-key";

      await expect(ensureMinimaxApiKeyInteractive()).resolves.toBeUndefined();
      expect(process.env.WITTGENSTEIN_MINIMAX_API_KEY).toBe("env-key");
    });
  });

  it("skips the prompt on non-interactive stdin instead of hanging (2026-10-16 fix)", async () => {
    await withoutMinimaxKeys(async () => {
      const originalIsTty = process.stdin.isTTY;
      Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });
      try {
        await expect(ensureMinimaxApiKeyInteractive()).resolves.toBeUndefined();
        expect(process.env.WITTGENSTEIN_MINIMAX_API_KEY).toBeUndefined();
      } finally {
        Object.defineProperty(process.stdin, "isTTY", {
          value: originalIsTty,
          configurable: true,
        });
      }
    });
  });
});

describe("questionOrClose", () => {
  it("resolves with the answer when the question is answered", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const rl = createInterface({ input, output });
    try {
      const pending = questionOrClose(rl, "key: ");
      input.write("secret-key\n");

      await expect(pending).resolves.toBe("secret-key");
    } finally {
      rl.close();
    }
  });

  it("resolves empty when the interface closes before an answer", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const rl = createInterface({ input, output });

    const pending = questionOrClose(rl, "key: ");
    rl.close();

    await expect(pending).resolves.toBe("");
  });
});
