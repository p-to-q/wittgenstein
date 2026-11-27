/**
 * Writes `npm-publish/` — a self-contained package (no workspace:*)
 * for the guarded public CLI release flow.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(cliRoot, "npm-publish");
const bundleSrc = resolve(cliRoot, "dist/bundle.cjs");
const loupeSrc = resolve(cliRoot, "dist/loupe.py");
const readmeSrc = resolve(cliRoot, "README.md");
const optionalPeerSources = [resolve(cliRoot, "../codec-image/package.json")];

const pkg = JSON.parse(await readFile(resolve(cliRoot, "package.json"), "utf8"));
const release = JSON.parse(await readFile(resolve(cliRoot, "../../package.json"), "utf8"));
if (pkg.version !== release.version) {
  throw new Error(`RELEASE_VERSION_MISMATCH: root ${release.version}, CLI ${pkg.version}`);
}
const version = release.version;
const exec = promisify(execFile);
const repoRoot = resolve(cliRoot, "../..");
const { stdout: sourceCommit } = await exec("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
const { stdout: sourceStatus } = await exec("git", ["status", "--porcelain"], { cwd: repoRoot });
const wittgensteinBuild = {
  sourceCommit: sourceCommit.trim(),
  lockfileSha256: createHash("sha256")
    .update(await readFile(resolve(repoRoot, "pnpm-lock.yaml")))
    .digest("hex"),
  dirty: Boolean(sourceStatus.trim()),
};
const optionalPeerContract = await loadOptionalPeerContract(optionalPeerSources);

const binStub = `#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const d = dirname(fileURLToPath(import.meta.url));
const bundled = resolve(d, "../dist/bundle.cjs");
const r = spawnSync(process.execPath, [bundled, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
`;

const slim = {
  name: "wittgenstein-cli",
  version,
  wittgensteinBuild,
  description:
    "Wittgenstein modality harness CLI — codecs, run manifests, Minimax text→ASCII PNG post-process.",
  license: pkg.license,
  homepage: pkg.homepage,
  repository: pkg.repository,
  bugs: pkg.bugs,
  type: "module",
  bin: {
    wittgenstein: "./bin/wittgenstein.mjs",
  },
  files: ["dist/bundle.cjs", "dist/loupe.py", "bin/wittgenstein.mjs", "README.md"],
  engines: {
    node: ">=22.22.0",
  },
  keywords: ["wittgenstein", "cli", "llm", "codec", "minimax"],
  ...optionalPeerContract,
};

await mkdir(resolve(outDir, "dist"), { recursive: true });
await mkdir(resolve(outDir, "bin"), { recursive: true });
await copyFile(bundleSrc, resolve(outDir, "dist/bundle.cjs"));
await chmod(resolve(outDir, "dist/bundle.cjs"), 0o755);
await copyFile(loupeSrc, resolve(outDir, "dist/loupe.py"));
const binPath = resolve(outDir, "bin/wittgenstein.mjs");
await writeFile(binPath, binStub, "utf8");
await chmod(binPath, 0o755);
try {
  await copyFile(readmeSrc, resolve(outDir, "README.md"));
} catch {
  await writeFile(resolve(outDir, "README.md"), "# wittgenstein-cli\n\nSee repository docs.\n");
}
await writeFile(resolve(outDir, "package.json"), `${JSON.stringify(slim, null, 2)}\n`);
console.log(
  `Prepared ${outDir} (${slim.name}@${slim.version}). Validate from the repo root with pnpm release:check`,
);

async function loadOptionalPeerContract(packageJsonPaths) {
  const peerDependencies = {};
  const peerDependenciesMeta = {};

  for (const packageJsonPath of packageJsonPaths) {
    const source = JSON.parse(await readFile(packageJsonPath, "utf8"));
    for (const [name, range] of Object.entries(source.peerDependencies ?? {})) {
      if (source.peerDependenciesMeta?.[name]?.optional !== true) continue;
      peerDependencies[name] = range;
      peerDependenciesMeta[name] = { optional: true };
    }
  }

  if (Object.keys(peerDependencies).length === 0) {
    return {};
  }

  return {
    peerDependencies,
    peerDependenciesMeta,
  };
}
