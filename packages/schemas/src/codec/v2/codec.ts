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
 * manifest object during codec-v2 ports (see `docs/agent-guides/image-port.md`).
 *
 * @experimental
 */
import type { Modality } from "../../modality.js";
import type { HarnessCtx } from "./ctx.js";
import type { ManifestRowKey } from "./manifest-rows.js";
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
 * `match` decides whether this route handles a given request; `BaseCodec.pickRoute`
 * selects the first matching route in declaration order.
 */
export interface Route<Req> {
  readonly id: string;
  readonly match: (req: Req) => boolean;
}

export interface ManifestRow {
  /**
   * Stable key under which this row is merged into the run manifest. The key
   * set is closed and single-sourced in `./manifest-rows.ts`
   * (`MANIFEST_ROW_KEYS`): a codec typo must not silently overwrite core
   * manifest fields, so extending the set is deliberate and code-reviewed.
   * New keys follow the codec-id prefix convention (`"image.*"`, `"audio.*"`).
   * The harness re-checks the key at runtime for untyped callers.
   */
  readonly key: ManifestRowKey;
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
