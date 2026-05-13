import type { ImageSceneSpec } from "./schema.js";
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

export type ImageSemanticSource = "emitted" | "legacy-top-level" | "absent";

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
    readonly slot: "LFQ-family-decoder";
  };
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
