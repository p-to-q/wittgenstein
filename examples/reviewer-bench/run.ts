/**
 * Reviewer bench — one-command verification of Wittgenstein's
 * engineering claims, runnable on a 2024-era laptop in ≤5 minutes
 * with NO GPU dependency. See `./README.md` for the rationale.
 *
 * Verifies (Tier 0 surface only — no learned models):
 *   1. Each deterministic route (sensor, svg-local, asciipng) produces
 *      an artifact whose SHA-256 matches the pinned expected value.
 *   2. `wittgenstein replay` round-trips against saved manifests with
 *      byte parity (svg-local / sensor canonical replay targets).
 *   3. The doctor command reports tier readiness honestly.
 *
 * Output:
 *   - Pretty-prints a one-page markdown report to stdout.
 *   - Writes the same report to `examples/reviewer-bench/report.md`.
 *   - Exit code 0 on full pass; 1 on any failure (with detail in the
 *     report).
 *
 * Intended use: a reviewer / first-time visitor types `pnpm
 * reviewer-bench` after a clean checkout + install, and gets a
 * paste-into-review-form summary of the project's engineering claims
 * without setting up CUDA / ImageNet / FFmpeg / HyperFrames.
 *
 * The QUALITY claim (SOTA-adjacent FID-30K etc.) is verified by the
 * published benchmark page, NOT re-run here. See the delivery
 * doctrine note for the split.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const benchDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(benchDir, "..", "..");
const cliBin = resolve(repoRoot, "packages", "cli", "bin", "wittgenstein.js");
const workDir = resolve(benchDir, ".work");
const reportPath = resolve(benchDir, "report.md");
const expectedPath = resolve(benchDir, "expected.json");

interface ExpectedReceipt {
  /** Stable identifier for the bench row. */
  readonly id: string;
  /** Modality / route that produces the artifact. */
  readonly route: string;
  /** CLI args, exactly as passed (excluding --out which the bench injects). */
  readonly args: ReadonlyArray<string>;
  /** Artifact file basename inside the run's output directory. */
  readonly artifactBasename: string;
  /** Pinned SHA-256 of the artifact bytes. */
  readonly sha256: string;
  /** Human description for the report. */
  readonly description: string;
}

interface ExpectedFile {
  readonly schemaVersion: string;
  readonly receipts: ReadonlyArray<ExpectedReceipt>;
}

type RowOutcome = "pass" | "fail" | "skip";

