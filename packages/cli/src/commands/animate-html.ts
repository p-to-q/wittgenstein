import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Command } from "commander";
import { buildPlayableSlideshowHtml } from "@wittgenstein/codec-video";
import { resolveExecutionRoot } from "./shared.js";

function collectSvgPath(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value];
}

export interface AnimateHtmlCommandOptions {
  out?: string;
  durationSec?: string;
  title?: string;
  once?: boolean;
  svg?: string[];
}

function resolveSlideSeconds(svgCount: number, totalSec?: number): number[] {
  const n = Math.max(1, svgCount);
  if (totalSec && totalSec > 0) {
    const each = Math.max(0.25, totalSec / n);
    return Array.from({ length: n }, () => each);
  }
  return Array.from({ length: n }, () => 3);
}

export function registerAnimateHtmlCommand(program: Command): void {
  program
    .command("animate-html")
    .description(
      "Write a self-contained HTML file: SVG slides animate in the browser via CSS (looping), no HyperFrames CLI.",
    )
    .requiredOption("--out <path>", "output .html path")
    .option("--svg <path>", "SVG file as one slide (repeatable, order preserved)", collectSvgPath, [])
    .option("--duration-sec <number>", "total seconds split evenly across slides", "6")
    .option("--title <text>", "document title")
    .option("--once", "play the timeline once instead of looping")
    .action(async (options: AnimateHtmlCommandOptions) => {
      const root = resolveExecutionRoot();
      const svgPaths = options.svg ?? [];
      if (svgPaths.length === 0) {
        throw new Error("animate-html requires at least one --svg <path> (repeatable).");
      }

      const inlineSvgs: string[] = [];
      for (const rel of svgPaths) {
        const abs = resolve(root, rel);
        inlineSvgs.push(await readFile(abs, "utf8"));
      }

      const totalSec = Number.parseFloat(options.durationSec ?? "6");
      const durationsSec = resolveSlideSeconds(inlineSvgs.length, Number.isFinite(totalSec) ? totalSec : undefined);

      const html = buildPlayableSlideshowHtml({
        svgs: inlineSvgs,
        durationsSec,
        ...(options.title !== undefined && options.title !== "" ? { title: options.title } : {}),
        loop: !options.once,
      });

      const outPath = resolve(root, options.out!);
      await mkdir(dirname(outPath), { recursive: true });
      await writeFile(outPath, html, "utf8");

      console.log(JSON.stringify({ ok: true, artifactPath: outPath }, null, 2));
    });
}
