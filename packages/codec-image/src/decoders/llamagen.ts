/**
 * LlamaGen frozen-decoder bridge (M1B target).
 *
 * The signature here is the typed contract every future impl PR fills in.
 * The actual ONNX wiring / weights fetch / decode call is gated on the M1B
 * radar audits (#283 Gates C+D, tracked at #334 + #335) — those need local
 * empirical compute that no PR has yet run. Until they clear, this loader
 * throws `LLAMAGEN_BRIDGE_NOT_IMPLEMENTED` with a structured error citing
 * the upstream artifacts and the gate trackers.
 *
 * Refs:
 *   - Audit: `docs/research/2026-05-13-audit-vqgan-class.md` (Gates A+B pass)
 *   - Upstream: https://github.com/FoundationVision/LlamaGen (Apache-2.0)
 *   - Bridge contract: `./types.ts`
 *   - Replay verifier for the wired path: `wittgenstein replay` (#384)
 */
import type { ImageDecoderBridge, LoadDecoderBridgeOptions } from "./types.js";

/**
 * Stable identifier for this bridge family. Recorded on every manifest as
 * `decoderId` so receipts can be filtered / replayed per-family. Survives
 * impl evolution.
 */
export const LLAMAGEN_DECODER_ID = "llamagen-frozen-vq-v0" as const;

/**
 * Load the LlamaGen frozen decoder bridge.
 *
 * Currently throws — see file header. The signature is locked so the M1B
 * implementation PR is a contract-fill: implement `decode(codes)` against
 * `ImageLatentCodes` (matching the codebook + grid shape the bridge
 * advertises) and return `ImageDecoderResult` with `decoderHash` derived
 * from weights+codebook bytes.
 *
 * The impl must:
 *   1. Read `LLAMAGEN_DECODER_MANIFEST` (separate file like Kokoro's
 *      `decoders/kokoro/manifest.json`) for pinned weights SHA-256.
 *   2. Verify the weights cache or fetch + sha256-verify on first run.
 *   3. Refuse to return if `weightsLicense === "research-only"` and
 *      `options.allowResearchWeights !== true` (ADR-0020, tracked at #376).
 *   4. Build an ONNX inference session under `options.runtimeTier`
 *      (default `node-onnx-cpu`) and advertise `determinismClass` per
 *      what Gate C measurement actually showed (#334).
 */
export async function loadLlamagenDecoderBridge(
  _options: LoadDecoderBridgeOptions = {},
): Promise<ImageDecoderBridge> {
  throw createBridgeNotImplementedError();
}

function createBridgeNotImplementedError(): Error & { code: string; details: object } {
  const error = new Error(
    "LlamaGen decoder bridge is not yet wired. M1B is gated on Gates C (determinism, #334) + D (Node/ONNX/CPU feasibility, #335). See docs/research/2026-05-13-audit-vqgan-class.md for the audit + docs/research/2026-05-13-m1b-prep-research.md for the implementation plan.",
  );
  Object.assign(error, {
    name: "WittgensteinError",
    code: "LLAMAGEN_BRIDGE_NOT_IMPLEMENTED",
    details: {
      family: "llamagen",
      decoderId: LLAMAGEN_DECODER_ID,
      blockers: {
        gateC: "https://github.com/p-to-q/wittgenstein/issues/334",
        gateD: "https://github.com/p-to-q/wittgenstein/issues/335",
        umbrella: "https://github.com/p-to-q/wittgenstein/issues/283",
      },
    },
  });
  return error as Error & { code: string; details: object };
}
