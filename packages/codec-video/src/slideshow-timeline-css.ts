export interface ClipTimelineClip {
  index: number;
  start: number;
  durationSec: number;
}

export interface BuildClipTimelineCssOptions {
  /** CSS animation-iteration-count; use `"infinite"` for looping browser playback. */
  iterationCount?: number | "infinite";
}

export function buildClipTimelineCss(
  clips: ClipTimelineClip[],
  totalSec: number,
  options?: BuildClipTimelineCssOptions,
): string {
  const T = Math.max(totalSec, 0.0001);
  const blocks: string[] = [];
  const iteration =
    options?.iterationCount === "infinite"
      ? "infinite"
      : String(options?.iterationCount ?? 1);

  for (const { index, start, durationSec } of clips) {
    const end = start + durationSec;
    const p0 = (start / T) * 100;
    const p1 = Math.min(100, (end / T) * 100);
    const name = `hf-clip-op-${index}`;
    const atStart = start <= 1e-6;
    const endsAtEnd = end >= T - 1e-6;
    const eps = 0.05;

    let keyframes: string;
    if (atStart && endsAtEnd) {
      keyframes = `@keyframes ${name} { 0%, 100% { opacity: 1; transform: scale(1); } }`;
    } else if (atStart) {
      keyframes = `@keyframes ${name} {
        0% { opacity: 1; transform: scale(1); }
        ${fmtPct(Math.max(0, p1 - eps))} { opacity: 1; transform: scale(1); }
        ${fmtPct(p1)} { opacity: 0; transform: scale(0.99); }
        100% { opacity: 0; transform: scale(0.99); }
      }`;
    } else if (endsAtEnd) {
      keyframes = `@keyframes ${name} {
        0% { opacity: 0; transform: scale(0.99); }
        ${fmtPct(Math.max(0, p0 - eps))} { opacity: 0; transform: scale(0.99); }
        ${fmtPct(p0)} { opacity: 1; transform: scale(1); }
        100% { opacity: 1; transform: scale(1); }
      }`;
    } else {
      keyframes = `@keyframes ${name} {
        0% { opacity: 0; transform: scale(0.99); }
        ${fmtPct(Math.max(0, p0 - eps))} { opacity: 0; transform: scale(0.99); }
        ${fmtPct(p0)} { opacity: 1; transform: scale(1); }
        ${fmtPct(Math.max(p0, p1 - eps))} { opacity: 1; transform: scale(1); }
        ${fmtPct(p1)} { opacity: 0; transform: scale(0.99); }
        100% { opacity: 0; transform: scale(0.99); }
      }`;
    }

    blocks.push(keyframes);
    blocks.push(
      `.hf-clip--${index} { animation: ${name} ${T}s linear ${iteration} both; will-change: opacity, transform; }`,
    );
  }

  return blocks.join("\n");
}

function fmtPct(value: number): string {
  const clamped = Math.max(0, Math.min(100, value));
  return `${clamped.toFixed(3)}%`;
}
