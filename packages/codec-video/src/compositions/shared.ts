// Shared primitives for the HyperFrames-shaped HTML compositions. Extracted
// from `hyperframes-wrapper.ts` per #327 / #288 so the SVG-slide and
// scene-card compositions don't independently duplicate stage dimensions,
// id sanitization, or HTML escaping.

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

export function sanitizeCompositionId(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "composition";
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Common base CSS that both compositions emit before their composition-specific
 * style block. Kept here so a single edit propagates across compositions.
 */
export const BASE_CSS = [
  `:root { color-scheme: dark; }`,
  `html, body { height: 100%; margin: 0; }`,
].join("\n");

export interface FrameTimeClip {
  index: number;
  start: number;
  durationSec: number;
}

export function buildFrameTimeCss(
  clips: readonly FrameTimeClip[],
  totalDurationSec: number,
): string {
  const lines = [
    `body[data-wittgenstein-frame-time] .hf-clip { animation: none !important; opacity: 0; transform: scale(0.99); }`,
  ];
  for (const clip of clips) {
    const end = clip.start + clip.durationSec;
    lines.push(
      `body[data-wittgenstein-frame-time="${frameBucket(clip.start, end, totalDurationSec)}"] .hf-clip--${clip.index} { opacity: 1 !important; transform: scale(1) !important; }`,
    );
  }
  return lines.join("\n");
}

export const FRAME_TIME_SCRIPT = String.raw`
(function () {
  var params = new URLSearchParams(window.location.search);
  var raw = params.get("wittgensteinFrameTime");
  if (raw === null) return;
  var time = Number(raw);
  if (!Number.isFinite(time)) return;
  var stage = document.getElementById("stage");
  var total = Number(stage && stage.dataset.duration || "0");
  document.body.setAttribute("data-wittgenstein-frame-time", "");
  var clips = Array.from(document.querySelectorAll(".hf-clip"));
  for (var i = 0; i < clips.length; i += 1) {
    var el = clips[i];
    var start = Number(el.getAttribute("data-start") || "0");
    var duration = Number(el.getAttribute("data-duration") || "0");
    var end = start + duration;
    if (time >= start && (time < end || (total > 0 && time >= total && end >= total))) {
      document.body.setAttribute("data-wittgenstein-frame-time", start.toFixed(3) + "-" + Math.min(end, total || end).toFixed(3));
      return;
    }
  }
})();
`;

function frameBucket(start: number, end: number, totalDurationSec: number): string {
  return `${start.toFixed(3)}-${Math.min(end, totalDurationSec).toFixed(3)}`;
}
