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
  type RunManifest,
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

function manifestReplayKey(manifest: RunManifest): string {
  if (manifest.codec === "sensor") return "sensor";
  if (manifest.codec === "svg") return "svg-local"; // svg-local is the deterministic path
  if (manifest.codec === "asciipng") return "asciipng-local";
  return manifest.codec;
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
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "MANIFEST_READ_FAILED",
              message: `Could not read manifest at ${absPath}`,
              cause: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      let parsedManifest: unknown;
      try {
        parsedManifest = JSON.parse(manifestJson);
      } catch (error) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "MANIFEST_INVALID_JSON",
              message: `Manifest at ${absPath} is not valid JSON.`,
              cause: error instanceof Error ? error.message : String(error),
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const validation = RunManifestSchema.safeParse(parsedManifest);
      if (!validation.success) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "MANIFEST_SCHEMA_INVALID",
              message: "Manifest does not match RunManifestSchema.",
              issues: validation.error.issues,
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }
      const manifest = validation.data;

      const replayKey = manifestReplayKey(manifest);
      if (!REPLAY_SUPPORTED_ROUTES.has(replayKey)) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "REPLAY_UNSUPPORTED_ROUTE",
              message: `Replay is not yet wired for codec '${manifest.codec}'. Currently supported: sensor, svg (local), asciipng (local). Image / audio / video pending M1B / M2-cross-platform / M4 — see issue #384.`,
              codec: manifest.codec,
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      if (manifest.request === undefined) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "MANIFEST_MISSING_REQUEST",
              message:
                "Manifest predates the `request` field added for replay. Re-run the original command to produce a replay-compatible manifest (Issue #384).",
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const requestValidation = WittgensteinRequestSchema.safeParse(manifest.request);
      if (!requestValidation.success) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "MANIFEST_REQUEST_INVALID",
              message:
                "Recorded request does not match WittgensteinRequestSchema; cannot replay.",
              issues: requestValidation.error.issues,
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }
      const request: WittgensteinRequest = requestValidation.data;

      if (manifest.artifactSha256 === null) {
        console.error(
          JSON.stringify(
            {
              ok: false,
              code: "MANIFEST_NO_BASELINE_HASH",
              message:
                "Original manifest has no artifactSha256 to compare against (likely a failed run). Nothing to verify.",
            },
            null,
            2,
          ),
        );
        process.exitCode = 1;
        return;
      }

      const harness = await Wittgenstein.bootstrap({
        cwd: workspaceRoot,
        ...(options.config ? { configPath: options.config } : {}),
      });

      const outcome = await harness.run(request, {
        command: "replay",
        args: [absPath],
        cwd: workspaceRoot,
        dryRun: true,
      });

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
