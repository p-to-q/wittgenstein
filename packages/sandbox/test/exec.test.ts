import { describe, expect, it } from "vitest";
import { execProgram, NotImplementedError } from "../src/index.js";

describe("@wittgenstein/sandbox", () => {
  it("preserves the reserved execution seam", async () => {
    await expect(
      execProgram("print('hi')", {
        timeoutMs: 10,
      }),
    ).rejects.toBeInstanceOf(NotImplementedError);
  });

  it("throws a structured production-sandbox-not-implemented error", async () => {
    await expect(
      execProgram("print('hi')", {
        timeoutMs: 10,
      }),
    ).rejects.toMatchObject({
      name: "NotImplementedError",
      code: "SANDBOX_NOT_IMPLEMENTED",
      message: "NotImplementedError(execProgram)",
      details: {
        kind: "production_sandbox_not_implemented",
        adr: "ADR-0016",
        package: "@wittgenstein/sandbox",
        reservedBoundary: "untrusted-code-execution",
        mechanism: "none",
      },
    });
  });
});
