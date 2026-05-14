/**
 * End-to-end smoke test for `wittgenstein replay <manifest-path>` (#384).
 *
 * Runs sensor --dry-run twice via the CLI; the second run is `replay`
 * against the first run's manifest. Asserts byte-parity through the
 * exit code + structured stdout.
 *
 * Why sensor: the sensor codec is fully deterministic (no LLM call, no
 * platform-divergence concerns like #374 image PNG). It is the canonical
 * route for proving the reproducibility claim today.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = resolve(packageRoot, "bin", "wittgenstein.js");

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "wittgenstein-replay-test-"));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("@wittgenstein/cli replay (Issue #384)", () => {
  it("svg --source local is byte-reproducible via replay", async () => {
    // Baseline run. Use packageRoot as cwd so the bin can resolve tsx
    // (the bin's workspace-marker check defaults to tsx mode when run
    // from inside the repo, and tsx is only in the workspace's
    // node_modules). The harness's `resolveExecutionRoot` then finds
    // the workspace and writes artifacts under `<repo>/artifacts/runs/`;
    // we pass a temp `--out` path to keep test artifacts isolated.
    //
    // Why svg-local and not sensor: sensor's HTML output embeds the
    // .csv output path as a user hint, so byte-parity across runs to
    // different paths is structurally impossible until that gets fixed
    // (filed as follow-up). svg-local emits pure deterministic SVG.
    const baselineOut = join(workDir, "baseline.svg");
    const baseline = spawnSync(
      process.execPath,
      [
        cliBin,
        "svg",
        "deterministic circle pattern",
        "--source",
        "local",
        "--seed",
        "42",
        "--out",
        baselineOut,
      ],
      { cwd: packageRoot, encoding: "utf8" },
    );
    expect(baseline.status).toBe(0);
    const baselineOutput = JSON.parse(baseline.stdout) as {
      ok: boolean;
      runDir: string;
      artifactPath: string;
    };
    expect(baselineOutput.ok).toBe(true);

    const baselineManifest = join(baselineOutput.runDir, "manifest.json");

    // Sanity: manifest exists and includes the `request` field (the new
    // schema addition that powers replay).
    const manifestRaw = JSON.parse(await readFile(baselineManifest, "utf8")) as {
      request?: unknown;
      artifactSha256?: string | null;
    };
    expect(manifestRaw.request).toBeDefined();
    expect(manifestRaw.artifactSha256).toBeTruthy();

    // Replay run.
    const replay = spawnSync(process.execPath, [cliBin, "replay", baselineManifest], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(0);
    const replayOutput = JSON.parse(replay.stdout) as {
      ok: boolean;
      code: string;
      baselineArtifactSha256: string;
      replayArtifactSha256: string;
    };
    expect(replayOutput.ok).toBe(true);
    expect(replayOutput.code).toBe("REPLAY_OK");
    expect(replayOutput.replayArtifactSha256).toBe(replayOutput.baselineArtifactSha256);
  });

  it("refuses replay for the image codec with a clear error", async () => {
    // Build a fake manifest with codec: image; replay should refuse.
    const fakeManifestDir = join(workDir, "fake-image");
    await mkdtemp(join(tmpdir(), "noop-")); // ensure tmpdir works
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(fakeManifestDir, { recursive: true });
    const fakeManifestPath = join(fakeManifestDir, "manifest.json");
    await writeFile(
      fakeManifestPath,
      JSON.stringify({
        runId: "fake-image-run",
        gitSha: "abc",
        lockfileHash: "def",
        nodeVersion: process.version,
        wittgensteinVersion: "0.0.0",
        command: "wittgenstein image",
        args: ["prompt"],
        seed: 7,
        codec: "image",
        license: { weightsRestriction: "permissive" },
        llmProvider: "anthropic",
        llmModel: "claude-opus-4-7",
        llmTokens: { input: 1, output: 2 },
        costUsd: 0,
        promptRaw: "prompt",
        promptExpanded: "prompt",
        llmOutputRaw: "{}",
        llmOutputParsed: {},
        request: { modality: "image", prompt: "prompt" },
        artifactPath: "/tmp/out.png",
        artifactSha256: "deadbeef",
        startedAt: new Date().toISOString(),
        durationMs: 10,
        ok: true,
      }),
      "utf8",
    );

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string };
    expect(errOutput.code).toBe("REPLAY_UNSUPPORTED_ROUTE");
  });

  it("refuses replay on a manifest missing the request field", async () => {
    const fakeManifestDir = join(workDir, "fake-no-request");
    const { mkdir, writeFile } = await import("node:fs/promises");
    await mkdir(fakeManifestDir, { recursive: true });
    const fakeManifestPath = join(fakeManifestDir, "manifest.json");
    await writeFile(
      fakeManifestPath,
      JSON.stringify({
        runId: "fake-sensor-run",
        gitSha: "abc",
        lockfileHash: "def",
        nodeVersion: process.version,
        wittgensteinVersion: "0.0.0",
        command: "wittgenstein sensor",
        args: ["prompt"],
        seed: 7,
        codec: "sensor",
        route: "ecg",
        license: { weightsRestriction: "permissive" },
        llmProvider: "anthropic",
        llmModel: "claude-opus-4-7",
        llmTokens: { input: 0, output: 0 },
        costUsd: 0,
        promptRaw: "prompt",
        promptExpanded: "prompt",
        llmOutputRaw: "{}",
        llmOutputParsed: {},
        // intentionally no `request` field — pre-replay-era manifest
        artifactPath: "/tmp/out.json",
        artifactSha256: "deadbeef",
        startedAt: new Date().toISOString(),
        durationMs: 10,
        ok: true,
      }),
      "utf8",
    );

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string };
    expect(errOutput.code).toBe("MANIFEST_MISSING_REQUEST");
  });
});
