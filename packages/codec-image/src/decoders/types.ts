/**
 * Shared decoder-bridge contract for image (M1B prep).
 *
 * Every image decoder bridge — `llamagen`, future `seed`, future `dvae` etc. —
 * conforms to `ImageDecoderBridge`. The contract is the seam the procedural
 * placeholder renderer (`../pipeline/decoder.ts`) will swap out once M1B's
 * radar audits (#283) clear empirical Gates C+D for at least one candidate.
 *
 * Pinning the interface BEFORE the first real impl lands means the wiring PR
 * for M1B is a contract-fill, not a contract-design — keeps the load-bearing
 * design decisions in one place (this file + `README.md`) instead of smearing
 * them across the impl PR.
 *
 * Tracking: [#384] (replay verifies what this produces); [#283] (M1B umbrella);
 * RFC-0007 (1D-vs-2D shape discriminator, the load-bearing schema decision
 * above the bridge interface).
 */
import type { DecoderFamily, ImageLatentCodes } from "../schema.js";
import type { DecodedRaster } from "../pipeline/decoder.js";

/**
 * Determinism class of a decoder bridge's output.
 *
 * - `byte-parity` — same `ImageLatentCodes` + same bridge build → bit-identical
 *   `pngBytes` across platforms. The strongest claim; only achievable when
 *   the entire decode path is integer-arithmetic or platform-pinned floats
 *   (rare in practice for trained models).
 *
 * - `structural-parity` — same input → same image-code receipt, same PNG
 *   dimensions, same channel layout, same dominant palette, but pixel-level
 *   bytes may differ across platforms by epsilon-level float noise. The
 *   M2 audio precedent ([`docs/adrs/0015-audio-decoder-family.md`](../../../docs/adrs/0015-audio-decoder-family.md))
 *   ratifies this as the acceptable shipping contract for cross-platform
 *   trained-model decoders. See #374 for the image-side decision tracker.
 */
export type DecoderDeterminismClass = "byte-parity" | "structural-parity";

/**
 * Runtime tier the bridge runs under. Locks the doctrine that the canonical
 * M-phase path is Node + ONNX + CPU (per `docs/hard-constraints.md`).
 *
 * - `node-onnx-cpu` — the only runtime tier currently a hard-constraint pass.
 *   Bridge invocations from `wittgenstein image` run under this tier.
 *
 * - `node-onnx-gpu` — opt-in; surfaces if a contributor enables a GPU runtime.
 *   Receipts mark the run as such; cross-platform parity is `structural`.
 *
 * - `local-python` — escape-hatch for benchmarking only; not a shipping path.
 *   Mirror of polyglot-mini's research-grade subprocess execution.
 *
 * New tiers require an ADR (governance lane per ADR-0014).
 */
export type DecoderRuntimeTier = "node-onnx-cpu" | "node-onnx-gpu" | "local-python";

/**
 * Capabilities a bridge advertises at load time. The pipeline consults these
 * before calling `decode()` to verify the input latents are decodable; an
 * advertise/decode mismatch is a deterministic typed error, not a runtime
 * surprise.
 */
export interface ImageDecoderCapabilities {
  /** Which decoder family this bridge implements. Matches `DecoderFamilySchema`. */
  readonly family: DecoderFamily;

  /** Stable identifier for `manifest.image.decoder.id` and `decoderHash` (Issue #384 receipts). */
  readonly decoderId: string;

  /**
   * Per-token-shape advertisement. The pipeline matches a candidate
   * `ImageLatentCodes` against this list and refuses if no entry matches.
   *
   * For 2D shapes: `tokenGrid: [W, H]` is supported.
   * For 1D shapes (RFC-0007): `sequenceLength: N` is supported.
   *
   * A bridge that handles both shapes lists both entries.
   */
  readonly supportedShapes: ReadonlyArray<DecoderShapeSupport>;

  /**
   * Codebook identifier + version the bridge expects on incoming latents.
   * `ImageLatentCodes.codebook` + `codebookVersion` must match exactly.
   * Mismatched codebooks decode to garbage; bridge MUST refuse at advertise time.
   */
  readonly codebook: string;
  readonly codebookVersion: string;

