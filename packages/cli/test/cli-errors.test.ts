import { describe, expect, it, vi } from "vitest";
import { printCliError, shapeCliError } from "../src/cli-errors.js";

describe("shapeCliError", () => {
  it("shapes named refusals flat, with code, message, and details", () => {
    const error = Object.assign(new Error("Cannot find module '/tmp/nope.json'"), {
      code: "CONFIG_LOAD_FAILED",
      details: { configPath: "/tmp/nope.json" },
    });

    expect(shapeCliError(error)).toEqual({
      code: "CONFIG_LOAD_FAILED",
      message: "Cannot find module '/tmp/nope.json'",
      details: { configPath: "/tmp/nope.json" },
    });
  });

  it("attaches a stack only when the error could not be named", () => {
    const shaped = shapeCliError(new Error("boom"));

    expect(shaped.code).toBe("UNEXPECTED_ERROR");
    expect(shaped.message).toBe("boom");
    expect(typeof shaped.stack).toBe("string");
    expect(shaped.details).toBeUndefined();
  });

  it("ignores non-string codes and non-record details", () => {
    const error = Object.assign(new Error("boom"), { code: 42, details: ["not", "a", "record"] });
    const shaped = shapeCliError(error);

    expect(shaped.code).toBe("UNEXPECTED_ERROR");
    expect(shaped.details).toBeUndefined();
  });

  it("stringifies non-object thrown values", () => {
    expect(shapeCliError("bad thing")).toEqual({ code: "UNEXPECTED_ERROR", message: "bad thing" });
    expect(shapeCliError(undefined)).toEqual({ code: "UNEXPECTED_ERROR", message: "undefined" });
  });
});

describe("printCliError", () => {
  it("prints one flat JSON refusal with ok:false on stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      printCliError(Object.assign(new Error("boom"), { code: "CONFIG_LOAD_FAILED" }));

      expect(spy).toHaveBeenCalledTimes(1);
      const printed = String(spy.mock.calls[0]?.[0]);
      expect(JSON.parse(printed)).toEqual({
        ok: false,
        code: "CONFIG_LOAD_FAILED",
        message: "boom",
      });
    } finally {
      spy.mockRestore();
    }
  });

  it("falls back to a minimal refusal when details are not serializable", () => {
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    const error = Object.assign(new Error("boom"), {
      code: "CONFIG_LOAD_FAILED",
      details: circular,
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      printCliError(error);

      const printed = String(spy.mock.calls[0]?.[0]);
      expect(JSON.parse(printed)).toEqual({
        ok: false,
        code: "CONFIG_LOAD_FAILED",
        message: "boom",
      });
    } finally {
      spy.mockRestore();
    }
  });
});
