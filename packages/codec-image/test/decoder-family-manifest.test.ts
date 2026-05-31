import { describe, expect, it } from "vitest";
import {
  DecoderFamilyManifestSchema,
  validateDecoderManifestAuditReceipts,
  type DecoderFamilyManifest,
} from "../src/decoders/manifest.js";

const SHA_ZERO = "0".repeat(64);
const SHA_ONE = "1".repeat(64);
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

describe("decoder family manifest contract", () => {
  it("accepts a candidate manifest with blocked empirical gates", () => {
    const parsed = DecoderFamilyManifestSchema.parse(candidateManifest());

    expect(parsed.schemaVersion).toBe("witt.image.decoder-manifest/v0.1");
    expect(parsed.family).toBe("llamagen");
    expect(parsed.status).toBe("candidate");
    expect(parsed.audits.gateC.status).toBe("blocked");
    expect(parsed.audits.gateD.status).toBe("blocked");
  });

  it("rejects mismatched upstream and asset identity", () => {
    const manifest = candidateManifest({
      assets: {
        ...candidateManifest().assets,
        revision: "different-revision",
      },
    });

    const result = DecoderFamilyManifestSchema.safeParse(manifest);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("assets.revision");
  });

  it("rejects blessed manifests until all gates pass and decoderHash is pinned", () => {
    const result = DecoderFamilyManifestSchema.safeParse(
      candidateManifest({
        status: "blessed",
      }),
    );

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining([
        "audits.gateC.status",
        "audits.gateD.status",
        "capabilities.decoderHash",
      ]),
    );
  });

  it("accepts a fully blessed manifest shape after empirical gates pass", () => {
    const manifest = candidateManifest({
      status: "blessed",
      capabilities: {
        ...candidateManifest().capabilities,
        decoderHash: SHA_ONE,
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

    expect(DecoderFamilyManifestSchema.parse(manifest).status).toBe("blessed");
  });

  it("allows decoder assets to reference the training-run receipt that produced their checkpoint", () => {
    const manifest = candidateManifest({
      assets: {
        ...candidateManifest().assets,
        trainingProvenance: {
          runId: "tokenizer-20260530T210000Z-a1b2c3d4",
          manifestPath:
            "research/training/_shared/runs/tokenizer-20260530T210000Z-a1b2c3d4/manifest.json",
          manifestSha256: "2".repeat(64),
          checkpointSha256: SHA_ZERO,
        },
      },
    });

    const parsed = DecoderFamilyManifestSchema.parse(manifest);

    expect(parsed.assets.trainingProvenance?.runId).toBe("tokenizer-20260530T210000Z-a1b2c3d4");
  });

  it("rejects decoder training provenance that points at a different checkpoint", () => {
    const manifest = candidateManifest({
      assets: {
        ...candidateManifest().assets,
        trainingProvenance: {
          runId: "tokenizer-20260530T210000Z-a1b2c3d4",
          manifestPath:
            "research/training/_shared/runs/tokenizer-20260530T210000Z-a1b2c3d4/manifest.json",
          manifestSha256: "2".repeat(64),
          checkpointSha256: SHA_ONE,
        },
      },
    });

    const result = DecoderFamilyManifestSchema.safeParse(manifest);

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain(
      "assets.trainingProvenance.checkpointSha256",
    );
  });

  it("accepts lab environment metadata on Gate C/D receipts", () => {
    const parsed = validateDecoderManifestAuditReceipts(
      blessedManifest(),
      new Map([
        [
          "artifacts/m1b-audit/vqgan-gates.json",
          auditReceipt({
            environment: {
              labRunId: "slurm-123",
              hardware: "lab-a100-node",
              accelerator: "A100",
              torchVersion: "2.4.0",
              onnxRuntimeVersion: "1.18.0",
              cudaVersion: "12.4",
              driverVersion: "550.54",
            },
          }),
        ],
      ]),
    );

    expect(parsed).toEqual({ ok: true, issues: [] });
  });

  it("requires passed empirical gates to provide matching audit receipts", () => {
    const manifest = blessedManifest();

    const validation = validateDecoderManifestAuditReceipts(manifest, new Map());

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining(["audits.gateC.receipt", "audits.gateD.receipt"]),
    );
  });

  it("rejects receipts whose hard pass checks did not pass", () => {
    const manifest = blessedManifest();
    const receipt = auditReceipt({ gateCStatus: "blocked", gateCPassCheck: false });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toContain(
      "receipts.artifacts/m1b-audit/vqgan-gates.json.gates.C.status",
    );
  });

  it("rejects receipts for a different candidate family", () => {
    const manifest = blessedManifest();
    const receipt = auditReceipt({ candidate: "seed/openmagvit2" });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toContain(
      "receipts.artifacts/m1b-audit/vqgan-gates.json.candidate",
    );
  });

  it("does not accept substring candidate matches", () => {
    const manifest = blessedManifest();
    const receipt = auditReceipt({ candidate: "vqgan-class/not-llamagen" });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toContain(
      "receipts.artifacts/m1b-audit/vqgan-gates.json.candidate",
    );
  });

  it("rejects receipts that set pass_check=true without the required metrics", () => {
    const manifest = blessedManifest();
    const receipt = auditReceipt({ omitHardMetrics: true });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toEqual(
      expect.arrayContaining([
        "receipts.artifacts/m1b-audit/vqgan-gates.json.gates.C.status",
        "receipts.artifacts/m1b-audit/vqgan-gates.json.gates.D.status",
      ]),
    );
  });

  it("lets Gate C bless structural parity without requiring re-encode fixed points", () => {
    const manifest = blessedManifest();
    const receipt = auditReceipt({
      reencodeConsistent: false,
      reencodeTokenHammingRate: 0.1211,
    });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation).toEqual({ ok: true, issues: [] });
  });

  it("rejects Gate C receipts whose measured parity differs from the manifest policy", () => {
    const manifest = blessedManifest();
    const receipt = auditReceipt({ crossDeviceParity: "byte-identical" });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toContain(
      "receipts.artifacts/m1b-audit/vqgan-gates.json.gates.C.status",
    );
  });

  it("applies the manifest-declared Gate D latency threshold instead of a receipt claim", () => {
    const manifest = blessedManifest({
      audits: {
        ...blessedManifest().audits,
        gateD: {
          ...blessedManifest().audits.gateD,
          acceptance: {
            ...GATE_D_ACCEPTANCE,
            maxCpuDecodeSeconds: 1,
          },
        },
      },
    });
    const receipt = auditReceipt({ gateDCpuDecodeSeconds: 1.25 });

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", receipt]]),
    );

    expect(validation.ok).toBe(false);
    expect(validation.issues.map((issue) => issue.path)).toContain(
      "receipts.artifacts/m1b-audit/vqgan-gates.json.gates.D.status",
    );
  });

  it("accepts blessed manifests only when Gate C/D receipts support them", () => {
    const manifest = blessedManifest();

    const validation = validateDecoderManifestAuditReceipts(
      manifest,
      new Map([["artifacts/m1b-audit/vqgan-gates.json", auditReceipt()]]),
    );

    expect(validation).toEqual({ ok: true, issues: [] });
  });
});

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
      weightsSha256: SHA_ZERO,
      codebookFilename: "codebook.bin",
      codebookSha256: SHA_ONE,
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

  return {
    ...base,
    ...overrides,
  };
}

