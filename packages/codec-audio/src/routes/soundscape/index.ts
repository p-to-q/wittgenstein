import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import type { AudioPlan } from "../../schema.js";
import { generateAmbient } from "../../runtime.js";
import { finalizeRouteRender, resolveAmbientCategory } from "../shared.js";

export async function renderSoundscapeRoute(
  plan: AudioPlan,
  ctx: RenderCtx,
): Promise<RenderResult> {
  const startedAt = Date.now();
  const ambientCategory = resolveAmbientCategory(plan, `${plan.script} ${plan.music.motif}`);
  return finalizeRouteRender(
    ctx,
    "soundscape",
    generateAmbient(ambientCategory === "silence" ? "forest" : ambientCategory, 8, ctx.seed),
    startedAt,
  );
}
