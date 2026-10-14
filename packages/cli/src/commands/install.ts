import type { DecoderPreflightReceipt } from "@wittgenstein/codec-image";
import type { Command } from "commander";
import {
  preflightSelectedImageDecoder,
  readDecoderCacheDir,
  type DecoderManifestSelection,
} from "./decoder-manifest.js";
import { resolveExecutionRoot } from "./shared.js";
import { buildInstallTierPlan, resolveInstallTier, type InstallTierId } from "../tiers.js";
import { fetchImageTierWeights } from "../install-image-tier.js";
import {
  defaultInstalledTiersReceiptPath,
  upsertInstalledTierEntry,
  type InstalledTierEntry,
} from "../install-receipt.js";

const DECODER_DELIVERY_TRACKER = "https://github.com/p-to-q/wittgenstein/issues/402";
const MODEL_OWNER_REVIEW_TRACKER = "https://github.com/p-to-q/wittgenstein/issues/435";

interface InstallCommandOptions {
  dryRun?: boolean;
  gpu?: boolean;
  allowResearchWeights?: boolean;
  json?: boolean;
  weightsBaseUrl?: string;
}

interface ResolvedWeightFacts {
  readonly weightsSha256: string;
  readonly codebookSha256: string | null;
  readonly weightsRestriction: "permissive" | "research-only";
  readonly source: "cache-hit" | "fetched";
}

