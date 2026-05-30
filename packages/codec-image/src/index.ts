/**
 * Public consumer surface for `@wittgenstein/codec-image` (Issue #365).
 *
 * What ships:
 *   - `imageCodec` (v1) / `imageV2Codec` (v2) — codec instances the harness
 *     and external consumers register / invoke.
 *   - Request / artifact / scene types needed to type call sites.
 *
 * Decoder delivery inspection:
 *   - decoder-family manifest parsing and preflight receipts are exported for
 *     read-only CLI surfaces such as `wittgenstein doctor`.
 *
 * What does NOT ship:
 *   - `./pipeline/*` — internal renderer pipeline that changes as the M1B
 *     decoder bridge lands. Pipeline internals are reachable from within
 *     this package's own modules; external consumers should not depend on
 *     them.
 *   - Internal schemas like `DecoderFamilySchema`, `ImageLatentCodesSchema`,
 *     etc. If a consumer needs these (e.g. for benchmark scaffolding), open
 *     an issue — the API surface for those moves with the schema
 *     discriminator RFC ([RFC-0007](../../../docs/rfcs/0007-image-seedcode-shape-discriminator.md)).
 */
export { imageCodec, imageV2Codec, ImageCodec } from "./codec.js";
export { ImageSceneSpecSchema, imageSchemaPreamble, parseImageSceneSpec } from "./schema.js";
export type { ImageSceneSpec } from "./schema.js";
// `ImageRequest` + its schema live in `@wittgenstein/schemas` (the
// modality-locked surface). Re-export from codec-image so consumers can
// import the codec's surface from one place.
export { ImageRequestSchema, type ImageRequest } from "@wittgenstein/schemas";
export type {
  ImageArtifact,
  ImageArtifactMetadata,
  ImageCodeReceipt,
  ImageCodePath,
  ImageAdapterOutcome,
  ImageSemanticSource,
} from "./types.js";
export {
  DecoderFamilyManifestSchema,
  validateDecoderManifestAuditReceipts,
} from "./decoders/manifest.js";
export type {
  DecoderFamilyManifest,
  DecoderManifestAuditReceiptValidation,
} from "./decoders/manifest.js";
export { preflightImageDecoder } from "./decoders/preflight.js";
export type {
  DecoderPreflightOptions,
  DecoderPreflightReason,
  DecoderPreflightReceipt,
  DecoderPreflightStatus,
} from "./decoders/preflight.js";
