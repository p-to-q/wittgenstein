import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import { recommendAmbient, type AmbientCategory } from "../ambient-adapter.js";
import { finalizeAudioArtifact, generateAmbient, mixTracks } from "../runtime.js";
import type { AudioPlan } from "../schema.js";

export type AudioRouteId = "speech" | "soundscape" | "music";

export function resolveAmbientCategory(plan: AudioPlan, hintText: string): AmbientCategory {
  return plan.ambient.category === "auto"
    ? recommendAmbient(hintText).category
    : plan.ambient.category;
}

export function mixAmbientLayer(
  foreground: Float32Array,
  options: {
    category: AmbientCategory;
    durationSec: number;
    level: number;
    seed: number | null;
  },
): Float32Array {
  const ambient = generateAmbient(options.category, options.durationSec, options.seed);
  return mixTracks([
    { samples: foreground, gain: 1 },
    { samples: ambient, gain: options.level },
  ]);
}

export async function finalizeRouteRender(
  ctx: RenderCtx,
  route: AudioRouteId,
  samples: Float32Array,
  startedAt: number,
): Promise<RenderResult> {
  const result = await finalizeAudioArtifact(ctx, samples, route);
  return {
    ...result,
    metadata: {
      ...result.metadata,
      durationMs: Date.now() - startedAt,
    },
  };
}
