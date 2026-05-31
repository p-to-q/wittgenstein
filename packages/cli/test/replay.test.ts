/**
 * End-to-end smoke test for `wittgenstein replay <manifest-path>` (#384).
 *
 * Runs svg --source local via the CLI; the second run is `replay`
 * against the first run's manifest. Asserts byte-parity through the
 * exit code + structured stdout.
 *
 * Why svg-local and not sensor: sensor dashboards still carry an output-path
 * user hint, while svg-local emits pure deterministic SVG.
 */
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RunManifest, WittgensteinRequest } from "@wittgenstein/schemas";

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
    const fakeManifestPath = await writeManifest("fake-image", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: "/tmp/out.png",
      request: { modality: "image", prompt: "prompt" },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string };
    expect(errOutput.code).toBe("REPLAY_UNSUPPORTED_ROUTE");
  });

  it("refuses replay on a manifest missing the request field", async () => {
    const fakeManifestPath = await writeManifest("fake-no-request", {
      codec: "sensor",
      command: "wittgenstein sensor",
      route: "ecg",
      artifactPath: "/tmp/out.json",
      request: undefined,
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string };
    expect(errOutput.code).toBe("MANIFEST_MISSING_REQUEST");
  });

  it("refuses non-local svg manifests based on the recorded request", async () => {
    const fakeManifestPath = await writeManifest("fake-svg-engine", {
      codec: "svg",
      command: "wittgenstein svg",
      artifactPath: "/tmp/out.svg",
      request: { modality: "svg", prompt: "prompt", source: "engine" },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string; route: string };
    expect(errOutput.code).toBe("REPLAY_UNSUPPORTED_ROUTE");
    expect(errOutput.route).toBe("svg-engine");
  });

  it("refuses non-local asciipng manifests based on the recorded request", async () => {
    const fakeManifestPath = await writeManifest("fake-asciipng-minimax", {
      codec: "asciipng",
      command: "wittgenstein asciipng",
      artifactPath: "/tmp/out.png",
      request: { modality: "asciipng", prompt: "prompt", source: "minimax" },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string; route: string };
    expect(errOutput.code).toBe("REPLAY_UNSUPPORTED_ROUTE");
    expect(errOutput.route).toBe("asciipng-minimax");
  });

  it("refuses manifests whose codec disagrees with the recorded request", async () => {
    const fakeManifestPath = await writeManifest("fake-codec-request-mismatch", {
      codec: "svg",
      command: "wittgenstein svg",
      artifactPath: "/tmp/out.svg",
      request: { modality: "sensor", prompt: "prompt", signal: "ecg" },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as {
      code: string;
      codec: string;
      requestModality: string;
    };
    expect(errOutput.code).toBe("MANIFEST_REQUEST_CODEC_MISMATCH");
    expect(errOutput.codec).toBe("svg");
    expect(errOutput.requestModality).toBe("sensor");
  });

  it("reports replay bootstrap failures as structured errors", async () => {
    const fakeManifestPath = await writeManifest("fake-bad-config", {
      codec: "svg",
      command: "wittgenstein svg",
      artifactPath: "/tmp/out.svg",
      request: { modality: "svg", prompt: "prompt", source: "local" },
    });

    const replay = spawnSync(
      process.execPath,
      [cliBin, "replay", fakeManifestPath, "--config", "/tmp/wittgenstein-missing-config.toml"],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string; cause: string };
    expect(errOutput.code).toBe("REPLAY_EXECUTION_FAILED");
    expect(errOutput.cause).toContain("wittgenstein-missing-config.toml");
  });
});

type ManifestFixtureOptions = {
  codec: string;
  command: string;
  route?: string;
  artifactPath: string;
  request?: WittgensteinRequest;
};

async function writeManifest(
  directoryName: string,
  options: ManifestFixtureOptions,
): Promise<string> {
  const fakeManifestDir = join(workDir, directoryName);
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(fakeManifestDir, { recursive: true });
  const fakeManifestPath = join(fakeManifestDir, "manifest.json");
  const manifest: RunManifest = {
    runId: `${directoryName}-run`,
    gitSha: "abc",
    lockfileHash: "def",
    nodeVersion: process.version,
    wittgensteinVersion: "0.0.0",
    command: options.command,
    args: ["prompt"],
    seed: 7,
    codec: options.codec,
    route: options.route,
    license: { weightsRestriction: "permissive" },
    llmProvider: "anthropic",
    llmModel: "claude-opus-4-7",
    llmTokens: { input: 0, output: 0 },
    costUsd: 0,
    promptRaw: "prompt",
    promptExpanded: "prompt",
    llmOutputRaw: "{}",
    llmOutputParsed: {},
    request: options.request,
    artifactPath: options.artifactPath,
    artifactSha256: "deadbeef",
    startedAt: new Date().toISOString(),
    durationMs: 10,
    ok: true,
  };
  await writeFile(fakeManifestPath, JSON.stringify(manifest), "utf8");
  return fakeManifestPath;
}
