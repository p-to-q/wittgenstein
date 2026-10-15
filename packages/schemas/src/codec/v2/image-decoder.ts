/**
 * `image.decoder` row value — the decoder-lane receipt schema.
 *
 * The 2026-10-16 closeout review (CR1/CR3) declared every closed
 * `MANIFEST_ROW_KEYS` key in `RunManifestSchema` with permissive
 * (`z.unknown()`) values and scheduled the first value promotion for
 * `image.decoder` with S7e (runtime identity). This module is that
 * promotion's single source: the same key, the same serialization location,
 * now a typed contract.
 *
 * Producers (the codec-image bridge lane) emit exactly this shape.
 * Consumers (CLI replay) read the typed value instead of re-validating raw
 * JSON by hand; malformed rows are refused at the manifest-schema boundary.
 *
 * Forward compatibility: plain `z.object` — unknown keys strip, known
 * malformed fields refuse. Adding a receipt field means extending this
 * schema; older readers strip it instead of refusing the whole manifest.
 */
import { z } from "zod";

/**
 * Determinism contract of a decoder bridge (#473 two-axis vocabulary).
 * Single-sourced here so capabilities, receipts, and the family manifest
 * share one enum.
 */
export const DecoderDeterminismClassSchema = z.enum(["byte-parity", "structural-parity"]);
export type DecoderDeterminismClass = z.infer<typeof DecoderDeterminismClassSchema>;

/**
 * Runtime identity recorded on bridge receipts (S7e).
 *
 * - `name` — the Node inference runtime the bridge loads.
 * - `version` — the resolved native binding version, read from the runtime
 *   itself (`env.versions.node`; equals the installed `onnxruntime-node`
 *   npm version — probe-verified for 1.18.0 (peer floor) and 1.30.0).
 * - `executionProviders` — the requested execution-provider list from the
 *   `InferenceSession` session options (the LlamaGen bridge pins `["cpu"]`).
 *   ONNX Runtime exposes no per-node "which provider executed" introspection
 *   (`session.executionProviders` is `undefined` as of onnxruntime-node
 *   1.30.0), so receipts record the *configured* list as the scoped
 *   determinism claim — never an observed one.
 */
export const DecoderRuntimeIdentitySchema = z.object({
  name: z.literal("onnxruntime-node"),
  version: z.string().min(1),
  executionProviders: z.array(z.string().min(1)).min(1),
});
export type DecoderRuntimeIdentity = z.infer<typeof DecoderRuntimeIdentitySchema>;

/**
 * Decoder-lane receipt for a raster produced by an injected decoder bridge
 * (S7b wiring); absence of the `image.decoder` row means the procedural
 * placeholder lane produced the raster.
 *
 * `runtime` is optional: receipts written before S7e lack it, and a bridge
 * whose runtime cannot report a version omits it and surfaces a decode
 * warning instead of a silent gap.
 */
export const ImageDecoderReceiptSchema = z.object({
  lane: z.literal("injected-bridge"),
  decoderId: z.string().min(1),
  decoderHash: z.string().min(1),
  determinismClass: DecoderDeterminismClassSchema,
  runtime: DecoderRuntimeIdentitySchema.optional(),
});
export type ImageDecoderReceipt = z.infer<typeof ImageDecoderReceiptSchema>;
