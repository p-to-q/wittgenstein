/**
 * HarnessCtx — the run-scoped capability bag handed to `Codec.produce()`.
 *
 * Inspired by LangChain's Runnable invocation context (Brief H): instead of opening
 * codec.ts to plumb a new field, the harness widens `HarnessCtx`. `fork()` spawns a
 * child context with a derived `runId` and the current run as `parentRunId`, so nested
 * pipelines stay traceable in the manifest spine.
 *
 * Logger / Clock are the two cross-cutting capabilities every codec needs. Anything
 * else (LLM client, filesystem, cost ledger) lives on `services` so we can extend
 * without breaking the type.
 *
 * Compatibility note: this v2 `HarnessCtx` is the eventual replacement for the v1
 * `RenderCtx` exported from `@wittgenstein/schemas`. v1 stays live until the M1A port
 * lands; the two are intentionally distinct types so a partial migration cannot
 * silently typecheck.
 *
 * @experimental
 */
import type { RunSidecar } from "./sidecar.js";

export interface Logger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

export interface Clock {
  /** Wall-clock now in ms since epoch. */
  now: () => number;
  /** ISO-8601 string for the current instant; matches `RunManifest.startedAt`. */
  iso: () => string;
}

export interface HarnessCtx {
  readonly runId: string;
  readonly parentRunId: string | null;
  readonly runDir: string;
  readonly seed: number | null;
  readonly outPath: string;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly sidecar: RunSidecar;
  /** Forward-compatible extension slot; v0.2 ships it empty. */
  readonly services?: Readonly<Record<string, unknown>>;
  /** Spawn a child context with a fresh `runId` and `parentRunId === this.runId`. */
  fork: (childRunId: string, overrides?: ForkOverrides) => HarnessCtx;
}

export interface ForkOverrides {
  runDir?: string;
  outPath?: string;
  seed?: number | null;
  services?: Readonly<Record<string, unknown>>;
}
