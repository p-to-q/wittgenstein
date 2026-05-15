#!/usr/bin/env node
/**
 * CI guard: verify the npm tarball for each publishable package excludes
 * training-tier files.
 *
 * Per the delivery doctrine
 * (`docs/research/2026-05-13-delivery-and-componentization.md`), a user
 * running `npm install @wittgenstein/cli` must never pull in `research/`,
 * `bench/`, `examples/`, or large binary artifacts. This guard runs
 * `npm pack --dry-run --json` per publishable package and verifies the
 * file list contains none of those.
 *
 * Run: `node scripts/check-npm-publish-tarball.mjs`
 * Exits 0 on clean, 1 on any leak (with offending package + file).
 */

import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const bundledCliManifestPath = resolve(repoRoot, "packages/cli/npm-publish/package.json");
const optionalPeerSourcePaths = [resolve(repoRoot, "packages/codec-image/package.json")];
const npmCacheDir = mkdtempSync(join(tmpdir(), "wittgenstein-npm-pack-cache-"));
let npmCacheRemoved = false;

function removeNpmCacheDir() {
  if (npmCacheRemoved) return;
  npmCacheRemoved = true;
  try {
    rmSync(npmCacheDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup; a temp-cache removal failure should not mask the guard result.
  }
}

process.once("exit", removeNpmCacheDir);
process.once("SIGINT", () => {
  removeNpmCacheDir();
  process.exit(130);
});
process.once("SIGTERM", () => {
  removeNpmCacheDir();
  process.exit(143);
});
process.once("uncaughtException", (error) => {
  removeNpmCacheDir();
  throw error;
});

/** Per-file patterns that MUST NOT appear in any published tarball. */
const FORBIDDEN_PATTERNS = [
  /^research\//,
  /^bench\//,
  /^examples\//,
  /\.pt$/,
  /\.ckpt$/,
  /\.safetensors$/,
  /\.onnx$/,
];

/** Size cap (MB). Files larger than this in a tarball trigger a leak even if extension is OK. */
const SIZE_LIMIT_MB = 10;

async function findPublishablePackages() {
  const dir = resolve(repoRoot, "packages");
  const entries = await readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const pkgJsonPath = resolve(dir, entry.name, "package.json");
    let pkg;
    try {
      pkg = await readJson(pkgJsonPath);
    } catch {
      continue;
    }
    if (pkg.private === true) continue;
    if (!pkg.name) continue;
    out.push({ name: pkg.name, dir: resolve(dir, entry.name) });
  }
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function tarballFiles(packageDir) {
  const { stdout } = await execFileAsync(
    "npm",
    ["pack", "--dry-run", "--json", "--loglevel=silent"],
    {
      cwd: packageDir,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: npmCacheDir,
      },
      maxBuffer: 32 * 1024 * 1024,
    },
  );
  // `npm pack` runs the package's `prepack` script and that script's stdout
  // (e.g. "> @wittgenstein/cli@0.1.0 build" then tsc output) bleeds into the
  // captured stream before the JSON payload. The JSON we want is an array,
  // so peel off anything before the first `[` and trim trailing noise.
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("npm pack did not emit a JSON array");
  }
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  if (!Array.isArray(parsed) || parsed.length === 0) return [];
  return parsed[0].files ?? [];
}

function collectTarballLeaks(packageName, files) {
  const leaks = [];
  for (const file of files) {
    const path = file.path ?? String(file);
    const size = typeof file.size === "number" ? file.size : 0;

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(path)) {
        leaks.push({
          package: packageName,
          file: path,
          reason: `matches forbidden pattern ${pattern}`,
        });
      }
    }

    if (size > SIZE_LIMIT_MB * 1024 * 1024) {
      leaks.push({
        package: packageName,
        file: path,
        reason: `size ${(size / 1024 / 1024).toFixed(2)} MB exceeds ${SIZE_LIMIT_MB} MB limit`,
      });
    }
  }
  return leaks;
}

