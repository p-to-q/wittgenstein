import { readFile } from "node:fs/promises";
import type { RenderCtx, RenderResult } from "@wittgenstein/schemas";
import type { AudioPlan } from "../../schema.js";
import { renderMacSpeech, synthSpeech } from "../../runtime.js";
import { finalizeRouteRender, mixAmbientLayer, resolveAmbientCategory } from "../shared.js";

export async function renderSpeechRoute(
  plan: AudioPlan,
  ctx: RenderCtx,
  options: { allowHostTts?: boolean } = {},
): Promise<RenderResult> {
  const startedAt = Date.now();
  const durationSec = Math.max(2, inferSpeechDurationSec(plan.script));
  const ambientCategory = resolveAmbientCategory(plan, plan.script);

  let speechSamples = synthSpeech(plan.script, durationSec);
  if (options.allowHostTts === true && (await renderMacSpeech(plan.script, ctx.outPath))) {
    speechSamples = decodeWavToFloat32(await readFile(ctx.outPath));
  }

  return finalizeRouteRender(
    ctx,
    "speech",
    mixAmbientLayer(speechSamples, {
      category: ambientCategory,
      durationSec,
      level: plan.ambient.level,
      seed: ctx.seed,
    }),
    startedAt,
  );
}

function inferSpeechDurationSec(script: string): number {
  const words = script.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2.5, words / 2.4);
}

function decodeWavToFloat32(buffer: Buffer): Float32Array {
  const dataOffset = 44;
  const sampleCount = Math.max(0, (buffer.length - dataOffset) / 2);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i += 1) {
    samples[i] = buffer.readInt16LE(dataOffset + i * 2) / 32767;
  }
  return samples;
}
