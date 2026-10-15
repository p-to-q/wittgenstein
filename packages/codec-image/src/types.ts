import type { ImageSceneSpec } from "./schema.js";
import type { DecoderDeterminismClass } from "./decoders/types.js";
import type { CostUsdReason, codecV2 } from "@wittgenstein/schemas";

export type ImageCodePath =
  | "provider-latents"
  | "coarse-vq"
  | "visual-seed-code"
  | "semantic-fallback";

/**
 * Which adapter tier actually fired during a render. Distinct from
 * `ImageCodePath`, which records the *intent* declared on the spec — this
 * records the *outcome* observed by `adaptSceneToLatents`, so the manifest
 * can show which tier won the fall-through (e.g. spec carried
 * `providerLatents` but it failed validation, so the actual fired tier was
 * `coarse-vq` or further down).
 *
 * Adapter tiers, in priority order:
 *   - `provider-latents` — spec.providerLatents validated and was used directly
 *   - `coarse-vq`        — spec.coarseVq validated and was upsampled
 *   - `visual-seed-code` — spec.seedCode validated and was expanded
 *   - `learned-mlp`      — env-resolved MLP adapter ran (#243 reframing)
 *   - `placeholder`      — no hint validated and no learned adapter resolved
 */
export type ImageAdapterOutcome =
  | "provider-latents"
  | "coarse-vq"
  | "visual-seed-code"
  | "learned-mlp"
  | "placeholder";

export type ImageAdapterFallbackReason =
  | "provider-latents-invalid"
  | "coarse-vq-invalid"
  | "seed-code-invalid"
  | "no-decoder-facing-code"
  | "learned-mlp-unavailable";

export interface ImageAdapterReceipt {
  readonly outcome: ImageAdapterOutcome;
  readonly attemptedPaths: readonly ImageCodePath[];
  readonly fallbackReasons: readonly ImageAdapterFallbackReason[];
  readonly seedExpanderId: string | null;
  /**
   * SHA-256 over the canonical decode-input latents this adapter produced
   * (schema version, family, codebook, codebook version, token grid, tokens)
   * — the digest of exactly what `decodeLatentsToRaster` receives.
   *
   * Decode-input identity for the replay lane (S7d, #384): for
   * `structural-parity` decoders, artifact bytes cannot be required to match,
   * so replay proves baseline and replayed runs fed the decoder the *same
   * input* rather than merely the same dimensions. Computed over the final
   * (post-annotation) latents with a fixed key order so the digest is stable
   * across process and platform.
   */
  readonly latentsSha256: string;
}

export type ImageSemanticSource = "emitted" | "legacy-top-level" | "absent";

/**
 * Decoder-lane receipt for a raster produced by an injected decoder
 * bridge (S7b wiring). Surfaced as the `image.decoder` manifest row;
 * absence of the receipt means the procedural placeholder lane
 * produced the raster.
 */
export interface ImageDecoderReceipt {
  /** Lane marker: which decoder path produced the raster. */
  readonly lane: "injected-bridge";
  /** Stable decoder identifier (`ImageDecoderCapabilities.decoderId`). */
  readonly decoderId: string;
  /** Weights/tokenizer/adapter hash stamped by the bridge (Issue #384 replay). */
  readonly decoderHash: string;
  /** Determinism contract the bridge advertises. */
  readonly determinismClass: DecoderDeterminismClass;
}

export interface ImageCodeReceipt {
  readonly mode: NonNullable<ImageSceneSpec["mode"]>;
  readonly path: ImageCodePath;
  readonly hasSemantic: boolean;
  readonly hasEmittedSemantic: boolean;
  readonly hasEffectiveSemantic: boolean;
  readonly semanticSource: ImageSemanticSource;
  readonly hasSeedCode: boolean;
  readonly hasCoarseVq: boolean;
  readonly hasProviderLatents: boolean;
  readonly seedFamily: string | null;
  readonly seedMode: string | null;
  readonly seedLength: number | null;
  readonly coarseVqGrid: readonly [number, number] | null;
  readonly providerLatentGrid: readonly [number, number] | null;
}

export interface ImageArtifactMetadata extends codecV2.BaseArtifactMetadata {
  readonly codec: "image";
  readonly route: "raster";
  warnings: codecV2.CodecWarning[];
  readonly llmTokens: { input: number; output: number };
  readonly costUsd: number | null;
  readonly costUsdReason?: CostUsdReason;
  readonly durationMs: number;
  readonly seed: number | null;
  readonly promptExpanded: string | null;
  readonly llmOutputRaw: string | null;
  readonly llmOutputParsed: ImageSceneSpec | null;
  readonly imageCode: ImageCodeReceipt;
  /**
   * Which adapter tier actually fired this render (outcome, not intent).
   * Mirrors what sensor and audio already record via
   * `RenderResult.metadata.renderPath`.
   */
  readonly adapterOutcome: ImageAdapterOutcome;
  readonly adapterReceipt: ImageAdapterReceipt;
  readonly quality: {
    readonly structural: {
      readonly schemaValidated: boolean;
      readonly route: "raster";
      readonly imageCode: ImageCodeReceipt;
      readonly paletteCount: number;
      readonly palette: string[];
    };
    readonly partial: {
      readonly reason: "adapter-stub";
    };
  };
  readonly adapterHash: string;
  readonly decoderHash: {
    readonly value: string;
    readonly frozen: true;
    /** Which decoder filled the frozen-decoder slot. */
    readonly slot: string;
  };
  /** Present only when an injected decoder bridge produced the raster (S7b). */
  readonly decoderReceipt?: ImageDecoderReceipt;
  artifactSha256: string | null;
}

export interface ImageArtifact extends codecV2.BaseArtifact {
  readonly outPath: string;
  bytes?: Uint8Array;
  readonly mime: "image/png";
  readonly width: number;
  readonly height: number;
  readonly metadata: ImageArtifactMetadata;
}
