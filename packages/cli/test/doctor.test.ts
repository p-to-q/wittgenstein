import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isNodeVersionAtLeast } from "../src/commands/doctor.js";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const cliBin = resolve(packageRoot, "src/cli-main.ts");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("doctor tier readiness", () => {
  it("checks the full semver floor for Node runtime gates", () => {
    expect(isNodeVersionAtLeast("v20.18.9", [20, 19, 0])).toBe(false);
    expect(isNodeVersionAtLeast("20.19.0", [20, 19, 0])).toBe(true);
    expect(isNodeVersionAtLeast("v20.19.1", [20, 19, 0])).toBe(true);
    expect(isNodeVersionAtLeast("v21.0.0", [20, 19, 0])).toBe(true);
    expect(isNodeVersionAtLeast("not-a-node-version", [20, 19, 0])).toBe(false);
  });

  it("prints the current tier readiness table", () => {
    const doctor = runDoctor();

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      tiers: {
        tier0: { ready: boolean };
        tier1: { ready: boolean; installHint: string };
      };
      videoRender: {
        enabled: boolean;
        backend: string;
        hyperframesNode: { status: string; runtime: string; tier: string };
        hyperframesCli: { status: string; runtime: string; tier: string };
        ffmpeg: { status: string; runtime: string; tier: string };
        chrome: { status: string; runtime: string; tier: string };
      };
      imageDecoder: {
        status: string;
        manifestPath: string | null;
        family: string | null;
        decoderId: string | null;
        manifestStatus: string | null;
        weightsRestriction: string | null;
        audits: Record<string, string> | null;
        weightsCached: boolean | null;
        decoderManifest: { status: string; message: string };
        reason: string | null;
        installHint: string | null;
        onnxRuntime: {
          status: string;
          runtime: string;
          tier: string;
          installHint?: string;
          message?: string;
          path?: string;
        };
        blockers: {
          decoderDelivery: string;
          gateCDeterminism: string;
          gateDOnnxCpu: string;
        };
      };
    };
    expect(payload.tiers.tier0.ready).toBe(true);
    expect(payload.tiers.tier1.ready).toBe(false);
    expect(payload.tiers.tier1.installHint).toBe("wittgenstein install image");
    expect(payload.videoRender.enabled).toBe(false);
    expect(payload.videoRender.backend).toBe("distilled-internal");
    expect(payload.videoRender.hyperframesNode.status).toBe("skipped");
    expect(payload.videoRender.hyperframesCli.status).toBe("skipped");
    expect(payload.videoRender.ffmpeg.status).toBe("skipped");
    expect(payload.videoRender.chrome.status).toBe("skipped");
    expect(payload.videoRender.hyperframesNode).toMatchObject({
      runtime: "node",
      tier: "video",
    });
    expect(payload.videoRender.hyperframesCli).toMatchObject({
      runtime: "hyperframes",
      tier: "video",
    });
    expect(payload.videoRender.ffmpeg).toMatchObject({
      runtime: "ffmpeg",
      tier: "video",
    });
    expect(payload.videoRender.chrome).toMatchObject({
      runtime: "chrome",
      tier: "video",
    });
    expect(payload.imageDecoder.status).toBe("not-selected");
    expect(payload.imageDecoder.manifestPath).toBeNull();
    expect(payload.imageDecoder.family).toBeNull();
    expect(payload.imageDecoder.decoderId).toBeNull();
    expect(payload.imageDecoder.manifestStatus).toBeNull();
    expect(payload.imageDecoder.weightsRestriction).toBeNull();
    expect(payload.imageDecoder.audits).toBeNull();
    expect(payload.imageDecoder.weightsCached).toBeNull();
    expect(payload.imageDecoder.decoderManifest.status).toBe("skipped");
    expect(payload.imageDecoder.reason).toBe("manifest-missing");
    expect(payload.imageDecoder.installHint).toBe("wittgenstein install image");
    expect(["ok", "missing"]).toContain(payload.imageDecoder.onnxRuntime.status);
    expect(payload.imageDecoder.onnxRuntime.runtime).toBe("onnxruntime-node");
    expect(payload.imageDecoder.onnxRuntime.tier).toBe("image");
    expect(payload.imageDecoder.onnxRuntime.installHint).toBe("wittgenstein install image");
    expect(payload.imageDecoder.blockers.decoderDelivery).toMatch(/issues\/402$/);
    expect(payload.imageDecoder.blockers.gateCDeterminism).toMatch(/issues\/334$/);
    expect(payload.imageDecoder.blockers.gateDOnnxCpu).toMatch(/issues\/335$/);
  });

  it("prints structured video dependency checks when HyperFrames MP4 rendering is enabled", () => {
    const doctor = runDoctor({ WITTGENSTEIN_HYPERFRAMES_RENDER: "1" });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      videoRender: {
        enabled: boolean;
        backend: string;
        hyperframesNode: { status: string; runtime: string; tier: string };
        hyperframesCli: { status: string; runtime: string; tier: string };
        ffmpeg: { status: string; runtime: string; tier: string };
        chrome: { status: string; runtime: string; tier: string };
      };
    };

    expect(payload.videoRender.enabled).toBe(true);
    expect(payload.videoRender.backend).toBe("distilled-internal");
    expect(payload.videoRender.hyperframesNode.status).toBe("skipped");
    expect(payload.videoRender.hyperframesCli.status).toBe("skipped");
    expect(["ok", "missing"]).toContain(payload.videoRender.ffmpeg.status);
    expect(["ok", "missing"]).toContain(payload.videoRender.chrome.status);
    expect(payload.videoRender.ffmpeg.runtime).toBe("ffmpeg");
    expect(payload.videoRender.ffmpeg.tier).toBe("video");
    expect(payload.videoRender.chrome.runtime).toBe("chrome");
    expect(payload.videoRender.chrome.tier).toBe("video");
  });

  it("checks HyperFrames CLI when the npx backend is selected", () => {
    const doctor = runDoctor({
      WITTGENSTEIN_HYPERFRAMES_RENDER: "1",
      WITTGENSTEIN_HYPERFRAMES_BACKEND: "npx-cli",
    });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      videoRender: {
        enabled: boolean;
        backend: string;
        hyperframesNode: { status: string; runtime: string; tier: string };
        hyperframesCli: { status: string; runtime: string; tier: string };
      };
    };

    expect(payload.videoRender.enabled).toBe(true);
    expect(payload.videoRender.backend).toBe("npx-cli");
    expect(["ok", "missing"]).toContain(payload.videoRender.hyperframesNode.status);
    expect(["ok", "missing"]).toContain(payload.videoRender.hyperframesCli.status);
    expect(payload.videoRender.hyperframesNode.runtime).toBe("node");
    expect(payload.videoRender.hyperframesNode.tier).toBe("video");
    expect(payload.videoRender.hyperframesCli.runtime).toBe("hyperframes");
    expect(payload.videoRender.hyperframesCli.tier).toBe("video");
  });

  it("reports a ready image decoder when the selected blessed manifest has cached weights", () => {
    const fixture = writeDecoderFixture();
    const doctor = runDoctor({
      WITTGENSTEIN_DECODER_MANIFEST: fixture.manifestPath,
      XDG_CACHE_HOME: fixture.xdgCacheHome,
    });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      imageDecoder: {
        status: string;
        manifestPath: string;
        family: string;
        decoderId: string;
        manifestStatus: string;
        weightsRestriction: string;
        audits: Record<string, string>;
        weightsCached: boolean;
        decoderManifest: { status: string; path: string };
        onnxRuntime: { status: string; runtime: string; tier: string; installHint?: string };
        reason: string | null;
        details: { weights: { source: string; weightsSha256: string; codebookSha256: string } };
      };
    };

    expect(payload.imageDecoder.status).toBe("ready");
    expect(payload.imageDecoder.manifestPath).toBe(fixture.manifestPath);
    expect(payload.imageDecoder.family).toBe("llamagen");
    expect(payload.imageDecoder.decoderId).toBe("llamagen-vqgan-phase0");
    expect(payload.imageDecoder.manifestStatus).toBe("blessed");
    expect(payload.imageDecoder.weightsRestriction).toBe("permissive");
    expect(payload.imageDecoder.audits).toEqual({
      gateA: "passed",
      gateB: "passed",
      gateC: "passed",
      gateD: "passed",
    });
    expect(payload.imageDecoder.weightsCached).toBe(true);
    expect(payload.imageDecoder.decoderManifest.status).toBe("ok");
    expect(["ok", "missing"]).toContain(payload.imageDecoder.onnxRuntime.status);
    expect(payload.imageDecoder.onnxRuntime.runtime).toBe("onnxruntime-node");
    expect(payload.imageDecoder.onnxRuntime.tier).toBe("image");
    expect(payload.imageDecoder.onnxRuntime.installHint).toBe("wittgenstein install image");
    expect(payload.imageDecoder.reason).toBeNull();
    expect(payload.imageDecoder.details.weights.source).toBe("cache-hit");
    expect(payload.imageDecoder.details.weights.weightsSha256).toBe(fixture.weightsSha);
    expect(payload.imageDecoder.details.weights.codebookSha256).toBe(fixture.codebookSha);
  });

  it("reports a structured blocked image decoder when the selected manifest is invalid", () => {
    const dir = makeTempDir();
    const manifestPath = join(dir, "invalid-decoder-manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ schemaVersion: "not-this" }));

    const doctor = runDoctor({ WITTGENSTEIN_DECODER_MANIFEST: manifestPath });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      imageDecoder: {
        status: string;
        manifestPath: string;
        decoderManifest: { status: string; path: string; message: string };
        reason: string;
        weightsCached: boolean | null;
        details: { issues: Array<{ path: string; message: string }> };
      };
    };

    expect(payload.imageDecoder.status).toBe("blocked");
    expect(payload.imageDecoder.manifestPath).toBe(manifestPath);
    expect(payload.imageDecoder.decoderManifest.status).toBe("invalid");
    expect(payload.imageDecoder.reason).toBe("manifest-invalid");
    expect(payload.imageDecoder.weightsCached).toBeNull();
    expect(payload.imageDecoder.details.issues.length).toBeGreaterThan(0);
  });
});

