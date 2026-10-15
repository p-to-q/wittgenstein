import { createInterface } from "node:readline/promises";
import { stdin as input, stderr as promptOutput } from "node:process";

/**
 * Obtain the Minimax API key for `asciipng --source minimax`.
 *
 * Interactive terminals get a prompt (written to stderr so stdout stays a
 * single JSON document). Non-interactive stdin is never prompted: the run
 * proceeds keyless and the codec refuses with its structured missing-key
 * `VALIDATION_ERROR` — the same lane every other missing-LLM-key failure
 * uses. Answering the prompt empty or closing it (Ctrl+D) behaves the same
 * way instead of leaving the question promise pending (2026-10-16 fix:
 * closed stdin used to drain the event loop and exit 0 with no output).
 */
export async function ensureMinimaxApiKeyInteractive(): Promise<void> {
  if (process.env.WITTGENSTEIN_MINIMAX_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim()) {
    return;
  }
  if (!input.isTTY) {
    return;
  }

  const rl = createInterface({ input, output: promptOutput });
  try {
    const answer = await questionOrClose(rl, "Minimax API key (text-only chat model): ");
    const key = answer.trim();
    if (key) {
      process.env.WITTGENSTEIN_MINIMAX_API_KEY = key;
    }
  } finally {
    rl.close();
  }
}

/**
 * Ask `query` and resolve with the answer; resolves with `""` when the
 * interface closes first (Ctrl+D / closed stdin) or the question rejects,
 * so callers never hang on a pending `question` promise. Exported for tests.
 */
export function questionOrClose(
  rl: ReturnType<typeof createInterface>,
  query: string,
): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (value: string) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    rl.once("close", () => settle(""));
    void rl.question(query).then(settle, () => settle(""));
  });
}
