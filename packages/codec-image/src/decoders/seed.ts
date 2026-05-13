/**
 * Seed/SEED-family frozen-decoder bridge (M1B alternate candidate).
 *
 * Same shape as `./llamagen.ts` — signature locked, impl gated on M1B
 * radar audits. The radar's per-candidate audit for OpenMAGVIT2/SEED-Voken
 * is at #331 (Priority 3; Gate B partial pending HF URL verification);
 * full impl waits for that to clear + Gates C+D for whichever candidate
 * is selected.
 *
 * Refs:
 *   - Audit (P3-5): `docs/research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md`
 *   - Bridge contract: `./types.ts`
 */
import type { ImageDecoderBridge, LoadDecoderBridgeOptions } from "./types.js";

export const SEED_DECODER_ID = "seed-frozen-vq-v0" as const;

export async function loadSeedDecoderBridge(
  _options: LoadDecoderBridgeOptions = {},
): Promise<ImageDecoderBridge> {
  throw createBridgeNotImplementedError();
}

function createBridgeNotImplementedError(): Error & { code: string; details: object } {
  const error = new Error(
    "Seed-family decoder bridge is not yet wired. The seed-family candidates (OpenMAGVIT2 / SEED-Voken / similar) are tracked at #331; M1B canonical is VQGAN-class (#329).",
  );
  Object.assign(error, {
    name: "WittgensteinError",
    code: "SEED_BRIDGE_NOT_IMPLEMENTED",
    details: {
      family: "seed",
      decoderId: SEED_DECODER_ID,
      blockers: {
        audit: "https://github.com/p-to-q/wittgenstein/issues/331",
        umbrella: "https://github.com/p-to-q/wittgenstein/issues/283",
      },
    },
  });
  return error as Error & { code: string; details: object };
}
