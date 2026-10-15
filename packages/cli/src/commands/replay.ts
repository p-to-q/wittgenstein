/**
 * `wittgenstein replay <manifest-path>` — verify a past run is reproducible.
 *
 * Reads a saved manifest, reconstructs the original `WittgensteinRequest`
 * from the recorded `manifest.request` field, re-runs the codec, and asserts
 * the artifact still reproduces. This converts the manifest spine from an
 * audit log into a verification surface (Issue #384, tracking the
 * verification-ladder Tier 1.1 follow-up from #310).
 *
 * Supported routes:
 *   - sensor — pure local
 *   - svg (source: local) — pure local
 *   - asciipng (source: local) — pure local
 *   - image — both lanes (S7d). Placeholder-lane runs verify byte-for-byte
 *     as before; bridge-backed runs (an `image.decoder` row is present)
 *     additionally resolve the *recorded* decoder cache-only and verify the
 *     S7d chain: decoder identity (id / hash / determinism class) →
 *     decode-input digest (`image.adapter.latentsSha256`) → artifact parity
 *     at the decoder's declared class. The chain also reports the recorded
 *     runtime identity (S7e: `onnxruntime-node` version + configured
 *     execution providers, baseline vs replay) as *evidence* — runtime
 *     drift is never a violation by itself.
 *
 * Recorded-generation replay (S7d, image lane): the LLM stage is frozen
 * like a VCR cassette. `services.recordedGeneration` makes the codec
 * re-parse `manifest.llmOutputRaw` instead of calling an LLM or the
 * dry-run stub, and the deterministic suffix (adapter → decoder → package)
 * re-executes for real. A recorded generation that fails to parse is a
 * refusal — the dry-run stub is never substituted (that would false-green
 * a different scene).
 *
 * Refused with a clear error (never a silent green):
 *   - non-image runs that recorded a live LLM call — replay falls back to
 *     the dry-run stub there, which cannot reproduce paid model output
 *   - image runs without a usable recorded `llmOutputRaw`
 *   - image runs whose `image.decoder` row is malformed — refused by the
 *     manifest schema itself (`MANIFEST_SCHEMA_INVALID`, path-precise
 *     issues) since the S7e value promotion typed the row
 *   - bridge-backed image runs whose receipts predate S7d (no
 *     `latentsSha256`) or whose recorded decoder is unknown / not
 *     installed locally (replay never fetches)
 *   - audio — pending M2 sweep stability across platforms
 *   - video — pending M4 distillation
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  RunManifestSchema,
  WittgensteinRequestSchema,
  type WittgensteinRequest,
  type codecV2,
} from "@wittgenstein/schemas";
import { Wittgenstein } from "@wittgenstein/core";
import { readPngStructure } from "@wittgenstein/codec-image";
import {
  decoderFamilyForDecoderId,
  loadImageDecoderBridgeForRun,
  type ImageDecoderLoadOutcome,
} from "./decoder-bridge.js";
import { readDecoderCacheDir } from "./decoder-manifest.js";
import { resolveExecutionRoot } from "./shared.js";

interface ReplayOptions {
  config?: string;
  allowResearchWeights?: boolean;
}

/** Structured replay report; `ok`/`code` plus case-specific evidence fields. */
export interface ReplayReport {
  readonly ok: boolean;
  readonly code: string;
  readonly [key: string]: unknown;
}

export interface ReplayDependencies {
  /** Overridable for tests; defaults to the S7b/S7c entry-layer loader. */
  readonly loadImageDecoderBridgeForRun?: (options: {
    decoder?: string;
    allowResearchWeights?: boolean;
    cacheDir?: string;
    cacheOnly?: boolean;
  }) => Promise<ImageDecoderLoadOutcome>;
}

const REPLAY_SUPPORTED_ROUTES: ReadonlySet<string> = new Set([
  "sensor",
  "svg-local",
  "asciipng-local",
  "image",
]);

/**
 * Verification verdicts that completed a comparison and print to stdout
 * (the exit code separates pass from violation); every other code is a
 * refusal / failure and prints to stderr.
 */
