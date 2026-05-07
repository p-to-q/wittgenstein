import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { RenderResult, codecV2 } from "@wittgenstein/schemas";
import type { ImageArtifact } from "../types.js";

export async function packageRasterAsPng(
  art: ImageArtifact,
  ctx: Pick<codecV2.HarnessCtx, "outPath">,
): Promise<ImageArtifact> {
  if (!art.bytes) {
    throw new Error("ImageArtifact is missing PNG bytes before package().");
  }
  await mkdir(dirname(ctx.outPath), { recursive: true });
  await writeFile(ctx.outPath, art.bytes);
  art.metadata.artifactSha256 = createHash("sha256").update(art.bytes).digest("hex");
  return {
    ...art,
    outPath: ctx.outPath,
  };
}

export function toRenderResult(art: ImageArtifact): RenderResult {
  return {
    artifactPath: art.outPath,
    mimeType: art.mime,
    bytes: art.bytes?.byteLength ?? 0,
    metadata: {
      codec: art.metadata.codec,
      route: art.metadata.route,
      llmTokens: art.metadata.llmTokens,
      costUsd: art.metadata.costUsd,
      durationMs: art.metadata.durationMs,
      seed: art.metadata.seed,
      // Outcome of the adapter fall-through (which tier actually fired) — not
      // the spec intent. Surfaces in `RunManifest.renderPath` so observers can
      // see e.g. "providerLatents was provided but failed validation; the
      // visual-seed-code tier ran instead."
      renderPath: art.metadata.adapterOutcome,
    },
  };
}
