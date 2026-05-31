import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { preflightImageDecoder } from "../src/decoders/preflight.js";
import type { DecoderFamilyManifest } from "../src/decoders/manifest.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(join(tmpdir(), "witt-image-preflight-"));
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

describe("image decoder preflight receipt", () => {
  it("reports manifest-missing before any runtime or weights check", async () => {
    const receipt = await preflightImageDecoder();

    expect(receipt).toMatchObject({
      schemaVersion: "witt.image.decoder-preflight/v0.1",
      status: "blocked",
      reason: "manifest-missing",
      installHint: "wittgenstein install image",
    });
  });

  it("reports manifest-not-blessed for candidate manifests", async () => {
    const receipt = await preflightImageDecoder({ manifest: candidateManifest() });

    expect(receipt.status).toBe("blocked");
    expect(receipt.reason).toBe("manifest-not-blessed");
    expect(receipt.decoderId).toBe("llamagen-vqgan-phase0");
    expect(receipt.details.status).toBe("candidate");
  });

  it("reports audit-receipt-invalid before weights lookup", async () => {
    const receipt = await preflightImageDecoder({
      manifest: blessedManifest(),
      auditReceipts: new Map(),
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.reason).toBe("audit-receipt-invalid");
    expect(receipt.details.issues).toBeInstanceOf(Array);
  });

  it("reports weights-not-installed after manifest and audit receipts pass", async () => {
    const receipt = await preflightImageDecoder({
      manifest: blessedManifest(),
      auditReceipts: new Map([["artifacts/m1b-audit/vqgan-gates.json", auditReceipt()]]),
      cacheDir: tmp,
      checkRuntime: false,
    });

    expect(receipt.status).toBe("blocked");
    expect(receipt.reason).toBe("weights-not-installed");
    expect(receipt.installHint).toBe("wittgenstein install image");
  });

  it("reports ready when manifest, audit receipts, and cached assets are present", async () => {
    const manifest = blessedManifest();
    const cacheDir = join(tmp, manifest.family, manifest.assets.weightsSha256);
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, manifest.assets.weightsFilename), WEIGHTS);
    await writeFile(join(cacheDir, manifest.assets.codebookFilename!), CODEBOOK);

    const receipt = await preflightImageDecoder({
      manifest,
      auditReceipts: new Map([["artifacts/m1b-audit/vqgan-gates.json", auditReceipt()]]),
      cacheDir: tmp,
      checkRuntime: false,
    });

    expect(receipt).toMatchObject({
      status: "ready",
      reason: null,
      decoderId: "llamagen-vqgan-phase0",
      family: "llamagen",
      details: {
        weights: {
          source: "cache-hit",
          weightsSha256: manifest.assets.weightsSha256,
          codebookSha256: manifest.assets.codebookSha256,
        },
      },
    });
  });
});

const WEIGHTS = new TextEncoder().encode("weights");
const CODEBOOK = new TextEncoder().encode("codebook");
const WEIGHTS_SHA = sha256(WEIGHTS);
const CODEBOOK_SHA = sha256(CODEBOOK);
const DECODER_HASH = "1".repeat(64);
const GATE_C_ACCEPTANCE = {
  mode: "within-device-determinism" as const,
  minSampleCount: 3,
  requiredEncodeConsistency: true as const,
  requiredDecodeConsistency: true as const,
  crossDeviceParity: "structural-only" as const,
  maxReencodeTokenHammingRate: null,
};
const GATE_D_ACCEPTANCE = {
  maxCpuDecodeSeconds: 30,
  outputShape: [256, 256, 3] as [number, number, 3],
  requiresNode: true as const,
};

function candidateManifest(overrides: Partial<DecoderFamilyManifest> = {}): DecoderFamilyManifest {
  const base: DecoderFamilyManifest = {
    schemaVersion: "witt.image.decoder-manifest/v0.1",
    family: "llamagen",
    decoderId: "llamagen-vqgan-phase0",
    status: "candidate",
    decisionTracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    implementationTracker: "https://github.com/p-to-q/wittgenstein/issues/329",
    upstream: {
      repoId: "FoundationVision/LlamaGen",
      revision: "pin-before-blessing",
      sourceUrl: "https://github.com/FoundationVision/LlamaGen",
    },
    assets: {
      family: "llamagen",
      repoId: "FoundationVision/LlamaGen",
      revision: "pin-before-blessing",
      weightsFilename: "vqgan.onnx",
      weightsSha256: WEIGHTS_SHA,
      codebookFilename: "codebook.bin",
      codebookSha256: CODEBOOK_SHA,
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
    },
    audits: {
      gateA: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
      gateB: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
      gateC: { status: "blocked", tracker: "https://github.com/p-to-q/wittgenstein/issues/334" },
      gateD: { status: "blocked", tracker: "https://github.com/p-to-q/wittgenstein/issues/335" },
    },
    notes: ["Fixture only; not a blessed decoder-family manifest."],
  };

  return { ...base, ...overrides };
}

function blessedManifest(): DecoderFamilyManifest {
  return candidateManifest({
    status: "blessed",
    capabilities: {
      ...candidateManifest().capabilities,
      decoderHash: DECODER_HASH,
    },
    audits: {
      gateA: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
      gateB: { status: "passed", tracker: "https://github.com/p-to-q/wittgenstein/issues/329" },
      gateC: {
        status: "passed",
        tracker: "https://github.com/p-to-q/wittgenstein/issues/334",
        receipt: "artifacts/m1b-audit/vqgan-gates.json",
        acceptance: GATE_C_ACCEPTANCE,
      },
      gateD: {
        status: "passed",
        tracker: "https://github.com/p-to-q/wittgenstein/issues/335",
        receipt: "artifacts/m1b-audit/vqgan-gates.json",
        acceptance: GATE_D_ACCEPTANCE,
      },
    },
  });
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
