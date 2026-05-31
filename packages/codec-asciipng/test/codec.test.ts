import { describe, expect, it } from "vitest";
import { asciipngCodec, minimaxTextToAsciiIr, renderPseudoAsciiPng } from "../src/index.js";

describe("@wittgenstein/codec-asciipng", () => {
  it("registers codec", () => {
    expect(asciipngCodec.name).toBe("asciipng");
    expect(asciipngCodec.modality).toBe("asciipng");
  });

  it("returns ASCIIPNG_SCHEMA_PARSE_FAILED for invalid JSON (#367 error-path coverage)", () => {
    const result = asciipngCodec.parse("definitely-not-json");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ASCIIPNG_SCHEMA_PARSE_FAILED");
    expect(result.error.cause).toBeInstanceOf(SyntaxError);
  });

  it("returns ASCIIPNG_SCHEMA_INVALID with zod issues for out-of-range columns", () => {
    // columns has min: 8, max: 120 — passing 5000 should fail validation.
    const result = asciipngCodec.parse(JSON.stringify({ columns: 5000 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ASCIIPNG_SCHEMA_INVALID");
    const issues = (
      result.error.details as { issues: ReadonlyArray<{ path: ReadonlyArray<string | number> }> }
    ).issues;
    expect(issues.some((issue) => issue.path.includes("columns"))).toBe(true);
  });

  it("returns ASCIIPNG_SCHEMA_INVALID for malformed fg color tuple", () => {
    // fg expects [r, g, b] integers in [0, 255]; passing a wrong shape fails.
    const result = asciipngCodec.parse(JSON.stringify({ fg: ["red"] }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("ASCIIPNG_SCHEMA_INVALID");
  });

  it("post-processes Minimax-style text into a fixed-size grid IR", () => {
    const raw = "```\n##\n..##\n```";
    const ir = minimaxTextToAsciiIr(raw, 6, 3, 4);
    expect(ir.text.length).toBe(18);
    expect(ir.glyphMode).toBe("density");
  });

  it("produces PNG magic from minimal IR", () => {
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
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);
    expect(bytes[2]).toBe(0x4e);
    expect(bytes[3]).toBe(0x47);
  });
});
