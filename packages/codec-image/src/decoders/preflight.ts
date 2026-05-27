import { DecoderFamilyManifestSchema, validateDecoderManifestAuditReceipts } from "./manifest.js";
import {
  DecoderWeightsNotInstalledError,
  resolveDecoderWeights,
  type ResolvedDecoderWeights,
} from "./weights.js";
import { ensureOnnxRuntime } from "./runtime.js";
import type { DecoderRuntimeTier } from "./types.js";

export type DecoderPreflightStatus = "ready" | "blocked";

export type DecoderPreflightReason =
  | "manifest-missing"
  | "manifest-invalid"
  | "manifest-not-blessed"
  | "audit-receipt-invalid"
  | "weights-not-installed"
  | "weights-invalid"
  | "runtime-unavailable";

export interface DecoderPreflightReceipt {
  readonly schemaVersion: "witt.image.decoder-preflight/v0.1";
  readonly status: DecoderPreflightStatus;
  readonly reason: DecoderPreflightReason | null;
  readonly decoderId: string | null;
  readonly family: string | null;
  readonly runtimeTier: DecoderRuntimeTier | null;
  readonly installHint: string | null;
  readonly tracker: string | null;
  readonly details: Record<string, unknown>;
}

export interface DecoderPreflightOptions {
  readonly manifest?: unknown;
  readonly auditReceipts?: ReadonlyMap<string, unknown>;
  readonly cacheDir?: string;
  readonly allowResearchWeights?: boolean;
  readonly checkRuntime?: boolean;
}

export async function preflightImageDecoder(
  options: DecoderPreflightOptions = {},
): Promise<DecoderPreflightReceipt> {
  if (options.manifest === undefined) {
    return blocked("manifest-missing", {
      installHint: "wittgenstein install image",
      details: {
        message: "No decoder-family manifest has been selected for the image tier.",
      },
    });
  }

  const parsed = DecoderFamilyManifestSchema.safeParse(options.manifest);
  if (!parsed.success) {
    return blocked("manifest-invalid", {
      details: {
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      },
    });
  }

  const manifest = parsed.data;
  const base = {
    decoderId: manifest.decoderId,
    family: manifest.family,
    runtimeTier: manifest.capabilities.runtimeTier,
  };

  if (manifest.status !== "blessed") {
    return blocked("manifest-not-blessed", {
      ...base,
      details: {
        status: manifest.status,
        decisionTracker: manifest.decisionTracker,
      },
    });
  }

  const receiptValidation = validateDecoderManifestAuditReceipts(
    manifest,
    options.auditReceipts ?? new Map(),
  );
  if (!receiptValidation.ok) {
    return blocked("audit-receipt-invalid", {
      ...base,
      details: { issues: receiptValidation.issues },
    });
  }

  let resolvedWeights: ResolvedDecoderWeights;
  try {
    resolvedWeights = await resolveDecoderWeights({
      manifest: manifest.assets,
      ...(options.cacheDir ? { cacheDir: options.cacheDir } : {}),
      ...(options.allowResearchWeights !== undefined
        ? { allowResearchWeights: options.allowResearchWeights }
        : {}),
    });
  } catch (error) {
    if (error instanceof DecoderWeightsNotInstalledError) {
      return blocked("weights-not-installed", {
        ...base,
        installHint: "wittgenstein install image",
        details: error.details,
      });
    }

    const shaped = error as Error & { code?: string; details?: Record<string, unknown> };
    return blocked("weights-invalid", {
      ...base,
      details: {
        code: shaped.code,
        message: shaped.message,
        details: shaped.details,
      },
    });
  }

  const needsNodeOrt =
    manifest.capabilities.runtimeTier === "node-onnx-cpu" ||
    manifest.capabilities.runtimeTier === "node-onnx-gpu";

  if (needsNodeOrt && (options.checkRuntime ?? true)) {
    try {
      await ensureOnnxRuntime();
    } catch (error) {
      const shaped = error as Error & { code?: string; details?: Record<string, unknown> };
      return blocked("runtime-unavailable", {
        ...base,
        installHint: "wittgenstein install image",
        details: {
          code: shaped.code,
          message: shaped.message,
          details: shaped.details,
        },
      });
    }
  }

  return {
    schemaVersion: "witt.image.decoder-preflight/v0.1",
    status: "ready",
    reason: null,
    installHint: null,
    tracker: null,
    details: {
      weights: {
        source: resolvedWeights.source,
        weightsSha256: resolvedWeights.weightsSha256,
        codebookSha256: resolvedWeights.codebookSha256,
        weightsRestriction: resolvedWeights.weightsRestriction,
      },
    },
    ...base,
  };
}

function blocked(
  reason: DecoderPreflightReason,
  overrides: Partial<
    Omit<DecoderPreflightReceipt, "schemaVersion" | "status" | "reason" | "tracker">
  >,
): DecoderPreflightReceipt {
  return {
    schemaVersion: "witt.image.decoder-preflight/v0.1",
    status: "blocked",
    reason,
    decoderId: null,
    family: null,
    runtimeTier: null,
    installHint: null,
    tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    details: {},
    ...overrides,
  };
}
