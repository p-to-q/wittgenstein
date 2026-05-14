// Loupe dashboard rendering — extracted from `render.ts` per #326 / #288.
//
// Encapsulates the 3-level fallback chain (loupe.py search → loupe_cli on PATH
// → static-HTML fallback) behind a single API. The renderer keeps the same
// `SensorRenderPath` outcome string so manifests and tests stay byte-stable.

import { access, writeFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { spawn } from "node:child_process";
import type { SensorSignalSpec } from "./schema.js";

export type SensorRenderPath = "loupe-script" | "loupe-cli" | "fallback-static-html";

export interface LoupeRenderResult {
  htmlReady: boolean;
  renderPath: SensorRenderPath;
}

function resolveModuleDir(): string {
  if (typeof __dirname === "string") {
    return __dirname;
  }
  return process.cwd();
}

const moduleDir = resolveModuleDir();

function resolveEntrypointDir(): string | null {
  const entrypoint = process.argv[1];
  if (!entrypoint) return null;
  return dirname(resolvePath(entrypoint));
}

/**
 * Default candidate locations for `loupe.py`, ordered from most-likely to
 * least-likely. The renderer probes each in turn and falls through to the
 * `loupe_cli` PATH lookup if none exist.
 */
function defaultLoupeSearchPaths(): string[] {
  const entrypointDir = resolveEntrypointDir();
  return [
    ...(entrypointDir ? [resolvePath(entrypointDir, "loupe.py")] : []), // bundled CLI dist/
    ...(entrypointDir ? [resolvePath(entrypointDir, "../loupe.py")] : []), // adjacent to bin/
    resolvePath(moduleDir, "../loupe.py"), // package root
    resolvePath(process.cwd(), "loupe.py"), // cwd
    resolvePath(process.cwd(), "packages/codec-sensor/loupe.py"), // repo root
    resolvePath(process.cwd(), "polyglot-mini/loupe.py"), // sub-project
  ];
}

export async function renderLoupeDashboard(
  csvPath: string,
  htmlPath: string,
  spec: SensorSignalSpec,
  searchPaths: string[] = defaultLoupeSearchPaths(),
): Promise<LoupeRenderResult> {
  const loupePath = await firstExistingPath(searchPaths);

  if (loupePath) {
    try {
      await spawnChecked("python3", [loupePath, csvPath, "-o", htmlPath]);
      return { htmlReady: true, renderPath: "loupe-script" };
    } catch {
      /* fall through to fallback */
    }
  } else {
    try {
      await spawnChecked("python3", ["-m", "loupe_cli", csvPath, "-o", htmlPath]);
      return { htmlReady: true, renderPath: "loupe-cli" };
    } catch {
      /* fall through to fallback */
    }
  }

  await writeFile(htmlPath, buildFallbackHtml(spec, csvPath));
  return { htmlReady: true, renderPath: "fallback-static-html" };
}

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* skip */
    }
  }
  return null;
}

function buildFallbackHtml(spec: SensorSignalSpec, _csvPath: string): string {
  // Do NOT embed the CSV file's path, basename, OR caller-supplied
  // filename. Different `--out` choices produce different basenames,
  // which would break manifest replay across runs to different outPaths
  // (Issue #387 first attempted to fix via `basename(csvPath)`, but the
  // basename itself varies by user input; truly path-independent output
  // is the only invariant-stable form). The HTML now describes the
  // co-located CSV without naming it; a user looking at the dashboard
  // can list the directory to find the file. Reviewer-bench depends on
  // this byte-stability for sensor replay verification.
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>${spec.signal} preview</title>
<body style="font-family: ui-monospace, monospace; padding: 24px; background: #111; color: #f5f5f5;">
  <h1>${spec.signal} preview</h1>
  <p>Loupe was unavailable, so Wittgenstein wrote the raw CSV sidecar instead.</p>
  <p>Open the matching <code>.csv</code> in this directory, or rerun with Python 3 available to get the interactive dashboard.</p>
</body>
</html>`;
}

async function spawnChecked(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
    });
  });
}
