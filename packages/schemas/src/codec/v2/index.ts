/**
 * Codec v2 protocol — barrel export.
 *
 * @experimental — the M1A image port is the first concrete runtime user of this
 * surface. Some codec packages still expose v1 compatibility shims during the
 * M0→M5b migration, but this barrel is now live protocol code, not types-only
 * scaffolding.
 *
 * See `docs/rfcs/0001-codec-protocol-v2.md` (§Addendum 2026-04-26) and
 * `docs/research/briefs/H_codec_engineering_prior_art.md`.
 */
export type { BaseArtifact, BaseArtifactMetadata, Codec, ManifestRow, Route } from "./codec.js";
export { isManifestRowKey, MANIFEST_ROW_KEYS } from "./manifest-rows.js";
export type { ManifestRowKey } from "./manifest-rows.js";
export { BaseCodec, CodecRouteError } from "./base.js";
export type { HarnessCtx, ForkOverrides, Logger, Clock } from "./ctx.js";
export type { HybridIR, IR, LatentIR, TextIR } from "./ir.js";
export { isHybridIR, isLatentIR, isTextIR } from "./ir.js";
export type { RunSidecar, SidecarBreadcrumb } from "./sidecar.js";
export { createRunSidecar } from "./sidecar.js";
export type { CodecWarning } from "./warning.js";
export { CodecPhase } from "./warning.js";
export type { StandardSchemaV1 } from "./standard-schema.js";
// Decoder-lane receipt value schema (S7e promotion of the `image.decoder`
// row; scheduled by the 2026-10-16 closeout review CR3).
export {
  DecoderDeterminismClassSchema,
  DecoderRuntimeIdentitySchema,
  ImageDecoderReceiptSchema,
} from "./image-decoder.js";
export type {
  DecoderDeterminismClass,
  DecoderRuntimeIdentity,
  ImageDecoderReceipt,
} from "./image-decoder.js";
