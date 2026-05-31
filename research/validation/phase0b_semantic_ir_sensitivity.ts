#!/usr/bin/env tsx
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { RenderCtx } from "@wittgenstein/schemas";
import { format as formatPrettier } from "prettier";
import {
  MLP_ADAPTER_FEATURE_SCHEMA_SHA256,
  adapterFeatureSchema,
} from "../../packages/codec-image/src/adapters/mlp-runtime.js";
import { selectSeedExpander } from "../../packages/codec-image/src/adapters/seed-expander-resolve.js";
import { adaptSceneToLatents } from "../../packages/codec-image/src/pipeline/adapter.js";
import { decodeLatentsToRaster } from "../../packages/codec-image/src/pipeline/decoder.js";
import {
  ImageSceneSpecSchema,
  ImageVisualSeedCodeSchema,
  type ImageLatentCodes,
  type ImageSceneSpec,
} from "../../packages/codec-image/src/schema.js";
import type { ImageAdapterReceipt } from "../../packages/codec-image/src/types.js";

const DEFAULT_OUT = "artifacts/m1b-audit/phase0b-semantic-ir-sensitivity.json";
const SCHEMA_VERSION = "witt.research.phase0b-semantic-ir-sensitivity/v0.1";

interface CaseSpec {
  readonly field: string;
  readonly base: unknown;
  readonly variant: unknown;
}

const CASES: readonly CaseSpec[] = [
  {
    field: "intent",
    base: "stormy ocean at midnight",
    variant: "sunny meadow at noon",
  },
  {
    field: "lighting.mood",
    base: "warm golden",
    variant: "cold fluorescent",
  },
  {
    field: "composition.framing",
    base: "wide establishing shot",
    variant: "tight macro detail",
  },
  {
    field: "style.palette",
    base: ["amber", "deep blue", "white"],
    variant: ["acid green", "magenta", "black"],
  },
  {
    field: "constraints.negative",
    base: ["no text", "no watermark"],
    variant: ["no people", "no buildings"],
  },
];

