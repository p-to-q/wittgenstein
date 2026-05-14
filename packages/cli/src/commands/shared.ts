import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { RunManifest, WittgensteinRequest } from "@wittgenstein/schemas";
import { Wittgenstein } from "@wittgenstein/core";

export interface CommandRuntimeOptions {
  out?: string;
  seed?: string;
  dryRun?: boolean;
  config?: string;
  allowResearchWeights?: boolean;
}

export interface CommandInspectionContext {
  manifest: RunManifest;
  runDir: string;
  error: unknown;
}

export interface CommandOutputOptions {
  inspect?: (context: CommandInspectionContext) => Record<string, unknown> | undefined;
}

export async function runCodecCommand(
  request: WittgensteinRequest,
  command: string,
  args: string[],
  options: CommandRuntimeOptions,
  outputOptions: CommandOutputOptions = {},
): Promise<void> {
  const workspaceRoot = resolveExecutionRoot();
  const harness = await Wittgenstein.bootstrap({
    cwd: workspaceRoot,
    ...(options.config ? { configPath: options.config } : {}),
  });

  const outcome = await harness.run(request, {
    command,
    args,
    cwd: workspaceRoot,
    dryRun: options.dryRun ?? false,
    ...(options.out ? { outPath: resolve(workspaceRoot, options.out) } : {}),
    ...(options.config ? { configPath: options.config } : {}),
  });

  const extra = outputOptions.inspect?.({
    manifest: outcome.manifest,
    runDir: outcome.runDir,
    error: outcome.error,
  });

  console.log(
    JSON.stringify(
      {
        ok: outcome.manifest.ok,
        runId: outcome.manifest.runId,
        runDir: outcome.runDir,
        artifactPath: outcome.manifest.artifactPath,
        artifactSidecars: outcome.manifest.artifactSidecars,
        error: outcome.error,
        ...(extra ?? {}),
      },
      null,
      2,
    ),
  );

  if (!outcome.manifest.ok) {
    process.exitCode = 1;
  }
}

export function parseOptionalSeed(seed: string | undefined): number | null | undefined {
  if (seed === undefined) {
    return undefined;
  }

  return Number.parseInt(seed, 10);
}

export function resolveExecutionRoot(): string {
  let current = resolve(process.cwd());
  let parent = dirname(current);

  while (current !== parent) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) {
      return current;
    }
    current = parent;
    parent = dirname(current);
  }

  return existsSync(resolve(current, "pnpm-workspace.yaml")) ? current : process.cwd();
}