interface RowResult {
  readonly id: string;
  readonly description: string;
  readonly outcome: RowOutcome;
  readonly expected: string;
  readonly observed: string;
  readonly detail?: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function parseCliJson<T extends object>(
  stdout: string,
  failure: {
    id: string;
    description: string;
    expected: string;
    observed: string;
  },
): { ok: true; payload: T } | { ok: false; row: RowResult } {
  try {
    return { ok: true, payload: JSON.parse(stdout) as T };
  } catch {
    return {
      ok: false,
      row: {
        ...failure,
        outcome: "fail",
        detail: stdout.slice(0, 200),
      },
    };
  }
}

async function readArtifactBytes(
  path: string,
  receipt: ExpectedReceipt,
): Promise<{ ok: true; bytes: Uint8Array } | { ok: false; row: RowResult }> {
  try {
    return { ok: true, bytes: new Uint8Array(await readFile(path)) };
  } catch (error) {
    return {
      ok: false,
      row: {
        id: receipt.id,
        description: receipt.description,
        outcome: "fail",
        expected: receipt.sha256,
        observed: "(artifact unreadable)",
        detail: `${path}: ${formatUnknownError(error)}`.slice(0, 400),
      },
    };
  }
}

async function runCli(
  args: ReadonlyArray<string>,
): Promise<{ stdout: string; stderr: string; status: number | null }> {
  // Run from repoRoot so the bin's workspace-marker check picks tsx
  // mode (with workspace node_modules visible). The script directs
  // artifacts to workDir via --out, so we don't pollute the repo.
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const out = { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
  noteRunDirFromStdout(out.stdout);
  return out;
}

async function verifyArtifactRow(receipt: ExpectedReceipt): Promise<RowResult> {
  const outPath = resolve(workDir, `${receipt.id}-${receipt.artifactBasename}`);
  await mkdir(dirname(outPath), { recursive: true });

  const result = await runCli([...receipt.args, "--out", outPath]);
  if (result.status !== 0) {
    return {
      id: receipt.id,
      description: receipt.description,
      outcome: "fail",
      expected: receipt.sha256,
      observed: "(cli failed)",
      detail: result.stderr.slice(0, 400) || result.stdout.slice(0, 400),
    };
  }

  // The CLI may write to <outPath> or to a derived path (e.g. sensor
  // emits .json/.csv/.html siblings; svg emits .svg). Try the primary
  // outPath first, then look up via the structured CLI stdout.
  const primaryArtifact = await readArtifactBytes(outPath, receipt);
  let bytes: Uint8Array | undefined = primaryArtifact.ok ? primaryArtifact.bytes : undefined;
  if (!bytes) {
    // Pull artifactPath from the CLI's JSON stdout.
    const parsed = parseCliJson<{ artifactPath?: string }>(result.stdout, {
      id: receipt.id,
      description: receipt.description,
      expected: receipt.sha256,
      observed: "(cli stdout unparsable)",
    });
    if (parsed.ok === false) {
      return parsed.row;
    }
    const cliPayload = parsed.payload;
    if (!cliPayload.artifactPath) {
      return {
        id: receipt.id,
        description: receipt.description,
        outcome: "fail",
        expected: receipt.sha256,
        observed: "(no artifactPath in cli stdout)",
        detail: result.stdout.slice(0, 200),
      };
    }
    const payloadArtifact = await readArtifactBytes(cliPayload.artifactPath, receipt);
    if (payloadArtifact.ok === false) {
      return payloadArtifact.row;
    }
    bytes = payloadArtifact.bytes;
  }

  const observed = sha256(bytes);
  if (observed === receipt.sha256) {
    return {
      id: receipt.id,
      description: receipt.description,
      outcome: "pass",
      expected: receipt.sha256,
      observed,
    };
  }
  return {
    id: receipt.id,
    description: receipt.description,
    outcome: "fail",
    expected: receipt.sha256,
    observed,
    detail: "Artifact SHA-256 mismatch.",
  };
}

async function verifyReplayRow(receipt: ExpectedReceipt): Promise<RowResult> {
  // First run produces the baseline manifest; second run replays it.
  // DO NOT pass --out: the harness writes to a runDir-local `output.<ext>`
  // by default; replay does the same. Identical basename across runs is
  // what makes byte parity possible for any codec whose artifact embeds
  // its own filename (sensor's HTML title via the Loupe path, for
  // example — third-party code we can't sanitize).
  const baseline = await runCli(receipt.args);
  if (baseline.status !== 0) {
    return {
      id: receipt.id,
      description: `${receipt.description} (replay round-trip)`,
      outcome: "fail",
      expected: "REPLAY_OK",
      observed: "(baseline run failed)",
      detail: baseline.stderr.slice(0, 400),
    };
  }
  const parsedBaseline = parseCliJson<{ runDir?: string }>(baseline.stdout, {
    id: receipt.id,
    description: `${receipt.description} (replay round-trip)`,
    expected: "REPLAY_OK",
    observed: "(baseline stdout unparsable)",
  });
  if (parsedBaseline.ok === false) {
    return parsedBaseline.row;
  }
  const baselineOut = parsedBaseline.payload;
  if (!baselineOut.runDir || !(await directoryExists(baselineOut.runDir))) {
    return {
      id: receipt.id,
      description: `${receipt.description} (replay round-trip)`,
      outcome: "fail",
      expected: "REPLAY_OK",
      observed: "(baseline runDir missing)",
      detail: baselineOut.runDir
        ? `${baselineOut.runDir} does not exist or is not a directory.`
        : baseline.stdout.slice(0, 200),
    };
  }
  const manifestPath = resolve(baselineOut.runDir, "manifest.json");

  const replay = await runCli(["replay", manifestPath]);
  if (replay.status !== 0) {
    let replayPayload: { code?: string } = {};
    try {
      replayPayload = JSON.parse(replay.stdout) as { code?: string };
    } catch {
      /* fall through with empty */
    }
    return {
      id: receipt.id,
      description: `${receipt.description} (replay round-trip)`,
      outcome: "fail",
      expected: "REPLAY_OK",
      observed: replayPayload.code ?? "(unknown failure)",
      detail: (replay.stderr || replay.stdout).slice(0, 400),
    };
  }
  return {
    id: receipt.id,
    description: `${receipt.description} (replay round-trip)`,
    outcome: "pass",
    expected: "REPLAY_OK",
    observed: "REPLAY_OK",
  };
}

async function verifyDoctor(): Promise<RowResult> {
  const result = await runCli(["doctor"]);
  if (result.status !== 0) {
    return {
      id: "doctor",
      description: "wittgenstein doctor exits 0",
      outcome: "fail",
      expected: "exit 0",
      observed: `exit ${result.status ?? "null"}`,
      detail: result.stderr.slice(0, 400) || result.stdout.slice(0, 400),
    };
  }
  return {
    id: "doctor",
    description: "wittgenstein doctor exits 0",
    outcome: "pass",
    expected: "exit 0",
    observed: "exit 0",
  };
}

function emoji(outcome: RowOutcome): string {
  return outcome === "pass" ? "✅" : outcome === "fail" ? "❌" : "⏭️";
}

function renderReport(rows: ReadonlyArray<RowResult>, elapsedMs: number): string {
  const passCount = rows.filter((r) => r.outcome === "pass").length;
  const failCount = rows.filter((r) => r.outcome === "fail").length;
  const skipCount = rows.filter((r) => r.outcome === "skip").length;
  const total = rows.length;
  const allPass = failCount === 0;

  const lines: string[] = [];
  lines.push("# Wittgenstein reviewer-bench report");
  lines.push("");
  lines.push(`**Verdict:** ${allPass ? "✅ all pass" : `❌ ${failCount} of ${total} failed`}`);
  lines.push("");
  lines.push(
    `**Summary:** ${passCount} pass · ${failCount} fail · ${skipCount} skip · ${total} total · ${(elapsedMs / 1000).toFixed(1)}s`,
  );
  lines.push("");
  lines.push("## What this bench verifies");
  lines.push("");
  lines.push("Wittgenstein's **engineering claims** at Tier 0 (no GPU, no learned models):");
  lines.push("");
  lines.push(
    "- Each deterministic-by-construction route (sensor, svg-local, asciipng) produces an artifact with a SHA-256 that matches a pinned receipt.",
  );
  lines.push("- `wittgenstein replay` round-trips a saved manifest to byte parity.");
  lines.push("- `wittgenstein doctor` exits clean.");
  lines.push("");
  lines.push(
    "The **quality** claim (SOTA-adjacent FID-30K and beyond) is verified by the published benchmark page, not re-run here. See [`docs/research/2026-05-13-delivery-and-componentization.md`](../../docs/research/2026-05-13-delivery-and-componentization.md) for the split.",
  );
  lines.push("");
  lines.push("## Rows");
  lines.push("");
  lines.push("| | ID | Description | Expected | Observed |");
  lines.push("|---|---|---|---|---|");
  for (const r of rows) {
    const desc = r.description.replace(/\|/g, "\\|");
    const exp =
      r.expected.length > 24 ? `${r.expected.slice(0, 8)}…${r.expected.slice(-8)}` : r.expected;
    const obs =
      r.observed.length > 24 ? `${r.observed.slice(0, 8)}…${r.observed.slice(-8)}` : r.observed;
    lines.push(`| ${emoji(r.outcome)} | \`${r.id}\` | ${desc} | \`${exp}\` | \`${obs}\` |`);
  }
  const failures = rows.filter((r) => r.outcome === "fail");
  if (failures.length > 0) {
    lines.push("");
    lines.push("## Failure detail");
    lines.push("");
    for (const r of failures) {
      lines.push(`### ${r.id} — ${r.description}`);
      lines.push("");
      lines.push(`- expected: \`${r.expected}\``);
      lines.push(`- observed: \`${r.observed}\``);
      if (r.detail) {
        lines.push("- detail:");
        lines.push("");
        lines.push("  ```");
        lines.push(`  ${r.detail.split("\n").join("\n  ")}`);
        lines.push("  ```");
      }
      lines.push("");
    }
  }
  lines.push("");
  lines.push("## Where to read further");
  lines.push("");
  lines.push(
    "- [`docs/research/2026-05-13-wittgenstein-research-program.md`](../../docs/research/2026-05-13-wittgenstein-research-program.md) — the three-track research program (engineering / research / hacker).",
  );
  lines.push(
    "- [`docs/research/2026-05-13-delivery-and-componentization.md`](../../docs/research/2026-05-13-delivery-and-componentization.md) — the tiered delivery doctrine that puts this bench in context.",
  );
  lines.push(
    "- [`docs/research/2026-05-13-verification-ladder.md`](../../docs/research/2026-05-13-verification-ladder.md) — the verification ladder the manifest spine + replay sit on.",
  );
  lines.push(
    "- [`docs/hard-constraints.md`](../../docs/hard-constraints.md) — the load-bearing doctrine constraints.",
  );
  lines.push("- [`docs/adrs/`](../../docs/adrs/) — every architecture decision, ratified.");
  lines.push("- [`docs/rfcs/`](../../docs/rfcs/) — every RFC, with red-team sections.");
  lines.push("");
  return lines.join("\n");
}

/** Track CLI-created runDirs so we can clean them up at the end. */
const createdRunDirs = new Set<string>();

function noteRunDirFromStdout(stdout: string): void {
  try {
    const payload = JSON.parse(stdout) as { runDir?: string; replayRunDir?: string };
    if (payload.runDir) createdRunDirs.add(payload.runDir);
    if (payload.replayRunDir) createdRunDirs.add(payload.replayRunDir);
  } catch {
    /* not JSON; skip */
  }
}

async function main(): Promise<void> {
  const started = Date.now();

  await rm(workDir, { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const expectedRaw = await readFile(expectedPath, "utf8");
  const expected = JSON.parse(expectedRaw) as ExpectedFile;

  const rows: RowResult[] = [];

  rows.push(await verifyDoctor());
  for (const receipt of expected.receipts) {
    rows.push(await verifyArtifactRow(receipt));
  }
  // Replay verification: one canonical row per replay-supported route.
  const replayTargets = expected.receipts.filter(
    (r) => r.id === "svg-local-replay" || r.id === "sensor-replay",
  );
  for (const receipt of replayTargets) {
    rows.push(await verifyReplayRow(receipt));
  }

  const elapsedMs = Date.now() - started;
  const report = renderReport(rows, elapsedMs);
  await writeFile(reportPath, report, "utf8");
  process.stdout.write(`${report}\n`);

  // Clean up: workDir and every runDir we caused the harness to create.
  // Reviewer-bench should leave a clean tree behind. Best-effort —
  // failures here don't change the exit code.
  await rm(workDir, { recursive: true, force: true });
  for (const runDir of createdRunDirs) {
    try {
      await rm(runDir, { recursive: true, force: true });
    } catch {
      /* leave behind; don't change exit code over cleanup */
    }
  }

  const failed = rows.some((r) => r.outcome === "fail");
  process.exit(failed ? 1 : 0);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `reviewer-bench crashed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(2);
});
