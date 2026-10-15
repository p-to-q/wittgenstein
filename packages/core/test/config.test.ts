import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadWittgensteinConfig } from "../src/runtime/config.js";

const createdDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "witt-config-"));
  createdDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadWittgensteinConfig error boundary", () => {
  it("loads defaults when no config file exists", async () => {
    const config = await loadWittgensteinConfig({ cwd: makeTempDir() });

    expect(config.runtime.artifactsDir).toBe("artifacts");
    expect(config.llm.provider).toBe("minimax");
  });

  it("wraps a missing explicit config path in CONFIG_LOAD_FAILED", async () => {
    const dir = makeTempDir();
    const missing = join(dir, "does-not-exist.json");
    let caught: unknown;
    try {
      await loadWittgensteinConfig({ cwd: dir, configPath: "does-not-exist.json" });
    } catch (error) {
      caught = error;
    }

    const shaped = caught as { code?: unknown; message?: unknown; details?: unknown };
    expect(shaped.code).toBe("CONFIG_LOAD_FAILED");
    expect(shaped.message).toContain(missing);
    expect(shaped.details).toEqual({ configPath: missing });
  });

  it("wraps schema-invalid config values in CONFIG_SCHEMA_INVALID", async () => {
    const dir = makeTempDir();
    const configPath = join(dir, "wittgenstein.config.mjs");
    writeFileSync(configPath, 'export default { llm: { provider: "bogus-provider" } };\n');

    let caught: unknown;
    try {
      await loadWittgensteinConfig({ cwd: dir });
    } catch (error) {
      caught = error;
    }

    const shaped = caught as { code?: unknown; message?: unknown; details?: unknown };
    const details = shaped.details as { configPath?: unknown; issues?: unknown } | undefined;
    expect(shaped.code).toBe("CONFIG_SCHEMA_INVALID");
    expect(shaped.message).toContain("Wittgenstein config");
    expect(shaped.message).toContain("llm.provider");
    expect(details?.configPath).toBe(configPath);
    expect(Array.isArray(details?.issues)).toBe(true);
  });

  it("reports env-only schema failures without inventing a config path", async () => {
    const dir = makeTempDir();
    let caught: unknown;
    try {
      await loadWittgensteinConfig({ cwd: dir, env: { WITTGENSTEIN_LLM_PROVIDER: "bogus" } });
    } catch (error) {
      caught = error;
    }

    const shaped = caught as { code?: unknown; message?: unknown; details?: unknown };
    const details = shaped.details as Record<string, unknown> | undefined;
    expect(shaped.code).toBe("CONFIG_SCHEMA_INVALID");
    expect(shaped.message).toContain("llm.provider");
    expect(details?.configPath).toBeUndefined();
  });
});
