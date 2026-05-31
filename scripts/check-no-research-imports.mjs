#!/usr/bin/env node
// CI guard: verify no file under packages/<pkg>/src/ imports from
// training/research Python surfaces. The training stack lives in
// research/training/ plus the narrow python/image_adapter trainer and MUST
// stay outside the npm publish surface — packages depend on core/codec-*
// only, never on training code.
//
// Per the delivery doctrine
// (docs/research/2026-05-13-delivery-and-componentization.md):
//
//     Training scripts may import from packages/<pkg> (one-way dep,
//     contributor uses the harness inside training jobs). No file
//     under packages/<pkg>/src/ may import from training/research Python.
//
// Run: node scripts/check-no-research-imports.mjs
// Exits 0 on clean, 1 on any forbidden import.

import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const packagesDir = resolve(repoRoot, "packages");

const IMPORT_PATTERNS = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
];

const SKIP_DIRS = new Set(["node_modules", "dist", ".tsbuildinfo", "__snapshots__"]);

async function* walkSource(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkSource(path);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      yield path;
    }
  }
}

function findImports(text) {
  const out = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      out.add(m[1]);
    }
  }
  return out;
}

function normalizeRel(path) {
  return path.split("\\").join("/");
}

function isTrainingSurfaceRel(rel) {
  const normalized = normalizeRel(rel);
  return (
    normalized === "research" ||
    normalized.startsWith("research/") ||
    normalized === "python" ||
    normalized.startsWith("python/")
  );
}

function importsTrainingSurface(specifier, filePath) {
  // Relative imports: resolve and check if the target lands inside a
  // training/research Python surface.
  if (specifier.startsWith(".")) {
    const targetAbs = resolve(dirname(filePath), specifier);
    return isTrainingSurfaceRel(relative(repoRoot, targetAbs));
  }
  // Absolute import specifiers: catch repo-root `/research/...` or
  // `/python/...` imports and absolute filesystem paths that resolve inside
  // this checkout's training/research Python surfaces.
  if (specifier.startsWith("/")) {
    if (
      specifier === "/research" ||
      specifier.startsWith("/research/") ||
      specifier === "/python" ||
      specifier.startsWith("/python/")
    ) {
      return true;
    }
    return isTrainingSurfaceRel(relative(repoRoot, specifier));
  }
  // Package names: look for any hint at the training surfaces — we don't
  // publish @wittgenstein/research, @wittgenstein/training, or repo-root
  // python packages, so any such bare specifier is a leak.
  return /^research\/|^python\/|^@wittgenstein\/(?:research|training)\//.test(specifier);
}

async function main() {
  const violations = [];
  try {
    await stat(packagesDir);
  } catch {
    process.stdout.write("ℹ no packages/ directory — nothing to check.\n");
    process.exit(0);
  }

  // Walk each packages/*/src/ tree.
  const packageEntries = await readdir(packagesDir, { withFileTypes: true });
  for (const pkg of packageEntries) {
    if (!pkg.isDirectory()) continue;
    const srcDir = resolve(packagesDir, pkg.name, "src");
    try {
      await stat(srcDir);
    } catch {
      continue;
    }
    for await (const file of walkSource(srcDir)) {
      const text = await readFile(file, "utf8");
      const imports = findImports(text);
      for (const spec of imports) {
        if (importsTrainingSurface(spec, file)) {
          violations.push({
            file: relative(repoRoot, file),
            spec,
          });
        }
      }
    }
  }

  if (violations.length === 0) {
    process.stdout.write(
      "✓ no packages/*/src file imports from training/research Python surfaces.\n",
    );
    process.exit(0);
  }

  const violationSummary =
    `✗ ${violations.length} forbidden training/research ` + "Python import(s):\n\n";
  process.stderr.write(violationSummary);
  for (const v of violations) {
    process.stderr.write(`  ${v.file}\n    imports: ${v.spec}\n`);
  }
  process.stderr.write(
    "\nTraining code lives in research/training/ or python/image_adapter/ and stays\n" +
      "outside the npm publish surface. See " +
      "docs/research/2026-05-13-delivery-and-componentization.md.\n",
  );
  process.exit(1);
}

main().catch((error) => {
  process.stderr.write(`check-no-research-imports crashed: ${error?.message ?? String(error)}\n`);
  process.exit(2);
});
