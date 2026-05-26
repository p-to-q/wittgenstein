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
      videoRender: {
        enabled: boolean;
        backend: string;
        hyperframesNode: { status: string };
        hyperframesCli: { status: string };
        ffmpeg: { status: string };
        chrome: { status: string };
      };
    };
    expect(payload.tiers.tier0.ready).toBe(true);
    expect(payload.tiers.tier1.ready).toBe(false);
    expect(payload.tiers.tier1.installHint).toBe("wittgenstein install image");
    expect(payload.videoRender.enabled).toBe(false);
    expect(payload.videoRender.backend).toBe("distilled-internal");
    expect(payload.videoRender.hyperframesNode.status).toBe("skipped");
    expect(payload.videoRender.hyperframesCli.status).toBe("skipped");
    expect(payload.videoRender.ffmpeg.status).toBe("skipped");
    expect(payload.videoRender.chrome.status).toBe("skipped");
  });

  it("prints structured video dependency checks when HyperFrames MP4 rendering is enabled", () => {
    const doctor = spawnSync("node", ["--import", "tsx", cliBin, "doctor"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        WITTGENSTEIN_HYPERFRAMES_RENDER: "1",
      },
    });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      videoRender: {
        enabled: boolean;
        backend: string;
        hyperframesNode: { status: string };
        hyperframesCli: { status: string };
        ffmpeg: { status: string };
        chrome: { status: string };
      };
    };

    expect(payload.videoRender.enabled).toBe(true);
    expect(payload.videoRender.backend).toBe("distilled-internal");
    expect(payload.videoRender.hyperframesNode.status).toBe("skipped");
    expect(payload.videoRender.hyperframesCli.status).toBe("skipped");
    expect(["ok", "missing"]).toContain(payload.videoRender.ffmpeg.status);
    expect(["ok", "missing"]).toContain(payload.videoRender.chrome.status);
  });

  it("checks HyperFrames CLI when the npx backend is selected", () => {
    const doctor = spawnSync("node", ["--import", "tsx", cliBin, "doctor"], {
      cwd: packageRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        WITTGENSTEIN_HYPERFRAMES_RENDER: "1",
        WITTGENSTEIN_HYPERFRAMES_BACKEND: "npx-cli",
      },
    });

    expect(doctor.status).toBe(0);
    const payload = JSON.parse(doctor.stdout) as {
      videoRender: {
        enabled: boolean;
        backend: string;
        hyperframesNode: { status: string };
        hyperframesCli: { status: string };
      };
    };

    expect(payload.videoRender.enabled).toBe(true);
    expect(payload.videoRender.backend).toBe("npx-cli");
    expect(["ok", "missing"]).toContain(payload.videoRender.hyperframesNode.status);
    expect(["ok", "missing"]).toContain(payload.videoRender.hyperframesCli.status);
  });
});
