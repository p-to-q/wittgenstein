/**
 * BaseCodec — the abstract scaffold every v2 codec extends.
 *
 * Locks the four-stage pipeline (RFC-0001):
 *   request --(expand)--> IR --(adapt)--> IR --(decode)--> Art --(package)--> Art
 *
 * Subclasses override the four protected hooks. `produce()` itself is `final` in
 * spirit (TS lacks `final`; see `noImplicitOverride` enforcement at compile time):
 * it owns ordering, sidecar threading, and the rule that any warnings emitted via
 * `ctx.sidecar.warnings` are folded into `Art.metadata.warnings` exactly once at
 * `package()` time, so callers never see two channels.
 *
 * Rejected practices — DO NOT introduce these (Brief H §Reject):
 *   1. No `try / catch / log-and-continue` around phases. Throw; the harness owns
 *      retry policy. Silent fallbacks are an ADR-0005 / hard-constraints violation.
 *   2. No request-time strategy fields (`req.route`, `req.source`). Strategy lives
 *      on the codec via `routes` + `match`.
 *   3. No post-hoc manifest overrides from the harness. Use `manifestRows()`.
 *   4. No global mutable state for warnings (no `console.warn`, no module-level
 *      arrays). The sidecar is the only channel.
 *
 * @experimental
 */
import type { BaseArtifact, Codec, ManifestRow, Route } from "./codec.js";
import type { HarnessCtx } from "./ctx.js";
import type { IR } from "./ir.js";
import type { StandardSchemaV1 } from "./standard-schema.js";
import type { Modality } from "@wittgenstein/schemas";

export abstract class BaseCodec<Req, Art extends BaseArtifact> implements Codec<Req, Art> {
  abstract readonly id: string;
  abstract readonly modality: Modality;
  abstract readonly routes: ReadonlyArray<Route<Req>>;
  abstract readonly schema: StandardSchemaV1<unknown, Req>;

  /**
   * Phase 1: turn the validated request into an initial IR (often by calling the
   * LLM). The codec owns prompt assembly, the schema preamble, and parsing.
   */
  protected abstract expand(req: Req, ctx: HarnessCtx): Promise<IR>;

  /**
   * Phase 2: deterministic transform on the IR (palette extraction, route-specific
   * normalisation, etc.). At v0.2 this is pure-TS; M1B introduces L4 adapters that
   * may produce `LatentIR` here.
   */
  protected abstract adapt(ir: IR, ctx: HarnessCtx): Promise<IR>;

  /**
   * Phase 3: render the IR into modality-specific bytes / structures. No I/O to
   * `ctx.outPath` yet — that is `package()`'s job. Decoder ≠ generator (ADR-0005).
   */
  protected abstract decode(ir: IR, ctx: HarnessCtx): Promise<Art>;

  /**
   * Phase 4: write to `ctx.outPath`, finalise metadata, fold sidecar warnings into
   * `Art.metadata.warnings`. Subclasses MUST call `super.package(art, ctx)` (or
   * replicate its warning-folding contract) so callers see one warning channel.
   */
  protected async package(art: Art, ctx: HarnessCtx): Promise<Art> {
    const merged = [...art.metadata.warnings, ...ctx.sidecar.warnings];
    // Preserve `art.metadata` identity while folding sidecar warnings in.
    (art.metadata as { warnings: typeof merged }).warnings = merged;
    return art;
  }

  async produce(req: Req, ctx: HarnessCtx): Promise<Art> {
    const ir0 = await this.expand(req, ctx);
    const ir1 = await this.adapt(ir0, ctx);
    const art = await this.decode(ir1, ctx);
    return this.package(art, ctx);
  }

  abstract manifestRows(art: Art): ReadonlyArray<ManifestRow>;
}
