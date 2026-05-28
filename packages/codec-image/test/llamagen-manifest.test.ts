/**
 * Guardrail for the checked-in LlamaGen decoder bridge manifest
 * (`src/decoders/llamagen/manifest.json`, added in PR #492).
 *
 * The manifest is a `DecoderWeightsManifest`-shaped pin record consumed at
 * runtime by `resolveDecoderWeights()` in `../weights.ts`. It is plain JSON
 * with no compile-time check, so without this test a silent edit — a
 * malformed SHA, a dropped field, a license downgrade — would only surface
 * when a user actually tried to load the bridge.
 *
 * This pins three things:
 *   1. The committed JSON parses against `DecoderWeightsManifestSchema`.
 *   2. The SHA-256 + license fields match the values the audit receipt
 *      (`docs/research/2026-05-27-audit-vqgan-class-gates-cd.md`) and the
 *      sibling README declare, so the manifest cannot drift away from its
 *      provenance unnoticed.
 *   3. The shape stays in lockstep with the schema (e.g. a future required
 *      field forces a manifest update, not a silent skip).
 *
 * Source: #507 open decision — "Should #492 receive the local guardrail
 * test patch before merge?" → yes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { DecoderWeightsManifestSchema } from "../src/decoders/weights.js";

const here = dirname(fileURLToPath(import.meta.url));
const manifestPath = resolve(here, "../src/decoders/llamagen/manifest.json");

describe("llamagen decoder bridge manifest (#492 guardrail)", () => {
  const raw = readFileSync(manifestPath, "utf8");

  it("is valid JSON", () => {
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it("conforms to DecoderWeightsManifestSchema", () => {
    const parsed = DecoderWeightsManifestSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `llamagen/manifest.json failed schema validation:\n${parsed.error.issues
          .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
          .join("\n")}`,
      );
    }
    expect(parsed.success).toBe(true);
  });

  it("pins the audited provenance values (SHA / license / revision)", () => {
    const manifest = DecoderWeightsManifestSchema.parse(JSON.parse(raw));
    // These exact values come from the Gate D ONNX export receipt
    // (docs/research/2026-05-27-audit-vqgan-class-gates-cd.md). Changing
    // the shipped artifact requires updating both the audit doc and this
    // pin in the same PR — a silent SHA swap fails here.
    expect(manifest.family).toBe("llamagen");
    expect(manifest.repoId).toBe("FoundationVision/LlamaGen");
    expect(manifest.revision).toBe("81e41139272c038412e4fe8f1c52a51ebbf95b8b");
    expect(manifest.weightsFilename).toBe("llamagen_vq_ds16_decoder.onnx");
    expect(manifest.weightsSha256).toBe(
      "fd6800b3df8193968656e3e6b01ab48bd8899ebede829dfd1166da5f5b9f9389",
    );
    expect(manifest.license.code).toBe("MIT");
    expect(manifest.license.weights).toBe("permissive");
  });

  it("declares a sha256 in the canonical 64-hex-char form", () => {
    const manifest = DecoderWeightsManifestSchema.parse(JSON.parse(raw));
    expect(manifest.weightsSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
