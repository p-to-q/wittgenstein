import { describe, expect, it } from "vitest";
import { parseOptionalSeed, resolveExecutionRoot } from "../src/commands/shared.js";

describe("parseOptionalSeed", () => {
  it("returns undefined when no seed is provided (caller should fall through to default)", () => {
    expect(parseOptionalSeed(undefined)).toBeUndefined();
  });

  it("parses '0' as the integer zero (NOT a missing value)", () => {
    expect(parseOptionalSeed("0")).toBe(0);
  });

  it("parses positive integers", () => {
    expect(parseOptionalSeed("7")).toBe(7);
    expect(parseOptionalSeed("42")).toBe(42);
  });

  it("parses leading-numeric strings as the parseInt prefix", () => {
    // parseInt("123abc", 10) → 123 — not ideal but the documented behavior
    // of the existing implementation. If the contract changes (e.g. reject
    // garbage), update this test alongside the change.
    expect(parseOptionalSeed("123abc")).toBe(123);
  });

  it("returns NaN for non-numeric strings (not undefined; the caller can detect)", () => {
    // The function returns undefined ONLY for undefined input. A bad seed
    // string surfaces as NaN so the caller can choose to error rather
    // than silently resolve to the default.
    const result = parseOptionalSeed("not-a-number");
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe("resolveExecutionRoot", () => {
  it("walks up to the workspace root containing pnpm-workspace.yaml", () => {
    // Vitest runs with cwd = the package's own dir (packages/cli) when
    // invoked via `pnpm --filter`. The function should walk up to the
    // monorepo root, where pnpm-workspace.yaml lives.
    const root = resolveExecutionRoot();
    expect(root.endsWith("/wittgenstein") || root.endsWith("\\wittgenstein")).toBe(true);
  });

  it("returns an absolute path", () => {
    const root = resolveExecutionRoot();
    // POSIX absolute or Windows drive prefix
    expect(/^([A-Z]:|\/)/.test(root)).toBe(true);
  });
});
