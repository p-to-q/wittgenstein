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
  });

  // Bounded count of `request.modality` references (in CODE, not comments)
  // — #300 modality-blind invariant guard. The current 15 references are
  // classified inline in harness.ts (separate from the modality-as-parameter
  // references inside `defaultOutputPathFor`'s body, which use the
  // `modality` parameter directly rather than `request.modality`):
  //   - 1 is legitimate modality-keyed routing (legacy outPath defaulting; v2
  //     keeps these — the registry IS keyed by modality)
  //   - 14 are v1-compat scaffolding (asciipng / svg / video legacy pipeline
  //     + helper guards) that retires when the last v1 codec ports to v2
  // If this count changes, the new reference must be classified inline in
  // harness.ts AND the expected count updated here (or the new reference
  // removed if it's drift).
  it("bounds the total count of `request.modality` references in code", async () => {
    const source = await readHarnessSource();
    // Strip line comments and block comments so prose references inside the
    // classifying comments don't inflate the count.
    const stripped = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const matches = stripped.match(/request\.modality/g) ?? [];
    // 15 is the audited baseline after v2 outPath defaulting stopped reading
    // from the request and instead uses the routed codec's registry modality.
    // Reduce this number when v1 codecs retire (#300). Increase only with
    // explicit classification in this test's comment + harness.ts inline note.
    expect(matches.length).toBe(15);
  });
});