export function registerInstallCommand(program: Command): void {
  program
    .command("install")
    .argument("<tier>", "installable runtime tier")
    .description("Plan or install optional runtime tiers")
    .option("--dry-run", "print the install plan without downloading or writing files")
    .option("--gpu", "select the GPU image decoder tier")
    .option(
      "--allow-research-weights",
      "allow research-only decoder weights for benchmarking per ADR-0020",
    )
    .option(
      "--weights-base-url <url>",
      "HuggingFace-style base URL for weight fetch (<base>/<repoId>/resolve/<revision>/<filename>)",
    )
    .option("--json", "print structured JSON output (default)")
    .action(async (tier: string, options: InstallCommandOptions) => {
      const workspaceRoot = resolveExecutionRoot();
      const resolvedTier = resolveInstallTier(tier, { gpu: options.gpu ?? false });

      if (!resolvedTier) {
        printInstallError({
          code: "INVALID_INSTALL_TIER",
          message: `Unknown install tier: ${tier}`,
          supportedTiers: ["image"],
        });
        process.exitCode = 1;
        return;
      }

      if (resolvedTier === "image-gpu") {
        printInstallError({
          code: "TIER_INSTALL_GPU_UNSUPPORTED",
          message:
            "The image GPU tier is not shipped: no onnxruntime-gpu bridge exists in the delivery surface yet.",
          supportedTiers: ["image"],
          tracker: DECODER_DELIVERY_TRACKER,
        });
        process.exitCode = 1;
        return;
      }

      const weightsBaseUrl = options.weightsBaseUrl ?? process.env.WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL;
      const plan = buildInstallTierPlan(resolvedTier, {
        allowResearchWeights: options.allowResearchWeights ?? false,
        weightsFetch: weightsBaseUrl ? "fetch-enabled" : "cache-only",
      });
      const cacheDir = readDecoderCacheDir(workspaceRoot);

      if (options.dryRun) {
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "plan-only",
              status: "blocked",
              plan,
              fetchPolicy: {
                weightsBaseUrlConfigured: Boolean(weightsBaseUrl),
                cacheOnly: !weightsBaseUrl,
                note:
                  "Weights fetch activates when --weights-base-url or WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL is set; the shipped derivative ONNX has no canonical SHA-pinnable URL yet (#402/#435).",
              },
              decoderPreflight: imageDecoderPreflightForPlan(),
            },
            null,
            2,
          ),
        );
        return;
      }

      const { selection, preflight } = await preflightSelectedImageDecoder({
        workspaceRoot,
        ...(cacheDir ? { cacheDir } : {}),
        allowResearchWeights: options.allowResearchWeights ?? false,
        checkRuntime: true,
      });

      if (preflight.status === "ready") {
        // Idempotent no-op: the tier is fully installed. Refresh the receipt
        // entry so doctor sees install history even for cache-hit installs.
        await upsertInstalledTierEntry(
          defaultInstalledTiersReceiptPath(),
          entryFromResolvedFacts(resolvedTier, selection, preflight, {
            weightsSha256: weightsSha256FromManifest(selection),
            codebookSha256: codebookSha256FromManifest(selection),
            weightsRestriction: weightsRestrictionFromPreflight(preflight) ?? "permissive",
            source: "cache-hit",
          }),
        );
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "install-ready",
              status: "ready",
              manifestPath: selection.manifestPath,
              decoderId: preflight.decoderId,
              family: preflight.family,
              runtimeTier: preflight.runtimeTier,
              weightsRestriction: weightsRestrictionFromPreflight(preflight),
              receiptPath: defaultInstalledTiersReceiptPath(),
              plan,
              decoderPreflight: preflight,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (preflight.reason === "weights-not-installed" || preflight.reason === "weights-invalid") {
        const assets = selection.parsedManifest?.assets;
        if (!assets) {
          printInstallError({
            code: "TIER_INSTALL_BLOCKED_BY_DECODER_PREFLIGHT",
            message: "Weights are missing but the selected decoder manifest declares no assets pin.",
            status: "blocked",
            manifestPath: selection.manifestPath,
            decoderId: preflight.decoderId,
            family: preflight.family,
            runtimeTier: preflight.runtimeTier,
            plan,
            decoderPreflight: preflight,
          });
          process.exitCode = 1;
          return;
        }

        if (!weightsBaseUrl) {
          printInstallError({
            code: "TIER_INSTALL_NEEDS_WEIGHTS_URL",
            message:
              "Weights for the image tier are not installed, and no fetch base URL is configured. The shipped derivative ONNX has no canonical SHA-pinnable URL yet; pass --weights-base-url (or set WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL) to a HuggingFace-style base to fetch + sha256-verify from that mirror.",
            status: "blocked",
            installHint: "wittgenstein install image --weights-base-url <base-url>",
            tracker: DECODER_DELIVERY_TRACKER,
            modelOwnerTracker: MODEL_OWNER_REVIEW_TRACKER,
            manifestPath: selection.manifestPath,
            decoderId: preflight.decoderId,
            family: preflight.family,
            runtimeTier: preflight.runtimeTier,
            plan,
            decoderPreflight: preflight,
          });
          process.exitCode = 1;
          return;
        }

        const outcome = await fetchImageTierWeights({
          manifest: assets,
          baseUrl: weightsBaseUrl,
          ...(cacheDir ? { cacheDir } : {}),
          allowResearchWeights: options.allowResearchWeights ?? false,
        });

        if (!outcome.ok) {
          printInstallError({
            code: outcome.code,
            message: outcome.message,
            status: "blocked",
            manifestPath: selection.manifestPath,
            decoderId: preflight.decoderId,
            family: preflight.family,
            runtimeTier: preflight.runtimeTier,
            plan,
            decoderPreflight: preflight,
            details: outcome.details,
          });
          process.exitCode = 1;
          return;
        }

        // Weights are cached + verified now. Check whether the ONNX runtime
        // peer is present so the receipt records the honest runtime state.
        const after = await preflightSelectedImageDecoder({
          workspaceRoot,
          ...(cacheDir ? { cacheDir } : {}),
          allowResearchWeights: options.allowResearchWeights ?? false,
          checkRuntime: true,
        });
        const runtimeVerified = after.preflight.status === "ready";
        await upsertInstalledTierEntry(
          defaultInstalledTiersReceiptPath(),
          entryFromResolvedFacts(resolvedTier, selection, after.preflight, {
            weightsSha256: outcome.resolved.weightsSha256,
            codebookSha256: outcome.resolved.codebookSha256 ?? null,
            weightsRestriction: outcome.resolved.weightsRestriction,
            source: outcome.resolved.source,
          }),
        );

        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "installed",
              status: runtimeVerified ? "ready" : "runtime-pending",
              manifestPath: selection.manifestPath,
              decoderId: preflight.decoderId,
              family: preflight.family,
              runtimeTier: preflight.runtimeTier,
              weightsSha256: outcome.resolved.weightsSha256,
              codebookSha256: outcome.resolved.codebookSha256 ?? null,
              source: outcome.resolved.source,
              runtimeVerified,
              ...(runtimeVerified
                ? {}
                : {
                    installHint:
                      "onnxruntime-node is not installed; run `npm install onnxruntime-node` (or your package manager's equivalent) and re-run `wittgenstein doctor`.",
                  }),
              receiptPath: defaultInstalledTiersReceiptPath(),
              plan,
              decoderPreflight: after.preflight,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (preflight.reason === "runtime-unavailable") {
        // Weights are cached + verified; only the optional npm peer is
        // missing. Record the install so doctor can report the pending step.
        await upsertInstalledTierEntry(
          defaultInstalledTiersReceiptPath(),
          entryFromResolvedFacts(resolvedTier, selection, preflight, {
            weightsSha256: weightsSha256FromManifest(selection),
            codebookSha256: codebookSha256FromManifest(selection),
            weightsRestriction: weightsRestrictionFromPreflight(preflight) ?? "permissive",
            source: "cache-hit",
          }),
        );
        console.log(
          JSON.stringify(
            {
              ok: true,
              action: "install-partial",
              status: "runtime-pending",
              manifestPath: selection.manifestPath,
              decoderId: preflight.decoderId,
              family: preflight.family,
              runtimeTier: preflight.runtimeTier,
              installHint:
                "onnxruntime-node is not installed; run `npm install onnxruntime-node` (or your package manager's equivalent) and re-run `wittgenstein doctor`.",
              receiptPath: defaultInstalledTiersReceiptPath(),
              plan,
              decoderPreflight: preflight,
            },
            null,
            2,
          ),
        );
        return;
      }

      printInstallError({
        code:
          preflight.reason === "manifest-missing"
            ? "TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST"
            : "TIER_INSTALL_BLOCKED_BY_DECODER_PREFLIGHT",
        message: installBlockedMessage(preflight.reason),
        status: "blocked",
        manifestPath: selection.manifestPath,
        decoderId: preflight.decoderId,
        family: preflight.family,
        runtimeTier: preflight.runtimeTier,
        weightsRestriction: weightsRestrictionFromPreflight(preflight),
        plan,
        decoderPreflight: preflight,
      });
      process.exitCode = 1;
    });
}

