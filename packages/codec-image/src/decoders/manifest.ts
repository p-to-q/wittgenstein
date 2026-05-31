import { z } from "zod";
import { DecoderFamilySchema } from "../schema.js";
import { DecoderWeightsManifestSchema } from "./weights.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const PositiveIntSchema = z.number().int().positive();
const PositiveFiniteSchema = z.number().finite().positive();

export const DecoderGateCParitySchema = z.enum([
  "byte-identical",
  "token-identical",
  "structural-only",
]);

export const DecoderGateCAcceptanceSchema = z
  .object({
    mode: z.literal("within-device-determinism"),
    minSampleCount: PositiveIntSchema,
    requiredEncodeConsistency: z.literal(true),
    requiredDecodeConsistency: z.literal(true),
    crossDeviceParity: DecoderGateCParitySchema,
    maxReencodeTokenHammingRate: z.number().finite().min(0).max(1).nullable(),
  })
  .strict();

export const DecoderGateDAcceptanceSchema = z
  .object({
    maxCpuDecodeSeconds: PositiveFiniteSchema.max(30),
    outputShape: z.tuple([PositiveIntSchema, PositiveIntSchema, z.literal(3)]),
    requiresNode: z.literal(true),
  })
  .strict();

export const DecoderShapeSupportManifestSchema = z.discriminatedUnion("shape", [
  z.object({
    shape: z.literal("2D"),
    tokenGrid: z.tuple([z.number().int().positive(), z.number().int().positive()]),
    outputPixels: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }),
  z.object({
    shape: z.literal("1D"),
    sequenceLength: z.number().int().positive(),
    outputPixels: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  }),
]);

export const DecoderFamilyManifestSchema = z
  .object({
    schemaVersion: z.literal("witt.image.decoder-manifest/v0.1"),
    family: DecoderFamilySchema,
    decoderId: z.string().min(1),
    status: z.enum(["candidate", "blessed", "rejected"]),
    decisionTracker: z.string().url(),
    implementationTracker: z.string().url().optional(),
    upstream: z.object({
      repoId: z.string().min(1),
      revision: z.string().min(1),
      sourceUrl: z.string().url(),
    }),
    assets: DecoderWeightsManifestSchema,
    capabilities: z.object({
      supportedShapes: z.array(DecoderShapeSupportManifestSchema).min(1),
      codebook: z.string().min(1),
      codebookVersion: z.string().min(1),
      determinismClass: z.enum(["byte-parity", "structural-parity"]),
      runtimeTier: z.enum(["node-onnx-cpu", "node-onnx-gpu", "local-python"]),
      decoderHash: Sha256Schema.optional(),
    }),
    audits: z.object({
      gateA: z.object({
        status: z.enum(["passed", "blocked", "skipped", "unknown"]),
        tracker: z.string().url(),
      }),
      gateB: z.object({
        status: z.enum(["passed", "blocked", "skipped", "unknown"]),
        tracker: z.string().url(),
      }),
      gateC: z.object({
        status: z.enum(["passed", "blocked", "skipped", "unknown"]),
        tracker: z.string().url(),
        receipt: z.string().optional(),
        acceptance: DecoderGateCAcceptanceSchema.optional(),
      }),
      gateD: z.object({
        status: z.enum(["passed", "blocked", "skipped", "unknown"]),
        tracker: z.string().url(),
        receipt: z.string().optional(),
        acceptance: DecoderGateDAcceptanceSchema.optional(),
      }),
    }),
    notes: z.array(z.string()).default([]),
  })
  .superRefine((manifest, ctx) => {
    if (manifest.family !== manifest.assets.family) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets", "family"],
        message: "assets.family must match manifest.family.",
      });
    }

    if (manifest.upstream.repoId !== manifest.assets.repoId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets", "repoId"],
        message: "assets.repoId must match upstream.repoId.",
      });
    }

    if (manifest.upstream.revision !== manifest.assets.revision) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets", "revision"],
        message: "assets.revision must match upstream.revision.",
      });
    }

    if (
      manifest.assets.trainingProvenance &&
      manifest.assets.trainingProvenance.checkpointSha256 !== manifest.assets.weightsSha256
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["assets", "trainingProvenance", "checkpointSha256"],
        message: "trainingProvenance.checkpointSha256 must match assets.weightsSha256.",
      });
    }

    if (manifest.status === "blessed") {
      for (const gate of ["gateA", "gateB", "gateC", "gateD"] as const) {
        if (manifest.audits[gate].status !== "passed") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["audits", gate, "status"],
            message: "blessed decoder manifests require all audit gates to pass.",
          });
        }
      }

      if (!manifest.audits.gateC.acceptance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["audits", "gateC", "acceptance"],
          message: "blessed decoder manifests require a Gate C acceptance policy.",
        });
      }

      if (!manifest.audits.gateD.acceptance) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["audits", "gateD", "acceptance"],
          message: "blessed decoder manifests require a Gate D acceptance policy.",
        });
      }

      if (!manifest.capabilities.decoderHash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capabilities", "decoderHash"],
          message: "blessed decoder manifests require a decoderHash.",
        });
      }
    }

    if (manifest.audits.gateC.status === "passed" && !manifest.audits.gateC.acceptance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audits", "gateC", "acceptance"],
        message: "passed Gate C manifests require a declared acceptance policy.",
      });
    }

    if (manifest.audits.gateD.status === "passed" && !manifest.audits.gateD.acceptance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audits", "gateD", "acceptance"],
        message: "passed Gate D manifests require a declared acceptance policy.",
      });
    }

    const gateCAcceptance = manifest.audits.gateC.acceptance;
    if (
      gateCAcceptance?.crossDeviceParity === "structural-only" &&
      manifest.capabilities.determinismClass !== "structural-parity"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audits", "gateC", "acceptance", "crossDeviceParity"],
        message:
          "structural-only Gate C parity requires capabilities.determinismClass='structural-parity'.",
      });
    }

    if (
      gateCAcceptance?.crossDeviceParity === "byte-identical" &&
      manifest.capabilities.determinismClass !== "byte-parity"
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audits", "gateC", "acceptance", "crossDeviceParity"],
        message:
          "byte-identical Gate C parity requires capabilities.determinismClass='byte-parity'.",
      });
    }

    const gateDAcceptance = manifest.audits.gateD.acceptance;
    if (
      gateDAcceptance &&
      !shapeSupportedByCapabilities(
        gateDAcceptance.outputShape,
        manifest.capabilities.supportedShapes,
      )
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audits", "gateD", "acceptance", "outputShape"],
        message: "Gate D outputShape must match one advertised capability outputPixels entry.",
      });
    }
  });

