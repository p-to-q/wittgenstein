// Loupe dashboard rendering — extracted from `render.ts` per #326 / #288.
//
// Encapsulates the 3-level fallback chain (loupe.py search → loupe_cli on PATH
// → static-HTML fallback) behind a single API. The renderer keeps the same
// `SensorRenderPath` outcome string so manifests and tests stay byte-stable.

import { access, writeFile } from "node:fs/promises";
import { basename, dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { SensorSignalSpec } from "./schema.js";

export type SensorRenderPath = "loupe-script" | "loupe-cli" | "fallback-static-html";

export interface LoupeRenderResult {
  htmlReady: boolean;
  renderPath: SensorRenderPath;
}

const moduleDir = dirname(fileURLToPath(import.meta.url));

/**
 * Default candidate locations for `loupe.py`, ordered from most-likely to
 * least-likely. The renderer probes each in turn and falls through to the
 * `loupe_cli` PATH lookup if none exist.
 */
function defaultLoupeSearchPaths(): string[] {
  return [
    resolvePath(moduleDir, "../../../../loupe.py"), // repo root
    resolvePath(moduleDir, "../loupe.py"), // package root
    resolvePath(process.cwd(), "loupe.py"), // cwd
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

function buildFallbackHtml(spec: SensorSignalSpec, csvPath: string): string {
  // Embed only the CSV file's basename, not its absolute path. Absolute
  // paths bake the run's output directory into the artifact bytes, which
  // breaks the "same IR + same seed → same bytes" reproducibility doctrine
  // (manifest replay across runs to different outPaths would diverge by
  // path bytes alone). The basename + the colocated layout (csv sits next
  // to the html) is enough for a user landing on the dashboard to find
  // the file (Issue #387).
  const csvBasename = basename(csvPath);
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8" />
<title>${spec.signal} preview</title>
<body style="font-family: ui-monospace, monospace; padding: 24px; background: #111; color: #f5f5f5;">
  <h1>${spec.signal} preview</h1>
  <p>Loupe was unavailable, so Wittgenstein wrote the raw CSV sidecar instead.</p>
  <p>Open <code>${csvBasename}</code> (next to this HTML file) or rerun with Python 3 available to get the interactive dashboard.</p>
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
