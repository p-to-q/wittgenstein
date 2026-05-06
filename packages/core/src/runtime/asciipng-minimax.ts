import { minimaxTextToAsciiIr } from "@wittgenstein/codec-asciipng";
import type { LlmConfig, WittgensteinRequest } from "@wittgenstein/schemas";
import type { LlmGenerationResult } from "../llm/adapter.js";
import { OpenAICompatibleLlmAdapter } from "../llm/openai-compatible.js";
import { ValidationError } from "./errors.js";

const MINIMAX_ASCII_SYSTEM = [
  "You only emit plain text. No JSON, no markdown code fences, no explanations.",
  "Output exactly a block ASCII / line-printer picture.",
  "Rules:",
  "- Each line must be at most WIDTH characters (caller states WIDTH in the user message).",
  "- Emit exactly HEIGHT lines (caller states HEIGHT).",
  "- Use only spaces and printable ASCII symbols like .:`+*#%@ for shading.",
  "- Do not prefix lines with numbers or bullets.",
].join("\n");

export async function generateAsciipngFromMinimax(
  request: Extract<WittgensteinRequest, { modality: "asciipng" }>,
  promptExpanded: string,
  seed: number | null,
  llmFallback: LlmConfig,
): Promise<LlmGenerationResult> {
  if (request.source !== "minimax") {
    throw new ValidationError("generateAsciipngFromMinimax requires source=minimax.");
  }

  const apiKey =
    process.env.WITTGENSTEIN_MINIMAX_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim();
  if (!apiKey) {
    throw new ValidationError(
      "Missing Minimax API key. Set WITTGENSTEIN_MINIMAX_API_KEY or MINIMAX_API_KEY, or paste when the CLI prompts.",
    );
  }
  if (!process.env.WITTGENSTEIN_MINIMAX_API_KEY) {
    process.env.WITTGENSTEIN_MINIMAX_API_KEY = apiKey;
  }

  const model =
    request.minimaxModel?.trim() ||
    process.env.WITTGENSTEIN_MINIMAX_MODEL?.trim() ||
    "abab6.5s-chat-h";

  const adapter = new OpenAICompatibleLlmAdapter({
    ...llmFallback,
    provider: "minimax",
    model,
    apiKeyEnv: "WITTGENSTEIN_MINIMAX_API_KEY",
  });

  const width = request.columns;
  const height = request.rows;
  const userBlock = [
    `WIDTH=${width}`,
    `HEIGHT=${height}`,
    "",
    "User request (interpret visually as ASCII art):",
    promptExpanded,
  ].join("\n");

  const gen = await adapter.generate({
    model,
    maxOutputTokens: Math.min(llmFallback.maxOutputTokens, 2048),
    temperature: 0.35,
    seed,
    responseFormat: "text",
    messages: [
      { role: "system", content: MINIMAX_ASCII_SYSTEM },
      { role: "user", content: userBlock },
    ],
  });

  const ir = minimaxTextToAsciiIr(gen.text, request.columns, request.rows, request.cell);

  return {
    text: JSON.stringify(ir),
    tokens: gen.tokens,
    costUsd: gen.costUsd,
    costUsdReason: gen.costUsdReason,
    raw: { minimax: true, minimaxRawChars: gen.text.length },
  };
}
