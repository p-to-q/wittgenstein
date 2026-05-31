import { access } from "node:fs/promises";
import { resolve } from "node:path";

export interface EnvironmentReport {
  nodeVersion: string;
  nodeSatisfied: boolean;
  hasPnpmLockfile: boolean;
  hasPackageJson: boolean;
}

const NODE_ENGINE_MINIMUM = [20, 19, 0] as const;

export async function verifyEnvironment(cwd = process.cwd()): Promise<EnvironmentReport> {
  return {
    nodeVersion: process.version,
    nodeSatisfied: isNodeVersionAtLeast(process.versions.node, NODE_ENGINE_MINIMUM),
    hasPnpmLockfile: await exists(resolve(cwd, "pnpm-lock.yaml")),
    hasPackageJson: await exists(resolve(cwd, "package.json")),
  };
}

function isNodeVersionAtLeast(
  version: string,
  minimum: readonly [number, number, number],
): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) {
    return false;
  }

  const parsed = match.slice(1).map((part) => Number(part));
  if (parsed.some((part) => !Number.isSafeInteger(part))) {
    return false;
  }

  const [major, minor, patch] = parsed;
  const [minimumMajor, minimumMinor, minimumPatch] = minimum;

  if (major !== minimumMajor) {
    return major > minimumMajor;
  }
  if (minor !== minimumMinor) {
    return minor > minimumMinor;
  }

  return patch >= minimumPatch;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
