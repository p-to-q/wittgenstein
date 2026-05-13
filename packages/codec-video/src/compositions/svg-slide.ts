// SVG-slide composition — renders a HyperFrames-shaped HTML page where each
// scene is a pre-rendered inline SVG slide. Extracted from
// `hyperframes-wrapper.ts` per #327 / #288.

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

export interface SvgSlideHtmlResult {
  html: string;
  totalDurationSec: number;
}

/**
 * Build the HTML for the SVG-slide composition. Caller is expected to have
 * already verified that `composition.inlineSvgs` is non-empty.
 */
export function buildSvgSlideHtml(
  composition: VideoComposition,
  ctx: RenderCtx,
  inlineSvgs: readonly string[],
): SvgSlideHtmlResult {
  const compositionId = sanitizeCompositionId(`wittgenstein-${ctx.runId}`);
  const durations = resolveSlideDurations(composition, inlineSvgs.length);

  let t = 0;
  const svgClips = inlineSvgs.map((svg, index) => {
    const durationSec = durations[index] ?? 3;
    const start = t;
    t += durationSec;
    const label = composition.scenes[index]?.name ?? `slide-${index + 1}`;
    return { svg, index, start, durationSec, label };
  });
  const totalDurationSec = Math.max(t, 0.25);

  const clipTimelineCss = buildClipTimelineCss(
    svgClips.map((c) => ({ index: c.index, start: c.start, durationSec: c.durationSec })),
    totalDurationSec,
    { iterationCount: 1 },
  );

  const bodyInner = svgClips.map(({ svg, index, start, durationSec, label }) => {
    const trackIndex = index % 8;
    return [
      `<div`,
      `  class="hf-clip hf-clip--${index}"`,
      `  style="z-index:${10 + index}"`,
      `  data-start="${start}"`,
      `  data-duration="${durationSec}"`,
      `  data-track-index="${trackIndex}"`,
      `>`,
      `  <div class="hf-svg-slide" role="img" aria-label="${escapeHtml(label)}">`,
      stripXmlDeclaration(svg),
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
    `html, body { background: #000000; }`,
    `#stage { position: relative; width: ${STAGE_WIDTH}px; height: ${STAGE_HEIGHT}px; margin: 0 auto; background: #000000; overflow: hidden; }`,
    `.hf-clip { position: absolute; inset: 0; display: grid; place-items: center; padding: 48px; box-sizing: border-box; opacity: 0; }`,
    `.hf-svg-slide { width: 100%; height: 100%; display: grid; place-items: center; box-sizing: border-box; }`,
    `.hf-svg-slide > svg { width: auto; height: auto; max-width: 1720px; max-height: 940px; display: block; }`,
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

function resolveSlideDurations(composition: VideoComposition, slideCount: number): number[] {
  const n = Math.max(1, slideCount);
  const scenes = composition.scenes;
  if (scenes.length === n) {
    return scenes.map((s) => s.durationSec);
  }
  if (composition.durationSec && composition.durationSec > 0) {
    const each = Math.max(0.25, composition.durationSec / n);
    return Array.from({ length: n }, () => each);
  }
  return Array.from({ length: n }, () => 3);
}

function stripXmlDeclaration(svg: string): string {
  return svg.replace(/^\uFEFF?<\?xml[^>]*>\s*/i, "").trim();
}
