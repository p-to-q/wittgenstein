import type { SvgEngineConfig } from "@wittgenstein/schemas";
import type { LlmGenerationResult } from "../llm/adapter.js";
import { ValidationError } from "./errors.js";

export async function generateSvgFromEngine(
  promptExpanded: string,
  seed: number | null,
  svg: SvgEngineConfig,
): Promise<LlmGenerationResult> {
  const url = new URL(svg.requestPath, svg.inferenceUrl).href;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), svg.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ prompt: promptExpanded, seed }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new ValidationError(`SVG engine HTTP ${res.status}`, {
        details: { url, body: body.slice(0, 2000) },
      });
    }

    const payload = (await res.json()) as { text?: string };
    if (typeof payload.text !== "string" || payload.text.length === 0) {
      throw new ValidationError("SVG engine response missing string field `text` (JSON payload for codec.parse).", {
        details: { url },
      });
    }

    return {
      text: payload.text,
      tokens: { input: 0, output: 0 },
      costUsd: 0,
      costUsdReason: "computed",
      raw: { svgEngine: true, url },
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("SVG engine request failed.", {
      cause: error,
      details: { url },
    });
  } finally {
    clearTimeout(timer);
  }
}
