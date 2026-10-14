/**
 * Weight-fetch orchestration for `wittgenstein install image` (Issue #403).
 *
 * Thin adapter over the codec-image installation surface (#402): the same
 * `resolveDecoderWeights` + `buildHuggingFaceAssetFetcher` the bridge loader
 * uses at runtime, so the installer cannot diverge from the loader in cache
 * layout, sha256 verification, atomic promotion, or error codes.
 *
 * No fetch happens unless the caller passes an explicit base URL — the
 * shipped derivative ONNX has no canonical SHA-pinnable URL yet (#402/#435),
 * so the default posture stays cache-only and this module reports exactly
 * what it needs when a fetch is requested.
 */
import {
  buildHuggingFaceAssetFetcher,
  resolveDecoderWeights,
  type DecoderWeightsManifest,
  type ResolvedDecoderWeights,
} from "@wittgenstein/codec-image";

export type ImageTierFetchOutcome =
  | { readonly ok: true; readonly resolved: ResolvedDecoderWeights }
  | {
      readonly ok: false;
      readonly code: string;
      readonly message: string;
      readonly details: Record<string, unknown>;
    };

export interface FetchImageTierWeightsOptions {
  readonly manifest: DecoderWeightsManifest;
  readonly baseUrl: string;
  readonly cacheDir?: string;
  readonly allowResearchWeights?: boolean;
}

export async function fetchImageTierWeights(
  options: FetchImageTierWeightsOptions,
): Promise<ImageTierFetchOutcome> {
  const base = options.baseUrl.trim();
  if (!/^https?:\/\//i.test(base)) {
    return {
      ok: false,
      code: "INVALID_WEIGHTS_BASE_URL",
      message: `Weights base URL must be an http(s) URL (HuggingFace-style base); received: ${JSON.stringify(options.baseUrl)}.`,
      details: { baseUrl: options.baseUrl },
    };
  }

  const fetcher = buildHuggingFaceAssetFetcher(base);
  if (!fetcher) {
    return {
      ok: false,
      code: "INVALID_WEIGHTS_BASE_URL",
      message: "Weights base URL resolved to no fetcher (empty value).",
      details: { baseUrl: options.baseUrl },
    };
  }

  try {
    const resolved = await resolveDecoderWeights({
      manifest: options.manifest,
      fetcher,
      ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
      ...(options.allowResearchWeights !== undefined
        ? { allowResearchWeights: options.allowResearchWeights }
        : {}),
    });
    return { ok: true, resolved };
  } catch (error) {
    const shaped = error as Error & { code?: string; details?: Record<string, unknown> };
    return {
      ok: false,
      code: shaped.code ?? "WEIGHTS_FETCH_FAILED",
      message: shaped.message,
      details: shaped.details ?? {},
    };
  }
}
