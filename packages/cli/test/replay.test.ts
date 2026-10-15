/**
 * `wittgenstein replay <manifest-path>` (#384; S7d bridge-lane verification).
 *
 * Two layers:
 *   - end-to-end CLI runs: deterministic local routes (svg / sensor / image
 *     placeholder) reproduce byte-for-byte; refusal paths are structured;
 *     bridge-lane runs resolve the recorded decoder cache-only (no fetch —
 *     proven by a poisoned weights URL in the environment).
 *   - unit runs through `replayManifest` with an injected loader: the S7d
 *     verification chain (decoder identity → decode-input digest →
 *     class-aware artifact parity) plus its refusals, and the S7e runtime
 *     identity evidence (report-only, never a violation).
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ImageDecoderBridge } from "@wittgenstein/codec-image";
import { LLAMAGEN_DECODER_ID } from "@wittgenstein/codec-image";
import type { RunManifest, WittgensteinRequest } from "@wittgenstein/schemas";
import { replayManifest } from "../src/commands/replay.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cliBin = resolve(packageRoot, "bin", "wittgenstein.js");

const STUB_DECODER_HASH = "recorded-weights-sha256";

/**
 * Digest of the latents the pipeline produces for `imageSceneJson()` below.
 * Pinned (golden-style): if the recorded-generation seam silently fell back
 * to the dry-run stub scene, the replay-side digest would differ and the
 * latents-parity assertions would fail.
 */
const FIXTURE_LATENTS_SHA256 = "aebd1ec29adcdc50ea2326711ed7be8ff07361d22c13af6a2f7b79ae5b3121ea";

let workDir: string;
const previousSeedExpander = process.env.WITTGENSTEIN_IMAGE_SEED_EXPANDER;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "wittgenstein-replay-test-"));
  // The pinned latents digest assumes the default (placeholder) seed
  // expander; guard against ambient configuration changing the ABI.
  delete process.env.WITTGENSTEIN_IMAGE_SEED_EXPANDER;
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
  if (previousSeedExpander === undefined) {
    delete process.env.WITTGENSTEIN_IMAGE_SEED_EXPANDER;
  } else {
    process.env.WITTGENSTEIN_IMAGE_SEED_EXPANDER = previousSeedExpander;
  }
});

