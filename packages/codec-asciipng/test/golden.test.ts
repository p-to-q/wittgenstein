/**
 * Byte-stable golden coverage for codec-asciipng (Issue #347).
 *
 * Locks the deterministic renderer output against a SHA-256 digest so any
 * accidental change to the pseudo-ASCII raster path is caught by `pnpm
 * test:golden`. Goldens are kept inline rather than as fixture files because
 * the output is small and the digest itself is the contract.
 *
 * To regenerate after an intentional renderer change: replace the expected
 * digest with the value the test prints when it fails.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { renderPseudoAsciiPng, minimaxTextToAsciiIr } from "../src/index.js";

function sha256(bytes: Uint8Array | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("codec-asciipng golden parity (Issue #347)", () => {
  it("renderPseudoAsciiPng is byte-stable for a canonical input", () => {
    const bytes = renderPseudoAsciiPng(
      {
        text: "Hi",
        columns: 12,
        rows: 4,
        cell: 4,
        fg: [200, 255, 200],
        bg: [0, 0, 0],
      },
      1,
    );
    expect(sha256(bytes)).toBe(
      "417521c79a7b26fc806d653acbaefd1351607debe5a82dfabc3d309d13ea44de",
    );
  });

  it("minimaxTextToAsciiIr is byte-stable for canonical input", () => {
    const ir = minimaxTextToAsciiIr("```\n##\n..##\n```", 6, 3, 4);
    const json = Buffer.from(JSON.stringify(ir), "utf8");
    expect(sha256(json)).toBe(
      "40ea7f712277417d37659e62781c22f3371baae9e5c371805569f1d2c016bf91",
    );
  });
});
