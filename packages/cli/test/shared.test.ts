import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseOptionalSeed,
  parsePositiveIntegerOption,
  parsePositiveNumberOption,
  parseSeedOption,
  resolveExecutionRoot,
} from "../src/commands/shared.js";

describe("parseOptionalSeed", () => {
  it("returns undefined when no seed is provided (caller should fall through to default)", () => {
    expect(parseOptionalSeed(undefined)).toBeUndefined();
  });

  it("passes through parsed integer seeds", () => {
    expect(parseOptionalSeed(0)).toBe(0);
    expect(parseOptionalSeed(42)).toBe(42);
  });
});

describe("parseSeedOption", () => {
  it("parses '0' as the integer zero (NOT a missing value)", () => {
    expect(parseSeedOption("0")).toBe(0);
  });

  it("parses positive integers", () => {
    expect(parseSeedOption("7")).toBe(7);
    expect(parseSeedOption("42")).toBe(42);
  });

  it("rejects leading-numeric strings instead of truncating to the parseInt prefix", () => {
    expect(() => parseSeedOption("123abc")).toThrow("Seed must be an integer.");
  });

  it("rejects non-numeric strings before they can serialize to null in manifests", () => {
    expect(() => parseSeedOption("not-a-number")).toThrow("Seed must be an integer.");
  });

  it("rejects numbers outside JavaScript's safe integer range", () => {
    expect(() => parseSeedOption("9007199254740992")).toThrow("Seed must be a safe integer.");
  });
});

describe("parsePositiveNumberOption", () => {
  it("parses integer and decimal positive numbers", () => {
    expect(parsePositiveNumberOption("7")).toBe(7);
    expect(parsePositiveNumberOption("1.25")).toBe(1.25);
    expect(parsePositiveNumberOption(".5")).toBe(0.5);
  });

  it("rejects truncated, zero, negative, and non-numeric values", () => {
    expect(() => parsePositiveNumberOption("12abc")).toThrow("Value must be a positive number.");
    expect(() => parsePositiveNumberOption("0")).toThrow("Value must be a positive number.");
    expect(() => parsePositiveNumberOption("-1")).toThrow("Value must be a positive number.");
    expect(() => parsePositiveNumberOption("nope")).toThrow("Value must be a positive number.");
  });
});

describe("parsePositiveIntegerOption", () => {
  it("parses positive integers", () => {
    expect(parsePositiveIntegerOption("1")).toBe(1);
    expect(parsePositiveIntegerOption("120")).toBe(120);
  });

  it("rejects truncated, decimal, zero, negative, and unsafe integer values", () => {
    expect(() => parsePositiveIntegerOption("10xyz")).toThrow("Value must be a positive integer.");
    expect(() => parsePositiveIntegerOption("1.5")).toThrow("Value must be a positive integer.");
    expect(() => parsePositiveIntegerOption("0")).toThrow("Value must be a positive safe integer.");
    expect(() => parsePositiveIntegerOption("-1")).toThrow("Value must be a positive integer.");
    expect(() => parsePositiveIntegerOption("9007199254740992")).toThrow(
      "Value must be a positive safe integer.",
    );
  });
});

describe("resolveExecutionRoot", () => {
  it("walks up to the workspace root containing pnpm-workspace.yaml", () => {
    // Vitest runs with cwd = the package's own dir (packages/cli) when
    // invoked via `pnpm --filter`. The function should walk up to the
    // monorepo root, where pnpm-workspace.yaml lives.
    const root = resolveExecutionRoot();
    expect(existsSync(resolve(root, "pnpm-workspace.yaml"))).toBe(true);
  });

  it("returns an absolute path", () => {
    const root = resolveExecutionRoot();
    // POSIX absolute or Windows drive prefix
    expect(/^([A-Z]:|\/)/.test(root)).toBe(true);
  });
});