const STDOUT_VERDICT_CODES: ReadonlySet<string> = new Set([
  "REPLAY_OK",
  "REPLAY_STRUCTURAL_OK",
  "REPLAY_HASH_MISMATCH",
  "REPLAY_STRUCTURE_MISMATCH",
  "REPLAY_LATENTS_MISMATCH",
  "REPLAY_DECODER_HASH_MISMATCH",
]);

const INSTALL_HINT = "wittgenstein install image";

function requestReplayKey(request: WittgensteinRequest): string {
  if (request.modality === "sensor") return "sensor";
  if (request.modality === "svg") return `svg-${request.source}`;
  if (request.modality === "asciipng") return `asciipng-${request.source}`;
  return request.modality;
}

function errorCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads `image.adapter.latentsSha256` from a manifest object; null when
 * absent. The row is declared but still untyped (`z.unknown()`), so this is
 * a narrow read — not a validation (the `image.decoder` row is typed since
 * the S7e promotion and needs no such narrowing).
 */
function readLatentsSha256(manifest: unknown): string | null {
  if (!isRecord(manifest)) {
    return null;
  }
  const row = manifest["image.adapter"];
  if (!isRecord(row)) {
    return null;
  }
  const digest = row["latentsSha256"];
  return typeof digest === "string" && digest.length > 0 ? digest : null;
}

/**
 * Advisory equality of the recorded and replayed decoder runtime identities
 * (S7e). `null` when either side recorded none (pre-S7e receipts; runtimes
 * that cannot report a version) — absence is not a claim, so there is
 * nothing to compare. `false` is evidence only: replay never fails on
 * runtime drift; the recorded environment is surfaced so a reader knows
 * what the determinism claim was scoped to.
 */
function runtimeIdentityParity(
  baseline: codecV2.DecoderRuntimeIdentity | undefined,
  replay: codecV2.DecoderRuntimeIdentity | undefined,
): boolean | null {
  if (!baseline || !replay) {
    return null;
  }
  return (
    baseline.name === replay.name &&
    baseline.version === replay.version &&
    baseline.executionProviders.length === replay.executionProviders.length &&
    baseline.executionProviders.every(
      (provider, index) => provider === replay.executionProviders[index],
    )
  );
}

type ArtifactRead =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly cause: string };

async function readArtifactBytes(path: string): Promise<ArtifactRead> {
  try {
    return { ok: true, bytes: await readFile(path) };
  } catch (error) {
    return { ok: false, cause: errorCause(error) };
  }
}

/**
 * Re-runs the recorded request and verifies the reproducibility claim.
 * Returns a structured report instead of printing, so the command wrapper
 * (and tests) decide how to surface it.
 */
