import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { WittgensteinError } from "./errors.js";

export interface RunTelemetryOptions {
  runId: string;
  runDir: string;
}

export class RunTelemetry {
  public readonly runId: string;
  public readonly runDir: string;

  public constructor(options: RunTelemetryOptions) {
    this.runId = options.runId;
    this.runDir = options.runDir;
  }

  public async ensureRunDir(): Promise<void> {
    await mkdir(this.runDir, { recursive: true });
  }

  public async writeText(name: string, value: string): Promise<void> {
    // Path guard: telemetry names come from harness/codec code, but a
    // traversal here would silently write outside the run dir. Reject
    // absolute paths and `..` segments with a typed error instead
    // (2026-10-16 Stage B).
    if (isAbsolute(name) || name.split(/[\\/]/).includes("..")) {
      throw new WittgensteinError(
        "TELEMETRY_PATH_TRAVERSAL",
        "Telemetry file name must stay inside the run dir.",
        {
          details: { name },
        },
      );
    }

    const filePath = resolve(this.runDir, name);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, value, "utf8");
  }

  public async writeJson(name: string, value: unknown): Promise<void> {
    await this.writeText(name, `${JSON.stringify(value, null, 2)}\n`);
  }
}
