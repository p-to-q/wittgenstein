import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import type { AudioPlan } from "../../schema.js";
import { synthMusic } from "../../runtime.js";
import { finalizeRouteRender, mixAmbientLayer, resolveAmbientCategory } from "../shared.js";

export async function renderMusicRoute(plan: AudioPlan, ctx: RenderCtx): Promise<RenderResult> {
  const startedAt = Date.now();
  const durationSec = 8;
  const ambientCategory = resolveAmbientCategory(plan, `${plan.script} ${plan.music.motif}`);
  const music = synthMusic(durationSec, plan.music.motif);
  return finalizeRouteRender(
    ctx,
    "music",
    mixAmbientLayer(music, {
      category: ambientCategory,
      durationSec,
      level: plan.ambient.level * 0.8,
      seed: ctx.seed,
    }),
    startedAt,
  );
}