describe("@wittgenstein/cli replay (Issue #384) — end to end", () => {
  // 30s allowance: two CLI spawns (baseline + replay, tsx startup each)
  // exceed vitest's 5s default under load — plain `pnpm test` (CI) must
  // pass; found 2026-10-16 during the pre-push CI-mirror sweep.
  it("svg --source local is byte-reproducible via replay", async () => {
    // Baseline run. Use packageRoot as cwd so the bin can resolve tsx
    // (the bin's workspace-marker check defaults to tsx mode when run
    // from inside the repo, and tsx is only in the workspace's
    // node_modules). The harness's `resolveExecutionRoot` then finds
    // the workspace and writes artifacts under `<repo>/artifacts/runs/`;
    // we pass a temp `--out` path to keep test artifacts isolated.
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
  }, 30_000);

  // 30s allowance: two CLI spawns (baseline + replay, tsx startup each)
  // exceed vitest's 5s default under load — plain `pnpm test` (CI) must
  // pass; found 2026-10-16 during the pre-push CI-mirror sweep.
  it("sensor dry-run is byte-reproducible via replay", async () => {
    // Keep the default output basename (`output.*`) for both baseline and replay.
    // The optional Loupe dashboard path embeds only the basename, so this remains
    // byte-stable whether the Python dashboard or static fallback renders HTML.
    const baseline = spawnSync(
      process.execPath,
      [
        cliBin,
        "sensor",
        "deterministic ecg replay",
        "--dry-run",
        "--signal",
        "ecg",
        "--sample-rate-hz",
        "32",
        "--duration-sec",
        "2",
        "--seed",
        "42",
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
    expect(baselineOutput.artifactPath.endsWith(".html")).toBe(true);

    const baselineManifest = join(baselineOutput.runDir, "manifest.json");
    const manifestRaw = JSON.parse(await readFile(baselineManifest, "utf8")) as {
      request?: unknown;
      artifactSha256?: string | null;
    };
    expect(manifestRaw.request).toBeDefined();
    expect(manifestRaw.artifactSha256).toBeTruthy();

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
  }, 30_000);

  // 30s allowance: two CLI spawns (baseline + replay, tsx startup each)
  // exceed vitest's 5s default under load — plain `pnpm test` (CI) must
  // pass; found 2026-10-16 during the pre-push CI-mirror sweep.
  it("image placeholder dry-run is byte-reproducible via recorded-generation replay", async () => {
    const baselineOut = join(workDir, "baseline-image.png");
    const baseline = spawnSync(
      process.execPath,
      [
        cliBin,
        "image",
        "deterministic placeholder replay",
        "--dry-run",
        "--seed",
        "42",
        "--out",
        baselineOut,
      ],
      { cwd: packageRoot, encoding: "utf8" },
    );
    expect(baseline.status).toBe(0);
    // Image runs print progress diagnostics ahead of the JSON body (svg and
    // sensor do not), so parse from the first brace of the stdout stream.
    const baselineOutput = JSON.parse(stdoutBody(baseline.stdout)) as {
      ok: boolean;
      runDir: string;
      artifactPath: string;
    };
    expect(baselineOutput.ok).toBe(true);
    expect(baselineOutput.artifactPath).toBe(baselineOut);

    const baselineManifest = join(baselineOutput.runDir, "manifest.json");
    const manifestRaw = JSON.parse(await readFile(baselineManifest, "utf8")) as {
      request?: unknown;
      artifactSha256?: string | null;
      llmOutputRaw?: string | null;
      "image.adapter"?: unknown;
      "image.decoder"?: unknown;
    };
    expect(manifestRaw.request).toBeDefined();
    expect(manifestRaw.artifactSha256).toBeTruthy();
    // Placeholder lane: adapter receipt carries the S7d decode-input digest;
    // the injected-bridge row is absent — replay must still verify this run
    // byte-for-byte, via recorded-generation replay of the stub scene.
    expect((manifestRaw["image.adapter"] as { latentsSha256?: string }).latentsSha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(manifestRaw["image.decoder"]).toBeUndefined();
    expect(typeof manifestRaw.llmOutputRaw).toBe("string");

    const replay = spawnSync(process.execPath, [cliBin, "replay", baselineManifest], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(0);
    const replayOutput = JSON.parse(stdoutBody(replay.stdout)) as {
      ok: boolean;
      code: string;
      byteParity: boolean;
      determinismClass: string;
      latents: { latentsParity: boolean };
      baselineArtifactSha256: string;
      replayArtifactSha256: string;
    };
    expect(replayOutput.ok).toBe(true);
    expect(replayOutput.code).toBe("REPLAY_OK");
    expect(replayOutput.byteParity).toBe(true);
    expect(replayOutput.determinismClass).toBe("byte-parity");
    expect(replayOutput.latents.latentsParity).toBe(true);
    expect(replayOutput.replayArtifactSha256).toBe(replayOutput.baselineArtifactSha256);
  }, 30_000);

  it("resolves a recorded bridge decoder cache-only — never fetches, reports REPLAY_DECODER_UNAVAILABLE", async () => {
    const cacheDir = join(workDir, "empty-decoder-cache");
    await mkdir(cacheDir, { recursive: true });
    const manifestPath = await writeManifest("bridge-decoder-unavailable", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "bridge lane replay" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", manifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        WITTGENSTEIN_DECODER_CACHE_DIR: cacheDir,
        // Poison the ambient weights URL: if replay ever fetched, this would
        // surface as a fetch failure (or a hang) instead of WEIGHTS_NOT_INSTALLED.
        WITTGENSTEIN_LLAMAGEN_WEIGHTS_URL: "http://127.0.0.1:1",
      },
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as {
      ok: boolean;
      code: string;
      decoderId: string;
      decoderCode: string;
      installHint: string;
    };
    expect(errOutput.ok).toBe(false);
    expect(errOutput.code).toBe("REPLAY_DECODER_UNAVAILABLE");
    expect(errOutput.decoderId).toBe(LLAMAGEN_DECODER_ID);
    expect(errOutput.decoderCode).toBe("WEIGHTS_NOT_INSTALLED");
    expect(errOutput.installHint).toContain("install image");
  });

  it("refuses recorded decoders this build does not know", async () => {
    const manifestPath = await writeManifest("bridge-decoder-unknown", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "future decoder" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ decoderId: "future-decoder-v9" }),
      },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", manifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string; decoderId: string };
    expect(errOutput.code).toBe("REPLAY_DECODER_UNSUPPORTED");
    expect(errOutput.decoderId).toBe("future-decoder-v9");
  });

  it("refuses image manifests without a recorded llmOutputRaw (no stub substitution)", async () => {
    const manifestPath = await writeManifest("image-no-llm-output", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "no recorded scene" },
      llmOutputRaw: null,
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", manifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string };
    expect(errOutput.code).toBe("MANIFEST_MISSING_LLM_OUTPUT");
  });

  it("refuses malformed image.decoder rows at the manifest-schema boundary (S7e promotion)", async () => {
    const manifestPath = await writeManifest("image-bad-decoder-row", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "malformed row" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        "image.decoder": { lane: "injected-bridge", decoderId: 42, decoderHash: "x", determinismClass: "byte-parity" },
      },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", manifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as {
      code: string;
      issues: Array<{ path: Array<string | number> }>;
    };
    // S7e typed the row: it is part of the manifest contract now, so a
    // malformed field refuses the whole schema parse with a path-precise
    // issue instead of the retired `MANIFEST_IMAGE_DECODER_INVALID`
    // lane-reader refusal.
    expect(errOutput.code).toBe("MANIFEST_SCHEMA_INVALID");
    expect(
      errOutput.issues.some((issue) => issue.path.join(".") === "image.decoder.decoderId"),
    ).toBe(true);
  });

  it("refuses bridge-lane manifests whose receipts predate S7d (no latents digest)", async () => {
    const manifestPath = await writeManifest("bridge-no-digest", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "old receipts" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(null),
        ...imageDecoderRow(),
      },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", manifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string; decoderId: string };
    expect(errOutput.code).toBe("MANIFEST_MISSING_LATENTS_DIGEST");
    expect(errOutput.decoderId).toBe(LLAMAGEN_DECODER_ID);
  });

  it("refuses non-image routes that recorded a live LLM call", async () => {
    const manifestPath = await writeManifest("sensor-live-llm", {
      codec: "sensor",
      command: "wittgenstein sensor",
      route: "ecg",
      artifactPath: "/tmp/out.json",
      request: { modality: "sensor", prompt: "prompt", signal: "ecg" },
      llmTokens: { input: 12, output: 4 },
      costUsd: 0.002,
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", manifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as { code: string };
    expect(errOutput.code).toBe("REPLAY_LIVE_LLM_UNSUPPORTED");
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

    const missingConfigPath = join(workDir, "wittgenstein-missing-config.toml");
    const replay = spawnSync(
      process.execPath,
      [cliBin, "replay", fakeManifestPath, "--config", missingConfigPath],
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

  it("reports invalid recorded requests before replay execution", async () => {
    const fakeManifestPath = await writeManifest("fake-invalid-request", {
      codec: "svg",
      command: "wittgenstein svg",
      artifactPath: "/tmp/out.svg",
      rawRequest: { modality: "svg", prompt: "" },
    });

    const replay = spawnSync(process.execPath, [cliBin, "replay", fakeManifestPath], {
      cwd: packageRoot,
      encoding: "utf8",
    });
    expect(replay.status).toBe(1);
    const errOutput = JSON.parse(replay.stderr) as {
      code: string;
      issues: Array<{ path: Array<string | number> }>;
    };
    expect(errOutput.code).toBe("MANIFEST_REQUEST_INVALID");
    expect(errOutput.issues.some((issue) => issue.path.includes("prompt"))).toBe(true);
  });
});

describe("replay bridge-lane verification chain (S7d/S7e, unit)", () => {
  it("replays a bridge-backed byte-parity run to REPLAY_OK with full evidence", async () => {
    const stubPng = pngBytes(64, 64, 0xa1);
    const manifestPath = await writeManifest("bridge-happy", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "bridge lane replay" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(stubPng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    let seenOptions: Record<string, unknown> | undefined;
    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async (options) => {
          seenOptions = options;
          return { bridge: stubImageDecoderBridge({ pngBytes: stubPng }).bridge };
        },
      },
    );

    // Manifest-recorded decoder id resolved to a family and loaded cache-only.
    expect(seenOptions).toMatchObject({ decoder: "llamagen", cacheOnly: true });
    expect(report.ok).toBe(true);
    expect(report.code).toBe("REPLAY_OK");
    expect(report.byteParity).toBe(true);
    expect(report.determinismClass).toBe("byte-parity");
    expect(report.decoder).toMatchObject({
      decoderId: LLAMAGEN_DECODER_ID,
      baselineDecoderHash: STUB_DECODER_HASH,
      replayDecoderHash: STUB_DECODER_HASH,
      decoderHashParity: true,
    });
    expect(report.latents).toMatchObject({
      baselineLatentsSha256: FIXTURE_LATENTS_SHA256,
      replayLatentsSha256: FIXTURE_LATENTS_SHA256,
      latentsParity: true,
    });
  });

  it("refuses decoders this build cannot resolve, before loading anything", async () => {
    let loaderCalled = false;
    const manifestPath = await writeManifest("unit-decoder-unknown", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ decoderId: "future-decoder-v9" }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => {
          loaderCalled = true;
          return { bridge: stubImageDecoderBridge().bridge };
        },
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_DECODER_UNSUPPORTED");
    expect(loaderCalled).toBe(false);
  });

  it("maps a local cache miss to REPLAY_DECODER_UNAVAILABLE with the install hint", async () => {
    const manifestPath = await writeManifest("unit-decoder-unavailable", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          error: {
            code: "WEIGHTS_NOT_INSTALLED",
            message: "not installed",
            installHint: "wittgenstein install image",
            details: { family: "llamagen" },
          },
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_DECODER_UNAVAILABLE");
    expect(report.decoderCode).toBe("WEIGHTS_NOT_INSTALLED");
    expect(report.installHint).toBe("wittgenstein install image");
  });

  it("passes through other typed loader failures unchanged", async () => {
    const manifestPath = await writeManifest("unit-decoder-opt-in", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          error: { code: "RESEARCH_WEIGHTS_REQUIRES_OPT_IN", message: "research only" },
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("RESEARCH_WEIGHTS_REQUIRES_OPT_IN");
  });

  it("refuses when the loaded decoder id does not match the recorded one", async () => {
    const manifestPath = await writeManifest("unit-decoder-id-mismatch", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ decoderId: "other-bridge" }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_DECODER_ID_MISMATCH");
    expect(report.expectedDecoderId).toBe(LLAMAGEN_DECODER_ID);
    expect(report.installedDecoderId).toBe("other-bridge");
  });

  it("refuses when the installed decoder's determinism class differs from the recorded one", async () => {
    const manifestPath = await writeManifest("unit-decoder-class-mismatch", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ determinismClass: "structural-parity" }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ determinismClass: "byte-parity" }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_DECODER_CLASS_MISMATCH");
    expect(report.expectedDeterminismClass).toBe("structural-parity");
    expect(report.installedDeterminismClass).toBe("byte-parity");
  });

  it("flags decoder weight drift after re-decode (hash is post-run evidence)", async () => {
    const stubPng = pngBytes(64, 64, 0xa1);
    const manifestPath = await writeManifest("unit-hash-drift", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(stubPng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ pngBytes: stubPng, decoderHash: "drifted-weights-sha" }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_DECODER_HASH_MISMATCH");
    expect(report.baselineArtifactSha256).toBe(report.replayArtifactSha256);
    expect(report.decoder).toMatchObject({
      baselineDecoderHash: STUB_DECODER_HASH,
      replayDecoderHash: "drifted-weights-sha",
      decoderHashParity: false,
    });
  });

  it("flags a decode-input digest mismatch as REPLAY_LATENTS_MISMATCH", async () => {
    const stubPng = pngBytes(64, 64, 0xa1);
    const manifestPath = await writeManifest("unit-latents-mismatch", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(stubPng),
      extraRows: {
        ...imageAdapterRow("0".repeat(64)),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ pngBytes: stubPng }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_LATENTS_MISMATCH");
    expect(report.latents).toMatchObject({
      baselineLatentsSha256: "0".repeat(64),
      replayLatentsSha256: FIXTURE_LATENTS_SHA256,
      latentsParity: false,
    });
  });

  it("reports a byte mismatch for a byte-parity decoder as REPLAY_HASH_MISMATCH", async () => {
    const manifestPath = await writeManifest("unit-byte-mismatch", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(pngBytes(64, 64, 0xff)),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ pngBytes: pngBytes(64, 64, 0xa1) }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_HASH_MISMATCH");
    expect(report.byteParity).toBe(false);
  });

  it("verifies a structural-parity decoder at its declared class (bytes differ, structure matches)", async () => {
    const baselinePng = pngBytes(64, 64, 0xb1);
    const baselineArtifactPath = join(workDir, "baseline-structural.png");
    await writeFile(baselineArtifactPath, baselinePng);
    const manifestPath = await writeManifest("unit-structural-ok", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: baselineArtifactPath,
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(baselinePng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ determinismClass: "structural-parity" }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({
            determinismClass: "structural-parity",
            pngBytes: pngBytes(64, 64, 0xc7),
          }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(true);
    expect(report.code).toBe("REPLAY_STRUCTURAL_OK");
    expect(report.byteParity).toBe(false);
    expect(report.determinismClass).toBe("structural-parity");
    expect(report.structure).toEqual({
      baseline: { width: 64, height: 64 },
      replay: { width: 64, height: 64 },
    });
  });

  it("reports REPLAY_STRUCTURE_MISMATCH when IHDR dimensions differ", async () => {
    const baselinePng = pngBytes(64, 64, 0xb1);
    const baselineArtifactPath = join(workDir, "baseline-structural-mismatch.png");
    await writeFile(baselineArtifactPath, baselinePng);
    const manifestPath = await writeManifest("unit-structural-mismatch", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: baselineArtifactPath,
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(baselinePng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ determinismClass: "structural-parity" }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({
            determinismClass: "structural-parity",
            pngBytes: pngBytes(128, 128, 0xc7),
            outputPixels: [128, 128],
          }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_STRUCTURE_MISMATCH");
    expect(report.structure).toEqual({
      baseline: { width: 64, height: 64 },
      replay: { width: 128, height: 128 },
    });
  });

  it("reports REPLAY_ARTIFACT_READ_FAILED when the baseline artifact is missing", async () => {
    const manifestPath = await writeManifest("unit-artifact-missing", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "never-written.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(pngBytes(64, 64, 0xb1)),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ determinismClass: "structural-parity" }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({
            determinismClass: "structural-parity",
            pngBytes: pngBytes(64, 64, 0xc7),
          }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(false);
    expect(report.code).toBe("REPLAY_ARTIFACT_READ_FAILED");
    expect(report.side).toBe("baseline");
  });

  it("reports the recorded runtime identity as advisory evidence (S7e)", async () => {
    const stubPng = pngBytes(64, 64, 0xa1);
    const runtime = {
      name: "onnxruntime-node" as const,
      version: "1.30.0",
      executionProviders: ["cpu"],
    };
    const manifestPath = await writeManifest("unit-runtime-identity", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(stubPng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ runtime }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ pngBytes: stubPng, runtime }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(true);
    expect(report.code).toBe("REPLAY_OK");
    expect(report.decoder).toMatchObject({
      baselineRuntime: runtime,
      replayRuntime: runtime,
      runtimeParity: true,
    });
  });

  it("reports runtime drift as evidence without failing replay (report-only)", async () => {
    const stubPng = pngBytes(64, 64, 0xa1);
    const recordedRuntime = {
      name: "onnxruntime-node" as const,
      version: "1.30.0",
      executionProviders: ["cpu"],
    };
    const installedRuntime = { ...recordedRuntime, version: "1.31.0" };
    const manifestPath = await writeManifest("unit-runtime-drift", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(stubPng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow({ runtime: recordedRuntime }),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ pngBytes: stubPng, runtime: installedRuntime }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(true);
    expect(report.code).toBe("REPLAY_OK");
    expect(report.decoder).toMatchObject({
      baselineRuntime: recordedRuntime,
      replayRuntime: installedRuntime,
      runtimeParity: false,
    });
  });

  it("keeps pre-S7e receipts replayable — runtimeParity null when the baseline recorded none", async () => {
    const stubPng = pngBytes(64, 64, 0xa1);
    const installedRuntime = {
      name: "onnxruntime-node" as const,
      version: "1.30.0",
      executionProviders: ["cpu"],
    };
    const manifestPath = await writeManifest("unit-runtime-legacy", {
      codec: "image",
      command: "wittgenstein image",
      artifactPath: join(workDir, "out.png"),
      request: { modality: "image", prompt: "x" },
      llmOutputRaw: imageSceneJson(),
      artifactSha256: sha256Hex(stubPng),
      extraRows: {
        ...imageAdapterRow(FIXTURE_LATENTS_SHA256),
        ...imageDecoderRow(),
      },
    });

    const report = await replayManifest(
      { manifestPath },
      {
        loadImageDecoderBridgeForRun: async () => ({
          bridge: stubImageDecoderBridge({ pngBytes: stubPng, runtime: installedRuntime }).bridge,
        }),
      },
    );

    expect(report.ok).toBe(true);
    expect(report.code).toBe("REPLAY_OK");
    expect(report.decoder).toMatchObject({
      baselineRuntime: null,
      replayRuntime: installedRuntime,
      runtimeParity: null,
    });
  });
});

type ManifestFixtureOptions = {
  codec: string;
  command: string;
  route?: string;
  artifactPath?: string;
  request?: WittgensteinRequest;
  rawRequest?: unknown;
  artifactSha256?: string;
  llmOutputRaw?: string | null;
  llmTokens?: { input: number; output: number };
  costUsd?: number;
  extraRows?: Record<string, unknown>;
};

async function writeManifest(
  directoryName: string,
  options: ManifestFixtureOptions,
): Promise<string> {
  const fakeManifestDir = join(workDir, directoryName);
  await mkdir(fakeManifestDir, { recursive: true });
  const fakeManifestPath = join(fakeManifestDir, "manifest.json");
  const manifest: RunManifest & Record<string, unknown> = {
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
    llmTokens: options.llmTokens ?? { input: 0, output: 0 },
    costUsd: options.costUsd ?? 0,
    promptRaw: "prompt",
    promptExpanded: "prompt",
    llmOutputRaw: options.llmOutputRaw === undefined ? "{}" : options.llmOutputRaw,
    llmOutputParsed: {},
    request: options.rawRequest ?? options.request,
    artifactPath: options.artifactPath ?? "/tmp/out.png",
    artifactSha256: options.artifactSha256 ?? "deadbeef",
    startedAt: new Date().toISOString(),
    durationMs: 10,
    ok: true,
    ...(options.extraRows ?? {}),
  };
  await writeFile(fakeManifestPath, JSON.stringify(manifest), "utf8");
  return fakeManifestPath;
}

/**
 * A recorded scene JSON the deterministic suffix can re-execute: same shape
 * as the codec's dry-run stub scene (32-token `witt-dry-run` seed code,
 * llamagen / stub-codebook [32,32] grid) but with explicit fixed tokens so
 * the produced latents digest is pinnable.
 *
 * Deliberately constant — no per-test subject: `hashSpecToSeed` folds the
 * normalized subject into the expansion seed, so a varying subject would
 * make the produced latents digest test-dependent and a single
 * `FIXTURE_LATENTS_SHA256` unusable across the suite.
 */
function imageSceneJson(): string {
  return JSON.stringify({
    mode: "one-shot-vsc",
    semantic: {
      intent: "Recorded scene for replay tests",
      composition: {
        framing: "centered subject",
        camera: "neutral camera",
        depthPlan: ["foreground", "midground", "background"],
      },
      lighting: { mood: "neutral", key: "soft" },
      style: {
        references: ["local deterministic preview"],
        palette: ["neutral grey", "soft blue", "warm highlight"],
      },
      constraints: { mustHave: [], negative: [] },
    },
    seedCode: {
      schemaVersion: "witt.image.seed/v0.1",
      family: "witt-dry-run",
      mode: "prefix",
      length: 32,
      tokens: Array.from({ length: 32 }, (_, index) => (index * 7 + 1) % 8192),
    },
    decoder: {
      family: "llamagen",
      codebook: "stub-codebook",
      codebookVersion: "v0",
      latentResolution: [32, 32],
    },
  });
}

function imageAdapterRow(latentsSha256: string | null): Record<string, unknown> {
  return {
    "image.adapter": {
      outcome: "visual-seed-code",
      attemptedPaths: ["visual-seed-code"],
      fallbackReasons: [],
      seedExpanderId: "placeholder-seed-expander/v0",
      ...(latentsSha256 !== null ? { latentsSha256 } : {}),
    },
  };
}

function imageDecoderRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    "image.decoder": {
      lane: "injected-bridge",
      decoderId: LLAMAGEN_DECODER_ID,
      decoderHash: STUB_DECODER_HASH,
      determinismClass: "byte-parity",
      ...overrides,
    },
  };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Structural PNG for comparison tests: signature + a well-formed IHDR chunk
 * header (length 13, type IHDR, width/height) + filler. The reader under
 * test deliberately checks only signature + IHDR dimensions; byte-level
 * differences live in the filler.
 */
function pngBytes(width: number, height: number, filler: number): Uint8Array {
  const bytes = new Uint8Array(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.fill(filler, 24);
  return bytes;
}

function stubImageDecoderBridge(
  options: {
    decoderId?: string;
    decoderHash?: string;
    determinismClass?: "byte-parity" | "structural-parity";
    pngBytes?: Uint8Array;
    outputPixels?: [number, number];
    runtime?: { name: "onnxruntime-node"; version: string; executionProviders: string[] };
  } = {},
): { bridge: ImageDecoderBridge } {
  const png = options.pngBytes ?? pngBytes(64, 64, 0xa1);
  const outputPixels = options.outputPixels ?? [64, 64];
  const decoderId = options.decoderId ?? LLAMAGEN_DECODER_ID;
  const decoderHash = options.decoderHash ?? STUB_DECODER_HASH;
  const bridge: ImageDecoderBridge = {
    capabilities: {
      family: "llamagen",
      decoderId,
      supportedShapes: [{ shape: "2D", tokenGrid: [32, 32], outputPixels }],
      codebook: "stub-codebook",
      codebookVersion: "v0",
      determinismClass: options.determinismClass ?? "byte-parity",
      runtimeTier: "node-onnx-cpu",
      ...(options.runtime ? { runtime: options.runtime } : {}),
      codeLicense: "Apache-2.0",
      weightsLicense: "permissive",
    },
    async decode() {
      return {
        raster: { pngBytes: png, width: outputPixels[0], height: outputPixels[1] },
        warnings: [],
        decoderHash,
      };
    },
    async unload() {
      /* no-op */
    },
  };
  return { bridge };
}

function stdoutBody(text: string): string {
  const start = text.indexOf("{");
  if (start < 0) {
    throw new Error(`No JSON body found in output: ${text.slice(0, 200)}`);
  }
  return text.slice(start);
}
