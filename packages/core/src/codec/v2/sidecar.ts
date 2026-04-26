/**
 * Run-scoped sidecar threaded through the four pipeline phases.
 *
 * Inspired by unified's VFile (per Brief H §unified): a single mutable companion that
 * accumulates warnings and breadcrumbs without forcing every phase to return a tuple.
 * The codec produces an `Art`; the sidecar is the harness's record of what happened on
 * the way there.
 *
 * At M0 this is types-only; the harness does not yet construct sidecars. The `BaseCodec`
 * contract in `base.ts` documents how `produce()` will fold sidecar warnings into
 * `Art.metadata.warnings` so callers see one channel.
 *
 * @experimental
 */
import type { CodecPhase, CodecWarning } from "./warning.js";

export interface RunSidecar {
  /** All advisories emitted during this run, in order. */
  readonly warnings: CodecWarning[];
  /** Append-only narrative of phase transitions; useful for transcripts. */
  readonly breadcrumbs: SidecarBreadcrumb[];
}

export interface SidecarBreadcrumb {
  readonly phase: CodecPhase;
  /** ISO-8601 timestamp; the harness clock owns the source of truth. */
  readonly at: string;
  readonly note?: string;
  readonly detail?: unknown;
}

export const createRunSidecar = (): RunSidecar => ({
  warnings: [],
  breadcrumbs: [],
});
