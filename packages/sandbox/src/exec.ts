export interface ExecOptions {
  timeoutMs: number;
  memLimitMb?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface ExecResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

export interface SandboxErrorOptions {
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class SandboxError extends Error {
  public readonly code: string;
  public readonly details: Record<string, unknown> | undefined;

  public constructor(
    code: string,
    message: string,
    options: SandboxErrorOptions = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "SandboxError";
    this.code = code;
    this.details = options.details;
  }
}

export class NotImplementedError extends SandboxError {
  public constructor(scope: string, options: SandboxErrorOptions = {}) {
    const details = {
      kind: "production_sandbox_not_implemented",
      adr: "ADR-0016",
      ...options.details,
    };
    super("SANDBOX_NOT_IMPLEMENTED", `NotImplementedError(${scope})`, {
      cause: options.cause,
      details,
    });
    this.name = "NotImplementedError";
  }
}

/**
 * Reserved boundary for untrusted code execution (e.g. Python-backed audio DSP,
 * LLM-emitted drawing programs). Not implemented in scaffold — callers must
 * handle NotImplementedError.
 */
export async function execProgram(
  _code: string,
  _options: ExecOptions,
): Promise<ExecResult> {
  throw new NotImplementedError("execProgram", {
    details: {
      package: "@wittgenstein/sandbox",
      reservedBoundary: "untrusted-code-execution",
      mechanism: "none",
    },
  });
}
