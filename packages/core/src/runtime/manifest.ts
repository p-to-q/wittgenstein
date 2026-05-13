import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { WittgensteinError } from "./errors.js";

const execFileAsync = promisify(execFile);

export interface RuntimeFingerprint {
  gitSha: string | null;
  lockfileHash: string | null;
  nodeVersion: string;
  wittgensteinVersion: string;
}

export async function collectRuntimeFingerprint(
  cwd: string,
): Promise<RuntimeFingerprint> {
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

async function readWittgensteinVersion(packageJsonPath: string): Promise<string> {
  try {
    const raw = await readFile(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}
