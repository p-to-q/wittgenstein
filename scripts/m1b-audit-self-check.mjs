#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const checks = [
  {
    name: "python validation unit tests",
    command: "python3",
    args: [
      "-m",
      "unittest",
      "research.validation.test_m1b_metric_producers",
      "research.validation.test_vqgan_gate_audit",
    ],
  },
  {
    name: "ONNX export help",
    command: "python3",
    args: ["-m", "research.validation.m1b_export_llamagen_decoder_onnx", "--help"],
  },
  {
    name: "Gate C producer help",
    command: "python3",
    args: ["-m", "research.validation.m1b_gate_c_roundtrip", "--help"],
  },
  {
    name: "Gate D producer help",
    command: "python3",
    args: ["-m", "research.validation.m1b_gate_d_onnx_cpu", "--help"],
  },
  {
    name: "codec-image decoder manifest tests",
    command: "pnpm",
    args: [
      "--filter",
      "@wittgenstein/codec-image",
      "test",
      "--",
      "decoder-family-manifest.test.ts",
      "decoder-preflight.test.ts",
    ],
  },
  {
    name: "codec-image typecheck",
    command: "pnpm",
    args: ["--filter", "@wittgenstein/codec-image", "typecheck"],
  },
  {
    name: "M1B fixture artifact check",
    command: "node",
    args: ["scripts/m1b-audit-artifact-check.mjs", "research/validation/fixtures/m1b-audit"],
  },
  {
    name: "M1B artifact check rejects inconsistent pass metrics",
    custom: checkArtifactValidatorRejectsBadGateD,
  },
  {
    name: "M1B staging plan covers current worktree",
    command: "node",
    args: ["scripts/m1b-staging-plan-check.mjs"],
  },
  {
    name: "generated M1B artifacts are ignored",
    pathsMustBeIgnored: [
      "artifacts/m1b-audit/gate-c-roundtrip.json",
      "artifacts/m1b-audit/gate-d-onnx-cpu.json",
      "artifacts/m1b-audit/decoder.onnx",
    ],
  },
  {
    name: "M1B artifact README remains trackable",
    pathsMustNotBeIgnored: ["artifacts/m1b-audit/README.md", "artifacts/m1b-audit/.gitkeep"],
  },
];

let failed = false;

for (const check of checks) {
  console.log(`\n==> ${check.name}`);
  const ok = runCheck(check);
  if (!ok) {
    failed = true;
    console.error(`Check failed: ${check.name}`);
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log("\nM1B audit self-check passed.");
}

function runCheck(check) {
  if (check.pathsMustBeIgnored) {
    return check.pathsMustBeIgnored.every((path) => {
      const result = spawnSync("git", ["check-ignore", "-q", path], { stdio: "inherit" });
      return result.status === 0;
    });
  }

  if (check.custom) {
    return check.custom();
  }

  if (check.pathsMustNotBeIgnored) {
    return check.pathsMustNotBeIgnored.every((path) => {
      if (!existsSync(path)) {
        return false;
      }
      const result = spawnSync("git", ["check-ignore", "-q", path], { stdio: "inherit" });
      return result.status !== 0;
    });
  }

  const result = spawnSync(check.command, check.args, {
    stdio: "inherit",
    env: process.env,
  });
  return result.status === 0;
}

function checkArtifactValidatorRejectsBadGateD() {
  const dir = mkdtempSync(join(tmpdir(), "witt-m1b-artifact-check-"));
  try {
    cpSync("research/validation/fixtures/m1b-audit/gate-c-pass.fixture.json", join(dir, "gate-c-roundtrip.json"));
    cpSync(
      "research/validation/fixtures/m1b-audit/gate-d-onnx-export.fixture.json",
      join(dir, "gate-d-onnx-export.json"),
    );
    cpSync("research/validation/fixtures/m1b-audit/gate-d-fail.fixture.json", join(dir, "gate-d-onnx-cpu.json"));
    cpSync(
      "research/validation/fixtures/m1b-audit/vqgan-gates-blocked.fixture.json",
      join(dir, "vqgan-gates.json"),
    );
    const gateDPath = join(dir, "gate-d-onnx-cpu.json");
    const gateD = JSON.parse(readFileSync(gateDPath, "utf8"));
    gateD.onnx_cpu_passed = true;
    gateD.cpu_decode_seconds = 42.5;
    writeFileSync(gateDPath, JSON.stringify(gateD, null, 2));
    const result = spawnSync("node", ["scripts/m1b-audit-artifact-check.mjs", dir], {
      encoding: "utf8",
    });
    if (result.status === 0) {
      process.stdout.write(result.stdout);
      process.stderr.write(result.stderr);
      return false;
    }
    return result.stderr.includes("passed Gate D metrics require cpu_decode_seconds<=30");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
