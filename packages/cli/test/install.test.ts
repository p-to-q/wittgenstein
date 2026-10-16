import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(testDir, "..");
const cliBin = resolve(packageRoot, "src/cli-main.ts");

describe("install tier command", () => {
  // 30s allowance (repo-wide local convention): each test below spawns the
  // CLI once (`node --import tsx`, tsx startup per spawn); local runs
  // observed 3.1-4.5s — plain `pnpm test` (what CI runs, 5s default)
  // must pass.
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
      plan: { tier: string; runtimeTier: string; weightsFetch: string };
      fetchPolicy: { weightsBaseUrlConfigured: boolean; cacheOnly: boolean };
      decoderPreflight: {
        schemaVersion: string;
        status: string;
        reason: string;
        runtimeTier: string;
        tracker: string;
        details: {
          decisionTracker: string;
          gateCDeterminism: string;
          gateDOnnxCpu: string;
        };
      };
    };

    expect(payload.ok).toBe(true);
    expect(payload.action).toBe("plan-only");
    expect(payload.plan.tier).toBe("image");
    expect(payload.plan.runtimeTier).toBe("tier1");
    expect(payload.plan.weightsFetch).toBe("cache-only");
    expect(payload.fetchPolicy.weightsBaseUrlConfigured).toBe(false);
    expect(payload.fetchPolicy.cacheOnly).toBe(true);
    expect(payload.decoderPreflight).toMatchObject({
      schemaVersion: "witt.image.decoder-preflight/v0.1",
      status: "blocked",
      reason: "manifest-missing",
      runtimeTier: "node-onnx-cpu",
      tracker: "https://github.com/p-to-q/wittgenstein/issues/402",
    });
    expect(payload.decoderPreflight.details.decisionTracker).toMatch(/issues\/402$/);
    expect(payload.decoderPreflight.details.gateCDeterminism).toMatch(/issues\/334$/);
    expect(payload.decoderPreflight.details.gateDOnnxCpu).toMatch(/issues\/335$/);
  }, 30_000);

  it("refuses the image GPU tier until an onnxruntime-gpu bridge ships", () => {
    const install = spawnSync(
      "node",
      ["--import", "tsx", cliBin, "install", "image", "--gpu", "--dry-run"],
      {
        cwd: packageRoot,
        encoding: "utf8",
      },
    );

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as {
      ok: boolean;
      code: string;
      supportedTiers: string[];
    };

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("TIER_INSTALL_GPU_UNSUPPORTED");
    expect(payload.supportedTiers).toEqual(["image"]);
  }, 30_000);

  it("refuses real installation until a decoder manifest exists", () => {
    const install = spawnSync("node", ["--import", "tsx", cliBin, "install", "image"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as { ok: boolean; code: string };

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("TIER_INSTALL_BLOCKED_BY_DECODER_MANIFEST");
  }, 30_000);

  it("rejects unknown install tiers with a structured error", () => {
    const install = spawnSync("node", ["--import", "tsx", cliBin, "install", "audio"], {
      cwd: packageRoot,
      encoding: "utf8",
    });

    expect(install.status).toBe(1);
    const payload = JSON.parse(install.stderr) as { ok: boolean; code: string };

    expect(payload.ok).toBe(false);
    expect(payload.code).toBe("INVALID_INSTALL_TIER");
  }, 30_000);
});
