/**
 * Coverage for the generic ProcessRunner utility (lifted from codec-video per
 * Issue #356). The original consumer (`hyperframes-wrapper`) only exercises
 * it indirectly through end-to-end MP4 rendering — these tests pin the
 * timeout + bounded-capture + structured-error invariants directly.
 */
import { describe, expect, it } from "vitest";
import { firstOutputLine, runProcess } from "../src/index.js";

const baseOptions = {
  cwd: process.cwd(),
  env: process.env,
};

describe("runProcess (Issue #356)", () => {
  it("resolves when the subprocess exits 0", async () => {
    await expect(
      runProcess("node", ["-e", "process.exit(0)"], baseOptions, 5_000, "exit-0"),
    ).resolves.toBeUndefined();
  });

  it("rejects with the exit code + tail output when the subprocess exits non-zero", async () => {
    let caught: unknown;
    try {
      await runProcess(
        "node",
        ["-e", "console.error('boom'); process.exit(2)"],
        baseOptions,
        5_000,
        "exit-2",
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("exit-2");
    expect(message).toContain("code 2");
    expect(message).toContain("boom");
  });

  it("kills + rejects when the subprocess exceeds the timeout", async () => {
    let caught: unknown;
    try {
      await runProcess(
        "node",
        ["-e", "setTimeout(()=>{}, 60_000)"],
        baseOptions,
        100,
        "timeout-test",
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("timeout-test");
    expect(message).toContain("100ms");
  });

  it("includes the optional timeoutHint in timeout error messages", async () => {
    let caught: unknown;
    try {
      await runProcess(
        "node",
        ["-e", "setTimeout(()=>{}, 60_000)"],
        { ...baseOptions, timeoutHint: "(set WITTGENSTEIN_TEST_TIMEOUT_MS)" },
        100,
        "hint-test",
      );
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).toContain("(set WITTGENSTEIN_TEST_TIMEOUT_MS)");
  });

  it("rejects with a spawn-error explanation when the command does not exist", async () => {
    let caught: unknown;
    try {
      await runProcess(
        "/no/such/binary/wittgenstein-test",
        [],
        baseOptions,
        5_000,
        "missing-binary",
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("Failed to spawn missing-binary");
  });
});

/**
 * Coverage for the consolidated `firstOutputLine` helper (lifted from three
 * in-file copies per #487 item 1). The helper feeds `--version`-style probes
 * across the doctor and video paths; its contract has to survive both
 * single-stream (some commands print to stdout, some to stderr) and
 * cross-platform line endings.
 */
describe("firstOutputLine (#487 consolidation)", () => {
  it("returns the first non-empty trimmed line of stdout when present", () => {
    expect(firstOutputLine("ffmpeg version 8.1.1 …\nbuild config", "")).toBe(
      "ffmpeg version 8.1.1 …",
    );
  });

  it("falls back to stderr when stdout is empty", () => {
    expect(firstOutputLine("", "Chrome/Chromium 148.0.0.0 macOS")).toBe(
      "Chrome/Chromium 148.0.0.0 macOS",
    );
  });

  it("skips leading blank / whitespace-only lines", () => {
    expect(firstOutputLine("\n   \n\thyperframes 0.6.46\n", "")).toBe("hyperframes 0.6.46");
  });

  it("handles CRLF line endings (Windows-shaped output)", () => {
    expect(firstOutputLine("first line\r\nsecond line\r\n", "")).toBe("first line");
  });

  it("returns empty string when both streams are empty", () => {
    expect(firstOutputLine("", "")).toBe("");
  });

  it("works in single-argument mode (legacy mp4-renderer firstLine call shape)", () => {
    expect(firstOutputLine("ffmpeg version 8.1.1 …\nbuild")).toBe("ffmpeg version 8.1.1 …");
  });
});
