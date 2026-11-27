import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repo = fileURLToPath(new URL("../../../", import.meta.url));
let tmp: string;
let compiledRoot: string;
let compiledEntry: string;
let bundle: string;
let version: string;
const callerPackages = [
  null,
  "{malformed",
  JSON.stringify({ name: "another-app", version: "99.8.7" }),
];

beforeAll(async () => {
  tmp = await mkdtemp(join(tmpdir(), "witt-runtime-provenance-"));
  version = JSON.parse(await readFile(join(repo, "package.json"), "utf8")).version;
  await exec("pnpm", ["exec", "tsc", "-b", "packages/core"], { cwd: repo, timeout: 120_000 });
  compiledRoot = join(tmp, "compiled");
  const runtime = join(compiledRoot, "packages/core/dist/runtime");
  await mkdir(runtime, { recursive: true });
  await symlink(
    join(repo, "packages/core/node_modules"),
    join(compiledRoot, "node_modules"),
    "dir",
  );
  for (const name of ["runtime-version.js", "runtime-package.js", "errors.js"]) {
    await copyFile(join(repo, "packages/core/dist/runtime", name), join(runtime, name));
  }
  compiledEntry = pathToFileURL(join(runtime, "runtime-version.js")).href;
  await writeFile(
    join(compiledRoot, "package.json"),
    JSON.stringify({ name: "wittgenstein-monorepo", version, type: "module" }),
  );
  await exec(process.execPath, [join(repo, "packages/cli/scripts/bundle.mjs")], {
    cwd: repo,
    timeout: 120_000,
  });
  bundle = join(tmp, "standalone/bundle.cjs");
  await mkdir(dirname(bundle), { recursive: true });
  await copyFile(join(repo, "packages/cli/dist/bundle.cjs"), bundle);
}, 180_000);

afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("code-owned provenance across packaging", () => {
  it.each([false, true])(
    "standalone CJS doctor resolves optional peers relative to its bundle (installed: %s)",
    async (installed) => {
      const distribution = await mkdtemp(join(tmp, "doctor-distribution-"));
      const entry = join(distribution, "bundle.cjs");
      await copyFile(bundle, entry);
      const peer = join(distribution, "node_modules/onnxruntime-node");
      await mkdir(peer, { recursive: true });
      // Mask the compiled-ESM fixture's ancestor node_modules link in the missing case.
      await writeFile(
        join(peer, "package.json"),
        JSON.stringify({
          name: "onnxruntime-node",
          exports: installed ? "./index.js" : "./missing.js",
        }),
      );
      if (installed) await writeFile(join(peer, "index.js"), "module.exports = {};\n");
      const cwd = await mkdtemp(join(tmp, "doctor-caller-"));
      const { stdout, stderr } = await exec(process.execPath, [entry, "doctor"], {
        cwd,
        timeout: 30_000,
      });
      const doctor = JSON.parse(stdout);
      expect(stderr).toBe("");
      expect(doctor.ok).toBe(true);
      expect(doctor.imageDecoder.onnxRuntime.status).toBe(installed ? "ok" : "missing");
      if (installed)
        expect(doctor.imageDecoder.onnxRuntime.path).toBe(await realpath(join(peer, "index.js")));
    },
    45_000,
  );

  it.each(callerPackages)("compiled ESM ignores caller metadata %s", async (metadata) => {
    const cwd = await mkdtemp(join(tmp, "caller-"));
    if (metadata !== null) await writeFile(join(cwd, "package.json"), metadata);
    const { stdout } = await exec(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import {readRuntimeVersion} from ${JSON.stringify(compiledEntry)}; console.log(await readRuntimeVersion());`,
      ],
      { cwd },
    );
    expect(stdout.trim()).toBe(version);
  });

  it.each(callerPackages)(
    "standalone CJS CLI records its own version with caller %s",
    async (metadata) => {
      const cwd = await mkdtemp(join(tmp, "caller-"));
      if (metadata !== null) await writeFile(join(cwd, "package.json"), metadata);
      const { stdout } = await exec(
        process.execPath,
        [
          bundle,
          "sensor",
          "provenance regression",
          "--dry-run",
          "--seed",
          "42",
          "--duration-sec",
          "1",
          "--out",
          resolve(cwd, "sensor.json"),
        ],
        { cwd, timeout: 30_000 },
      );
      const outcome = JSON.parse(stdout);
      const manifest = JSON.parse(await readFile(join(outcome.runDir, "manifest.json"), "utf8"));
      const cliVersion = JSON.parse(
        await readFile(join(repo, "packages/cli/package.json"), "utf8"),
      ).version;
      expect(manifest.wittgensteinVersion).toBe(cliVersion);
      expect(manifest.ok).toBe(true);
      expect(manifest.gitSha).toBeNull();
      expect(manifest.lockfileHash).toBeNull();
    },
    45_000,
  );

  it.each([null, "{corrupt", JSON.stringify({ name: "wittgenstein-monorepo" })])(
    "compiled ESM rejects invalid own metadata %s",
    async (metadata) => {
      const ownPath = join(compiledRoot, "package.json");
      // Keep ESM interpretation separate so malformed package metadata reaches our boundary.
      await writeFile(join(compiledRoot, "packages/core/package.json"), '{"type":"module"}');
      if (metadata === null) await rm(ownPath);
      else await writeFile(ownPath, metadata);
      const { stdout } = await exec(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import {readRuntimeVersion} from ${JSON.stringify(compiledEntry)}; try { await readRuntimeVersion(); process.exit(1); } catch (e) { console.log(e.code); }`,
        ],
        { cwd: tmp },
      );
      expect(stdout.trim()).toBe("RUNTIME_VERSION_INVALID");
    },
  );
});
