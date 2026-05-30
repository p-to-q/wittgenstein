import { z } from "zod";
import { DecoderFamilySchema } from "../schema.js";
import { DecoderWeightsManifestSchema } from "./weights.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GateCMinSampleCount = 3;
const GateCMaxTokenHammingRate = 0.0;
const GateDMaxCpuDecodeSeconds = 30.0;

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
      }),
      gateD: z.object({
        status: z.enum(["passed", "blocked", "skipped", "unknown"]),
        tracker: z.string().url(),
        receipt: z.string().optional(),
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

      if (!manifest.capabilities.decoderHash) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["capabilities", "decoderHash"],
          message: "blessed decoder manifests require a decoderHash.",
        });
      }
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
            sample_count: z.number().int().optional(),
            token_hamming_rate: z.number().optional(),
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
      expectedGate === "C" ? gateCReceiptPasses(gateReceipt) : gateDReceiptPasses(gateReceipt);
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

function gateCReceiptPasses(gateReceipt: ParsedGateReceipt): boolean {
  return (
    gateReceipt.metrics.pass_check?.passed === true &&
    gateReceipt.metrics.roundtrip_passed === true &&
    typeof gateReceipt.metrics.sample_count === "number" &&
    gateReceipt.metrics.sample_count >= GateCMinSampleCount &&
    typeof gateReceipt.metrics.token_hamming_rate === "number" &&
    gateReceipt.metrics.token_hamming_rate <= GateCMaxTokenHammingRate
  );
}

function candidateMatchesFamily(candidate: string, family: string): boolean {
  return candidate === family || candidate.endsWith(`/${family}`);
}

function gateDReceiptPasses(gateReceipt: ParsedGateReceipt): boolean {
  return (
    gateReceipt.metrics.pass_check?.passed === true &&
    gateReceipt.metrics.onnx_cpu_passed === true &&
    typeof gateReceipt.metrics.cpu_decode_seconds === "number" &&
    gateReceipt.metrics.cpu_decode_seconds <= GateDMaxCpuDecodeSeconds &&
    Array.isArray(gateReceipt.metrics.output_shape) &&
    gateReceipt.metrics.output_shape.length === 3 &&
    gateReceipt.metrics.output_shape[0] === 256 &&
    gateReceipt.metrics.output_shape[1] === 256 &&
    gateReceipt.metrics.output_shape[2] === 3
  );
}
