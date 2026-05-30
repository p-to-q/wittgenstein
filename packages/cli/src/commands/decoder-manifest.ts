import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  DecoderFamilyManifestSchema,
  preflightImageDecoder,
  type DecoderFamilyManifest,
  type DecoderPreflightOptions,
  type DecoderPreflightReceipt,
} from "@wittgenstein/codec-image";

const DECODER_DELIVERY_TRACKER = "https://github.com/p-to-q/wittgenstein/issues/402";

export type DecoderManifestSelectionStatus = "not-selected" | "read-error" | "loaded";

export interface DecoderManifestSelection {
  readonly status: DecoderManifestSelectionStatus;
  readonly manifestPath: string | null;
  readonly manifestInput: unknown;
  readonly parsedManifest: DecoderFamilyManifest | null;
  readonly auditReceipts: ReadonlyMap<string, unknown>;
  readonly errorMessage: string | null;
}

export interface SelectedImageDecoderPreflight {
  readonly selection: DecoderManifestSelection;
  readonly preflight: DecoderPreflightReceipt;
}

export async function preflightSelectedImageDecoder(options: {
  readonly workspaceRoot: string;
  readonly cacheDir?: string;
  readonly allowResearchWeights?: boolean;
  readonly checkRuntime?: boolean;
}): Promise<SelectedImageDecoderPreflight> {
  const selection = await readSelectedDecoderManifest(options.workspaceRoot);

  if (selection.status === "not-selected") {
    return {
      selection,
      preflight: await preflightImageDecoder(),
    };
  }

  if (selection.status === "read-error") {
    return {
      selection,
      preflight: manifestInvalidPreflight(selection.errorMessage ?? "Unknown manifest read error."),
    };
  }

  const preflightOptions: DecoderPreflightOptions = {
    manifest: selection.manifestInput,
    auditReceipts: selection.auditReceipts,
    ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
    ...(options.allowResearchWeights !== undefined
      ? { allowResearchWeights: options.allowResearchWeights }
      : {}),
    ...(options.checkRuntime !== undefined ? { checkRuntime: options.checkRuntime } : {}),
  };

  return {
    selection,
    preflight: await preflightImageDecoder(preflightOptions),
  };
}

export function readDecoderCacheDir(workspaceRoot: string): string | undefined {
  const cacheDir = process.env.WITTGENSTEIN_DECODER_CACHE_DIR;
  if (!cacheDir) {
    return undefined;
  }

  return isAbsolute(cacheDir) ? cacheDir : resolve(workspaceRoot, cacheDir);
}

export function auditStatuses(
  manifest: DecoderFamilyManifest,
): Record<"gateA" | "gateB" | "gateC" | "gateD", string> {
  return {
    gateA: manifest.audits.gateA.status,
    gateB: manifest.audits.gateB.status,
    gateC: manifest.audits.gateC.status,
    gateD: manifest.audits.gateD.status,
  };
}

export function weightsCachedFromPreflight(receipt: DecoderPreflightReceipt): boolean | null {
  if (receipt.status === "ready") return true;
  if (receipt.reason === "weights-not-installed" || receipt.reason === "weights-invalid") {
    return false;
  }
  return null;
}

async function readSelectedDecoderManifest(
  workspaceRoot: string,
): Promise<DecoderManifestSelection> {
  const selectedManifest = process.env.WITTGENSTEIN_DECODER_MANIFEST;
  if (!selectedManifest) {
    return {
      status: "not-selected",
      manifestPath: null,
      manifestInput: undefined,
      parsedManifest: null,
      auditReceipts: new Map(),
      errorMessage: null,
    };
  }

  const manifestPath = isAbsolute(selectedManifest)
    ? selectedManifest
    : resolve(workspaceRoot, selectedManifest);

  let manifestInput: unknown;
  try {
    manifestInput = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    return {
      status: "read-error",
      manifestPath,
      manifestInput: undefined,
      parsedManifest: null,
      auditReceipts: new Map(),
      errorMessage: errorMessage(error),
    };
  }

  const parsedManifest = DecoderFamilyManifestSchema.safeParse(manifestInput);
  const parsed = parsedManifest.success ? parsedManifest.data : null;

  return {
    status: "loaded",
    manifestPath,
    manifestInput,
    parsedManifest: parsed,
    auditReceipts: parsed
      ? await readAuditReceipts(parsed, workspaceRoot, dirname(manifestPath))
      : new Map(),
    errorMessage: null,
  };
}

async function readAuditReceipts(
  manifest: DecoderFamilyManifest,
  workspaceRoot: string,
  manifestDir: string,
): Promise<Map<string, unknown>> {
  const receipts = new Map<string, unknown>();

  for (const gate of ["gateC", "gateD"] as const) {
    const receiptPath = manifest.audits[gate].receipt;
    if (!receiptPath) continue;

    const input = await readJsonFromCandidates(
      resolveReceiptCandidates(receiptPath, workspaceRoot, manifestDir),
    );
    if (input !== undefined) {
      receipts.set(receiptPath, input);
    }
  }

  return receipts;
}

function resolveReceiptCandidates(
  receiptPath: string,
  workspaceRoot: string,
  manifestDir: string,
): string[] {
  if (isAbsolute(receiptPath)) {
    return [receiptPath];
  }

  return [resolve(workspaceRoot, receiptPath), resolve(manifestDir, receiptPath)];
}

async function readJsonFromCandidates(paths: readonly string[]): Promise<unknown | undefined> {
  for (const path of paths) {
    try {
      return JSON.parse(await readFile(path, "utf8"));
    } catch {
      // Keep trying all supported resolution roots. The preflight validator
      // reports the manifest-declared receipt as missing if none resolve.
    }
  }

  return undefined;
}

function manifestInvalidPreflight(message: string): DecoderPreflightReceipt {
  return {
    schemaVersion: "witt.image.decoder-preflight/v0.1",
    status: "blocked",
    reason: "manifest-invalid",
    decoderId: null,
    family: null,
    runtimeTier: null,
    installHint: "wittgenstein install image",
    tracker: DECODER_DELIVERY_TRACKER,
    details: {
      issues: [{ path: "", message }],
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
