/**
 * Last-resort CLI error boundary.
 *
 * Command actions can throw before they get a chance to emit their own
 * structured payload — most commonly when `loadWittgensteinConfig` refuses a
 * bad `--config` path (`CONFIG_LOAD_FAILED` / `CONFIG_SCHEMA_INVALID`).
 * `runCli` funnels every escaping rejection through `printCliError`, so the
 * CLI output contract (ADR-0009, RFC-0002 fix 1) also holds on the failure
 * path: stdout stays empty, stderr carries exactly one JSON document, and
 * the process exits 1 — never a raw Node stack trace.
 *
 * The refusal shape matches the other pre-run refusals
 * (`printImageDecoderError`, `printInstallError`): a flat
 * `{ ok: false, code, message, details? }`. A `stack` is attached only when
 * the error could not be named (`UNEXPECTED_ERROR`), for bug reports.
 */

export interface CliErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

export function shapeCliError(error: unknown): CliErrorPayload {
  const candidate =
    typeof error === "object" && error !== null
      ? (error as { code?: unknown; message?: unknown; details?: unknown; stack?: unknown })
      : undefined;
  const code =
    typeof candidate?.code === "string" && candidate.code.length > 0
      ? candidate.code
      : "UNEXPECTED_ERROR";
  const message =
    typeof candidate?.message === "string" && candidate.message.length > 0
      ? candidate.message
      : String(error);
  const payload: CliErrorPayload = { code, message };

  if (isRecord(candidate?.details)) {
    payload.details = candidate.details;
  }

  if (code === "UNEXPECTED_ERROR" && typeof candidate?.stack === "string") {
    payload.stack = candidate.stack;
  }

  return payload;
}

/** Print a pre-run refusal as a single canonical JSON document on stderr. */
export function printCliError(error: unknown): void {
  const payload = shapeCliError(error);
  console.error(encodeCliError(payload));
}

function encodeCliError(payload: CliErrorPayload): string {
  try {
    return JSON.stringify({ ok: false, ...payload }, null, 2);
  } catch {
    // Non-serializable `details` must not defeat the last-resort boundary;
    // fall back to the code + message, which are always strings.
    return JSON.stringify({ ok: false, code: payload.code, message: payload.message }, null, 2);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
