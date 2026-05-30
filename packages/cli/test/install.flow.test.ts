import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const cliBin = resolve(packageRoot, "src/cli-main.ts");
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("install image decoder manifest flow", () => {
  it("reports ready when a blessed manifest, receipts, cached weights, and runtime peer resolve", () => {
    const fixture = writeDecoderFixture();

    const install = runInstall(["image", "--json"], {
      WITTGENSTEIN_DECODER_MANIFEST: fixture.manifestPath,
      WITTGENSTEIN_DECODER_CACHE_DIR: fixture.decoderCacheDir,
    });

    expect(install.status).toBe(0);
    const payload = JSON.parse(install.stdout) as {
      ok: boolean;
      action: string;
      status: string;
      manifestPath: string;
      decoderId: string;
      family: string;
      weightsRestriction: string;
      decoderPreflight: {
        status: string;
        reason: string | null;
        decoderId: string;
        family: string;
        runtimeTier: string;
        details: {
          weights: {
            source: string;
            weightsSha256: string;
            codebookSha256: string;
            weightsRestriction: string;
          };
        };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.action).toBe("install-ready");
    expect(payload.status).toBe("ready");
    expect(payload.manifestPath).toBe(fixture.manifestPath);
    expect(payload.decoderId).toBe("llamagen-vqgan-phase0");
    expect(payload.family).toBe("llamagen");
    expect(payload.weightsRestriction).toBe("permissive");
    expect(payload.decoderPreflight).toMatchObject({
      status: "ready",
      reason: null,
      decoderId: "llamagen-vqgan-phase0",
      family: "llamagen",
      runtimeTier: "node-onnx-cpu",
    });
    expect(payload.decoderPreflight.details.weights).toMatchObject({
      source: "cache-hit",
      weightsSha256: fixture.weightsSha,
      codebookSha256: fixture.codebookSha,
      weightsRestriction: "permissive",
    });
  });

  it("blocks when no manifest is selected", () => {
    const install = runInstall(["image", "--json"]);

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as InstallBlockedPayload;

    expect(payload.code).toBe("TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST");
    expect(payload.status).toBe("blocked");
    expect(payload.manifestPath).toBeNull();
    expect(payload.decoderPreflight.reason).toBe("manifest-missing");
  });

  it("blocks invalid manifests with structured preflight issues", () => {
    const dir = makeTempDir();
    const manifestPath = join(dir, "invalid-decoder-manifest.json");
    writeFileSync(manifestPath, JSON.stringify({ schemaVersion: "wrong" }));

    const install = runInstall(["image", "--json"], {
      WITTGENSTEIN_DECODER_MANIFEST: manifestPath,
      WITTGENSTEIN_DECODER_CACHE_DIR: join(dir, "decoder-cache"),
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as InstallBlockedPayload;

    expect(payload.code).toBe("TIER_INSTALL_BLOCKED_BY_DECODER_PREFLIGHT");
    expect(payload.status).toBe("blocked");
    expect(payload.manifestPath).toBe(manifestPath);
    expect(payload.decoderPreflight.reason).toBe("manifest-invalid");
    expect(payload.decoderPreflight.details.issues.length).toBeGreaterThan(0);
  });

  it("blocks manifests that are not blessed", () => {
    const fixture = writeDecoderFixture({ manifestStatus: "candidate" });

    const install = runInstall(["image", "--json"], {
      WITTGENSTEIN_DECODER_MANIFEST: fixture.manifestPath,
      WITTGENSTEIN_DECODER_CACHE_DIR: fixture.decoderCacheDir,
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as InstallBlockedPayload;

    expect(payload.decoderPreflight.reason).toBe("manifest-not-blessed");
    expect(payload.decoderPreflight.decoderId).toBe("llamagen-vqgan-phase0");
    expect(payload.decoderPreflight.details.status).toBe("candidate");
  });

  it.each(["missing", "invalid"] as const)(
    "blocks blessed manifests whose audit receipt is %s",
    (receiptState) => {
      const fixture = writeDecoderFixture({ receiptState });

      const install = runInstall(["image", "--json"], {
        WITTGENSTEIN_DECODER_MANIFEST: fixture.manifestPath,
        WITTGENSTEIN_DECODER_CACHE_DIR: fixture.decoderCacheDir,
      });

      expect(install.status).toBe(1);
      const payload = JSON.parse(install.stderr) as InstallBlockedPayload;

      expect(payload.decoderPreflight.reason).toBe("audit-receipt-invalid");
      expect(payload.decoderPreflight.details.issues.length).toBeGreaterThanOrEqual(1);
    },
  );

  it("blocks when declared weights are not installed", () => {
    const fixture = writeDecoderFixture({ cacheState: "missing" });

    const install = runInstall(["image", "--json"], {
      WITTGENSTEIN_DECODER_MANIFEST: fixture.manifestPath,
      WITTGENSTEIN_DECODER_CACHE_DIR: fixture.decoderCacheDir,
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as InstallBlockedPayload;

    expect(payload.decoderPreflight.reason).toBe("weights-not-installed");
    expect(payload.decoderPreflight.installHint).toBe("wittgenstein install image");
  });

  it("blocks and removes corrupted cached weights", () => {
    const fixture = writeDecoderFixture({ cacheState: "invalid" });

    const install = runInstall(["image", "--json"], {
      WITTGENSTEIN_DECODER_MANIFEST: fixture.manifestPath,
      WITTGENSTEIN_DECODER_CACHE_DIR: fixture.decoderCacheDir,
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as InstallBlockedPayload;

    expect(payload.decoderPreflight.reason).toBe("weights-invalid");
    expect(payload.decoderPreflight.details.code).toBe("WEIGHTS_SHA256_MISMATCH");
    expect(existsSync(fixture.weightsPath)).toBe(false);
  });
});

interface InstallBlockedPayload {
  ok: boolean;
  code: string;
  status: string;
  manifestPath: string | null;
  decoderPreflight: {
    reason: string | null;
    decoderId: string | null;
    installHint: string | null;
    details: Record<string, unknown>;
  };
}

type ManifestStatus = "candidate" | "blessed" | "rejected";
type CacheState = "valid" | "missing" | "invalid";
type ReceiptState = "valid" | "missing" | "invalid";

interface DecoderFixtureOptions {
  readonly manifestStatus?: ManifestStatus;
  readonly cacheState?: CacheState;
  readonly receiptState?: ReceiptState;
}

interface DecoderFixture {
  readonly manifestPath: string;
  readonly decoderCacheDir: string;
  readonly weightsPath: string;
  readonly weightsSha: string;
  readonly codebookSha: string;
}

function runInstall(args: string[], envOverrides: NodeJS.ProcessEnv = {}) {
  const env = { ...process.env };
  delete env.WITTGENSTEIN_DECODER_MANIFEST;
  delete env.WITTGENSTEIN_DECODER_CACHE_DIR;

  return spawnSync("node", ["--import", "tsx", cliBin, "install", ...args], {
    cwd: packageRoot,
    encoding: "utf8",
    env: { ...env, ...envOverrides },
  });
}

function writeDecoderFixture(options: DecoderFixtureOptions = {}): DecoderFixture {
  const root = makeTempDir();
  const decoderCacheDir = join(root, "decoder-cache");
  const manifestPath = join(root, "decoder-manifest.json");
  const receiptPath = join(root, "vqgan-gates.json");
  const weights = new TextEncoder().encode("weights");
  const codebook = new TextEncoder().encode("codebook");
  const weightsSha = sha256(weights);
  const codebookSha = sha256(codebook);
  const family = "llamagen";
  const cacheDir = join(decoderCacheDir, family, weightsSha);
  const manifestStatus = options.manifestStatus ?? "blessed";
  const receiptState = options.receiptState ?? "valid";
  const cacheState = options.cacheState ?? "valid";
  const weightsPath = join(cacheDir, "vqgan.onnx");

  if (cacheState !== "missing") {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(weightsPath, cacheState === "valid" ? weights : "corrupt");
    writeFileSync(join(cacheDir, "codebook.bin"), codebook);
  }

  if (receiptState === "valid") {
    writeFileSync(receiptPath, JSON.stringify(auditReceipt()));
  } else if (receiptState === "invalid") {
    writeFileSync(receiptPath, JSON.stringify({ schema_version: "wrong" }));
  }

  const empiricalAudits =
    manifestStatus === "blessed"
      ? {
          gateC: {
            status: "passed",
            tracker: "https://github.com/p-to-q/wittgenstein/issues/334",
            receipt: receiptPath,
          },
          gateD: {
            status: "passed",
            tracker: "https://github.com/p-to-q/wittgenstein/issues/335",
            receipt: receiptPath,
          },
        }
      : {
          gateC: {
            status: "blocked",
            tracker: "https://github.com/p-to-q/wittgenstein/issues/334",
          },
          gateD: {
            status: "blocked",
            tracker: "https://github.com/p-to-q/wittgenstein/issues/335",
          },
        };

  writeFileSync(
    manifestPath,
    JSON.stringify({
      schemaVersion: "witt.image.decoder-manifest/v0.1",
      family,
      decoderId: "llamagen-vqgan-phase0",
      status: manifestStatus,
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
        ...(manifestStatus === "blessed" ? { decoderHash: "1".repeat(64) } : {}),
      },
      audits: {
        gateA: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
        gateB: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
        ...empiricalAudits,
      },
      notes: ["install flow test fixture"],
    }),
  );

  return { manifestPath, decoderCacheDir, weightsPath, weightsSha, codebookSha };
}

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "witt-cli-install-flow-"));
  tempDirs.push(dir);
  return dir;
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
          sample_count: 3,
          token_hamming_rate: 0.0,
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