function blessedManifest(overrides: Partial<DecoderFamilyManifest> = {}): DecoderFamilyManifest {
  const base = candidateManifest({
    status: "blessed",
    capabilities: {
      ...candidateManifest().capabilities,
      decoderHash: SHA_ONE,
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

  return {
    ...base,
    ...overrides,
  };
}

function auditReceipt(
  overrides: {
    candidate?: string;
    gateCStatus?: "passed" | "blocked" | "skipped";
    gateDStatus?: "passed" | "blocked" | "skipped";
    gateCPassCheck?: boolean;
    gateDPassCheck?: boolean;
    crossDeviceParity?: "byte-identical" | "token-identical" | "structural-only";
    reencodeConsistent?: boolean;
    reencodeTokenHammingRate?: number;
    gateDCpuDecodeSeconds?: number;
    omitHardMetrics?: boolean;
    environment?: Record<string, string>;
  } = {},
) {
  const gateCMetrics = overrides.omitHardMetrics
    ? {}
    : {
        roundtrip_passed: true,
        encode_consistent: true,
        decode_consistent: true,
        reencode_consistent: overrides.reencodeConsistent ?? true,
        sample_count: 3,
        token_hamming_rate: overrides.reencodeTokenHammingRate ?? 0.0,
        reencode_token_hamming_rate: overrides.reencodeTokenHammingRate ?? 0.0,
        cross_device_parity: overrides.crossDeviceParity ?? "structural-only",
      };
  const gateDMetrics = overrides.omitHardMetrics
    ? {}
    : {
        onnx_cpu_passed: true,
        cpu_decode_seconds: overrides.gateDCpuDecodeSeconds ?? 1.25,
        output_shape: [256, 256, 3],
      };

  return {
    schema_version: "m1b-vqgan-gate-audit.v0",
    candidate: overrides.candidate ?? "vqgan-class/llamagen",
    status: "passed",
    git_sha: "abc123",
    generated_at: "2026-05-26T00:00:00Z",
    python_version: "3.13.0",
    platform: "test",
    ...(overrides.environment ? { environment: overrides.environment } : {}),
    gates: [
      {
        gate: "C",
        tracker: "https://github.com/p-to-q/wittgenstein/issues/334",
        status: overrides.gateCStatus ?? "passed",
        required_inputs: ["weights", "roundtrip metrics"],
        command: ["python3", "-m", "research.validation.vqgan_gate_audit"],
        metrics: {
          ...gateCMetrics,
          pass_check: {
            passed: overrides.gateCPassCheck ?? true,
            required: { roundtrip_passed: true },
          },
        },
        evidence: ["weights.pt"],
        notes: [],
      },
      {
        gate: "D",
        tracker: "https://github.com/p-to-q/wittgenstein/issues/335",
        status: overrides.gateDStatus ?? "passed",
        required_inputs: ["weights", "onnx", "cpu metrics"],
        command: ["python3", "-m", "research.validation.vqgan_gate_audit"],
        metrics: {
          ...gateDMetrics,
          pass_check: {
            passed: overrides.gateDPassCheck ?? true,
            required: { onnx_cpu_passed: true },
          },
        },
        evidence: ["weights.pt", "decoder.onnx"],
        notes: [],
      },
    ],
  };
}
