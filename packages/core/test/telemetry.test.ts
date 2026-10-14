import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RunTelemetry } from "../src/runtime/telemetry.js";

describe("RunTelemetry path guard (2026-10-16 Stage B)", () => {
  it("writes normal names inside the run dir", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-telemetry-"));
    const telemetry = new RunTelemetry({ runId: "t1", runDir });
    await telemetry.writeText("llm-input.txt", "hello");
    await telemetry.writeJson("manifest.json", { ok: true });
  });

  it("rejects parent-traversal names with a typed error", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-telemetry-"));
    const telemetry = new RunTelemetry({ runId: "t2", runDir });
    await expect(telemetry.writeText("../escape.txt", "bad")).rejects.toMatchObject({
      name: "WittgensteinError",
      code: "TELEMETRY_PATH_TRAVERSAL",
    });
    await expect(telemetry.writeText("a/../../escape.txt", "bad")).rejects.toMatchObject({
      code: "TELEMETRY_PATH_TRAVERSAL",
    });
  });

  it("rejects absolute names", async () => {
    const runDir = await mkdtemp(resolve(tmpdir(), "witt-telemetry-"));
    const telemetry = new RunTelemetry({ runId: "t3", runDir });
    await expect(telemetry.writeText(resolve(runDir, "escape.txt"), "bad")).rejects.toMatchObject({
      code: "TELEMETRY_PATH_TRAVERSAL",
    });
  });
});
