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
