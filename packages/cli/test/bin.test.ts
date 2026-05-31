import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("@wittgenstein/cli bin", () => {
  it("executes the CLI entrypoint from the workspace bin stub", () => {
    const result = spawnSync(process.execPath, ["./bin/wittgenstein.js", "--version"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe("0.1.0");
    expect(result.stderr).toBe("");
  });

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
  });
});
