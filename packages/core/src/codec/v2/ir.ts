/**
 * Intermediate Representation (IR) sum type for the codec v2 pipeline.
 *
 * Phase boundary in the v2 protocol:
 *   request --(expand)--> IR --(adapt)--> IR --(decode)--> Art --(package)--> Art
 *
 * At v0.2 only `Text` is inhabited. `Latent` and `Hybrid` are reserved variants for
 * post-M1B adapters (latent IRs from trained L4 networks) and future modalities that
 * mix natural-language plans with embedding tensors. The shape is locked in M0 so that
 * downstream code can pattern-match on `kind` without later refactoring.
 *
 * RFC-0001 §IR for the rationale and §Addendum (2026-04-26) for the M1A amendments.
 *
 * @experimental
 */
export interface TextIR {
  readonly kind: "text";
  readonly text: string;
  /** Optional structured plan parsed out of the text (codec-defined). */
  readonly plan?: unknown;
}

export interface LatentIR {
  readonly kind: "latent";
  /** Opaque embedding payload owned by an L4 adapter; v0.2 reserves the shape only. */
  readonly latent: unknown;
}

export interface HybridIR {
  readonly kind: "hybrid";
  readonly text: string;
  readonly latent: unknown;
}

export type IR = TextIR | LatentIR | HybridIR;

export const isTextIR = (ir: IR): ir is TextIR => ir.kind === "text";
export const isLatentIR = (ir: IR): ir is LatentIR => ir.kind === "latent";
export const isHybridIR = (ir: IR): ir is HybridIR => ir.kind === "hybrid";