function parseArgs(argv: readonly string[]): {
  out: string;
  generatedAt: string;
  seedExpander: string;
} {
  let out = DEFAULT_OUT;
  let generatedAt = new Date().toISOString();
  let seedExpander = "placeholder";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") {
      continue;
    } else if (arg === "--out") {
      out = requiredValue(argv, (index += 1), arg);
    } else if (arg === "--generated-at") {
      generatedAt = requiredValue(argv, (index += 1), arg);
    } else if (arg === "--seed-expander") {
      seedExpander = requiredValue(argv, (index += 1), arg);
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${String(arg)}`);
    }
  }

  return { out, generatedAt, seedExpander };
}

function requiredValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printHelp(): void {
  console.log(`Usage: pnpm exec tsx research/validation/phase0b_semantic_ir_sensitivity.ts [options]

Options:
  --out <path>             Output receipt path (default: ${DEFAULT_OUT})
  --generated-at <iso>     Override timestamp for deterministic fixtures
  --seed-expander <id>     Seed expander selector (default: placeholder)

This runner measures Phase 0b adapter-output sensitivity for #452. It is a
seed-expander hash baseline: it proves semantic fields perturb the current
Visual Seed Code output path, but also records that the perturbation is driven
by the per-spec hash seed rather than semantically aligned CLIP/SigLIP
conditioning.`);
}

function setPath(value: unknown, field: string, replacement: unknown): unknown {
  const cloned = JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  const parts = field.split(".");
  let cursor = cloned;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      throw new Error(`Cannot set ${field}; ${part} is not an object`);
    }
    cursor = next as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]!] = replacement;
  return cloned;
}

function baseScene(): ImageSceneSpec {
  return ImageSceneSpecSchema.parse({
    schemaVersion: "witt.image.spec/v0.1",
    mode: "one-shot-vsc",
    intent: "stormy ocean at midnight",
    subject: "rocky coast",
    composition: {
      framing: "wide establishing shot",
      camera: "low horizon",
      depthPlan: ["foreground rocks", "midground waves", "background storm clouds"],
    },
    lighting: {
      mood: "warm golden",
      key: "low side",
    },
    style: {
      references: ["phase0b baseline"],
      palette: ["amber", "deep blue", "white"],
    },
    constraints: {
      mustHave: ["visible horizon"],
      negative: ["no text", "no watermark"],
    },
    renderHints: {
      detailLevel: "medium",
      tokenBudget: 1024,
      seed: null,
    },
    decoder: {
      family: "llamagen",
      codebook: "stub-codebook",
      codebookVersion: "v0",
      latentResolution: [4, 4],
    },
    seedCode: ImageVisualSeedCodeSchema.parse({
      schemaVersion: "witt.image.seed/v0.1",
      family: "vqvae",
      mode: "prefix",
      tokens: [42, 17, 88, 201, 15, 33, 77, 100],
    }),
  });
}

function renderCtx(outPath: string): RenderCtx {
  const logger = {
    debug: () => undefined,
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  };
  return {
    runId: "phase0b-semantic-ir-sensitivity",
    runDir: dirname(outPath),
    seed: null,
    outPath,
    logger,
  };
}

async function adaptAndDecode(
  scene: ImageSceneSpec,
  label: string,
): Promise<{
  latents: ImageLatentCodes;
  pngBytes: Uint8Array;
  adapterReceipt: ImageAdapterReceipt;
}> {
  const ctx = renderCtx(`artifacts/tmp/phase0b-${label}.png`);
  const { latents, receipt } = await adaptSceneToLatents(scene, ctx);
  const raster = await decodeLatentsToRaster(latents, ctx);
  return {
    latents,
    pngBytes: raster.pngBytes,
    adapterReceipt: receipt,
  };
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function tokenDelta(
  a: readonly number[],
  b: readonly number[],
): {
  hammingRate: number;
  meanAbsoluteDelta: number;
  maxAbsoluteDelta: number;
} {
  if (a.length !== b.length) {
    throw new Error(`Token length mismatch: ${a.length} vs ${b.length}`);
  }
  let changed = 0;
  let totalAbs = 0;
  let maxAbs = 0;
  for (let index = 0; index < a.length; index += 1) {
    const delta = Math.abs((a[index] ?? 0) - (b[index] ?? 0));
    if (delta > 0) {
      changed += 1;
    }
    totalAbs += delta;
    maxAbs = Math.max(maxAbs, delta);
  }
  return {
    hammingRate: changed / Math.max(1, a.length),
    meanAbsoluteDelta: totalAbs / Math.max(1, a.length),
    maxAbsoluteDelta: maxAbs,
  };
}

function byteDelta(
  a: Uint8Array,
  b: Uint8Array,
): {
  byteHammingRate: number;
  lengthDelta: number;
} {
  const width = Math.max(a.length, b.length);
  let changed = Math.abs(a.length - b.length);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) {
      changed += 1;
    }
  }
  return {
    byteHammingRate: changed / Math.max(1, width),
    lengthDelta: b.length - a.length,
  };
}

async function buildReceipt(options: {
  generatedAt: string;
  seedExpander: string;
}): Promise<Record<string, unknown>> {
  const selectedSeedExpander = selectSeedExpander(options.seedExpander);
  process.env.WITTGENSTEIN_IMAGE_SEED_EXPANDER = options.seedExpander;
  const featureSchema = adapterFeatureSchema({});
  const base = baseScene();
  const rows = [];

  for (const caseSpec of CASES) {
    const baseCase = ImageSceneSpecSchema.parse(setPath(base, caseSpec.field, caseSpec.base));
    const variantCase = ImageSceneSpecSchema.parse(setPath(base, caseSpec.field, caseSpec.variant));

    const baseOutput = await adaptAndDecode(baseCase, `${caseSpec.field}-base`);
    const variantOutput = await adaptAndDecode(variantCase, `${caseSpec.field}-variant`);
    assertSeedExpanderReceipt(baseOutput.adapterReceipt, selectedSeedExpander.id, caseSpec.field);
    assertSeedExpanderReceipt(
      variantOutput.adapterReceipt,
      selectedSeedExpander.id,
      caseSpec.field,
    );
    const token = tokenDelta(baseOutput.latents.tokens, variantOutput.latents.tokens);
    const png = byteDelta(baseOutput.pngBytes, variantOutput.pngBytes);

    rows.push({
      field: caseSpec.field,
      baseValue: caseSpec.base,
      variantValue: caseSpec.variant,
      tokenHammingRate: token.hammingRate,
      meanAbsoluteTokenDelta: token.meanAbsoluteDelta,
      maxAbsoluteTokenDelta: token.maxAbsoluteDelta,
      baseLatentSha256: sha256(JSON.stringify(baseOutput.latents.tokens)),
      variantLatentSha256: sha256(JSON.stringify(variantOutput.latents.tokens)),
      basePngSha256: sha256(baseOutput.pngBytes),
      variantPngSha256: sha256(variantOutput.pngBytes),
      pngByteHammingRate: png.byteHammingRate,
      pngLengthDelta: png.lengthDelta,
      verdict:
        token.hammingRate > 0 ? "output_changed_hash_baseline" : "output_unchanged_hash_baseline",
    });
  }

  const meanTokenHammingRate =
    rows.reduce((sum, row) => sum + row.tokenHammingRate, 0) / Math.max(1, rows.length);
  const meanPngByteHammingRate =
    rows.reduce((sum, row) => sum + row.pngByteHammingRate, 0) / Math.max(1, rows.length);

  return {
    schemaVersion: SCHEMA_VERSION,
    issue: 452,
    generatedAt: options.generatedAt,
    measurement: "Phase 0b semantic IR field sensitivity",
    adapter: {
      codePath: "visual-seed-code",
      seedExpanderId: selectedSeedExpander.id,
      seedSensitivitySource: "adapter.hashSpecToSeed(scene)",
      learnedMlpFeatureSchema: featureSchema,
      learnedMlpUsed: false,
      semanticAlignment: "not_measured_seed_expander_hash_baseline",
    },
    controls: {
      seedCode: base.seedCode,
      decoder: base.decoder,
      variedFields: CASES.map((entry) => entry.field),
    },
    cases: rows,
    aggregate: {
      caseCount: rows.length,
      meanTokenHammingRate,
      meanPngByteHammingRate,
      allCasesChanged: rows.every((row) => row.tokenHammingRate > 0),
    },
    interpretation:
      "Current Visual Seed Code output is field-sensitive because adapter.hashSpecToSeed(scene) changes the seed-expander input. This is a null baseline receipt, not evidence of learned MLP or CLIP/SigLIP semantic conditioning.",
  };
}

function assertSeedExpanderReceipt(
  receipt: ImageAdapterReceipt,
  expectedSeedExpanderId: string,
  field: string,
): void {
  if (receipt.outcome !== "visual-seed-code" || receipt.seedExpanderId !== expectedSeedExpanderId) {
    throw new Error(
      `Phase 0b case ${field} expected visual-seed-code via ${expectedSeedExpanderId}; got outcome=${receipt.outcome}, seedExpanderId=${receipt.seedExpanderId}`,
    );
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const receipt = await buildReceipt(args);
  const out = resolve(args.out);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, await formatPrettier(JSON.stringify(receipt), { parser: "json" }), "utf8");

  const reloaded = JSON.parse(await readFile(out, "utf8")) as {
    aggregate?: { allCasesChanged?: boolean };
  };
  if (reloaded.aggregate?.allCasesChanged !== true) {
    throw new Error("Phase 0b receipt did not show output changes for all cases.");
  }
  console.log(`Phase 0b receipt written to ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
