import type { SvgRequest } from "@wittgenstein/schemas";
import type { LlmGenerationResult } from "../llm/adapter.js";

export function buildSvgLocalGeneration(request: SvgRequest): LlmGenerationResult {
  const svg = renderSvgFromPrompt(request.prompt, request.seed ?? null);
  return {
    text: JSON.stringify({ svg }),
    tokens: { input: 0, output: 0 },
    costUsd: null,
    costUsdReason: "no-llm-call",
    raw: { svgLocal: true as const },
  };
}

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashSeed(prompt: string, seed: number | null): number {
  const base = hashString(prompt);
  const s = seed ?? 0;
  return (base ^ Math.imul(s, 2654435761)) >>> 0;
}

function mulberry32(seed: number): () => number {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function renderSvgFromPrompt(prompt: string, seed: number | null): string {
  const rng = mulberry32(hashSeed(prompt, seed));
  const sparkles: string[] = [];
  for (let i = 0; i < 36; i += 1) {
    const cx = rng() * 1024;
    const cy = rng() * 1024;
    const r = rng() * 4 + 0.5;
    const o = 0.05 + rng() * 0.14;
    sparkles.push(
      `<circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}" fill="#ffffff" fill-opacity="${fmt(o)}"/>`,
    );
  }

  const blobs: string[] = [];
  const blobCount = 10 + Math.floor(rng() * 9);
  for (let i = 0; i < blobCount; i += 1) {
    const cx = 120 + rng() * 784;
    const cy = 120 + rng() * 784;
    const rx = 24 + rng() * 220;
    const ry = 24 + rng() * 220;
    const rot = rng() * 360;
    const v = 28 + Math.floor(rng() * 200);
    const fill = `rgb(${v},${Math.min(255, v + Math.floor(rng() * 40))},${Math.max(0, v - Math.floor(rng() * 50))})`;
    const o = 0.12 + rng() * 0.38;
    blobs.push(
      `<ellipse cx="${fmt(cx)}" cy="${fmt(cy)}" rx="${fmt(rx)}" ry="${fmt(
        ry,
      )}" fill="${fill}" fill-opacity="${fmt(o)}" transform="rotate(${fmt(rot)} ${fmt(cx)} ${fmt(cy)})"/>`,
    );
  }

  const ribbons: string[] = [];
  const ribbonCount = 3 + Math.floor(rng() * 4);
  for (let i = 0; i < ribbonCount; i += 1) {
    const x0 = rng() * 1024;
    const y0 = rng() * 1024;
    const x1 = rng() * 1024;
    const y1 = rng() * 1024;
    const x2 = rng() * 1024;
    const y2 = rng() * 1024;
    const sw = 1.5 + rng() * 6;
    const o = 0.18 + rng() * 0.35;
    const c = 120 + Math.floor(rng() * 120);
    ribbons.push(
      `<path d="M ${fmt(x0)} ${fmt(y0)} Q ${fmt(x1)} ${fmt(y1)} ${fmt(x2)} ${fmt(y2)}" fill="none" stroke="rgb(${c},${c},${c})" stroke-opacity="${fmt(
        o,
      )}" stroke-width="${fmt(sw)}" stroke-linecap="round"/>`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">`,
    `<rect width="1024" height="1024" fill="#000000"/>`,
    ...blobs,
    ...ribbons,
    ...sparkles,
    `</svg>`,
  ].join("");
}
