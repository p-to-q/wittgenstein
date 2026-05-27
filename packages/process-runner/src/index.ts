// Generic subprocess runner with timeout + stdout/stderr buffering. Lifted
// from `packages/codec-video/src/process-runner.ts` per Issue #356 so future
// codec subprocess work can reuse the timeout boundary, bounded output capture,
// and structured-error extraction without creating codec/core dependency cycles.

import { spawn, spawnSync } from "node:child_process";

export interface ProcessRunnerOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  /**
   * Optional operational hint appended to the timeout error message. Lets
   * callers preserve e.g. "(set WITTGENSTEIN_HYPERFRAMES_RENDER_TIMEOUT_MS)"
   * without baking the env-var name into this generic helper.
   */
  timeoutHint?: string;
}

/**
 * Cap on per-stream buffered output. Long-running noisy subprocesses can
 * otherwise accumulate unbounded strings; the error-path slice (`.slice(-8000)`
 * below) only consumes the last 8000 bytes, so a 32 KB cap stays well above
 * what error messages need while keeping memory predictable.
 */
const MAX_STREAM_BYTES = 32_768;

function appendCapped(current: string, chunk: string): string {
  const combined = current + chunk;
  if (combined.length <= MAX_STREAM_BYTES) {
    return combined;
  }
  return combined.slice(combined.length - MAX_STREAM_BYTES);
}

/**
 * Run a subprocess with a timeout and bounded stdout/stderr capture. Resolves
 * on exit code 0. Rejects with an `Error` carrying tail output on non-zero
 * exit, spawn error, or timeout.
 *
 * `errorPrefix` is used as the leading sentence of the rejection message; it
 * lets callers preserve their domain-specific phrasing (e.g.
 * "hyperframes render exited with code X").
 */
export async function runProcess(
  command: string,
  args: readonly string[],
  options: ProcessRunnerOptions,
  timeoutMs: number,
  errorPrefix: string,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout = appendCapped(stdout, chunk);
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr = appendCapped(stderr, chunk);
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      const hint = options.timeoutHint ? ` ${options.timeoutHint}` : "";
      reject(new Error(`${errorPrefix} timed out after ${timeoutMs}ms.${hint}`));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to spawn ${errorPrefix} (${command} ${args.join(" ")}). Is Node/npm available on PATH?`,
          { cause: error },
        ),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${errorPrefix} exited with code ${code}: ${stderr.slice(-8000) || stdout.slice(-8000)}`,
        ),
      );
    });
  });
}

/**
 * Returns the first non-empty line from a combined stdout / stderr pair,
 * trimmed. Used by `--version` probes that print one informative line and
 * sometimes deliver it on stderr instead of stdout (ffmpeg does, npx does
 * for some commands, headless Chrome does for `--version`).
 *
 * Consolidated from previous in-file copies in `packages/cli/doctor.ts`,
 * `packages/codec-video/hyperframes-cli-renderer.ts`, and the single-arg
 * `firstLine()` variant in `packages/codec-video/mp4-renderer.ts` per the
 * pre-training audit follow-up (#487 item 1).
 *
 * Accepts an optional `stderr` for the common probe-two-streams pattern.
 * When omitted, behaves identically to the older single-arg variant.
 */
export function firstOutputLine(stdout: string, stderr = ""): string {
  return (
    (stdout || stderr)
      .split(/\r?\n/)
      .find((line) => line.trim().length > 0)
      ?.trim() ?? ""
  );
}

/**
 * Standardized timeout policy for `<cmd> --version` probes. Version checks
 * should be near-instant; anything slower than this is either a misconfigured
 * tool, a hung subprocess, or the wrong command. The doctor / video-render
 * call sites previously used 1000ms and 10_000ms inconsistently for the same
 * probe; this constant pins the policy.
 *
 * Source: #487 item 3 (pre-training audit follow-up).
 */
export const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 1_000;

export interface SpawnVersionCheckOptions {
  /**
   * Override the default 1s timeout. Long-tail tools (`npx --no-install` on
   * a cold-cache macOS machine) sometimes need more; otherwise leave default.
   */
  readonly timeoutMs?: number;
  /**
   * Extra env to merge over `process.env`. Pass telemetry-suppression vars
   * (e.g. `HYPERFRAMES_NO_TELEMETRY: "1"`) without re-typing the whole env
   * spread at each call site.
   */
  readonly env?: NodeJS.ProcessEnv;
}

export interface SpawnVersionCheckResult {
  /** True iff the process exited with status 0 within the timeout. */
  readonly ok: boolean;
  /** Exit code, or `null` if the process was killed (timeout / signal). */
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  /** True iff the process was killed by the timeout. */
  readonly timedOut: boolean;
}

/**
 * Synchronous `<cmd> [args...]` probe with a standardized timeout policy.
 * Designed for the `<binary> --version` shape used by doctor and runtime
 * peer checks. Behaviour:
 *
 *   - Captures stdout + stderr as utf8 strings.
 *   - Merges `options.env` over `process.env` (so per-call telemetry-off
 *     toggles compose with the user's env).
 *   - Times out at `DEFAULT_VERSION_CHECK_TIMEOUT_MS` unless overridden.
 *   - Returns `{ ok, status, stdout, stderr, timedOut }`. Never throws on
 *     a missing binary — that's `ok: false` with `status: null`.
 *
 * The caller decides what to do with a failure (doctor reports `missing`,
 * video-render falls back to a default version string). Consolidating the
 * timeout + result shape here means a future maintainer touching version
 * probes doesn't have to re-derive "what should I do on timeout?" at each
 * call site.
 *
 * Source: #487 item 3.
 */
export function spawnVersionCheck(
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnVersionCheckOptions = {},
): SpawnVersionCheckResult {
  const timeout = options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS;
  const env = options.env ? { ...process.env, ...options.env } : process.env;
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    timeout,
    env,
  });
  // Node sets `signal` when the timeout kills the child.
  const timedOut = result.signal !== null && result.signal !== undefined;
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    timedOut,
  };
}
