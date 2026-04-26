/**
 * Typed warning channel for v2 codecs.
 *
 * Brief H, finding F2: instead of `console.warn` or string-typed log lines, codecs surface
 * non-fatal advisories on `Art.metadata.warnings: CodecWarning[]`. Inspired by Vercel AI SDK's
 * `result.warnings` and ESLint's messageId pattern. See
 * `docs/research/briefs/H_codec_engineering_prior_art.md` (adopt practices 4 + 7).
 *
 * Codecs should pick a stable `code` from their own messageId dictionary and never break it;
 * `message` is human-prose for transcripts; `detail` is opt-in structured payload for tooling.
 *
 * @experimental
 */
export interface CodecWarning {
  /** Stable, codec-prefixed identifier, e.g. `"image/palette-truncated"`. */
  readonly code: string;
  /** Human-readable one-liner; safe to print on the CLI. */
  readonly message: string;
  /** Optional structured payload for downstream tooling. */
  readonly detail?: unknown;
  /** Which pipeline phase emitted the warning (for sidecar grouping). */
  readonly phase?: CodecPhase;
}

/**
 * Pipeline phases. The four-stage shape is locked in RFC-0001;
 * the constants double as values (for code) and a string-literal type (for narrowing).
 */
export const CodecPhase = {
  Expand: "expand",
  Adapt: "adapt",
  Decode: "decode",
  Package: "package",
} as const;

export type CodecPhase = (typeof CodecPhase)[keyof typeof CodecPhase];