async function buildPackageClosure(packageName) {
  // `npm pack` runs each package's prepack script from a clean CI workspace.
  // Build workspace dependencies first so package-reference d.ts files exist.
  await execFileAsync("pnpm", ["--filter", `${packageName}...`, "build"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function prepareBundledCliArtifact() {
  await execFileAsync("pnpm", ["--filter", "@wittgenstein/cli", "run", "release:npm"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

async function expectedBundledOptionalPeerContract() {
  const peerDependencies = {};
  const peerDependenciesMeta = {};

  for (const packageJsonPath of optionalPeerSourcePaths) {
    const source = await readJson(packageJsonPath);
    for (const [name, range] of Object.entries(source.peerDependencies ?? {})) {
      if (source.peerDependenciesMeta?.[name]?.optional !== true) continue;
      peerDependencies[name] = range;
      peerDependenciesMeta[name] = { optional: true };
    }
  }

  return { peerDependencies, peerDependenciesMeta };
}

async function bundledCliManifestFailures() {
  const manifest = await readJson(bundledCliManifestPath);
  const expected = await expectedBundledOptionalPeerContract();
  const failures = [];

  for (const [name, range] of Object.entries(expected.peerDependencies)) {
    if (manifest.peerDependencies?.[name] !== range) {
      failures.push(
        `peerDependencies.${name} must mirror optional runtime peer range ${range} from codec package manifests.`,
      );
    }
    if (manifest.peerDependenciesMeta?.[name]?.optional !== true) {
      failures.push(
        `peerDependenciesMeta.${name}.optional must be true in the bundled CLI manifest.`,
      );
    }
  }

  for (const name of Object.keys(manifest.peerDependencies ?? {})) {
    if (expected.peerDependencies[name] === undefined) {
      failures.push(
        `peerDependencies.${name} is not sourced from a bundled optional runtime peer.`,
      );
    }
  }

  if (manifest.dependencies !== undefined) {
    failures.push(
      "bundled CLI manifest must not add runtime dependencies to the default install path.",
    );
  }
  if (manifest.optionalDependencies !== undefined) {
    failures.push(
      "bundled CLI manifest must use optional peer metadata, not optionalDependencies, for tiered runtimes.",
    );
  }
  if (!manifest.files?.includes("dist/loupe.py")) {
    failures.push("bundled CLI manifest must include dist/loupe.py for sensor CSV→HTML rendering.");
  }

  return failures;
}

async function main() {
  const packages = await findPublishablePackages();
  if (packages.length === 0) {
    process.stdout.write("ℹ no publishable packages (every packages/*/package.json is private).\n");
    process.exit(0);
  }

  const leaks = [];
  const packFailures = [];
  for (const pkg of packages) {
    let files;
    try {
      await buildPackageClosure(pkg.name);
    } catch (error) {
      packFailures.push({
        package: pkg.name,
        phase: "workspace build",
        error: error?.message ?? String(error),
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      });
      continue;
    }

    try {
      files = await tarballFiles(pkg.dir);
    } catch (error) {
      packFailures.push({
        package: pkg.name,
        phase: "npm pack dry-run",
        error: error?.message ?? String(error),
        stdout: error?.stdout ?? "",
        stderr: error?.stderr ?? "",
      });
      continue;
    }

    leaks.push(...collectTarballLeaks(pkg.name, files));
  }

  try {
    await prepareBundledCliArtifact();
    for (const error of await bundledCliManifestFailures()) {
      packFailures.push({
        package: "wittgenstein-cli",
        phase: "generated manifest",
        error,
        stdout: "",
        stderr: "",
      });
    }
    leaks.push(
      ...collectTarballLeaks(
        "wittgenstein-cli",
        await tarballFiles(dirname(bundledCliManifestPath)),
      ),
    );
  } catch (error) {
    packFailures.push({
      package: "wittgenstein-cli",
      phase: "release:npm artifact generation or npm pack dry-run",
      error: error?.message ?? String(error),
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? "",
    });
  }

  if (packFailures.length > 0) {
    process.stderr.write(`✗ ${packFailures.length} publishability failure(s):\n\n`);
    for (const failure of packFailures) {
      process.stderr.write(`  [${failure.package}] ${failure.phase}\n    → ${failure.error}\n`);
      if (failure.stderr) {
        process.stderr.write(`    stderr:\n${indent(failure.stderr.slice(0, 2000), "      ")}\n`);
      }
      if (failure.stdout) {
        process.stderr.write(`    stdout:\n${indent(failure.stdout.slice(0, 2000), "      ")}\n`);
      }
    }
    process.stderr.write(
      "\nThe publish-surface guard must inspect every publishable tarball. A failed\n" +
        "npm pack dry-run is a guard failure, not a skipped package.\n",
    );
    process.exit(1);
  }

  if (leaks.length === 0) {
    process.stdout.write(
      `✓ ${packages.length} publishable package(s) clean — no research/, bench/, examples/, large binaries.\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`✗ ${leaks.length} leak(s) in publishable tarballs:\n\n`);
  for (const leak of leaks) {
    process.stderr.write(`  [${leak.package}]  ${leak.file}\n    → ${leak.reason}\n`);
  }
  process.stderr.write(
    "\nA published npm tarball must not contain training-tier files. See:\n" +
      "  docs/research/2026-05-13-delivery-and-componentization.md\n" +
      "  research/training/README.md\n",
  );
  process.exit(1);
}

function indent(text, prefix) {
  return text
    .trimEnd()
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

main().catch((error) => {
  process.stderr.write(`check-npm-publish-tarball crashed: ${error?.message ?? String(error)}\n`);
  process.exit(2);
});
