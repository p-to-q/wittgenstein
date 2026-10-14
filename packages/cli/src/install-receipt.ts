/**
 * Installed-tiers receipt (`~/.config/wittgenstein/installed-tiers.json`).
 *
 * The install CLI writes one entry per installed runtime tier after a
 * successful fetch + sha256 verification (Issue #403); `wittgenstein doctor`
 * reads it back to report tier readiness without re-hashing the cache.
 *
 * The file is a plain receipt, not a source of truth: doctor always re-runs
 * decoder preflight (cache + runtime checks) and uses the receipt only for
 * install metadata (when / which SHA / whether the runtime was verified at
 * install time). A corrupt or missing receipt degrades to "unknown install
 * history", never to "ready".
 *
 * Path override: `WITTGENSTEIN_INSTALL_RECEIPT_PATH` (used by tests and
 * containerized installs).
 */
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type InstalledTierId = "image" | "image-gpu";

export interface InstalledTierEntry {
  readonly tier: InstalledTierId;
  readonly family: string;
  readonly decoderId: string;
  readonly weightsSha256: string;
  readonly codebookSha256: string | null;
  readonly weightsRestriction: "permissive" | "research-only";
  readonly source: "cache-hit" | "fetched";
  readonly runtimeVerified: boolean;
  readonly installedAt: string;
}

export interface InstalledTiersReceipt {
  readonly schemaVersion: "witt.installed-tiers/v0.1";
  readonly tiers: Partial<Record<InstalledTierId, InstalledTierEntry>>;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function defaultInstalledTiersReceiptPath(): string {
  return (
    process.env.WITTGENSTEIN_INSTALL_RECEIPT_PATH ??
    join(homedir(), ".config", "wittgenstein", "installed-tiers.json")
  );
}

export type InstalledTiersReadStatus = "loaded" | "missing" | "invalid";

export interface InstalledTiersReadResult {
  readonly status: InstalledTiersReadStatus;
  readonly receipt: InstalledTiersReceipt | null;
  readonly path: string;
}

export async function readInstalledTiersReceipt(path: string): Promise<InstalledTiersReadResult> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { status: "missing", receipt: null, path };
  }

  try {
    const receipt = parseInstalledTiersReceipt(JSON.parse(raw));
    return { status: "loaded", receipt, path };
  } catch {
    return { status: "invalid", receipt: null, path };
  }
}

export async function upsertInstalledTierEntry(
  path: string,
  entry: InstalledTierEntry,
): Promise<void> {
  const readResult = await readInstalledTiersReceipt(path);
  const tiers = { ...(readResult.receipt?.tiers ?? {}) };
  tiers[entry.tier] = entry;

  const receipt: InstalledTiersReceipt = {
    schemaVersion: "witt.installed-tiers/v0.1",
    tiers,
  };

  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp-${Date.now()}`;
  try {
    await writeFile(tmpPath, JSON.stringify(receipt, null, 2));
    await rename(tmpPath, path);
  } catch (error) {
    await rm(tmpPath, { force: true });
    throw error;
  }
}

function parseInstalledTiersReceipt(value: unknown): InstalledTiersReceipt {
  if (!isRecord(value) || value["schemaVersion"] !== "witt.installed-tiers/v0.1") {
    throw new Error("not an installed-tiers receipt");
  }
  const rawTiers = value["tiers"];
  if (!isRecord(rawTiers)) {
    throw new Error("receipt has no tiers record");
  }

  const tiers: Partial<Record<InstalledTierId, InstalledTierEntry>> = {};
  for (const [key, rawEntry] of Object.entries(rawTiers)) {
    if (key !== "image" && key !== "image-gpu") {
      throw new Error(`unknown tier ${key}`);
    }
    if (!isRecord(rawEntry)) {
      throw new Error(`tier ${key} entry is not a record`);
    }
    const entry = parseInstalledTierEntry(key, rawEntry);
    tiers[entry.tier] = entry;
  }

  return { schemaVersion: "witt.installed-tiers/v0.1", tiers };
}

function parseInstalledTierEntry(
  tier: InstalledTierId,
  raw: Record<string, unknown>,
): InstalledTierEntry {
  const family = raw["family"];
  const decoderId = raw["decoderId"];
  const weightsSha256 = raw["weightsSha256"];
  const codebookSha256 = raw["codebookSha256"];
  const weightsRestriction = raw["weightsRestriction"];
  const source = raw["source"];
  const runtimeVerified = raw["runtimeVerified"];
  const installedAt = raw["installedAt"];

  if (typeof family !== "string" || family.length === 0) throw new Error("family invalid");
  if (typeof decoderId !== "string" || decoderId.length === 0) throw new Error("decoderId invalid");
  if (typeof weightsSha256 !== "string" || !SHA256_PATTERN.test(weightsSha256)) {
    throw new Error("weightsSha256 invalid");
  }
  if (codebookSha256 !== null && (typeof codebookSha256 !== "string" || !SHA256_PATTERN.test(codebookSha256))) {
    throw new Error("codebookSha256 invalid");
  }
  if (weightsRestriction !== "permissive" && weightsRestriction !== "research-only") {
    throw new Error("weightsRestriction invalid");
  }
  if (source !== "cache-hit" && source !== "fetched") throw new Error("source invalid");
  if (typeof runtimeVerified !== "boolean") throw new Error("runtimeVerified invalid");
  if (typeof installedAt !== "string" || Number.isNaN(Date.parse(installedAt))) {
    throw new Error("installedAt invalid");
  }

  return {
    tier,
    family,
    decoderId,
    weightsSha256,
    codebookSha256,
    weightsRestriction,
    source,
    runtimeVerified,
    installedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
