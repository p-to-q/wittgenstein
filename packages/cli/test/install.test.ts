import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const cliBin = resolve(packageRoot, "src/cli-main.ts");

describe("install tier command", () => {
  it("prints an image install plan without fetching weights", () => {
    const install = spawnSync(
      "node",
      ["--import", "tsx", cliBin, "install", "image", "--dry-run"],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );

    expect(install.status).toBe(0);
    const payload = JSON.parse(install.stdout) as {
      ok: boolean;
      action: string;
      plan: { tier: string; runtimeTier: string; blockedBy: string };
    };

    expect(payload.ok).toBe(true);
    expect(payload.action).toBe("plan-only");
    expect(payload.plan.tier).toBe("image");
    expect(payload.plan.runtimeTier).toBe("tier1");
    expect(payload.plan.blockedBy).toBe("decoder-manifest");
  });

  it("maps --gpu to the image GPU tier", () => {
    const install = spawnSync(
      "node",
      ["--import", "tsx", cliBin, "install", "image", "--gpu", "--dry-run"],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );

    expect(install.status).toBe(0);
    const payload = JSON.parse(install.stdout) as { plan: { tier: string; runtimeTier: string } };

    expect(payload.plan.tier).toBe("image-gpu");
    expect(payload.plan.runtimeTier).toBe("tier2");
  });

  it("refuses real installation until a decoder manifest exists", () => {
    const install = spawnSync("node", ["--import", "tsx", cliBin, "install", "image"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as { ok: boolean; code: string };

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST");
  });

  it("rejects unknown install tiers with a structured error", () => {
    const install = spawnSync("node", ["--import", "tsx", cliBin, "install", "audio"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as { ok: boolean; code: string };

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("INVALID_INSTALL_TIER");
  });
});
