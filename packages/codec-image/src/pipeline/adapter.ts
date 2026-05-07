import type { RenderCtx } from "@wittgenstein/schemas";
import { resolveMlpForScene, predictWithResolved } from "../adapters/adapter-resolve.js";
import {
  ImageCoarseVqSchema,
  ImageLatentCodesSchema,
  ImageVisualSeedCodeSchema,
  type ImageCoarseVq,
  type ImageLatentCodes,
  type ImageSceneSpec,
  type ImageVisualSeedCode,
} from "../schema.js";

export type { ImageLatentCodes };
export { ImageLatentCodesSchema };

/** v1 stub: tokens[0]=1, tokens[1]=byte length, tokens[2..]=UTF-8 bytes of caption. */
export const STUB_LATENT_PROTOCOL_V1 = 1;

export async function adaptSceneToLatents(
  parsed: ImageSceneSpec,
  ctx: RenderCtx,
): Promise<ImageLatentCodes> {
  if (parsed.providerLatents) {
    const validated = ImageLatentCodesSchema.safeParse(parsed.providerLatents);
    if (validated.success) {
      ctx.logger.info("Using provider-included latents; skipping learned adapter.");
      return validated.data;
    }
    ctx.logger.warn("providerLatents failed validation; falling back to adapter.", {
      issues: validated.error?.issues,
    });
  }

  if (parsed.coarseVq) {
    const validated = ImageCoarseVqSchema.safeParse(parsed.coarseVq);
    if (validated.success) {
      ctx.logger.info("Using coarseVq hints; expanding to decoder-native latents.");
      return expandCoarseVqToLatents(parsed, validated.data);
    }
    ctx.logger.warn("coarseVq failed validation; falling back to next adapter tier.", {
      issues: validated.error?.issues,
    });
  }

  if (parsed.seedCode) {
    const validated = ImageVisualSeedCodeSchema.safeParse(parsed.seedCode);
    if (validated.success) {
      ctx.logger.info("Using Visual Seed Code; expanding to decoder-native latents.");
      return expandSeedToLatents(parsed, validated.data);
    }
    ctx.logger.warn("seedCode failed validation; falling back to next adapter tier.", {
      issues: validated.error?.issues,
    });
  }

  const resolved = await resolveMlpForScene(parsed, ctx);
  if (resolved) {
    return annotateLatents(parsed, await predictWithResolved(parsed, resolved));
  }

  return annotateLatents(parsed, placeholderLatents(parsed, ctx));
}

function placeholderLatents(parsed: ImageSceneSpec, ctx: RenderCtx): ImageLatentCodes {
  const [width, height] = parsed.decoder.latentResolution;
  const totalTokens = width * height;
  const codebookSize = 8192;
  const deterministicSeed = hashSpecToSeed(parsed);
  const tokens = new Array<number>(totalTokens);

  for (let index = 0; index < totalTokens; index += 1) {
    tokens[index] = (deterministicSeed + index * 97) % codebookSize;
  }

  const latentCodes = ImageLatentCodesSchema.parse({
    schemaVersion: "witt.image.latents/v0.1",
    family: parsed.decoder.family,
    codebook: parsed.decoder.codebook,
    codebookVersion: parsed.decoder.codebookVersion,
    tokenGrid: [width, height],
    tokens,
  });

  ctx.logger.warn(
    "Using placeholder seed-expansion adapter; set WITTGENSTEIN_IMAGE_ADAPTER_PREFERRED_PATH + WITTGENSTEIN_IMAGE_ADAPTER_LEGACY_PATH (or legacy aliases WITTGENSTEIN_IMAGE_ADAPTER_MLP_PATH + WITTGENSTEIN_IMAGE_ADAPTER_MLP_FALLBACK_PATH).",
  );
  return latentCodes;
}

function expandCoarseVqToLatents(
  parsed: ImageSceneSpec,
  coarseVq: ImageCoarseVq,
): ImageLatentCodes {
  const [targetWidth, targetHeight] = parsed.decoder.latentResolution;
  const [coarseWidth, coarseHeight] = coarseVq.tokenGrid;
  const totalTokens = targetWidth * targetHeight;
  const tokens = new Array<number>(totalTokens);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.min(coarseHeight - 1, Math.floor((y * coarseHeight) / targetHeight));
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.min(coarseWidth - 1, Math.floor((x * coarseWidth) / targetWidth));
      const targetIndex = y * targetWidth + x;
      const sourceIndex = sourceY * coarseWidth + sourceX;
      tokens[targetIndex] = coarseVq.tokens[sourceIndex] ?? 0;
    }
  }

  return ImageLatentCodesSchema.parse({
    schemaVersion: "witt.image.latents/v0.1",
    family: parsed.decoder.family,
    codebook: parsed.decoder.codebook,
    codebookVersion: parsed.decoder.codebookVersion,
    tokenGrid: [targetWidth, targetHeight],
    tokens,
  });
}

function expandSeedToLatents(
  parsed: ImageSceneSpec,
  seedCode: ImageVisualSeedCode,
): ImageLatentCodes {
  const [width, height] = parsed.decoder.latentResolution;
  const totalTokens = width * height;
  const codebookSize = 8192;
  const deterministicSeed = hashSpecToSeed(parsed);
  const tokens = new Array<number>(totalTokens);

  for (let index = 0; index < totalTokens; index += 1) {
    const base = seedCode.tokens[index % seedCode.tokens.length] ?? 0;
    tokens[index] = (base + deterministicSeed + index * 31) % codebookSize;
  }

  return ImageLatentCodesSchema.parse({
    schemaVersion: "witt.image.latents/v0.1",
    family: parsed.decoder.family,
    codebook: parsed.decoder.codebook,
    codebookVersion: parsed.decoder.codebookVersion,
    tokenGrid: [width, height],
    tokens,
  });
}

function annotateLatents(parsed: ImageSceneSpec, latents: ImageLatentCodes): ImageLatentCodes {
  const seed = hashSpecToSeed(parsed);
  const tokens = [...latents.tokens];
  if (tokens.length >= 4) {
    tokens[0] = inferSceneMode(parsed);
    tokens[1] = seed % 8192;
    tokens[2] = (seed >>> 5) % 8192;
    tokens[3] = (seed >>> 11) % 8192;
  }

  return ImageLatentCodesSchema.parse({
    ...latents,
    tokens,
  });
}

function inferSceneMode(parsed: ImageSceneSpec): number {
  const haystack = `${parsed.subject} ${parsed.intent}`.toLowerCase();
  if (
    haystack.includes("coast") ||
    haystack.includes("shore") ||
    haystack.includes("beach") ||
    haystack.includes("ocean")
  ) {
    return 0;
  }
  if (haystack.includes("forest") || haystack.includes("wood") || haystack.includes("tree")) {
    return 1;
  }
  if (haystack.includes("lake") || haystack.includes("river") || haystack.includes("water")) {
    return 2;
  }
  if (haystack.includes("mountain") || haystack.includes("peak") || haystack.includes("alpine")) {
    return 3;
  }
  if (haystack.includes("meadow") || haystack.includes("hill") || haystack.includes("field")) {
    return 4;
  }
  return hashSpecToSeed(parsed) % 5;
}

function hashSpecToSeed(parsed: ImageSceneSpec): number {
  const source = JSON.stringify({
    intent: parsed.intent,
    subject: parsed.subject,
    composition: parsed.composition,
    lighting: parsed.lighting,
    style: parsed.style,
    constraints: parsed.constraints,
    renderHints: parsed.renderHints,
    decoder: parsed.decoder,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
