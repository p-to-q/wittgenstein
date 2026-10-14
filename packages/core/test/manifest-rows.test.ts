import { describe, expect, it } from "vitest";
import { foldManifestRows } from "../src/runtime/harness.js";

type MutableManifest = Record<string, unknown>;

describe("foldManifestRows closed row-key set (2026-10-16 slice A4)", () => {
  it("folds allowed row keys onto the manifest", () => {
    const manifest: MutableManifest = { seed: 7 };
    foldManifestRows(manifest, [
      { key: "image.code", value: { mode: "one-shot-vsc" } },
      { key: "metadata.warnings", value: 2 },
      { key: "route", value: "raster" },
    ]);
    expect(manifest["image.code"]).toEqual({ mode: "one-shot-vsc" });
    expect(manifest["metadata.warnings"]).toBe(2);
    expect(manifest["route"]).toBe("raster");
    // Core fields untouched by unrelated rows.
    expect(manifest["seed"]).toBe(7);
  });

  it("aliases route and artifact.sha256 rows onto the typed manifest fields", () => {
    const manifest: MutableManifest = {};
    foldManifestRows(manifest, [
      { key: "route", value: "speech" },
      { key: "artifact.sha256", value: "abc123" },
    ]);
    expect(manifest["route"]).toBe("speech");
    expect(manifest["artifactSha256"]).toBe("abc123");
  });

  it("rejects unknown row keys with a typed error instead of writing silently", () => {
    const manifest: MutableManifest = { seed: 7 };
    expect(() => {
      foldManifestRows(manifest, [{ key: "seed", value: 99 }]);
    }).toThrowError(
      expect.objectContaining({
        name: "WittgensteinError",
        code: "MANIFEST_ROW_KEY_REJECTED",
      }),
    );
    // Rejection happens before any write: the core field stays intact.
    expect(manifest["seed"]).toBe(7);
  });

  it("rejects unknown keys even when earlier rows were valid", () => {
    const manifest: MutableManifest = {};
    expect(() => {
      foldManifestRows(manifest, [
        { key: "renderPath", value: "raster" },
        { key: "not-a-real-row", value: true },
      ]);
    }).toThrowError(expect.objectContaining({ code: "MANIFEST_ROW_KEY_REJECTED" }));
  });
});
