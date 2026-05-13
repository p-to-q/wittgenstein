// Generic subprocess runner with timeout + stdout/stderr buffering. Extracted
// from `hyperframes-wrapper.ts` per #327 / #288 so the timeout boundary, the
// output buffering, and the structured-error extraction are no longer tangled
// with HyperFrames-specific code.
//
// Kept inside `packages/codec-video/src/` for now; if a second codec needs the
// same shape (likely once audio's Kokoro subprocess wiring is touched), this
// can lift to `packages/core/src/utils/` as a follow-up — flagged but not
// done here to keep the refactor surgical.

import { spawn } from "node:child_process";

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
