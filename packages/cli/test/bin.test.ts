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
});
