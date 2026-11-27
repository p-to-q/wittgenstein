/** Verify the public distribution before npm/GitHub publication. No publish by default. */
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs, promisify } from "node:util";
import { z } from "zod";

const exec = promisify(execFile);
const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const identifier = "(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)";
const version = z
  .string()
  .regex(
    new RegExp(
      `^(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-${identifier}(?:\\.${identifier})*)?$`,
    ),
  );
const packageVersion = z.object({ version });
const buildSchema = z.object({
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  lockfileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  dirty: z.boolean(),
});

export function assertBuildProvenance(input, source, requireClean) {
  const build = buildSchema.parse(input);
  if (
    build.sourceCommit !== source.commit ||
    build.lockfileSha256 !== source.lockfileSha256 ||
    build.dirty !== source.dirty ||
    (requireClean && (build.dirty || source.dirty))
  ) {
    throw new Error(
      "RELEASE_BUILD_MISMATCH: rebuild from the exact clean release commit and lockfile",
    );
  }
  return build;
}
const publishedVersion = z.object({
  name: z.literal("wittgenstein-cli"),
  version,
  dist: z.object({ integrity: z.string().startsWith("sha512-") }),
});
const registrySchema = z.object({
  "dist-tags": z.record(z.string()),
  versions: z.record(z.unknown()),
});
const packedSchema = z
  .array(
    z.object({
      filename: z.string(),
      name: z.literal("wittgenstein-cli"),
      version,
      integrity: z.string().startsWith("sha512-"),
    }),
  )
  .length(1);
const alignmentSchema = z.object({
  root: version,
  cli: version,
  artifact: version,
  binary: version,
  tag: z.string(),
  name: z.literal("wittgenstein-cli"),
  integrity: z.string().startsWith("sha512-"),
});

export function releaseChannel(value) {
  return version.parse(value).includes("-") ? "next" : "latest";
}

export function assertReleaseAlignment(input) {
  const local = alignmentSchema.parse(input);
  if (
    new Set([local.root, local.cli, local.artifact, local.binary]).size !== 1 ||
    local.tag !== `v${local.root}`
  ) {
    throw new Error(`RELEASE_VERSION_MISMATCH: ${JSON.stringify(local)}`);
  }
  return { ...local, channel: releaseChannel(local.root) };
}

export function assertPublishedArtifact(document, local) {
  const registry = registrySchema.parse(document);
  if (registry.versions[local.root] === undefined) {
    throw new Error(`RELEASE_NPM_VERSION_MISSING: wittgenstein-cli@${local.root}`);
  }
  const published = publishedVersion.parse(registry.versions[local.root]);
  if (published.version !== local.root || published.dist.integrity !== local.integrity) {
    throw new Error(
      "RELEASE_NPM_ARTIFACT_MISMATCH: registry version/integrity differs from the checked tarball",
    );
  }
  if (registry["dist-tags"][local.channel] !== local.root) {
    throw new Error(`RELEASE_NPM_CHANNEL_MISMATCH: ${local.channel} does not select ${local.root}`);
  }
  return {
    name: published.name,
    version: published.version,
    integrity: published.dist.integrity,
    channel: local.channel,
  };
}

