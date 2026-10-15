/**
 * Shared entry-layer image decoder bridge loader (S7b/S7c) — extracted from
 * `image.ts` so both the `image --decoder` opt-in lane and `replay` load the
 * same bridge with the same typed failures (S7d, Issue #384).
 *
 * The codec owns the decode contract; the CLI owns loading and turns loader
 * failures into structured CLI errors before any LLM spend.
 */
import {
  LLAMAGEN_DECODER_ID,
  loadLlamagenDecoderBridge,
  type ImageDecoderBridge,
} from "@wittgenstein/codec-image";

/**
 * Recorded `decoderId` → loader family (S7d replay). The manifest spine is
 * the authority for which decoder a run used; replay resolves that recorded
 * id to a loadable family instead of taking a user flag. An id this build
 * does not know is refused (`REPLAY_DECODER_UNSUPPORTED`) — never guessed.
 */
const DECODER_ID_FAMILIES: ReadonlyMap<string, string> = new Map([
  [LLAMAGEN_DECODER_ID, "llamagen"],
]);

export function decoderFamilyForDecoderId(decoderId: string): string | null {
  return DECODER_ID_FAMILIES.get(decoderId) ?? null;
}

/** Structured CLI error for the `--decoder` opt-in lane (mirrors install's shape). */
export interface ImageDecoderCliError {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly installHint?: string;
}

export interface ImageDecoderLoadOutcome {
  readonly bridge?: ImageDecoderBridge;
  readonly error?: ImageDecoderCliError;
}

/**
 * Load the decoder bridge the `--decoder` flag opts into (S7b/S7c entry
 * layer). The codec owns the decode contract; the CLI owns loading and turns
 * loader failures into structured CLI errors before any LLM spend.
 */
export async function loadImageDecoderBridgeForRun(options: {
  decoder?: string;
  allowResearchWeights?: boolean;
  cacheDir?: string;
  /**
   * Resolve weights from the local cache only — no URL, no env, no fetcher
   * (S7d replay must never fetch; a fetched "pass" would be meaningless).
   */
  cacheOnly?: boolean;
}): Promise<ImageDecoderLoadOutcome> {
  if (!options.decoder) {
    return {};
  }

  if (options.decoder !== "llamagen") {
    return {
      error: {
        code: "INVALID_IMAGE_DECODER",
        message: `Unknown decoder family "${options.decoder}"; only "llamagen" is shipped.`,
      },
    };
  }

  try {
    const bridge = await loadLlamagenDecoderBridge({
      ...(options.allowResearchWeights ? { allowResearchWeights: options.allowResearchWeights } : {}),
      ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
      ...(options.cacheOnly ? { cacheOnly: true } : {}),
    });
    return { bridge };
  } catch (error) {
    const shaped = error as Error & { code?: string; details?: Record<string, unknown> };
    const installHint =
      typeof shaped.details?.["installHint"] === "string" ? shaped.details["installHint"] : undefined;
    return {
      error: {
        code: typeof shaped.code === "string" ? shaped.code : "IMAGE_DECODER_LOAD_FAILED",
        message: shaped.message ?? "Failed to load the image decoder bridge.",
        ...(shaped.details !== undefined ? { details: shaped.details } : {}),
        ...(installHint !== undefined ? { installHint } : {}),
      },
    };
  }
}

/** Print a structured `--decoder` lane error as JSON on stderr. */
export function printImageDecoderError(error: ImageDecoderCliError): void {
  console.error(
    JSON.stringify(
      {
        ok: false,
        ...error,
      },
      null,
      2,
    ),
  );
}
