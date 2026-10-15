import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_WITTGENSTEIN_CONFIG,
  WittgensteinConfigSchema,
  type WittgensteinConfig,
} from "@wittgenstein/schemas";
import { WittgensteinError } from "./errors.js";

export interface LoadConfigOptions {
  cwd?: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
}

const CONFIG_CANDIDATES = [
  "wittgenstein.config.ts",
  "wittgenstein.config.mts",
  "wittgenstein.config.js",
  "wittgenstein.config.mjs",
];

export async function loadWittgensteinConfig(
  options: LoadConfigOptions = {},
): Promise<WittgensteinConfig> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const env = options.env ?? process.env;
  const configPath = await resolveConfigPath(cwd, options.configPath);
  const loadedConfig = configPath ? await importConfig(configPath) : {};

  const merged = {
    ...DEFAULT_WITTGENSTEIN_CONFIG,
    ...loadedConfig,
    llm: {
      ...DEFAULT_WITTGENSTEIN_CONFIG.llm,
      ...loadedConfig.llm,
    },
    runtime: {
      ...DEFAULT_WITTGENSTEIN_CONFIG.runtime,
      ...loadedConfig.runtime,
      retry: {
        ...DEFAULT_WITTGENSTEIN_CONFIG.runtime.retry,
        ...loadedConfig.runtime?.retry,
      },
      budget: {
        ...DEFAULT_WITTGENSTEIN_CONFIG.runtime.budget,
        ...loadedConfig.runtime?.budget,
      },
    },
    codecs: {
      ...DEFAULT_WITTGENSTEIN_CONFIG.codecs,
      ...loadedConfig.codecs,
    },
    svg: {
      ...DEFAULT_WITTGENSTEIN_CONFIG.svg,
      ...loadedConfig.svg,
    },
  };

  if (env.WITTGENSTEIN_LLM_PROVIDER) {
    merged.llm.provider = env.WITTGENSTEIN_LLM_PROVIDER as WittgensteinConfig["llm"]["provider"];
  }

  if (env.WITTGENSTEIN_LLM_MODEL) {
    merged.llm.model = env.WITTGENSTEIN_LLM_MODEL;
  }

  if (env.WITTGENSTEIN_LLM_BASE_URL) {
    merged.llm.baseUrl = env.WITTGENSTEIN_LLM_BASE_URL;
  }

  if (env.WITTGENSTEIN_ARTIFACTS_DIR) {
    merged.runtime.artifactsDir = env.WITTGENSTEIN_ARTIFACTS_DIR;
  }

  if (env.WITTGENSTEIN_SVG_INFERENCE_URL) {
    merged.svg = {
      ...merged.svg,
      inferenceUrl: env.WITTGENSTEIN_SVG_INFERENCE_URL,
    };
  }

  try {
    return WittgensteinConfigSchema.parse(merged);
  } catch (cause) {
    throw configSchemaError(configPath, cause);
  }
}

async function resolveConfigPath(
  cwd: string,
  explicitPath?: string,
): Promise<string | null> {
  if (explicitPath) {
    return resolve(cwd, explicitPath);
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const candidatePath = resolve(cwd, candidate);
    if (await pathExists(candidatePath)) {
      return candidatePath;
    }
  }

  return null;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function importConfig(filePath: string): Promise<Partial<WittgensteinConfig>> {
  try {
    const imported = (await import(pathToFileURL(filePath).href)) as Record<string, unknown>;
    return (imported.default ?? imported.config ?? imported) as Partial<WittgensteinConfig>;
  } catch (cause) {
    throw new WittgensteinError(
      "CONFIG_LOAD_FAILED",
      `Failed to load Wittgenstein config "${filePath}": ${describeCause(cause)}`,
      { cause, details: { configPath: filePath } },
    );
  }
}

function configSchemaError(configPath: string | null, cause: unknown): WittgensteinError {
  const { summary, issues } = summarizeConfigIssues(cause);
  const subject = configPath ? `Wittgenstein config "${configPath}"` : "Wittgenstein config";
  return new WittgensteinError(
    "CONFIG_SCHEMA_INVALID",
    `${subject} failed schema validation: ${summary}`,
    {
      cause,
      details: {
        ...(configPath ? { configPath } : {}),
        ...(issues.length > 0 ? { issues } : {}),
      },
    },
  );
}

function summarizeConfigIssues(error: unknown): { summary: string; issues: unknown[] } {
  const issues = readIssues(error);
  if (issues.length === 0) {
    return { summary: describeCause(error), issues };
  }

  const statements = issues
    .slice(0, 3)
    .map((issue) => `${issuePath(issue)}: ${issueMessage(issue)}`);
  const remaining = issues.length - statements.length;
  const suffix = remaining > 0 ? ` (+${remaining} more issue${remaining === 1 ? "" : "s"})` : "";
  return { summary: `${statements.join("; ")}${suffix}`, issues };
}

function readIssues(error: unknown): unknown[] {
  if (typeof error === "object" && error !== null && "issues" in error) {
    const issues = (error as { issues?: unknown }).issues;
    if (Array.isArray(issues)) {
      return issues;
    }
  }
  return [];
}

function issuePath(issue: unknown): string {
  if (typeof issue === "object" && issue !== null) {
    const path = (issue as { path?: unknown }).path;
    if (Array.isArray(path) && path.length > 0) {
      return path.join(".");
    }
  }
  return "(root)";
}

function issueMessage(issue: unknown): string {
  if (typeof issue === "object" && issue !== null) {
    const message = (issue as { message?: unknown }).message;
    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }
  return "invalid value";
}

function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
