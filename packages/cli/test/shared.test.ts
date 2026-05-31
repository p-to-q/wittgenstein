import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseOptionalSeed,
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
