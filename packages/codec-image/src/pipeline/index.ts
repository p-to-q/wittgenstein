import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import { expandSceneSpec } from "./expand.js";
import { adaptSceneToLatents } from "./adapter.js";
import { decodeLatentsToRaster } from "./decoder.js";
import { packageRasterAsPng, toRenderResult } from "./package.js";
import { imageCodeReceipt } from "../image-code-receipt.js";
import type { ImageSceneSpec } from "../schema.js";
import type { ImageArtifact } from "../types.js";

export async function renderImagePipeline(
  parsed: ImageSceneSpec,
  ctx: RenderCtx,
): Promise<RenderResult> {
  const expanded = await expandSceneSpec(parsed, ctx);
  const { latents, outcome } = await adaptSceneToLatents(expanded, ctx);
  const raster = await decodeLatentsToRaster(latents, ctx);
  const imageCode = imageCodeReceipt(parsed);
  const artifact: ImageArtifact = {
    outPath: ctx.outPath,
    bytes: raster.pngBytes,
    mime: "image/png",
    width: raster.width,
    height: raster.height,
    metadata: {
      codec: "image",
      route: "raster",
      warnings: [],
      llmTokens: { input: 0, output: 0 },
      costUsd: 0,
      durationMs: 0,
      seed: ctx.seed,
      promptExpanded: null,
      llmOutputRaw: null,
      llmOutputParsed: parsed,
      imageCode,
      adapterOutcome: outcome,
      quality: {
        structural: {
          schemaValidated: true,
          route: "raster",
          imageCode,
          paletteCount: parsed.style.palette.length,
          palette: [...parsed.style.palette],
        },
        partial: {
          reason: "adapter-stub",
        },
      },
      adapterHash: "legacy-v1",
      decoderHash: {
        value: "legacy-v1",
        frozen: true,
        slot: "LFQ-family-decoder",
      },
      artifactSha256: null,
    },
  };
  return toRenderResult(await packageRasterAsPng(artifact, { outPath: ctx.outPath }));
}
