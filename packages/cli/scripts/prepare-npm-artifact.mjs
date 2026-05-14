/**
 * Writes `npm-publish/` — a self-contained package (no workspace:*)
 * suitable for `cd npm-publish && npm publish`.
 */
import { chmod, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const cliRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(cliRoot, "npm-publish");
const bundleSrc = resolve(cliRoot, "dist/bundle.cjs");
const readmeSrc = resolve(cliRoot, "README.md");
const optionalPeerSources = [resolve(cliRoot, "../codec-image/package.json")];

const pkg = JSON.parse(await readFile(resolve(cliRoot, "package.json"), "utf8"));
const version = pkg.version === "0.0.0" ? "0.1.0" : pkg.version;
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
  description:
    "Wittgenstein modality harness CLI — codecs, run manifests, Minimax text→ASCII PNG post-process.",
  license: "Apache-2.0",
  type: "module",
  bin: {
    wittgenstein: "./bin/wittgenstein.mjs",
  },
  files: ["dist/bundle.cjs", "bin/wittgenstein.mjs", "README.md"],
  engines: {
    node: ">=20.19.0",
  },
  keywords: ["wittgenstein", "cli", "llm", "codec", "minimax"],
  ...optionalPeerContract,
};

await mkdir(resolve(outDir, "dist"), { recursive: true });
await mkdir(resolve(outDir, "bin"), { recursive: true });
await copyFile(bundleSrc, resolve(outDir, "dist/bundle.cjs"));
await chmod(resolve(outDir, "dist/bundle.cjs"), 0o755);
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
  `Prepared ${outDir} (${slim.name}@${slim.version}). Run: cd npm-publish && npm publish`,
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
