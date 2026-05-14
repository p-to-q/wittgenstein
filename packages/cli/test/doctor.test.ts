import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const cliBin = resolve(packageRoot, "src/cli-main.ts");

describe("doctor tier readiness", () => {
  it("prints the current tier readiness table", () => {
    const doctor = spawnSync("node", ["--import", "tsx", cliBin, "doctor"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      tiers: {
        tier0: { ready: boolean };
        tier1: { ready: boolean; installHint: string };
      };
    };
    expect(payload.tiers.tier0.ready).toBe(true);
    expect(payload.tiers.tier1.ready).toBe(false);
    expect(payload.tiers.tier1.installHint).toBe("wittgenstein install image");
  });
});
