import type { RenderCtx } from "@wittgenstein/schemas";
import type { ImageSceneSpec } from "../schema.js";

/**
 * Deliberate identity no-op at this phase: the SeedExpander seam is a placeholder
 * (M1B slice S2, "landed as a seam; real trained expander remains future work"), so
 * the frozen-decoder path consumes adapter latents directly. Real expansion lands with
 * a trained expander: docs/exec-plans/active/m1b-image-implementation-slices.md.
 */
export async function expandSceneSpec(
  parsed: ImageSceneSpec,
  _ctx: RenderCtx,
): Promise<ImageSceneSpec> {
  return parsed;
}
