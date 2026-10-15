/**
 * Seed/SEED-family frozen-decoder bridge (M1B alternate candidate).
 *
 * Same shape as `./llamagen.ts` — signature locked, impl gated on M1B
 * radar audits. The radar's per-candidate audit for OpenMAGVIT2/SEED-Voken
 * is at #331 (Priority 3). All four gates are cleared at audit level — A/B
 * externally (2026-05-31 closeout), C/D empirically (2026-10-15/16 lab runs
 * under the structural policy) — but no seed-family decoder is selected for
 * runtime delivery yet; the M1B floor remains `llamagen`.
 *
 * Refs:
 *   - Audit (P3-5): `docs/research/2026-05-13-audits-fsq-openmagvit2-titok-maskbit.md`
 *   - Gate C/D verdict: `docs/research/2026-10-16-openmagvit2-gate-cd-audit.md`
 *   - Bridge contract: `./types.ts`
 */
import { CLOSED_TRACKERS, TRACKERS } from "@wittgenstein/schemas";
import type { ImageDecoderBridge, LoadDecoderBridgeOptions } from "./types.js";

export const SEED_DECODER_ID = "seed-frozen-vq-v0" as const;

export async function loadSeedDecoderBridge(
  _options: LoadDecoderBridgeOptions = {},
): Promise<ImageDecoderBridge> {
  throw createBridgeNotImplementedError();
}

function createBridgeNotImplementedError(): Error & { code: string; details: object } {
  const error = new Error(
    "Seed-family decoder bridge is not yet wired. OpenMAGVIT2 (LFQ) cleared all four audit gates — A/B externally, C/D via the 2026-10-15/16 lab runs under the structural policy — but the seed family is not selected for runtime delivery yet; the M1B floor remains `llamagen`.",
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
        gateC: "passed",
        gateD: "passed",
      },
      blockers: {
        selection: TRACKERS.m1bOpenMagvit2Audit,
        umbrella: CLOSED_TRACKERS.m1bImageDecoderUmbrella,
      },
    },
  });
  return error as Error & { code: string; details: object };
}
