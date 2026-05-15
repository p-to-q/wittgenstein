import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));

async function readHarnessSource(): Promise<string> {
  return readFile(resolve(testDir, "../src/runtime/harness.ts"), "utf8");
}

describe("harness modality blindness", () => {
  it("does not branch on request.modality === image", async () => {
    const source = await readHarnessSource();
    expect(source.includes('request.modality === "image"')).toBe(false);
  });

  it("does not branch on request.modality === audio", async () => {
    const source = await readHarnessSource();
    expect(source.includes('request.modality === "audio"')).toBe(false);
  });

  it("keeps modality-specific legacy branching outside the main run body", async () => {
    const source = await readHarnessSource();
    const runBody = source.slice(
      source.indexOf("  public async run("),
      source.indexOf("  private async generateStructured("),
    );

    expect(runBody).not.toMatch(/request\.modality\s*[!=]==/);
    expect(runBody).toContain("runLegacyCodecPipeline");
    expect(source).toContain("./legacy-codec-pipeline.js");
  });

  // Bounded count of `request.modality` references (in CODE, not comments)
  // - #300 modality-blind invariant guard. The remaining reference is
  // legitimate modality-keyed routing for legacy outPath defaulting; v2 uses
  // the routed codec's registry modality. Modality-specific v1 scaffolding now
  // lives in `legacy-codec-pipeline.ts` and retires when the last v1 codec
  // ports to v2.
  // If this count changes, the new reference must be classified inline in
  // harness.ts AND the expected count updated here (or the new reference
  // removed if it's drift).
  it("bounds the total count of `request.modality` references in code", async () => {
    const source = await readHarnessSource();
    // Strip line comments and block comments so prose references inside the
    // classifying comments don't inflate the count.
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const matches = stripped.match(/request\.modality/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
