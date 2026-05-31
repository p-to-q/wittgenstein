/**
 * Seed/SEED-family frozen-decoder bridge (M1B alternate candidate).
 *
 * Same shape as `./llamagen.ts` — signature locked, impl gated on M1B
 * radar audits. The radar's per-candidate audit for OpenMAGVIT2/SEED-Voken
 * is at #331 (Priority 3). Gate A/B are externally cleared against the
 * Apache-2.0 HF model card and downloadable checkpoint filenames; full impl
 * waits on empirical Gates C+D for whichever candidate is selected.
 *
 * Refs:
 *   - Audit (P3-5): `docs/research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md`
 *   - Bridge contract: `./types.ts`
 */
import { TRACKERS } from "@wittgenstein/schemas";
import type { ImageDecoderBridge, LoadDecoderBridgeOptions } from "./types.js";

export const SEED_DECODER_ID = "seed-frozen-vq-v0" as const;

export async function loadSeedDecoderBridge(
  _options: LoadDecoderBridgeOptions = {},
): Promise<ImageDecoderBridge> {
  throw createBridgeNotImplementedError();
}

function createBridgeNotImplementedError(): Error & { code: string; details: object } {
  const error = new Error(
    "Seed-family decoder bridge is not yet wired. OpenMAGVIT2/SEED-Voken cleared external Gate A/B inspection, but empirical Gates C/D still need local compute before any seed-family decoder can be blessed.",
  );
  Object.assign(error, {
    name: "WittgensteinError",
    code: "SEED_BRIDGE_NOT_IMPLEMENTED",
    details: {
      family: "seed",
      decoderId: SEED_DECODER_ID,
      gateStatus: {
        gateA: "passed",
        gateB: "passed",
        gateC: "blocked",
        gateD: "blocked",
      },
      blockers: {
        gateC: TRACKERS.m1bOpenMagvit2Audit,
        gateD: TRACKERS.m1bOpenMagvit2Audit,
        umbrella: TRACKERS.m1bImageDecoderUmbrella,
      },
    },
  });
  return error as Error & { code: string; details: object };
}