export async function replayManifest(
  options: {
    manifestPath: string;
    config?: string;
    allowResearchWeights?: boolean;
  },
  deps: ReplayDependencies = {},
): Promise<ReplayReport> {
  const loadBridge = deps.loadImageDecoderBridgeForRun ?? loadImageDecoderBridgeForRun;
  const workspaceRoot = resolveExecutionRoot();
  const absPath = resolve(workspaceRoot, options.manifestPath);

  let manifestJson: string;
  try {
    manifestJson = await readFile(absPath, "utf8");
  } catch (error) {
    return {
      ok: false,
      code: "MANIFEST_READ_FAILED",
      message: `Could not read manifest at ${absPath}`,
      cause: errorCause(error),
    };
  }

  let parsedManifest: unknown;
  try {
    parsedManifest = JSON.parse(manifestJson);
  } catch (error) {
    return {
      ok: false,
      code: "MANIFEST_INVALID_JSON",
      message: `Manifest at ${absPath} is not valid JSON.`,
      cause: errorCause(error),
    };
  }

  const validation = RunManifestSchema.safeParse(parsedManifest);
  if (!validation.success) {
    return {
      ok: false,
      code: "MANIFEST_SCHEMA_INVALID",
      message: "Manifest does not match RunManifestSchema.",
      issues: validation.error.issues,
    };
  }
  const manifest = validation.data;

  if (manifest.request === undefined) {
    return {
      ok: false,
      code: "MANIFEST_MISSING_REQUEST",
      message:
        "Manifest predates the `request` field added for replay. Re-run the original command to produce a replay-compatible manifest (Issue #384).",
    };
  }

  const requestValidation = WittgensteinRequestSchema.safeParse(manifest.request);
  if (!requestValidation.success) {
    return {
      ok: false,
      code: "MANIFEST_REQUEST_INVALID",
      message: "Recorded request does not match WittgensteinRequestSchema; cannot replay.",
      issues: requestValidation.error.issues,
    };
  }
  const request: WittgensteinRequest = requestValidation.data;

  if (request.modality !== manifest.codec) {
    return {
      ok: false,
      code: "MANIFEST_REQUEST_CODEC_MISMATCH",
      message:
        "Manifest codec does not match the recorded request modality; refusing to replay an ambiguous run.",
      codec: manifest.codec,
      requestModality: request.modality,
    };
  }

  const replayKey = requestReplayKey(request);
  if (!REPLAY_SUPPORTED_ROUTES.has(replayKey)) {
    return {
      ok: false,
      code: "REPLAY_UNSUPPORTED_ROUTE",
      message: `Replay is not yet wired for route '${replayKey}'. Currently supported: sensor, svg (local), asciipng (local), image (placeholder + bridge lanes). Audio / video pending M2-cross-platform / M4 — see issue #384.`,
      codec: manifest.codec,
      route: replayKey,
    };
  }
  const imageRoute = replayKey === "image";

  // Non-image routes still re-run with the dry-run stub, so a manifest that
  // recorded a live LLM call cannot be honestly replayed there. The image
  // lane is exempt: recorded-generation replay (below) re-parses the
  // recorded LLM output instead of stubbing it.
  const liveLlmCall =
    manifest.llmTokens.input + manifest.llmTokens.output > 0 ||
    (typeof manifest.costUsd === "number" && manifest.costUsd > 0);
  if (!imageRoute && liveLlmCall) {
    return {
      ok: false,
      code: "REPLAY_LIVE_LLM_UNSUPPORTED",
      message:
        "This run recorded a live LLM call; replay re-runs with the dry-run stub and cannot reproduce paid model output (out of scope outside the image lane, Issue #384).",
      llmTokens: manifest.llmTokens,
      costUsd: manifest.costUsd,
    };
  }

  // --- Image-lane preflight (S7d D1/D3): selectors + refused-as-incomplete ---
  let decoderLane: codecV2.ImageDecoderReceipt | null = null;
  let baselineLatentsSha256: string | null = null;
  let recordedLlmOutputRaw: string | null = null;
  if (imageRoute) {
    // The `image.decoder` row is a typed contract since the S7e value
    // promotion, and the canonical parse above already enforced it: a
    // malformed row refused there as `MANIFEST_SCHEMA_INVALID` with
    // path-precise issues (that schema boundary replaced replay's
    // hand-validated `MANIFEST_IMAGE_DECODER_INVALID` refusal). Read the
    // validated value; absence still selects the placeholder lane.
    decoderLane = manifest["image.decoder"] ?? null;
    baselineLatentsSha256 = readLatentsSha256(manifest);

    recordedLlmOutputRaw =
      typeof manifest.llmOutputRaw === "string" && manifest.llmOutputRaw.trim().length > 0
        ? manifest.llmOutputRaw
        : null;
    if (recordedLlmOutputRaw === null) {
      return {
        ok: false,
        code: "MANIFEST_MISSING_LLM_OUTPUT",
        message:
          "Image replay re-parses the recorded `llmOutputRaw` (recorded-generation replay); this manifest has none. Re-run the original command to produce a replay-compatible manifest (Issue #384).",
      };
    }

    if (decoderLane && baselineLatentsSha256 === null) {
      return {
        ok: false,
        code: "MANIFEST_MISSING_LATENTS_DIGEST",
        message:
          "This bridge-backed run predates the S7d receipts contract (`image.adapter.latentsSha256`). Without the decode-input digest, structural-parity verification could not tell a reproduced run from a re-decoded different scene. Re-run the original command and replay that manifest.",
        decoderId: decoderLane.decoderId,
      };
    }
  }

  if (manifest.artifactSha256 === null) {
    return {
      ok: false,
      code: "MANIFEST_NO_BASELINE_HASH",
      message:
        "Original manifest has no artifactSha256 to compare against (likely a failed run). Nothing to verify.",
    };
  }

  // --- Decoder resolution (S7d D4): manifest-recorded id, cache-only load ---
  let bridge: ImageDecoderLoadOutcome["bridge"];
  if (decoderLane) {
    const family = decoderFamilyForDecoderId(decoderLane.decoderId);
    if (family === null) {
      return {
        ok: false,
        code: "REPLAY_DECODER_UNSUPPORTED",
        message: `The recorded decoder '${decoderLane.decoderId}' is not known to this replay build; cannot re-run the recorded decode lane.`,
        decoderId: decoderLane.decoderId,
      };
    }
    const cacheDir = readDecoderCacheDir(workspaceRoot);
    const loaded = await loadBridge({
      decoder: family,
      allowResearchWeights: options.allowResearchWeights ?? false,
      cacheOnly: true,
      ...(cacheDir !== undefined ? { cacheDir } : {}),
    });
    if (loaded.error) {
      const loadError = loaded.error;
      if (
        loadError.code === "WEIGHTS_NOT_INSTALLED" ||
        loadError.code === "DECODER_RUNTIME_UNAVAILABLE"
      ) {
        return {
          ok: false,
          code: "REPLAY_DECODER_UNAVAILABLE",
          message: `The recorded decoder '${decoderLane.decoderId}' is known but cannot be brought up locally (${loadError.code}); replay never fetches, so install it first.`,
          decoderId: decoderLane.decoderId,
          decoderCode: loadError.code,
          installHint: loadError.installHint ?? INSTALL_HINT,
          ...(loadError.details !== undefined ? { details: loadError.details } : {}),
        };
      }
      return { ok: false, ...loadError };
    }
    bridge = loaded.bridge;
    if (!bridge) {
      return {
        ok: false,
        code: "IMAGE_DECODER_LOAD_FAILED",
        message:
          "Decoder loader returned neither a bridge nor an error; refusing to replay without the recorded decode lane.",
      };
    }
    if (bridge.capabilities.decoderId !== decoderLane.decoderId) {
      await bridge.unload().catch(() => undefined);
      return {
        ok: false,
        code: "REPLAY_DECODER_ID_MISMATCH",
        message: `Installed decoder '${bridge.capabilities.decoderId}' does not match the run's recorded decoder '${decoderLane.decoderId}'; cannot re-run the recorded decode lane.`,
        expectedDecoderId: decoderLane.decoderId,
        installedDecoderId: bridge.capabilities.decoderId,
      };
    }
    if (bridge.capabilities.determinismClass !== decoderLane.determinismClass) {
      await bridge.unload().catch(() => undefined);
      return {
        ok: false,
        code: "REPLAY_DECODER_CLASS_MISMATCH",
        message: `Installed decoder '${decoderLane.decoderId}' declares determinism class '${bridge.capabilities.determinismClass}', but the run recorded '${decoderLane.determinismClass}'; the verification contract cannot be satisfied.`,
        expectedDeterminismClass: decoderLane.determinismClass,
        installedDeterminismClass: bridge.capabilities.determinismClass,
      };
    }
  }

  // --- Re-execute the deterministic suffix ---
  const runServices: Record<string, unknown> = {};
  if (bridge) {
    runServices.decoderBridge = bridge;
  }
  if (imageRoute && recordedLlmOutputRaw !== null) {
    runServices.recordedGeneration = { llmOutputRaw: recordedLlmOutputRaw };
  }

  let outcome: Awaited<ReturnType<Wittgenstein["run"]>>;
  try {
    const harness = await Wittgenstein.bootstrap({
      cwd: workspaceRoot,
      ...(options.config ? { configPath: options.config } : {}),
    });

    outcome = await harness.run(request, {
      command: "replay",
      args: [absPath],
      cwd: workspaceRoot,
      dryRun: true,
      ...(Object.keys(runServices).length > 0 ? { services: runServices } : {}),
    });
  } catch (error) {
    return {
      ok: false,
      code: "REPLAY_EXECUTION_FAILED",
      message: "Replay execution failed before a comparable manifest was produced.",
      cause: errorCause(error),
    };
  } finally {
    if (bridge) {
      await bridge.unload().catch(() => undefined);
    }
  }

  if (outcome.error !== null || !outcome.manifest.ok) {
    const errorCode = isRecord(outcome.error) ? outcome.error["code"] : undefined;
    if (errorCode === "RECORDED_GENERATION_INVALID") {
      return {
        ok: false,
        code: "MANIFEST_LLM_OUTPUT_INVALID",
        message:
          "The recorded `llmOutputRaw` does not parse as an ImageSceneSpec; refusing to substitute the dry-run stub scene for it (no silent fallback). Re-run the original command to produce a replay-compatible manifest.",
        cause: errorCause(outcome.error),
        replayRunId: outcome.manifest.runId,
        replayRunDir: outcome.runDir,
      };
    }
    return {
      ok: false,
      code: "REPLAY_EXECUTION_FAILED",
      message: "Replay execution produced a failed manifest; cannot compare artifacts.",
      replayRunId: outcome.manifest.runId,
      replayRunDir: outcome.runDir,
      cause: outcome.error?.message ?? "Unknown replay failure.",
      error: outcome.error,
    };
  }

  // The replay run's manifest passed `assertRunManifestValid` on the write
  // path, so its typed rows (`image.decoder`) are read directly; the still-
  // untyped `image.adapter` row is narrowed by `readLatentsSha256`.
  const baselineRunId = manifest.runId;
  const replayRunId = outcome.manifest.runId;
  const baselineSha = manifest.artifactSha256;
  const replaySha = outcome.manifest.artifactSha256;

  // --- Verification chain (S7d D2), link by link, first violation wins ---

  // Link 1 (bridge lane): decoder identity — the replayed decode must have
  // been stamped with the recorded weights hash.
  let decoderEvidence: Record<string, unknown> | undefined;
  if (decoderLane) {
    const replayReceipt = outcome.manifest["image.decoder"];
    const replayDecoderHash = replayReceipt?.decoderHash ?? null;
    const decoderHashParity = replayDecoderHash === decoderLane.decoderHash;
    decoderEvidence = {
      decoderId: decoderLane.decoderId,
      baselineDecoderHash: decoderLane.decoderHash,
      replayDecoderHash,
      decoderHashParity,
      // S7e runtime identity: evidence, not a verification link. Drift in
      // the resolved onnxruntime-node build or the configured execution
      // providers is environment, not run identity — reported either way.
      baselineRuntime: decoderLane.runtime ?? null,
      replayRuntime: replayReceipt?.runtime ?? null,
      runtimeParity: runtimeIdentityParity(decoderLane.runtime, replayReceipt?.runtime),
    };
    if (!decoderHashParity) {
      return {
        ok: false,
        code: "REPLAY_DECODER_HASH_MISMATCH",
        message:
          "The replayed decoder hash differs from the recorded one; the installed weights are not the ones the run used, so artifact comparison is meaningless.",
        baselineRunId,
        replayRunId,
        baselineArtifactSha256: baselineSha,
        replayArtifactSha256: replaySha,
        replayRunDir: outcome.runDir,
        decoder: decoderEvidence,
      };
    }
  }

  // Link 2 (image lane): decode-input identity — same latents digest, not
  // merely the same dimensions. Bridge lane required a digest at preflight;
  // placeholder-lane manifests that predate S7d skip this link explicitly.
  let latentsEvidence: Record<string, unknown> | undefined;
  if (imageRoute) {
    const replayLatentsSha256 = readLatentsSha256(outcome.manifest);
    if (baselineLatentsSha256 === null && replayLatentsSha256 === null) {
      latentsEvidence = { skipped: true, reason: "receipts-predate-s7d" };
    } else {
      const latentsParity = baselineLatentsSha256 === replayLatentsSha256;
      latentsEvidence = {
        baselineLatentsSha256,
        replayLatentsSha256,
        latentsParity,
      };
      if (!latentsParity) {
        return {
          ok: false,
          code: "REPLAY_LATENTS_MISMATCH",
          message:
            "Replay re-derived different decoder-input latents than the recorded run; the adapter chain did not reproduce the recorded scene's tokens.",
          baselineRunId,
          replayRunId,
          baselineArtifactSha256: baselineSha,
          replayArtifactSha256: replaySha,
          replayRunDir: outcome.runDir,
          latents: latentsEvidence,
        };
      }
    }
  }

  // Link 3: artifact parity at the declared class. Byte-parity ⇒ SHA
  // equality required. Structural-parity ⇒ PNG structure (signature + IHDR
  // dimensions) required; byte equality is reported as advisory evidence.
  const determinismClass = decoderLane?.determinismClass ?? "byte-parity";
  const byteParity = replaySha === baselineSha;

  const evidence = {
    baselineRunId,
    replayRunId,
    baselineArtifactSha256: baselineSha,
    replayArtifactSha256: replaySha,
    replayRunDir: outcome.runDir,
    determinismClass,
    byteParity,
    ...(decoderEvidence ? { decoder: decoderEvidence } : {}),
    ...(latentsEvidence ? { latents: latentsEvidence } : {}),
  };

  if (determinismClass === "byte-parity") {
    if (byteParity) {
      return { ok: true, code: "REPLAY_OK", ...evidence };
    }
    return {
      ok: false,
      code: "REPLAY_HASH_MISMATCH",
      message:
        "Replay produced a different artifact than the manifest's baseline. The reproducibility claim is violated for this run.",
      ...evidence,
    };
  }

  // structural-parity: compare PNG structure (signature + IHDR dimensions).
  const baselineArtifactPath = manifest.artifactPath;
  const replayArtifactPath = outcome.manifest.artifactPath;
  if (!baselineArtifactPath || !replayArtifactPath) {
    return {
      ok: false,
      code: "REPLAY_ARTIFACT_READ_FAILED",
      message: "Structural comparison needs both artifact files on disk; one path is missing from its manifest.",
      baselineArtifactPath,
      replayArtifactPath,
      ...evidence,
    };
  }
  const baselineArtifact = await readArtifactBytes(baselineArtifactPath);
  if (!baselineArtifact.ok) {
    return {
      ok: false,
      code: "REPLAY_ARTIFACT_READ_FAILED",
      message: `Could not read the baseline artifact at ${baselineArtifactPath}.`,
      side: "baseline",
      cause: baselineArtifact.cause,
      ...evidence,
    };
  }
  const replayArtifact = await readArtifactBytes(replayArtifactPath);
  if (!replayArtifact.ok) {
    return {
      ok: false,
      code: "REPLAY_ARTIFACT_READ_FAILED",
      message: `Could not read the replay artifact at ${replayArtifactPath}.`,
      side: "replay",
      cause: replayArtifact.cause,
      ...evidence,
    };
  }

  const baselineStructure = readPngStructure(baselineArtifact.bytes);
  const replayStructure = readPngStructure(replayArtifact.bytes);
  const structure = { baseline: baselineStructure, replay: replayStructure };
  const structureParity =
    baselineStructure !== null &&
    replayStructure !== null &&
    baselineStructure.width === replayStructure.width &&
    baselineStructure.height === replayStructure.height;

  if (!structureParity) {
    return {
      ok: false,
      code: "REPLAY_STRUCTURE_MISMATCH",
      message:
        "Replay produced a PNG whose structure differs from the baseline (structural-parity requires matching signature + IHDR dimensions).",
      structure,
      ...evidence,
    };
  }

  if (byteParity) {
    return { ok: true, code: "REPLAY_OK", structure, ...evidence };
  }
  return {
    ok: true,
    code: "REPLAY_STRUCTURAL_OK",
    message:
      "Structure verified at the decoder's declared determinism class; artifact bytes differ (advisory evidence only for structural-parity).",
    structure,
    ...evidence,
  };
}

export function registerReplayCommand(program: Command): void {
  program
    .command("replay <manifest-path>")
    .description(
      "Re-run a past manifest and verify its reproducibility claim (byte parity, or the decoder's declared structural class).",
    )
    .option("--config <path>", "config path")
    .option(
      "--allow-research-weights",
      "allow research-only decoder weights for benchmarking per ADR-0020",
    )
    .action(async (manifestPath: string, options: ReplayOptions) => {
      const report = await replayManifest({
        manifestPath,
        ...(options.config !== undefined ? { config: options.config } : {}),
        allowResearchWeights: options.allowResearchWeights ?? false,
      });

      if (report.ok || STDOUT_VERDICT_CODES.has(report.code)) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.error(JSON.stringify(report, null, 2));
      }
      if (!report.ok) {
        process.exitCode = 1;
      }
    });
}