function entryFromResolvedFacts(
  tier: InstallTierId,
  selection: DecoderManifestSelection,
  preflight: DecoderPreflightReceipt,
  resolved: ResolvedWeightFacts,
): InstalledTierEntry {
  return {
    tier,
    family: selection.parsedManifest?.family ?? preflight.family ?? "llamagen",
    decoderId: selection.parsedManifest?.decoderId ?? preflight.decoderId ?? "llamagen-frozen-vq-v0",
    weightsSha256: resolved.weightsSha256,
    codebookSha256: resolved.codebookSha256,
    weightsRestriction: resolved.weightsRestriction,
    source: resolved.source,
    runtimeVerified: preflight.status === "ready",
    installedAt: new Date().toISOString(),
  };
}

function weightsSha256FromManifest(selection: DecoderManifestSelection): string {
  const sha = selection.parsedManifest?.assets.weightsSha256;
  if (!sha) {
    throw new Error("decoder manifest declares no weightsSha256 pin");
  }
  return sha;
}

function codebookSha256FromManifest(selection: DecoderManifestSelection): string | null {
  return selection.parsedManifest?.assets.codebookSha256 ?? null;
}

function imageDecoderPreflightForPlan(): {
  schemaVersion: "witt.image.decoder-preflight/v0.1";
  status: "blocked";
  reason: "manifest-missing";
  decoderId: null;
  family: null;
  runtimeTier: "node-onnx-cpu";
  installHint: string;
  tracker: string;
  details: {
    message: string;
    decisionTracker: string;
    gateCDeterminism: string;
    gateDOnnxCpu: string;
  };
} {
  return {
    schemaVersion: "witt.image.decoder-preflight/v0.1",
    status: "blocked",
    reason: "manifest-missing",
    decoderId: null,
    family: null,
    runtimeTier: "node-onnx-cpu",
    installHint: "wittgenstein install image",
    tracker: DECODER_DELIVERY_TRACKER,
    details: {
      message:
        "No decoder-family manifest is selected. With WITTGENSTEIN_DECODER_MANIFEST set to a blessed manifest, install fetches weights only when --weights-base-url (or WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL) is configured — cache-only until the canonical artifact URL is blessed (#402/#435).",
      decisionTracker: DECODER_DELIVERY_TRACKER,
      gateCDeterminism: "https://github.com/p-to-q/wittgenstein/issues/334",
      gateDOnnxCpu: "https://github.com/p-to-q/wittgenstein/issues/335",
    },
  };
}

function installBlockedMessage(reason: string | null): string {
  if (reason === "manifest-missing") {
    return "Image tier installation requires a concrete decoder-family manifest before weights can be fetched.";
  }

  return "Image tier installation is blocked by decoder preflight checks.";
}

function weightsRestrictionFromPreflight(preflight: {
  details: Record<string, unknown>;
}): "permissive" | "research-only" | null {
  const weights = preflight.details["weights"];
  if (!isRecord(weights)) {
    return null;
  }

  const restriction = weights["weightsRestriction"];
  return restriction === "permissive" || restriction === "research-only" ? restriction : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function printInstallError(error: Record<string, unknown>): void {
  console.error(
    JSON.stringify(
      {
        ok: false,
        ...error,
      },
      null,
      2,
    ),
  );
}
