import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { RunManifestSchema, type RunManifest } from "@wittgenstein/schemas";
import { WittgensteinError } from "./errors.js";

const execFileAsync = promisify(execFile);

export interface RuntimeFingerprint {
  gitSha: string | null;
  lockfileHash: string | null;
  nodeVersion: string;
  wittgensteinVersion: string;
}

export async function collectRuntimeFingerprint(cwd: string): Promise<RuntimeFingerprint> {
  const rootPackageJsonPath = resolve(cwd, "package.json");
  const lockfilePath = resolve(cwd, "pnpm-lock.yaml");

  const [gitSha, lockfileHash, wittgensteinVersion] = await Promise.all([
    readGitSha(cwd),
    hashFile(lockfilePath),
    readWittgensteinVersion(rootPackageJsonPath),
  ]);

  return {
    gitSha,
    lockfileHash,
    nodeVersion: process.version,
    wittgensteinVersion,
  };
}

export async function hashFile(filePath: string): Promise<string | null> {
  try {
    const data = await readFile(filePath);
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}

/**
 * Like `hashFile` but throws an inspectable, typed error when the file can't
 * be read. Use this when a `null` digest would silently violate the manifest's
 * `artifactSha256` invariant — e.g. after a v1 codec render step that promised
 * to write `artifactPath` (Issue #345, doctrine: no silent fallbacks).
 */
export async function hashFileOrThrow(filePath: string): Promise<string> {
  const digest = await hashFile(filePath);
  if (digest === null) {
    throw new WittgensteinError(
      "ARTIFACT_HASH_FAILED",
      `Could not hash artifact at ${filePath}. The codec render step promised this path, but the file is missing or unreadable. The manifest cannot be honestly written with artifactSha256 = null.`,
      { details: { artifactPath: filePath } },
    );
  }
  return digest;
}

async function readGitSha(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Fail-closed counterpart of the old day-one behavior (commit 43218ca), which
 * returned a forged `"0.0.0"` whenever package.json was unreadable, unparsable,
 * or lacked a version field. `wittgensteinVersion` is replay provenance: a run
 * that cannot state which version produced it cannot honestly claim one
 * (doctrine: no silent fallbacks).
 */
async function readWittgensteinVersion(packageJsonPath: string): Promise<string> {
  let parsed: { version?: unknown };
  try {
    const raw = await readFile(packageJsonPath, "utf8");
    parsed = JSON.parse(raw) as { version?: unknown };
  } catch (cause) {
    throw new WittgensteinError(
      "MANIFEST_VERSION_UNREADABLE",
      `Could not read the wittgenstein version from ${packageJsonPath} ` +
        `(${cause instanceof Error ? cause.message : String(cause)}). The manifest's ` +
        `wittgensteinVersion field is provenance for replay, so a run without a readable ` +
        `version refuses to start instead of fabricating one.`,
      { cause, details: { packageJsonPath } },
    );
  }

  if (typeof parsed.version !== "string") {
    throw new WittgensteinError(
      "MANIFEST_VERSION_UNREADABLE",
      `package.json at ${packageJsonPath} does not declare a string "version" field. ` +
        `A well-formed package.json always carries one, so this points at a broken install; ` +
        `the manifest refuses to fabricate a placeholder version for it.`,
      { details: { packageJsonPath } },
    );
  }

  return parsed.version;
}

/**
 * Reject a manifest that fails the canonical RunManifestSchema before it is
 * persisted (2026-10-16 Stage B). The harness builds manifests imperatively
 * and `foldManifestRows` assigns codec-authored `unknown` values into
 * whitelisted keys, so TypeScript cannot prove runtime validity. Replay
 * already validates manifests on read; this makes the write path symmetric
 * and refuses to persist a corrupt receipt (doctrine: no silent fallbacks).
 */
export function assertRunManifestValid(manifest: RunManifest): void {
  const result = RunManifestSchema.safeParse(manifest);
  if (!result.success) {
    throw new WittgensteinError(
      "MANIFEST_INVALID",
      "Refusing to persist a run manifest that fails the canonical RunManifestSchema. " +
        "A codec emitted values the manifest cannot honestly record; fix the codec (or the schema) " +
        "instead of writing a corrupt receipt.",
      { details: { issues: result.error.issues } },
    );
  }
}
