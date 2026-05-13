/**
 * Helper: regenerate the SHA-256 receipts in
 * `examples/reviewer-bench/expected.json` by running each row's CLI
 * args and computing the artifact SHA.
 *
 * Run: `tsx scripts/reviewer-bench-pin.ts`
 *
 * The script DOES NOT write back to expected.json — it prints the
 * proposed file content. Eyeball the values, then commit.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cliBin = resolve(repoRoot, "packages", "cli", "bin", "wittgenstein.js");
const expectedPath = resolve(repoRoot, "examples", "reviewer-bench", "expected.json");
const workDir = resolve(repoRoot, "examples", "reviewer-bench", ".pin-work");

interface Receipt {
  id: string;
  route: string;
  args: string[];
  artifactBasename: string;
  sha256: string;
  description: string;
}

interface ExpectedFile {
  schemaVersion: string;
  _comment: string;
  receipts: Receipt[];
}

interface PinErrorBody {
  code: string;
  receiptId?: string;
  message: string;
  details?: unknown;
}

class PinError extends Error {
  readonly body: PinErrorBody;

  constructor(body: PinErrorBody) {
    super(body.message);
    this.name = "PinError";
    this.body = body;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pinReceipt(r: Receipt): Promise<string> {
  const outPath = resolve(workDir, `${r.id}-${r.artifactBasename}`);
  await mkdir(dirname(outPath), { recursive: true });
  const cli = spawnSync(process.execPath, [cliBin, ...r.args, "--out", outPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (cli.status !== 0) {
    throw new PinError({
      code: "CLI_FAILED",
      receiptId: r.id,
      message: `CLI failed while pinning ${r.id}.`,
      details: {
        status: cli.status,
        stderr: cli.stderr.slice(0, 800),
        stdout: cli.stdout.slice(0, 800),
      },
    });
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(outPath));
  } catch (primaryReadError) {
    let payload: { artifactPath?: string };
    try {
      payload = JSON.parse(cli.stdout) as { artifactPath?: string };
    } catch (parseError) {
      throw new PinError({
        code: "CLI_STDOUT_UNPARSABLE",
        receiptId: r.id,
        message: `CLI stdout was not valid JSON while pinning ${r.id}.`,
        details: {
          stdout: cli.stdout.slice(0, 800),
          primaryReadError:
            primaryReadError instanceof Error ? primaryReadError.message : String(primaryReadError),
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
        },
      });
    }
    if (!payload.artifactPath) {
      throw new PinError({
        code: "CLI_STDOUT_MISSING_ARTIFACT_PATH",
        receiptId: r.id,
        message: `CLI stdout did not include artifactPath while pinning ${r.id}.`,
        details: {
          stdout: cli.stdout.slice(0, 800),
          primaryReadError:
            primaryReadError instanceof Error ? primaryReadError.message : String(primaryReadError),
        },
      });
    }
    try {
      bytes = new Uint8Array(await readFile(payload.artifactPath));
    } catch (payloadReadError) {
      throw new PinError({
        code: "ARTIFACT_READ_FAILED",
        receiptId: r.id,
        message: `Could not read artifactPath while pinning ${r.id}.`,
        details: {
          artifactPath: payload.artifactPath,
          error:
            payloadReadError instanceof Error ? payloadReadError.message : String(payloadReadError),
        },
      });
    }
  }
  return sha256(bytes);
}

async function main(): Promise<void> {
  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const raw = await readFile(expectedPath, "utf8");
  const expected = JSON.parse(raw) as ExpectedFile;

  const updated: Receipt[] = [];
  for (const r of expected.receipts) {
    process.stderr.write(`pinning ${r.id}...\n`);
    const sha = await pinReceipt(r);
    updated.push({ ...r, sha256: sha });
  }

  const output: ExpectedFile = {
    ...expected,
    receipts: updated,
  };
  process.stdout.write(JSON.stringify(output, null, 2));
  process.stdout.write("\n");
}

main()
  .catch((error: unknown) => {
    const body =
      error instanceof PinError
        ? error.body
        : {
            code: "REVIEWER_BENCH_PIN_CRASHED",
            message: error instanceof Error ? error.message : String(error),
          };
    process.stderr.write(
      `${JSON.stringify(
        {
          ok: false,
          ...body,
        },
        null,
        2,
      )}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await rm(workDir, { recursive: true, force: true });
  });