  /**
   * Determinism contract. Pipeline records this on the manifest receipt; CI
   * gates compare across runs / platforms accordingly (#374 + replay #384).
   */
  readonly determinismClass: DecoderDeterminismClass;

  /** Runtime tier this bridge ran under. See `DecoderRuntimeTier`. */
  readonly runtimeTier: DecoderRuntimeTier;

  /**
   * Codec + license posture. Required by ADR-0020: the canonical M-phase
   * path needs permissive code AND weights; research-only weights are
   * opt-in via `--allow-research-weights`.
   */
  readonly codeLicense: string; // e.g. "Apache-2.0"
  readonly weightsLicense: "permissive" | "research-only";
}

/**
 * One supported (shape, output-resolution) tuple. A bridge that only outputs
 * 256×256 from a 16×16 token grid lists one entry; a multi-resolution bridge
 * lists several.
 */
export type DecoderShapeSupport =
  | {
      readonly shape: "2D";
      readonly tokenGrid: readonly [number, number];
      readonly outputPixels: readonly [number, number];
    }
  | {
      readonly shape: "1D";
      readonly sequenceLength: number;
      readonly outputPixels: readonly [number, number];
    };

/**
 * Result of a single `decode()` call. The pipeline wraps this in
 * `DecodedRaster` for downstream consumption; warnings flow into the
 * codec's manifest sidecar so receipts stay honest (Issue #182 / #363).
 */
export interface ImageDecoderResult {
  readonly raster: DecodedRaster;
  /**
   * Non-fatal warnings the bridge wants to surface. Format mirrors
   * `codecV2.Sidecar.warnings` so the codec can fold them in directly.
   */
  readonly warnings: ReadonlyArray<{
    readonly code: string;
    readonly message: string;
    readonly detail?: unknown;
  }>;
  /**
   * Stable hash of the model weights + tokenizer codebook + adapter
   * (everything that contributes to byte parity). Recorded on the manifest
   * as `decoderHash.value`.
   */
  readonly decoderHash: string;
}

/**
 * The bridge contract every image decoder family conforms to.
 *
 * Loading is async because real bridges fetch / mmap weights; subsequent
 * `decode()` calls are usually fast (model resident in memory). A bridge
 * loaded with research-only weights should refuse to be returned by
 * `load*DecoderBridge()` unless `allowResearchWeights: true` is passed
 * (ADR-0020 enforcement; tracked by #376).
 */
export interface ImageDecoderBridge {
  readonly capabilities: ImageDecoderCapabilities;

  /**
   * Decode a single `ImageLatentCodes` value into a PNG raster.
   *
   * Throws `WittgensteinError`-shaped errors with a `code` field on:
   *   - `DECODER_SHAPE_UNSUPPORTED` — latents don't match advertised shapes.
   *   - `DECODER_CODEBOOK_MISMATCH` — `codebook` or `codebookVersion` differ.
   *   - `DECODER_RUNTIME_UNAVAILABLE` — ONNX runtime / model missing.
   *   - `DECODER_INFERENCE_FAILED` — model ran but produced invalid output.
   */
  decode(codes: ImageLatentCodes): Promise<ImageDecoderResult>;

  /** Release any held resources (model weights, ONNX session). Idempotent. */
  unload(): Promise<void>;
}

/**
 * Options accepted by every `load*DecoderBridge()` entrypoint. Specific
 * bridges (llamagen, seed, dvae) may extend this with bridge-specific knobs;
 * the common fields here are what the pipeline / CLI always pass through.
 */
export interface LoadDecoderBridgeOptions {
  /**
   * If true, allow loading research-only weights (per ADR-0020). The CLI's
   * `--allow-research-weights` flag is the user-facing surface; the bridge
   * loader is the enforcement point. Implementation tracked at #376.
   */
  readonly allowResearchWeights?: boolean;

  /**
   * Cache directory for fetched model weights. Defaults to a tier-appropriate
   * path (e.g. `~/.cache/wittgenstein/decoders/<family>`).
   */
  readonly cacheDir?: string;

  /**
   * Override the runtime tier. Defaults to `node-onnx-cpu`. Non-canonical
   * tiers surface in the receipt; `local-python` requires the polyglot-mini
   * sandbox to be present.
   */
  readonly runtimeTier?: DecoderRuntimeTier;
}