function runDoctor(envOverrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };
  delete env.WITTGENSTEIN_DECODER_MANIFEST;
  delete env.WITTGENSTEIN_DECODER_CACHE_DIR;
  delete env.WITTGENSTEIN_HYPERFRAMES_RENDER;
  delete env.WITTGENSTEIN_HYPERFRAMES_BACKEND;

  return spawnSync("node", ["--import", "tsx", cliBin, "doctor"], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...env, ...envOverrides },
  });
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "witt-cli-doctor-"));
  tempDirs.push(dir);
  return dir;
}

function writeDecoderFixture(): {
  manifestPath: string;
  xdgCacheHome: string;
  weightsSha: string;
  codebookSha: string;
} {
  const dir = makeTempDir();
  const xdgCacheHome = join(dir, "xdg-cache");
  const manifestPath = join(dir, "decoder-manifest.json");
  const receiptPath = join(dir, "vqgan-gates.json");
  const weights = new TextEncoder().encode("weights");
  const codebook = new TextEncoder().encode("codebook");
  const weightsSha = sha256(weights);
  const codebookSha = sha256(codebook);
  const family = "llamagen";
  const cacheDir = join(xdgCacheHome, "wittgenstein", "decoders", family, weightsSha);

  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "vqgan.onnx"), weights);
  writeFileSync(join(cacheDir, "codebook.bin"), codebook);
  writeFileSync(receiptPath, JSON.stringify(auditReceipt()));
  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "witt.image.decoder-manifest/v0.1",
      family,
      decoderId: "llamagen-vqgan-phase0",
      status: "blessed",
      decisionTracker: "https://github.com/p-to-q/wittgenstein/issues/402",
      implementationTracker: "https://github.com/p-to-q/wittgenstein/issues/329",
      upstream: {
        repoId: "FoundationVision/LlamaGen",
        revision: "pin-before-blessing",
        sourceUrl: "https://github.com/FoundationVision/LlamaGen",
      },
      assets: {
        family,
        repoId: "FoundationVision/LlamaGen",
        revision: "pin-before-blessing",
        weightsFilename: "vqgan.onnx",
        weightsSha256: weightsSha,
        codebookFilename: "codebook.bin",
        codebookSha256: codebookSha,
        license: {
          code: "MIT",
          weights: "permissive",
        },
      },
      capabilities: {
        supportedShapes: [{ shape: "2D", tokenGrid: [16, 16], outputPixels: [256, 256] }],
        codebook: "llamagen-vqgan",
        codebookVersion: "pin-before-blessing",
        determinismClass: "structural-parity",
        runtimeTier: "node-onnx-cpu",
        decoderHash: "1".repeat(64),
      },
      audits: {
        gateA: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
        gateB: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
        gateC: {
          status: "passed",
          tracker: "https://github.com/p-to-q/wittgenstein/issues/334",
          receipt: receiptPath,
          acceptance: {
            mode: "within-device-determinism",
            minSampleCount: 3,
            requiredEncodeConsistency: true,
            requiredDecodeConsistency: true,
            crossDeviceParity: "structural-only",
            maxReencodeTokenHammingRate: null,
          },
        },
        gateD: {
          status: "passed",
          tracker: "https://github.com/p-to-q/wittgenstein/issues/335",
          receipt: receiptPath,
          acceptance: {
            maxCpuDecodeSeconds: 30,
            outputShape: [256, 256, 3],
            requiresNode: true,
          },
        },
      },
      notes: ["doctor test fixture"],
    }),
  );

  return { manifestPath, xdgCacheHome, weightsSha, codebookSha };
}

function auditReceipt() {
  return {
    schema_version: "m1b-vqgan-gate-audit.v0",
    candidate: "vqgan-class/llamagen",
    status: "passed",
    git_sha: "abc123",
    generated_at: "2026-05-26T00:00:00Z",
    python_version: "3.13.0",
    platform: "test",
    gates: [
      {
        gate: "C",
        tracker: "https://github.com/p-to-q/wittgenstein/issues/334",
        status: "passed",
        required_inputs: ["weights", "roundtrip metrics"],
        metrics: {
          roundtrip_passed: true,
          encode_consistent: true,
          decode_consistent: true,
          reencode_consistent: true,
          sample_count: 3,
          token_hamming_rate: 0.0,
          reencode_token_hamming_rate: 0.0,
          cross_device_parity: "structural-only",
          pass_check: { passed: true, required: {} },
        },
      },
      {
        gate: "D",
        tracker: "https://github.com/p-to-q/wittgenstein/issues/335",
        status: "passed",
        required_inputs: ["weights", "onnx", "cpu metrics"],
        metrics: {
          onnx_cpu_passed: true,
          cpu_decode_seconds: 1.25,
          output_shape: [256, 256, 3],
          pass_check: { passed: true, required: {} },
        },
      },
    ],
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
