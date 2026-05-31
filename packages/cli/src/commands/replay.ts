/**
 * `wittgenstein replay <manifest-path>` — verify a past run is byte-reproducible.
 *
 * Reads a saved manifest, reconstructs the original `WittgensteinRequest`
 * from the recorded `manifest.request` field, re-runs the codec, and asserts
 * the new `artifactSha256` matches the recorded one. This converts the
 * manifest spine from an audit log into a verification surface (Issue #384,
 * tracking the verification-ladder Tier 1.1 follow-up from #310).
 *
 * Supported routes (deterministic-by-construction today):
 *   - sensor — pure local
 *   - svg (source: local) — pure local
 *   - asciipng (source: local) — pure local
 *
 * Unsupported (refused with a clear error citing the M-phase):
 *   - image — pending M1B decoder bridge (#283)
 *   - audio — pending M2 sweep stability across platforms (#374-class concerns)
 *   - video — pending M4 distillation
 *   - any route that called a non-stub LLM (live LLM replay is out of scope)
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Command } from "commander";
import {
  RunManifestSchema,
  WittgensteinRequestSchema,
  type WittgensteinRequest,
} from "@wittgenstein/schemas";
import { Wittgenstein } from "@wittgenstein/core";
import { resolveExecutionRoot } from "./shared.js";

interface ReplayOptions {
  config?: string;
}

const REPLAY_SUPPORTED_ROUTES: ReadonlySet<string> = new Set([
  "sensor",
  "svg-local",
  "asciipng-local",
]);

function requestReplayKey(request: WittgensteinRequest): string {
  if (request.modality === "sensor") return "sensor";
  if (request.modality === "svg") return `svg-${request.source}`;
  if (request.modality === "asciipng") return `asciipng-${request.source}`;
  return request.modality;
}

function writeStructuredError(payload: Record<string, unknown>): void {
  console.error(JSON.stringify({ ok: false, ...payload }, null, 2));
}

function errorCause(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function registerReplayCommand(program: Command): void {
  program
    .command("replay <manifest-path>")
    .description(
      "Re-run a past manifest and assert artifact byte-parity (verifies the reproducibility claim).",
    )
    .option("--config <path>", "config path")
    .action(async (manifestPath: string, options: ReplayOptions) => {
      const workspaceRoot = resolveExecutionRoot();
      const absPath = resolve(workspaceRoot, manifestPath);

      let manifestJson: string;
      try {
        manifestJson = await readFile(absPath, "utf8");
      } catch (error) {
        writeStructuredError({
          code: "MANIFEST_READ_FAILED",
          message: `Could not read manifest at ${absPath}`,
          cause: errorCause(error),
        });
        process.exitCode = 1;
        return;
      }

      let parsedManifest: unknown;
      try {
        parsedManifest = JSON.parse(manifestJson);
      } catch (error) {
        writeStructuredError({
          code: "MANIFEST_INVALID_JSON",
          message: `Manifest at ${absPath} is not valid JSON.`,
          cause: errorCause(error),
        });
        process.exitCode = 1;
        return;
      }

      const validation = RunManifestSchema.safeParse(parsedManifest);
      if (!validation.success) {
        writeStructuredError({
          code: "MANIFEST_SCHEMA_INVALID",
          message: "Manifest does not match RunManifestSchema.",
          issues: validation.error.issues,
        });
        process.exitCode = 1;
        return;
      }
      const manifest = validation.data;

      if (manifest.request === undefined) {
        writeStructuredError({
          code: "MANIFEST_MISSING_REQUEST",
          message:
            "Manifest predates the `request` field added for replay. Re-run the original command to produce a replay-compatible manifest (Issue #384).",
        });
        process.exitCode = 1;
        return;
      }

      const requestValidation = WittgensteinRequestSchema.safeParse(manifest.request);
      if (!requestValidation.success) {
        writeStructuredError({
          code: "MANIFEST_REQUEST_INVALID",
          message: "Recorded request does not match WittgensteinRequestSchema; cannot replay.",
          issues: requestValidation.error.issues,
        });
        process.exitCode = 1;
        return;
      }
      const request: WittgensteinRequest = requestValidation.data;

      if (request.modality !== manifest.codec) {
        writeStructuredError({
          code: "MANIFEST_REQUEST_CODEC_MISMATCH",
          message:
            "Manifest codec does not match the recorded request modality; refusing to replay an ambiguous run.",
          codec: manifest.codec,
          requestModality: request.modality,
        });
        process.exitCode = 1;
        return;
      }

      const replayKey = requestReplayKey(request);
      if (!REPLAY_SUPPORTED_ROUTES.has(replayKey)) {
        writeStructuredError({
          code: "REPLAY_UNSUPPORTED_ROUTE",
          message: `Replay is not yet wired for route '${replayKey}'. Currently supported: sensor, svg (local), asciipng (local). Image / audio / video pending M1B / M2-cross-platform / M4 — see issue #384.`,
          codec: manifest.codec,
          route: replayKey,
        });
        process.exitCode = 1;
        return;
      }

      if (manifest.artifactSha256 === null) {
        writeStructuredError({
          code: "MANIFEST_NO_BASELINE_HASH",
          message:
            "Original manifest has no artifactSha256 to compare against (likely a failed run). Nothing to verify.",
        });
        process.exitCode = 1;
        return;
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
        });
      } catch (error) {
        writeStructuredError({
          code: "REPLAY_EXECUTION_FAILED",
          message: "Replay execution failed before a comparable manifest was produced.",
          cause: errorCause(error),
        });
        process.exitCode = 1;
        return;
      }

      if (outcome.error !== null || !outcome.manifest.ok) {
        writeStructuredError({
          code: "REPLAY_EXECUTION_FAILED",
          message: "Replay execution produced a failed manifest; cannot compare artifact hashes.",
          replayRunId: outcome.manifest.runId,
          replayRunDir: outcome.runDir,
          cause: outcome.error?.message ?? "Unknown replay failure.",
          error: outcome.error,
        });
        process.exitCode = 1;
        return;
      }

      const replayedHash = outcome.manifest.artifactSha256;
      const baselineHash = manifest.artifactSha256;
      const parity = replayedHash === baselineHash;

      console.log(
        JSON.stringify(
          {
            ok: parity,
            code: parity ? "REPLAY_OK" : "REPLAY_HASH_MISMATCH",
            baselineRunId: manifest.runId,
            replayRunId: outcome.manifest.runId,
            baselineArtifactSha256: baselineHash,
            replayArtifactSha256: replayedHash,
            replayRunDir: outcome.runDir,
            ...(parity
              ? {}
              : {
                  message:
                    "Replay produced a different artifact than the manifest's baseline. The reproducibility claim is violated for this run.",
                }),
          },
          null,
          2,
        ),
      );

      if (!parity) {
        process.exitCode = 1;
      }
    });
}
