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
    throw new Error(
      `cli failed for ${r.id}: status=${cli.status}\n${cli.stderr || cli.stdout}`,
    );
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await readFile(outPath));
  } catch {
    const payload = JSON.parse(cli.stdout) as { artifactPath?: string };
    if (!payload.artifactPath) {
      throw new Error(`no artifactPath in cli stdout for ${r.id}`);
    }
    bytes = new Uint8Array(await readFile(payload.artifactPath));
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

  await rm(workDir, { recursive: true, force: true });
}

main().catch((error: unknown) => {
  process.stderr.write(
    `reviewer-bench-pin crashed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
