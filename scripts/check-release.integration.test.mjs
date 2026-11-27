import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = "0.3.0-alpha.4";

async function fixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "witt-release-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const root = join(temporary, "repository");
  await mkdir(join(root, "scripts"), { recursive: true });
  await mkdir(join(root, "packages/cli"), { recursive: true });
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "junction");
  await copyFile(
    join(repository, "scripts/check-release.mjs"),
    join(root, "scripts/check-release.mjs"),
  );
  await writeFile(join(root, "package.json"), JSON.stringify({ private: true, version }));
  await writeFile(join(root, "packages/cli/package.json"), JSON.stringify({ version }));
  await writeFile(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  await writeFile(
    join(root, ".gitignore"),
    "artifacts/\nnode_modules/\npackages/cli/npm-publish/\n",
  );
  await writeFile(join(root, ".npmrc"), "registry=https://private.example.invalid/\n");
  for (const name of ["user.npmrc", "global.npmrc"]) await writeFile(join(temporary, name), "");
  const git = (args) => exec("git", args, { cwd: root });
  await git(["init", "--quiet"]);
  await git(["add", "."]);
  await git([
    "-c",
    "user.name=Release Test",
    "-c",
    "user.email=release-test@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  const { stdout: commit } = await git(["rev-parse", "HEAD"]);
  const artifact = join(root, "packages/cli/npm-publish");
  await mkdir(join(artifact, "bin"), { recursive: true });
  await writeFile(
    join(artifact, "package.json"),
    JSON.stringify({
      name: "wittgenstein-cli",
      version,
      wittgensteinBuild: {
        sourceCommit: commit.trim(),
        dirty: false,
        lockfileSha256: createHash("sha256")
          .update(await readFile(join(root, "pnpm-lock.yaml")))
          .digest("hex"),
      },
    }),
  );
  await writeFile(
    join(artifact, "bin/wittgenstein.mjs"),
    `console.log(process.argv[2] === "--version" ? ${JSON.stringify(version)} : JSON.stringify({ok:true,nodeSatisfied:true,imageDecoder:{status:"not-selected"}}));`,
  );
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^npm_config_|^(NPM_TOKEN|NODE_AUTH_TOKEN|NODE_OPTIONS)$/i.test(key),
    ),
  );
  Object.assign(env, {
    npm_config_userconfig: join(temporary, "user.npmrc"),
    npm_config_globalconfig: join(temporary, "global.npmrc"),
    npm_config_cache: join(temporary, "npm-cache"),
    npm_config_registry: "https://environment.example.invalid/",
  });
  return { root, temporary, env };
}

for (const configuration of ["environment", "project"]) {
  test(`public release ignores ${configuration} registry configuration (dry-run only)`, async (t) => {
    const { root, temporary, env } = await fixture(t);
    if (configuration === "project") delete env.npm_config_registry;
    const trace = join(temporary, "publish.json");
    const probe = join(temporary, "probe.mjs");
    // Exercise npm's real target selection, but force every intercepted publish to dry-run.
    // No publish request, lifecycle script, or registry fetch can run in this fixture.
    await writeFile(
      probe,
      `
    import childProcess from "node:child_process";
    import { syncBuiltinESMExports } from "node:module";
    import { writeFileSync } from "node:fs";
    import { promisify } from "node:util";
    const original = childProcess.execFile;
    childProcess.execFile = function (file, args, options, callback) {
      if (file === "npm" && args[0] === "publish") {
        return original(file, [...args, "--dry-run"], options, (error, stdout, stderr) => {
          writeFileSync(${JSON.stringify(trace)}, JSON.stringify({stdout,stderr,error:error?.message}));
          callback(error, stdout, stderr);
        });
      }
      return original(file, args, options, callback);
    };
    childProcess.execFile[promisify.custom] = (file, args, options) => new Promise((resolve, reject) => {
      childProcess.execFile(file, args, options, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({stdout, stderr});
      });
    });
    syncBuiltinESMExports();
    globalThis.fetch = async (url) => {
      if (url !== "https://registry.npmjs.org/wittgenstein-cli") throw new Error("Unexpected registry request");
      return new Response(JSON.stringify({"dist-tags":{},versions:{}}));
    };
  `,
    );
    await assert.rejects(
      exec(process.execPath, ["--import", probe, "scripts/check-release.mjs", "--publish-npm"], {
        cwd: root,
        env,
      }),
      /RELEASE_NPM_VERSION_MISSING/,
    );
    const published = JSON.parse(await readFile(trace, "utf8"));
    assert.equal(published.error, undefined);
    assert.match(
      published.stderr,
      /Publishing to https:\/\/registry\.npmjs\.org\/ with tag next.*\(dry-run\)/,
    );
    assert.doesNotMatch(
      published.stderr,
      /Publishing to https:\/\/(environment|private)\.example\.invalid/,
    );
  });
}

for (const scenario of [
  {
    name: "version mismatch",
    error: /RELEASE_VERSION_MISMATCH/,
    change: (root) =>
      writeFile(join(root, "packages/cli/package.json"), JSON.stringify({ version: "0.1.0" })),
  },
  {
    name: "invalid JSON",
    error: /JSON/,
    change: (root) => writeFile(join(root, "packages/cli/package.json"), "{"),
  },
  { name: "missing lockfile", error: /ENOENT/, change: (root) => rm(join(root, "pnpm-lock.yaml")) },
  {
    name: "dirty source",
    error: /RELEASE_DIRTY_SOURCE/,
    change: (root) =>
      writeFile(join(root, ".npmrc"), "registry=https://changed.example.invalid/\n"),
  },
]) {
  test(`record ${scenario.name} before npm pack runs`, async (t) => {
    const { root, env } = await fixture(t);
    await scenario.change(root);
    let failure;
    await assert.rejects(
      exec(process.execPath, ["scripts/check-release.mjs", "--publish-npm"], { cwd: root, env }),
      (error) => {
        failure = error;
        assert.match(error.stderr, scenario.error);
        return true;
      },
    );
    const runs = join(root, "artifacts/runs");
    const directories = await readdir(runs);
    assert.equal(directories.length, 1);
    const output = join(runs, directories[0]);
    assert.deepEqual(await readdir(output), ["release.json"]);
    const receipt = JSON.parse(await readFile(join(output, "release.json"), "utf8"));
    assert.equal(receipt.status, "failed");
    assert.match(receipt.error, scenario.error);
    assert.ok(Number.isFinite(Date.parse(receipt.checkedAt)));
    assert.ok(
      failure.stderr.includes(join(output, "release.json")),
      "print the failed receipt path",
    );
    if (scenario.name === "dirty source") assert.equal(receipt.source.dirty, true);
    else assert.equal(receipt.source, null);
  });
}