export type DecoderFamilyManifest = z.infer<typeof DecoderFamilyManifestSchema>;

const GateAuditStatusSchema = z.enum(["passed", "blocked", "skipped"]);

export const DecoderGateAuditReceiptSchema = z.object({
  schema_version: z.literal("m1b-vqgan-gate-audit.v0"),
  candidate: z.string().min(1),
  status: GateAuditStatusSchema,
  git_sha: z.string().nullable(),
  generated_at: z.string().min(1),
  python_version: z.string().min(1),
  platform: z.string().min(1),
  environment: z
    .object({
      labRunId: z.string().min(1).optional(),
      hardware: z.string().min(1).optional(),
      accelerator: z.string().min(1).optional(),
      torchVersion: z.string().min(1).optional(),
      onnxRuntimeVersion: z.string().min(1).optional(),
      cudaVersion: z.string().min(1).optional(),
      driverVersion: z.string().min(1).optional(),
    })
    .optional(),
  gates: z
    .array(
      z.object({
        gate: z.enum(["C", "D"]),
        tracker: z.string().url(),
        status: GateAuditStatusSchema,
        required_inputs: z.array(z.string()),
        command: z.array(z.string()).nullable().optional(),
        metrics: z
          .object({
            roundtrip_passed: z.boolean().optional(),
            encode_consistent: z.boolean().optional(),
            decode_consistent: z.boolean().optional(),
            reencode_consistent: z.boolean().optional(),
            sample_count: z.number().int().optional(),
            token_hamming_rate: z.number().optional(),
            reencode_token_hamming_rate: z.number().optional(),
            cross_device_parity: DecoderGateCParitySchema.optional(),
            onnx_cpu_passed: z.boolean().optional(),
            cpu_decode_seconds: z.number().optional(),
            output_shape: z.array(z.number()).optional(),
            pass_check: z
              .object({
                passed: z.boolean(),
                required: z.record(z.unknown()),
              })
              .optional(),
          })
          .passthrough(),
        evidence: z.array(z.string()).default([]),
        notes: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

export type DecoderGateAuditReceipt = z.infer<typeof DecoderGateAuditReceiptSchema>;

export interface DecoderManifestAuditReceiptValidation {
  readonly ok: boolean;
  readonly issues: ReadonlyArray<{
    readonly path: string;
    readonly message: string;
  }>;
}

export function validateDecoderManifestAuditReceipts(
  manifestInput: unknown,
  receiptsByPath: ReadonlyMap<string, unknown>,
): DecoderManifestAuditReceiptValidation {
  const parsedManifest = DecoderFamilyManifestSchema.safeParse(manifestInput);
  if (!parsedManifest.success) {
    return {
      ok: false,
      issues: parsedManifest.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    };
  }

  const manifest = parsedManifest.data;
  const issues: Array<{ path: string; message: string }> = [];

  for (const gate of ["gateC", "gateD"] as const) {
    const gateManifest = manifest.audits[gate];
    if (gateManifest.status !== "passed") {
      continue;
    }

    if (!gateManifest.receipt) {
      issues.push({
        path: `audits.${gate}.receipt`,
        message: "passed empirical gates require an audit receipt path.",
      });
      continue;
    }

    const receiptInput = receiptsByPath.get(gateManifest.receipt);
    if (receiptInput === undefined) {
      issues.push({
        path: `audits.${gate}.receipt`,
        message: "audit receipt was not provided for validation.",
      });
      continue;
    }

    const receipt = DecoderGateAuditReceiptSchema.safeParse(receiptInput);
    if (!receipt.success) {
      issues.push({
        path: `receipts.${gateManifest.receipt}`,
        message: receipt.error.issues.map((issue) => issue.message).join("; "),
      });
      continue;
    }
    if (receipt.data.status !== "passed") {
      issues.push({
        path: `receipts.${gateManifest.receipt}.status`,
        message: "audit receipt top-level status must be 'passed'.",
      });
      continue;
    }

    const expectedGate = gate === "gateC" ? "C" : "D";
    const gateReceipt = receipt.data.gates.find((entry) => entry.gate === expectedGate);
    if (!gateReceipt) {
      issues.push({
        path: `receipts.${gateManifest.receipt}.gates`,
        message: `audit receipt does not contain Gate ${expectedGate}.`,
      });
      continue;
    }

    if (!candidateMatchesFamily(receipt.data.candidate, manifest.family)) {
      issues.push({
        path: `receipts.${gateManifest.receipt}.candidate`,
        message: "audit receipt candidate does not reference manifest family.",
      });
    }

    if (gateReceipt.tracker !== gateManifest.tracker) {
      issues.push({
        path: `receipts.${gateManifest.receipt}.gates.${expectedGate}.tracker`,
        message: "audit receipt tracker must match manifest audit tracker.",
      });
    }

    const hardChecksPass =
      expectedGate === "C"
        ? gateCReceiptPasses(gateReceipt, manifest.audits.gateC.acceptance)
        : gateDReceiptPasses(gateReceipt, manifest.audits.gateD.acceptance);
    if (gateReceipt.status !== "passed" || !hardChecksPass) {
      issues.push({
        path: `receipts.${gateManifest.receipt}.gates.${expectedGate}.status`,
        message: "manifest gate is passed but receipt gate did not pass its hard checks.",
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

type ParsedGateReceipt = z.infer<typeof DecoderGateAuditReceiptSchema>["gates"][number];

type GateCAcceptance = z.infer<typeof DecoderGateCAcceptanceSchema>;
type GateDAcceptance = z.infer<typeof DecoderGateDAcceptanceSchema>;

function gateCReceiptPasses(
  gateReceipt: ParsedGateReceipt,
  acceptance: GateCAcceptance | undefined,
): boolean {
  if (!acceptance) {
    return false;
  }

  const sampleCount = gateReceipt.metrics.sample_count;
  const reencodeHammingRate =
    numericMetric(gateReceipt.metrics.reencode_token_hamming_rate) ??
    numericMetric(gateReceipt.metrics.token_hamming_rate);
  const reencodePasses =
    acceptance.maxReencodeTokenHammingRate === null ||
    (reencodeHammingRate !== undefined &&
      reencodeHammingRate <= acceptance.maxReencodeTokenHammingRate);

  return (
    gateReceipt.metrics.pass_check?.passed === true &&
    gateReceipt.metrics.cross_device_parity === acceptance.crossDeviceParity &&
    (gateReceipt.metrics.encode_consistent === true ||
      gateReceipt.metrics.roundtrip_passed === true) &&
    (gateReceipt.metrics.decode_consistent === true ||
      gateReceipt.metrics.roundtrip_passed === true) &&
    typeof sampleCount === "number" &&
    sampleCount >= acceptance.minSampleCount &&
    reencodePasses
  );
}

function candidateMatchesFamily(candidate: string, family: string): boolean {
  return candidate === family || candidate.endsWith(`/${family}`);
}

function gateDReceiptPasses(
  gateReceipt: ParsedGateReceipt,
  acceptance: GateDAcceptance | undefined,
): boolean {
  if (!acceptance) {
    return false;
  }

  return (
    gateReceipt.metrics.pass_check?.passed === true &&
    gateReceipt.metrics.onnx_cpu_passed === true &&
    typeof gateReceipt.metrics.cpu_decode_seconds === "number" &&
    gateReceipt.metrics.cpu_decode_seconds <= acceptance.maxCpuDecodeSeconds &&
    Array.isArray(gateReceipt.metrics.output_shape) &&
    sameShape(gateReceipt.metrics.output_shape, acceptance.outputShape)
  );
}

function numericMetric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sameShape(left: ReadonlyArray<number>, right: ReadonlyArray<number>): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function shapeSupportedByCapabilities(
  outputShape: readonly [number, number, 3],
  supportedShapes: ReadonlyArray<z.infer<typeof DecoderShapeSupportManifestSchema>>,
): boolean {
  return supportedShapes.some(
    (shape) => shape.outputPixels[0] === outputShape[0] && shape.outputPixels[1] === outputShape[1],
  );
}
