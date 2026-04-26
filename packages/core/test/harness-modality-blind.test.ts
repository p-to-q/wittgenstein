import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));

describe("harness modality blindness", () => {
  it("does not branch on request.modality === image", async () => {
    const source = await readFile(resolve(testDir, "../src/runtime/harness.ts"), "utf8");
    expect(source.includes('request.modality === "image"')).toBe(false);
  });
});