async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function command(file, args, cwd = repository) {
  const result = await exec(file, args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 120_000,
  });
  return result.stdout.trim();
}
async function sourceState() {
  return {
    commit: await command("git", ["rev-parse", "HEAD"]),
    dirty: Boolean(await command("git", ["status", "--porcelain"])),
    lockfileSha256: createHash("sha256")
      .update(await readFile(join(repository, "pnpm-lock.yaml")))
      .digest("hex"),
  };
}
async function publicRegistry() {
  const response = await fetch("https://registry.npmjs.org/wittgenstein-cli", {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`RELEASE_REGISTRY_UNAVAILABLE: HTTP ${response.status}`);
  return registrySchema.parse(await response.json());
}

export async function checkRelease(options = {}) {
  const root = packageVersion.parse(await json(join(repository, "package.json")));
  const cli = packageVersion.parse(await json(join(repository, "packages/cli/package.json")));
  if (root.version !== cli.version)
    throw new Error(`RELEASE_VERSION_MISMATCH: root ${root.version}, CLI ${cli.version}`);
  const source = await sourceState();
  if (options.publishNpm && source.dirty)
    throw new Error("RELEASE_DIRTY_SOURCE: commit changes before publishing");
  const out = join(
    repository,
    "artifacts/runs",
    `release-${root.version}-${Date.now()}-${randomUUID().slice(0, 8)}`,
  );
  await mkdir(out, { recursive: true });
  const receipt = { source, checkedAt: new Date().toISOString(), status: "checking" };
  let staging;
  try {
    const packed = packedSchema.parse(
      JSON.parse(
        await command("npm", [
          "pack",
          "./packages/cli/npm-publish",
          "--ignore-scripts",
          "--json",
          "--pack-destination",
          out,
        ]),
      ),
    )[0];
    if (basename(packed.filename) !== packed.filename)
      throw new Error("RELEASE_PACK_INVALID: nonlocal tarball filename");
    const tarball = join(out, packed.filename);
    const integrity = `sha512-${createHash("sha512")
      .update(await readFile(tarball))
      .digest("base64")}`;
    if (integrity !== packed.integrity)
      throw new Error("RELEASE_PACK_INVALID: tarball differs from npm pack receipt");
    const entries = (await command("tar", ["-tzf", tarball])).split("\n");
    if (entries.some((entry) => !entry.startsWith("package/") || entry.split("/").includes("..")))
      throw new Error("RELEASE_PACK_INVALID: unsafe archive entry");
    staging = await mkdtemp(join(tmpdir(), "witt-release-"));
    await command("tar", ["-xzf", tarball, "-C", staging]);
    const artifact = publishedVersion
      .omit({ dist: true })
      .extend({ wittgensteinBuild: buildSchema })
      .parse(await json(join(staging, "package/package.json")));
    receipt.build = assertBuildProvenance(
      artifact.wittgensteinBuild,
      source,
      options.publishNpm || options.requireNpm,
    );
    const binary = await command(
      process.execPath,
      [join(staging, "package/bin/wittgenstein.mjs"), "--version"],
      staging,
    );
    const local = assertReleaseAlignment({
      root: root.version,
      cli: cli.version,
      artifact: artifact.version,
      binary,
      tag: options.tag ?? `v${root.version}`,
      name: artifact.name,
      integrity,
    });
    if (packed.version !== local.root)
      throw new Error("RELEASE_PACK_INVALID: pack receipt version differs");
    Object.assign(receipt, { local, tarball, pack: packed });
    // --version alone does not exercise module-relative runtime/optional-peer probes.
    receipt.doctor = z
      .object({
        ok: z.literal(true),
        nodeSatisfied: z.literal(true),
        imageDecoder: z.object({ status: z.enum(["ready", "blocked", "not-selected"]) }),
      })
      .parse(
        JSON.parse(
          await command(
            process.execPath,
            [join(staging, "package/bin/wittgenstein.mjs"), "doctor"],
            staging,
          ),
        ),
      );
    await writeFile(join(out, "pack.json"), `${JSON.stringify(packed, null, 2)}\n`);
    if (options.publishNpm) {
      const registry = await publicRegistry();
      if (registry.versions[local.root] !== undefined) {
        // Reconcile a prior successful/uncertain publish; never overwrite or blindly retry it.
        receipt.published = assertPublishedArtifact(registry, local);
      } else {
        const now = await sourceState();
        if (
          now.dirty ||
          now.commit !== source.commit ||
          now.lockfileSha256 !== source.lockfileSha256
        )
          throw new Error("RELEASE_SOURCE_CHANGED: source changed before publication");
        await command("npm", ["publish", tarball, "--ignore-scripts", "--tag", local.channel]);
        receipt.published = assertPublishedArtifact(await publicRegistry(), local);
      }
    } else if (options.requireNpm) {
      receipt.published = assertPublishedArtifact(await publicRegistry(), local);
    }
    receipt.status = receipt.published ? "public-npm-verified" : "local-only";
    return { ...receipt, receipt: join(out, "release.json") };
  } catch (error) {
    receipt.status = "failed";
    receipt.error = error.message;
    throw error;
  } finally {
    await writeFile(join(out, "release.json"), `${JSON.stringify(receipt, null, 2)}\n`);
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({
      options: {
        tag: { type: "string" },
        "require-npm": { type: "boolean" },
        "publish-npm": { type: "boolean" },
      },
    });
    console.log(
      JSON.stringify(
        await checkRelease({
          tag: values.tag,
          requireNpm: values["require-npm"],
          publishNpm: values["publish-npm"],
        }),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
