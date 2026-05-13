// Scene-card composition — renders a HyperFrames-shaped HTML page where each
// scene is a structured card (kicker / title / body / meta) on a tinted
// gradient background. Extracted from `hyperframes-wrapper.ts` per
// #327 / #288.

import type { RenderCtx } from "@wittgenstein/schemas";
import type { VideoComposition } from "../schema.js";
import { buildClipTimelineCss } from "../slideshow-timeline-css.js";
import {
  BASE_CSS,
  STAGE_HEIGHT,
  STAGE_WIDTH,
  escapeHtml,
  sanitizeCompositionId,
} from "./shared.js";

export interface SceneCardHtmlResult {
  html: string;
  totalDurationSec: number;
}

/**
 * Build the HTML for the scene-card composition. Used when the composition
 * does not carry pre-rendered inline SVGs.
 */
export function buildSceneCardHtml(
  composition: VideoComposition,
  ctx: RenderCtx,
): SceneCardHtmlResult {
  const compositionId = sanitizeCompositionId(`wittgenstein-${ctx.runId}`);

  const scenes =
    composition.scenes.length > 0
      ? composition.scenes
      : [
          {
            name: "scene-1",
            description:
              composition.scenes.length === 0 ? "Auto scene (no scenes provided)." : "",
            durationSec: composition.durationSec,
          },
        ];

  const totalDurationSec = Math.max(
    composition.durationSec,
    scenes.reduce((sum, s) => sum + s.durationSec, 0),
    0.25,
  );

  let t = 0;
  const clips = scenes.map((scene, index) => {
    const start = t;
    t += scene.durationSec;
    return { scene, index, start };
  });

  const clipTimelineCss = buildClipTimelineCss(
    clips.map((c) => ({ index: c.index, start: c.start, durationSec: c.scene.durationSec })),
    totalDurationSec,
    { iterationCount: 1 },
  );

  const bodyInner = clips.map(({ scene, index, start }) => {
    const trackIndex = index % 8;
    const tone = sceneTone(index);
    return [
      `<div`,
      `  class="hf-clip hf-clip--${index}"`,
      `  style="z-index:${10 + index}; --hf-tone-a:${tone.a}; --hf-tone-b:${tone.b};"`,
      `  data-start="${start}"`,
      `  data-duration="${scene.durationSec}"`,
      `  data-track-index="${trackIndex}"`,
      `>`,
      `  <div class="hf-card" style="background: linear-gradient(145deg, rgba(10,14,28,0.82), rgba(10,14,28,0.62)), radial-gradient(900px 420px at 20% 0%, var(--hf-tone-a), transparent 55%), radial-gradient(700px 500px at 90% 80%, var(--hf-tone-b), transparent 55%);"`,
      `    <div class="hf-emoji" aria-hidden="true">🐧</div>`,
      `    <p class="hf-kicker">${escapeHtml(scene.name)}</p>`,
      `    <h1 class="hf-title">${escapeHtml(scene.name)}</h1>`,
      `    <p class="hf-body">${escapeHtml(scene.description)}</p>`,
      `    <div class="hf-meta">fps=${escapeHtml(String(composition.fps))} · seed=${escapeHtml(String(ctx.seed))}</div>`,
      `  </div>`,
      `</div>`,
    ].join("\n");
  });

  const html = [
    "<!doctype html>",
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(compositionId)}</title>`,
    `<style>`,
    BASE_CSS,
    `html, body { background: #070a12; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; }`,
    `#stage { position: relative; width: ${STAGE_WIDTH}px; height: ${STAGE_HEIGHT}px; margin: 0 auto; background: radial-gradient(1200px 800px at 30% 20%, #1b2a55, #070a12 55%), linear-gradient(180deg, #0b1020, #070a12); overflow: hidden; }`,
    `.hf-clip { position: absolute; inset: 0; display: grid; place-items: center; padding: 96px; box-sizing: border-box; opacity: 0; }`,
    `.hf-card { width: min(1400px, 92vw); border: 1px solid rgba(255,255,255,0.12); border-radius: 28px; padding: 56px 64px; background: rgba(10, 14, 28, 0.72); backdrop-filter: blur(10px); box-shadow: 0 30px 120px rgba(0,0,0,0.45); }`,
    `.hf-emoji { margin: 0 0 20px; font-size: clamp(96px, 14vw, 168px); line-height: 1; filter: drop-shadow(0 14px 36px rgba(0,0,0,0.45)); user-select: none; }`,
    `.hf-kicker { letter-spacing: 0.14em; text-transform: uppercase; font-size: 14px; color: rgba(255,255,255,0.55); margin: 0 0 18px; }`,
    `.hf-title { margin: 0 0 22px; font-size: 64px; line-height: 1.05; font-weight: 650; color: rgba(255,255,255,0.95); }`,
    `.hf-body { margin: 0; font-size: 34px; line-height: 1.35; color: rgba(255,255,255,0.78); white-space: pre-wrap; }`,
    `.hf-meta { margin-top: 34px; font-size: 18px; color: rgba(255,255,255,0.45); }`,
    clipTimelineCss,
    `</style>`,
    `</head>`,
    `<body>`,
    `<div`,
    `  id="stage"`,
    `  data-composition-id="${escapeHtml(compositionId)}"`,
    `  data-start="0"`,
    `  data-width="${STAGE_WIDTH}"`,
    `  data-height="${STAGE_HEIGHT}"`,
    `  data-duration="${totalDurationSec}"`,
    `>`,
    ...bodyInner,
    `</div>`,
    `</body>`,
    `</html>`,
    "",
  ].join("\n");

  return { html, totalDurationSec };
}

function sceneTone(index: number): { a: string; b: string } {
  const tones = [
    { a: "rgba(80, 160, 255, 0.35)", b: "rgba(255, 210, 120, 0.22)" },
    { a: "rgba(255, 140, 90, 0.28)", b: "rgba(120, 200, 255, 0.22)" },
    { a: "rgba(190, 120, 255, 0.26)", b: "rgba(120, 255, 200, 0.18)" },
  ] as const;
  return tones[index % tones.length]!;
}
