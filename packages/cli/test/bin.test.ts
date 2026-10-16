import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("@wittgenstein/cli bin", () => {
  // 30s allowance (repo-wide local convention): each test below spawns the
  // bin stub, which itself spawns `node --import tsx` (tsx startup per
  // spawn); local runs observed 2.8-4.8s — plain `pnpm test` (what CI
  // runs, 5s default) must pass.
  it("executes the CLI entrypoint from the workspace bin stub", () => {
    const result = spawnSync(process.execPath, ["./bin/wittgenstein.js", "--version"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
    expect(result.stderr).toBe("");
  }, 30_000);

  it("rejects malformed seed values before running a codec", () => {
    const result = spawnSync(
      process.execPath,
      ["./bin/wittgenstein.js", "sensor", "stable ECG trace", "--dry-run", "--seed", "12abc"],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "error: option '--seed <number>' argument '12abc' is invalid. Seed must be an integer.",
    );
  }, 30_000);

  it("rejects malformed positive numeric options before running a codec", () => {
    const result = spawnSync(
      process.execPath,
      [
        "./bin/wittgenstein.js",
        "sensor",
        "stable ECG trace",
        "--dry-run",
        "--duration-sec",
        "12abc",
      ],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "error: option '--duration-sec <number>' argument '12abc' is invalid. Value must be a positive number.",
    );
  }, 30_000);

  it("rejects malformed positive integer options before running a codec", () => {
    const result = spawnSync(
      process.execPath,
      ["./bin/wittgenstein.js", "asciipng", "hello", "--columns", "10xyz"],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(
      "error: option '--columns <n>' argument '10xyz' is invalid. Value must be a positive integer.",
    );
  }, 30_000);
});

describe("config refusals", () => {
  it("prints a structured CONFIG_LOAD_FAILED refusal for a missing --config path", () => {
    const missing = join(tmpdir(), `witt-missing-config-${process.pid}-${Date.now()}.json`);
    const result = spawnSync(
      process.execPath,
      ["./bin/wittgenstein.js", "image", "hello", "--config", missing, "--dry-run"],
      { cwd: packageRoot, encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    const payload = JSON.parse(result.stderr) as Record<string, unknown>;
    expect(payload).toMatchObject({ ok: false, code: "CONFIG_LOAD_FAILED" });
    expect(payload["details"]).toEqual({ configPath: missing });
  }, 30_000);

  it("prints a structured CONFIG_SCHEMA_INVALID refusal for schema-invalid config values", () => {
    const dir = mkdtempSync(join(tmpdir(), "witt-config-refusal-"));
    try {
      const configPath = join(dir, "wittgenstein.config.mjs");
      writeFileSync(configPath, 'export default { llm: { provider: "bogus-provider" } };\n');
      const result = spawnSync(
        process.execPath,
        ["./bin/wittgenstein.js", "doctor", "--config", configPath],
        { cwd: packageRoot, encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      const payload = JSON.parse(result.stderr) as { ok: boolean; code?: string; message?: string };
      expect(payload.ok).toBe(false);
      expect(payload.code).toBe("CONFIG_SCHEMA_INVALID");
      expect(payload.message).toContain("llm.provider");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
