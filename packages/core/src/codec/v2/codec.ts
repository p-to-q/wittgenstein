/**
 * Codec v2 protocol surface.
 *
 * Locked shape (RFC-0001 §Addendum 2026-04-26, Brief H finding F1):
 *
 *   interface Codec<Req, Art> {
 *     id: string;
 *     modality: Modality;
 *     routes: Route<Req>[];
 *     schema: StandardSchemaV1<unknown, Req>;
 *     produce(req: Req, ctx: HarnessCtx): Promise<Art>;
 *     manifestRows(art: Art): ManifestRow[];
 *   }
 *
 * Compared with v1 (`WittgensteinCodec.render(parsed, ctx) → RenderResult`):
 *  - Codec owns the LLM call (no more harness-side branching on modality).
 *  - Strategy lives on the codec (via `routes`), not on the request.
 *  - Schema is vendor-neutral via Standard Schema, not zod-specific.
 *  - Manifest contributions are codec-authored rows, not harness post-hoc overrides.
 *
 * `ManifestRow` is intentionally narrow: the v0.2 `RunManifest` is one big object per
 * run, not an array. Codecs return rows; the harness folds them into the existing
 * manifest object during the eventual port (see `docs/agent-guides/image-port.md`).
 *
 * @experimental
 */
import type { Modality } from "@wittgenstein/schemas";
import type { HarnessCtx } from "./ctx.js";
import type { CodecWarning } from "./warning.js";
import type { StandardSchemaV1 } from "./standard-schema.js";

/**
 * Base shape for any artifact produced by a v2 codec. Concrete codecs extend this
 * with their own bytes / paths / format-specific fields. The `metadata.warnings`
 * channel is mandatory (Brief H finding F2).
 */
export interface BaseArtifactMetadata {
  readonly codec: string;
  readonly route?: string;
  readonly warnings: CodecWarning[];
}

export interface BaseArtifact {
  readonly metadata: BaseArtifactMetadata;
}

/**
 * A single dispatchable strategy within a codec (e.g. "raster" for `codec-image`,
 * or "speech" / "soundscape" / "music" once `codec-audio` collapses its routes).
 * `match` decides whether this route handles a given request; the harness picks
 * the first matching route, in declaration order.
 */
export interface Route<Req> {
  readonly id: string;
  readonly match: (req: Req) => boolean;
}

export interface ManifestRow {
  /**
   * Stable key under which this row will be merged into the run manifest, e.g.
   * `"codec"`, `"llm"`, `"artifact"`. The harness reserves a small set of well-known
   * keys; codec-specific keys must use the codec id as a prefix (`"image.palette"`).
   */
  readonly key: string;
  readonly value: unknown;
}

export interface Codec<Req, Art extends BaseArtifact> {
  readonly id: string;
  readonly modality: Modality;
  readonly routes: ReadonlyArray<Route<Req>>;
  readonly schema: StandardSchemaV1<unknown, Req>;
  produce(req: Req, ctx: HarnessCtx): Promise<Art>;
  manifestRows(art: Art): ReadonlyArray<ManifestRow>;
}
