import { describe, expect, it } from "vitest";
import { createProgram } from "../src/index.js";

describe("image-dry-expand command", () => {
  it("registers as a top-level command with the documented options", () => {
    const command = createProgram().commands.find((c) => c.name() === "image-dry-expand");
    expect(command).toBeDefined();
    expect(command?.options.map((option) => option.long).sort()).toEqual([
      "--ascii",
      "--codebook",
      "--codebook-version",
      "--decoder-family",
      "--expander",
      "--family",
      "--grid",
      "--mode",
      "--seed",
      "--seed-code",
    ]);
  });
});
