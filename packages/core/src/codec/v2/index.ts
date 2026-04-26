/**
 * Codec v2 protocol — barrel export.
 *
 * @experimental — M0 lands types only. The harness, registry, and codec packages
 * still consume the v1 `WittgensteinCodec` from `@wittgenstein/schemas`. Importing
 * from this barrel does not change runtime behaviour; it surfaces the shapes that
 * the M1A image port will be the first concrete user of.
 *
 * See `docs/rfcs/0001-codec-protocol-v2.md` (§Addendum 2026-04-26) and
 * `docs/research/briefs/H_codec_engineering_prior_art.md`.
 */
export type { BaseArtifact, BaseArtifactMetadata, Codec, ManifestRow, Route } from "./codec.js";
export { BaseCodec } from "./base.js";
export type { HarnessCtx, ForkOverrides, Logger, Clock } from "./ctx.js";
export type { HybridIR, IR, LatentIR, TextIR } from "./ir.js";
export { isHybridIR, isLatentIR, isTextIR } from "./ir.js";
export type { RunSidecar, SidecarBreadcrumb } from "./sidecar.js";
export { createRunSidecar } from "./sidecar.js";
export type { CodecWarning } from "./warning.js";
export { CodecPhase } from "./warning.js";
export type { StandardSchemaV1 } from "./standard-schema.js";
