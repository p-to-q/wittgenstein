/**
 * Closed set of v2 manifest row keys — the row channel's single source of
 * truth (2026-10-16 closeout review, decision CR2;
 * `docs/research/2026-10-16-m1b-delivery-closeout-review.md`).
 *
 * v2 codecs author `ManifestRow`s; the harness folds them into the run
 * manifest (`packages/core/src/runtime/harness.ts`). The 2026-10-16
 * robustness slice closed the fold's accepted key set so a codec typo cannot
 * silently overwrite core manifest fields; this module moves that set to the
 * protocol package so three consumers share one definition:
 *
 *   1. the fold guard in core (`foldManifestRows`),
 *   2. the `ManifestRow.key` type (typed producers are checked at compile
 *      time; the runtime guard covers untyped callers),
 *   3. `RunManifestSchema` (`../../manifest.ts`), which declares every key so
 *      a canonical parse preserves the persisted rows instead of stripping
 *      them (CR1).
 *
 * Extending the set is deliberate and code-reviewed. New keys follow the
 * codec-id prefix convention (`image.*`, `audio.*`). If a row outgrows the
 * channel, promote it in place — same serialization location, typed value
 * schema — never duplicate it into a second location.
 */
export const MANIFEST_ROW_KEYS = [
  "route",
  "renderPath",
  "audioRender",
  "audioPlan",
  "image.code",
  "image.adapter",
  // S7b: decoder lane + bridge identity, emitted only when an injected
  // decoder bridge produced the raster (placeholder runs omit the row).
  "image.decoder",
  "quality.structural",
  "quality.partial",
  "metadata.warnings",
  "L4.adapterHash",
  "L5.decoderHash",
  "artifact.sha256",
] as const;

export type ManifestRowKey = (typeof MANIFEST_ROW_KEYS)[number];

const MANIFEST_ROW_KEY_SET: ReadonlySet<string> = new Set(MANIFEST_ROW_KEYS);

/** Runtime narrow for untyped callers (JS codecs, raw JSON, tests). */
export function isManifestRowKey(key: string): key is ManifestRowKey {
  return MANIFEST_ROW_KEY_SET.has(key);
}
